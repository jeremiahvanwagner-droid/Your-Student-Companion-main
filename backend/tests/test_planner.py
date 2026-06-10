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
from routes.planner import build_suggestions
from server import app

APP_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
OTHER_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
BLOCK_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
ASSIGNMENT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
PLANNED_ASSIGNMENT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"


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
        clerk_user_id="user_planner_test",
        email="student@example.com",
        claims={"sub": "user_planner_test"},
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


def _mock_admin(rows=None):
    admin = MagicMock()
    admin.table.return_value = _make_table_mock(rows)
    return admin


def _mock_admin_tables(tables):
    admin = MagicMock()
    mocks = {name: _make_table_mock(rows) for name, rows in tables.items()}

    def table_side(name):
        return mocks.get(name, _make_table_mock([]))

    admin.table.side_effect = table_side
    return admin, mocks


def _iso(dt: datetime) -> str:
    return dt.isoformat()


# ── Auth ──────────────────────────────────────────────────────────────────

class TestPlannerAuth:
    def test_list_requires_auth(self, client: TestClient):
        assert client.get("/api/planner/blocks").status_code == 401

    def test_create_requires_auth(self, client: TestClient):
        assert client.post("/api/planner/blocks", json={}).status_code == 401

    def test_suggest_requires_auth(self, client: TestClient):
        assert client.get("/api/planner/suggest").status_code == 401


# ── Blocks CRUD ───────────────────────────────────────────────────────────

