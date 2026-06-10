from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from lib.clerk_auth import AppAuthContext, get_app_auth_context
from server import app

APP_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
SUBJECT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def clear_overrides():
    app.dependency_overrides = {}
    yield
    app.dependency_overrides = {}


def _auth_user() -> AppAuthContext:
    return AppAuthContext(
        clerk_user_id="user_reports_test",
        email="student@example.com",
        claims={"sub": "user_reports_test"},
        app_user_id=APP_USER_ID,
        role="student",
    )


TABLE_METHODS = (
    "select", "insert", "update", "delete", "upsert",
    "eq", "in_", "or_", "contains", "gte", "lte", "lt",
    "order", "range", "limit",
)


def _make_table_mock(rows=None):
    mock = MagicMock()
    result = MagicMock()
    result.data = rows if rows is not None else []
    for method in TABLE_METHODS:
        getattr(mock, method).return_value = mock
    mock.execute.return_value = result
    return mock


def _mock_admin_tables(tables):
    admin = MagicMock()
    mocks = {name: _make_table_mock(rows) for name, rows in tables.items()}

    def table_side(name):
        return mocks.get(name, _make_table_mock([]))

    admin.table.side_effect = table_side
    return admin, mocks


def _week_bounds():
    now = datetime.now(timezone.utc)
    week_start_date = now.date() - timedelta(days=now.weekday())
    start_dt = datetime(
        week_start_date.year, week_start_date.month, week_start_date.day,
        tzinfo=timezone.utc,
    )
    # A timestamp strictly inside [start, now) for "already happened this week"
    midpoint = start_dt + (now - start_dt) / 2
    return week_start_date, start_dt, midpoint, now


# ── Auth ──────────────────────────────────────────────────────────────────

class TestReportsAuth:
    def test_current_requires_auth(self, client: TestClient):
        assert client.get("/api/reports/weekly/current").status_code == 401

    def test_generate_requires_auth(self, client: TestClient):
        assert client.post("/api/reports/weekly/generate", json={}).status_code == 401

    def test_history_requires_auth(self, client: TestClient):
        assert client.get("/api/reports/weekly/history").status_code == 401


# ── Current week computation ──────────────────────────────────────────────

class TestCurrentWeek:
    def _tables(self):
        week_start, start_dt, midpoint, now = _week_bounds()

        assignments = [
            {   # completed this week
                "id": "11111111-1111-4111-8111-111111111111",
                "subject_id": SUBJECT_ID,
                "title": "Done task",
                "priority": "medium",
                "status": "completed",
                "due_date": midpoint.isoformat(),
                "completed_at": midpoint.isoformat(),
            },
            {   # missed: due earlier this week, still not started
                "id": "22222222-2222-4222-8222-222222222222",
                "subject_id": None,
                "title": "Missed task",
                "priority": "high",
                "status": "not_started",
                "due_date": midpoint.isoformat(),
                "completed_at": None,
            },
            {   # due next week → next_week preview
                "id": "33333333-3333-4333-8333-333333333333",
                "subject_id": None,
                "title": "Next week essay",
                "priority": "urgent",
                "status": "not_started",
                "due_date": (start_dt + timedelta(days=8)).isoformat(),
                "completed_at": None,
            },
        ]
        focus_logs = [
            {"focus_minutes": 30, "logged_at": midpoint.isoformat()},
            {"focus_minutes": 20, "logged_at": midpoint.isoformat()},
        ]
        sessions = [
            {
                "subject_id": SUBJECT_ID,
                "duration_actual_minutes": 50,
                "completed_at": midpoint.isoformat(),
            }
        ]
        blocks = [
            {"id": "b1", "completed": True, "scheduled_start": midpoint.isoformat()},
            {"id": "b2", "completed": False, "scheduled_start": midpoint.isoformat()},
        ]
        subjects = [{"id": SUBJECT_ID, "name": "Biology"}]

        return {
            "assignments": assignments,
            "focus_logs": focus_logs,
            "study_sessions": sessions,
            "planner_blocks": blocks,
            "subjects": subjects,
        }

    def test_current_week_aggregates(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.reports as reports_routes

        admin, _ = _mock_admin_tables(self._tables())
        with patch.object(reports_routes, "_admin_client", return_value=admin):
            resp = client.get("/api/reports/weekly/current")

        assert resp.status_code == 200
        report = resp.json()["report"]
        assert report["tasks_completed"] == 1
        assert report["tasks_missed"] == 1
        assert report["focus_minutes_total"] == 50
        assert report["top_subject"] == "Biology"
        assert report["blocks_scheduled"] == 2
        assert report["blocks_completed"] == 1
        assert len(report["daily"]) == 7
        assert report["next_week"]["assignments_due"] == 1
        assert report["next_week"]["top_priorities"][0]["title"] == "Next week essay"

    def test_week_start_snaps_to_monday(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.reports as reports_routes

        admin, _ = _mock_admin_tables({})
        with patch.object(reports_routes, "_admin_client", return_value=admin):
            # 2026-06-10 is a Wednesday → snaps back to Monday 2026-06-08
            resp = client.get("/api/reports/weekly/current?week_start=2026-06-10")

        assert resp.status_code == 200
        assert resp.json()["report"]["week_start"] == "2026-06-08"

    def test_invalid_week_start_rejected(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.reports as reports_routes

        admin, _ = _mock_admin_tables({})
        with patch.object(reports_routes, "_admin_client", return_value=admin):
            resp = client.get("/api/reports/weekly/current?week_start=not-a-date")
        assert resp.status_code == 422


# ── Generate (snapshot upsert) ────────────────────────────────────────────

class TestGenerate:
    def test_generate_upserts_on_user_week(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.reports as reports_routes

        admin, mocks = _mock_admin_tables(
            {"weekly_reports": [{"id": "saved-report", "week_start": "2026-06-08"}]}
        )
        with patch.object(reports_routes, "_admin_client", return_value=admin):
            resp = client.post(
                "/api/reports/weekly/generate", json={"week_start": "2026-06-10"}
            )

        assert resp.status_code == 201
        assert resp.json()["report"]["id"] == "saved-report"

        upsert_call = mocks["weekly_reports"].upsert.call_args
        payload = upsert_call[0][0]
        assert payload["week_start"] == "2026-06-08"
        assert payload["user_id"] == APP_USER_ID
        assert "daily" in payload["insights_json"]
        assert upsert_call[1]["on_conflict"] == "user_id,week_start"


# ── History ───────────────────────────────────────────────────────────────

class TestHistory:
    def test_history_returns_rows(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.reports as reports_routes

        rows = [
            {"id": "r2", "week_start": "2026-06-08", "focus_minutes_total": 120},
            {"id": "r1", "week_start": "2026-06-01", "focus_minutes_total": 90},
        ]
        admin, _ = _mock_admin_tables({"weekly_reports": rows})
        with patch.object(reports_routes, "_admin_client", return_value=admin):
            resp = client.get("/api/reports/weekly/history?limit=2")

        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 2
        assert data["reports"][0]["id"] == "r2"
