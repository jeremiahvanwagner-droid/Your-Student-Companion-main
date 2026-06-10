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
from routes.reminders import build_sync_payloads
from server import app

APP_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
OTHER_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
REMINDER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
ASSIGNMENT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
BLOCK_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"


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
        clerk_user_id="user_reminders_test",
        email="student@example.com",
        claims={"sub": "user_reminders_test"},
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


# ── Auth ──────────────────────────────────────────────────────────────────

class TestRemindersAuth:
    def test_list_requires_auth(self, client: TestClient):
        assert client.get("/api/reminders").status_code == 401

    def test_sync_requires_auth(self, client: TestClient):
        assert client.post("/api/reminders/sync").status_code == 401

    def test_read_all_requires_auth(self, client: TestClient):
        assert client.post("/api/reminders/read-all").status_code == 401


# ── Listing ───────────────────────────────────────────────────────────────

class TestListReminders:
    def test_list_counts_unread(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.reminders as reminders_routes

        rows = [
            {"id": "1", "is_read": False, "title": "Due soon: Essay"},
            {"id": "2", "is_read": True, "title": "Overdue: Quiz prep"},
        ]
        with patch.object(reminders_routes, "_admin_client", return_value=_mock_admin(rows)):
            resp = client.get("/api/reminders")

        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 2
        assert data["unread"] == 1

    def test_create_manual_reminder(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.reminders as reminders_routes

        admin, mocks = _mock_admin_tables({"reminders": [{"id": REMINDER_ID}]})
        with patch.object(reminders_routes, "_admin_client", return_value=admin):
            resp = client.post(
                "/api/reminders",
                json={"reminder_type": "weekly_reset", "title": "Plan your week"},
            )

        assert resp.status_code == 201
        payload = mocks["reminders"].insert.call_args[0][0]
        assert payload["reminder_type"] == "weekly_reset"
        assert payload["user_id"] == APP_USER_ID

    def test_create_rejects_unknown_type(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        resp = client.post(
            "/api/reminders", json={"reminder_type": "spam", "title": "x"}
        )
        assert resp.status_code == 422


# ── Read state ────────────────────────────────────────────────────────────

class TestReadState:
    def test_mark_read_enforces_ownership(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.reminders as reminders_routes

        rows = [{"id": REMINDER_ID, "user_id": OTHER_USER_ID}]
        with patch.object(reminders_routes, "_admin_client", return_value=_mock_admin(rows)):
            resp = client.patch(f"/api/reminders/{REMINDER_ID}/read")
        assert resp.status_code == 403

    def test_mark_read(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.reminders as reminders_routes

        rows = [{"id": REMINDER_ID, "user_id": APP_USER_ID, "is_read": True}]
        admin, mocks = _mock_admin_tables({"reminders": rows})
        with patch.object(reminders_routes, "_admin_client", return_value=admin):
            resp = client.patch(f"/api/reminders/{REMINDER_ID}/read")

        assert resp.status_code == 200
        assert mocks["reminders"].update.call_args[0][0] == {"is_read": True}

    def test_read_all(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.reminders as reminders_routes

        admin, mocks = _mock_admin_tables({"reminders": []})
        with patch.object(reminders_routes, "_admin_client", return_value=admin):
            resp = client.post("/api/reminders/read-all")

        assert resp.status_code == 200
        assert mocks["reminders"].update.call_args[0][0] == {"is_read": True}

    def test_delete_reminder(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.reminders as reminders_routes

        rows = [{"id": REMINDER_ID, "user_id": APP_USER_ID}]
        with patch.object(reminders_routes, "_admin_client", return_value=_mock_admin(rows)):
            resp = client.delete(f"/api/reminders/{REMINDER_ID}")
        assert resp.status_code == 204


# ── Sync generation ──────────────────────────────────────────────────────

class TestSync:
    def test_sync_upserts_with_conflict_skip(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.reminders as reminders_routes

        now = datetime.now(timezone.utc)
        assignments = [
            {
                "id": ASSIGNMENT_ID,
                "title": "Essay",
                "status": "not_started",
                "due_date": (now + timedelta(hours=5)).isoformat(),
            }
        ]
        admin, mocks = _mock_admin_tables(
            {
                "assignments": assignments,
                "planner_blocks": [],
                "reminders": [{"id": "new-reminder"}],
            }
        )
        with patch.object(reminders_routes, "_admin_client", return_value=admin):
            resp = client.post("/api/reminders/sync")

        assert resp.status_code == 200
        data = resp.json()
        assert data["candidates"] == 1
        assert data["generated"] == 1

        upsert_call = mocks["reminders"].upsert.call_args
        payloads = upsert_call[0][0]
        assert payloads[0]["reminder_type"] == "due_soon"
        assert payloads[0]["reference_id"] == ASSIGNMENT_ID
        assert upsert_call[1]["on_conflict"] == "user_id,reminder_type,reference_id"
        assert upsert_call[1]["ignore_duplicates"] is True

    def test_sync_no_candidates_skips_upsert(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.reminders as reminders_routes

        admin, mocks = _mock_admin_tables({"assignments": [], "planner_blocks": []})
        with patch.object(reminders_routes, "_admin_client", return_value=admin):
            resp = client.post("/api/reminders/sync")

        assert resp.status_code == 200
        assert resp.json() == {"generated": 0, "candidates": 0}


class TestBuildSyncPayloads:
    def test_overdue_and_due_soon_and_blocks(self):
        now = datetime.now(timezone.utc)
        assignments = [
            {
                "id": ASSIGNMENT_ID,
                "title": "Late lab",
                "status": "in_progress",
                "due_date": (now - timedelta(days=1)).isoformat(),
            },
            {
                "id": "11111111-1111-4111-8111-111111111111",
                "title": "Tomorrow quiz",
                "status": "not_started",
                "due_date": (now + timedelta(hours=10)).isoformat(),
            },
            {   # due far out — no reminder
                "id": "22222222-2222-4222-8222-222222222222",
                "title": "Far away",
                "status": "not_started",
                "due_date": (now + timedelta(days=6)).isoformat(),
            },
            {   # completed — no reminder
                "id": "33333333-3333-4333-8333-333333333333",
                "title": "Done",
                "status": "completed",
                "due_date": (now + timedelta(hours=2)).isoformat(),
            },
        ]
        blocks = [
            {
                "id": BLOCK_ID,
                "title": "Algebra session",
                "completed": False,
                "scheduled_start": (now + timedelta(minutes=30)).isoformat(),
            },
            {   # completed block — no reminder
                "id": "44444444-4444-4444-8444-444444444444",
                "title": "Done block",
                "completed": True,
                "scheduled_start": (now + timedelta(minutes=30)).isoformat(),
            },
        ]

        payloads = build_sync_payloads(APP_USER_ID, assignments, blocks, now)

        types = sorted(p["reminder_type"] for p in payloads)
        assert types == ["due_soon", "overdue", "study_block"]
        by_type = {p["reminder_type"]: p for p in payloads}
        assert by_type["overdue"]["reference_id"] == ASSIGNMENT_ID
        assert by_type["study_block"]["reference_id"] == BLOCK_ID
        assert by_type["due_soon"]["title"].startswith("Due soon:")

    def test_no_due_date_means_no_reminder(self):
        now = datetime.now(timezone.utc)
        assignments = [
            {"id": ASSIGNMENT_ID, "title": "No date", "status": "not_started", "due_date": None}
        ]
        assert build_sync_payloads(APP_USER_ID, assignments, [], now) == []