class TestPlannerBlocks:
    def test_create_block(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.planner as planner_routes

        start = datetime.now(timezone.utc) + timedelta(days=1)
        admin, mocks = _mock_admin_tables({"planner_blocks": [{"id": BLOCK_ID}]})
        with patch.object(planner_routes, "_admin_client", return_value=admin):
            resp = client.post(
                "/api/planner/blocks",
                json={
                    "title": "Algebra review",
                    "scheduled_start": _iso(start),
                    "scheduled_end": _iso(start + timedelta(minutes=45)),
                },
            )

        assert resp.status_code == 201
        payload = mocks["planner_blocks"].insert.call_args[0][0]
        assert payload["title"] == "Algebra review"
        assert payload["user_id"] == APP_USER_ID
        assert payload["source"] == "manual"

    def test_create_block_rejects_inverted_range(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        start = datetime.now(timezone.utc)
        resp = client.post(
            "/api/planner/blocks",
            json={
                "title": "x",
                "scheduled_start": _iso(start),
                "scheduled_end": _iso(start - timedelta(minutes=30)),
            },
        )
        assert resp.status_code == 422

    def test_bulk_create(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.planner as planner_routes

        start = datetime.now(timezone.utc) + timedelta(days=1)
        block = {
            "title": "Session",
            "scheduled_start": _iso(start),
            "scheduled_end": _iso(start + timedelta(minutes=45)),
        }
        admin, mocks = _mock_admin_tables(
            {"planner_blocks": [{"id": "1"}, {"id": "2"}]}
        )
        with patch.object(planner_routes, "_admin_client", return_value=admin):
            resp = client.post("/api/planner/blocks/bulk", json={"blocks": [block, block]})

        assert resp.status_code == 201
        assert resp.json()["count"] == 2
        payloads = mocks["planner_blocks"].insert.call_args[0][0]
        assert isinstance(payloads, list) and len(payloads) == 2

    def test_bulk_create_caps_at_twenty(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        start = datetime.now(timezone.utc)
        block = {
            "title": "x",
            "scheduled_start": _iso(start),
            "scheduled_end": _iso(start + timedelta(minutes=30)),
        }
        resp = client.post("/api/planner/blocks/bulk", json={"blocks": [block] * 21})
        assert resp.status_code == 422

    def test_list_blocks_rejects_inverted_range(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.planner as planner_routes

        with patch.object(planner_routes, "_admin_client", return_value=_mock_admin([])):
            resp = client.get(
                "/api/planner/blocks?start=2026-06-10T00:00:00Z&end=2026-06-09T00:00:00Z"
            )
        assert resp.status_code == 422

    def test_list_blocks_returns_range(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.planner as planner_routes

        rows = [{"id": BLOCK_ID, "title": "Session"}]
        with patch.object(planner_routes, "_admin_client", return_value=_mock_admin(rows)):
            resp = client.get("/api/planner/blocks")

        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 1
        assert "start" in data["range"] and "end" in data["range"]

    def test_complete_enforces_ownership(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.planner as planner_routes

        rows = [{"id": BLOCK_ID, "user_id": OTHER_USER_ID}]
        with patch.object(planner_routes, "_admin_client", return_value=_mock_admin(rows)):
            resp = client.patch(
                f"/api/planner/blocks/{BLOCK_ID}/complete", json={"completed": True}
            )
        assert resp.status_code == 403

    def test_complete_block(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.planner as planner_routes

        rows = [{"id": BLOCK_ID, "user_id": APP_USER_ID, "completed": True}]
        admin, mocks = _mock_admin_tables({"planner_blocks": rows})
        with patch.object(planner_routes, "_admin_client", return_value=admin):
            resp = client.patch(
                f"/api/planner/blocks/{BLOCK_ID}/complete", json={"completed": True}
            )

        assert resp.status_code == 200
        updates = mocks["planner_blocks"].update.call_args[0][0]
        assert updates == {"completed": True}

    def test_delete_block(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.planner as planner_routes

        rows = [{"id": BLOCK_ID, "user_id": APP_USER_ID}]
        with patch.object(planner_routes, "_admin_client", return_value=_mock_admin(rows)):
            resp = client.delete(f"/api/planner/blocks/{BLOCK_ID}")
        assert resp.status_code == 204

    def test_update_rejects_empty_body(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.planner as planner_routes

        rows = [{"id": BLOCK_ID, "user_id": APP_USER_ID}]
        with patch.object(planner_routes, "_admin_client", return_value=_mock_admin(rows)):
            resp = client.put(f"/api/planner/blocks/{BLOCK_ID}", json={})
        assert resp.status_code == 422


# ── Auto-suggest ──────────────────────────────────────────────────────────

class TestSuggest:
    def test_suggest_returns_block_for_due_soon_assignment(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.planner as planner_routes

        due = datetime.now(timezone.utc) + timedelta(days=3)
        assignments = [
            {
                "id": ASSIGNMENT_ID,
                "title": "Essay draft",
                "subject_id": None,
                "due_date": due.isoformat(),
                "priority": "high",
                "estimated_minutes": 60,
                "status": "not_started",
            },
            {
                "id": PLANNED_ASSIGNMENT_ID,
                "title": "Already planned",
                "subject_id": None,
                "due_date": due.isoformat(),
                "priority": "medium",
                "estimated_minutes": 30,
                "status": "in_progress",
            },
        ]
        planned_blocks = [{"assignment_id": PLANNED_ASSIGNMENT_ID}]
        profiles = [{"timezone": "America/Chicago"}]

        admin, _ = _mock_admin_tables(
            {
                "assignments": assignments,
                "planner_blocks": planned_blocks,
                "student_profiles": profiles,
            }
        )
        with patch.object(planner_routes, "_admin_client", return_value=admin):
            resp = client.get("/api/planner/suggest")

        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 1
        suggestion = data["suggestions"][0]
        assert suggestion["assignment_id"] == ASSIGNMENT_ID
        assert suggestion["source"] == "auto_suggest"
        start = datetime.fromisoformat(suggestion["scheduled_start"])
        end = datetime.fromisoformat(suggestion["scheduled_end"])
        assert end - start == timedelta(minutes=60)

    def test_build_suggestions_caps_duration(self):
        now = datetime.now(timezone.utc)
        assignments = [
            {
                "id": ASSIGNMENT_ID,
                "title": "Huge project",
                "subject_id": None,
                "due_date": (now + timedelta(days=2)).isoformat(),
                "priority": "high",
                "estimated_minutes": 600,
                "status": "not_started",
            }
        ]
        suggestions = build_suggestions(assignments, set(), "America/New_York", now)
        assert len(suggestions) == 1
        start = datetime.fromisoformat(suggestions[0]["scheduled_start"])
        end = datetime.fromisoformat(suggestions[0]["scheduled_end"])
        assert end - start == timedelta(minutes=120)

    def test_build_suggestions_never_schedules_in_past(self):
        now = datetime.now(timezone.utc)
        assignments = [
            {
                "id": ASSIGNMENT_ID,
                "title": "Due tonight",
                "subject_id": None,
                "due_date": (now + timedelta(hours=3)).isoformat(),
                "priority": "urgent",
                "estimated_minutes": 45,
                "status": "not_started",
            }
        ]
        suggestions = build_suggestions(assignments, set(), "UTC", now)
        assert len(suggestions) == 1
        start = datetime.fromisoformat(suggestions[0]["scheduled_start"])
        assert start > now

    def test_build_suggestions_staggers_same_day(self):
        now = datetime.now(timezone.utc)
        due = now + timedelta(days=4)
        assignments = [
            {
                "id": f"00000000-0000-4000-8000-00000000000{i}",
                "title": f"Task {i}",
                "subject_id": None,
                "due_date": due.isoformat(),
                "priority": "medium",
                "estimated_minutes": 30,
                "status": "not_started",
            }
            for i in range(1, 3)
        ]
        suggestions = build_suggestions(assignments, set(), "UTC", now)
        assert len(suggestions) == 2
        starts = [datetime.fromisoformat(s["scheduled_start"]) for s in suggestions]
        assert starts[0] != starts[1]

    def test_build_suggestions_handles_bad_timezone(self):
        now = datetime.now(timezone.utc)
        assignments = [
            {
                "id": ASSIGNMENT_ID,
                "title": "Quiz prep",
                "subject_id": None,
                "due_date": (now + timedelta(days=5)).isoformat(),
                "priority": "low",
                "estimated_minutes": None,
                "status": "not_started",
            }
        ]
        suggestions = build_suggestions(assignments, set(), "Not/AZone", now)
        assert len(suggestions) == 1
