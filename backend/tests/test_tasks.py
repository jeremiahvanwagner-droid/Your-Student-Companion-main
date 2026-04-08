from __future__ import annotations

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

APP_USER_ID = "11111111-1111-4111-8111-111111111111"
OTHER_USER_ID = "22222222-2222-4222-8222-222222222222"
TASK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
SUBJECT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def clear_overrides():
    app.dependency_overrides = {}
    yield
    app.dependency_overrides = {}


def _override_app_user() -> AppAuthContext:
    return AppAuthContext(
        clerk_user_id="user_test_123",
        email="student@example.com",
        claims={"sub": "user_test_123"},
        app_user_id=APP_USER_ID,
        role="student",
    )


def _make_mock_table(rows=None):
    """Create a chained mock that mimics supabase table builder pattern."""
    mock = MagicMock()
    result = MagicMock()
    result.data = rows if rows is not None else []

    # every builder method returns self so chains work
    for method in ("select", "insert", "update", "delete", "eq", "in_", "order", "range", "limit"):
        getattr(mock, method).return_value = mock

    mock.execute.return_value = result
    return mock


def _mock_admin_with_table(table_data=None):
    """Return a mock admin client whose .table() returns a chained builder."""
    admin = MagicMock()
    table_mock = _make_mock_table(table_data)
    admin.table.return_value = table_mock
    return admin


# ── Auth tests ────────────────────────────────────────────────────────────


class TestTasksAuth:
    def test_list_requires_auth(self, client: TestClient):
        resp = client.get("/api/tasks")
        assert resp.status_code == 401

    def test_create_requires_auth(self, client: TestClient):
        resp = client.post("/api/tasks", json={"title": "Test"})
        assert resp.status_code == 401

    def test_get_requires_auth(self, client: TestClient):
        resp = client.get(f"/api/tasks/{TASK_ID}")
        assert resp.status_code == 401

    def test_update_requires_auth(self, client: TestClient):
        resp = client.put(f"/api/tasks/{TASK_ID}", json={"title": "X"})
        assert resp.status_code == 401

    def test_delete_requires_auth(self, client: TestClient):
        resp = client.delete(f"/api/tasks/{TASK_ID}")
        assert resp.status_code == 401

    def test_stats_requires_auth(self, client: TestClient):
        resp = client.get("/api/tasks/stats")
        assert resp.status_code == 401

    def test_patch_status_requires_auth(self, client: TestClient):
        resp = client.patch(
            f"/api/tasks/{TASK_ID}/status",
            json={"status": "completed"},
        )
        assert resp.status_code == 401


# ── Subjects auth ─────────────────────────────────────────────────────────


class TestSubjectsAuth:
    def test_list_requires_auth(self, client: TestClient):
        resp = client.get("/api/subjects")
        assert resp.status_code == 401

    def test_create_requires_auth(self, client: TestClient):
        resp = client.post("/api/subjects", json={"name": "Math"})
        assert resp.status_code == 401

    def test_delete_requires_auth(self, client: TestClient):
        resp = client.delete(f"/api/subjects/{SUBJECT_ID}")
        assert resp.status_code == 401


# ── CRUD tests (mocked Supabase) ─────────────────────────────────────────


class TestTasksCRUD:
    def test_list_returns_tasks(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _override_app_user

        tasks = [
            {"id": TASK_ID, "user_id": APP_USER_ID, "title": "Read Ch5", "status": "not_started"}
        ]

        with patch("routes.tasks._admin_client", return_value=_mock_admin_with_table(tasks)):
            resp = client.get("/api/tasks")

        assert resp.status_code == 200
        data = resp.json()
        assert "tasks" in data

    def test_create_validates_title(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _override_app_user

        resp = client.post("/api/tasks", json={"title": ""})
        assert resp.status_code == 422

    def test_create_validates_priority(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _override_app_user

        resp = client.post(
            "/api/tasks",
            json={"title": "Test", "priority": "invalid"},
        )
        assert resp.status_code == 422

    def test_create_succeeds(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _override_app_user

        created = {"id": TASK_ID, "user_id": APP_USER_ID, "title": "New task", "status": "not_started"}
        mock_admin = _mock_admin_with_table([created])

        with patch("routes.tasks._admin_client", return_value=mock_admin):
            resp = client.post(
                "/api/tasks",
                json={"title": "New task", "priority": "high"},
            )

        assert resp.status_code == 201
        assert resp.json()["task"]["title"] == "New task"

    def test_get_rejects_other_user(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _override_app_user

        task = {"id": TASK_ID, "user_id": OTHER_USER_ID, "title": "Not mine"}
        mock_admin = _mock_admin_with_table([task])

        with patch("routes.tasks._admin_client", return_value=mock_admin):
            resp = client.get(f"/api/tasks/{TASK_ID}")

        assert resp.status_code == 403

    def test_get_returns_own_task(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _override_app_user

        task = {"id": TASK_ID, "user_id": APP_USER_ID, "title": "Mine", "status": "not_started"}
        mock_admin = _mock_admin_with_table([task])

        with patch("routes.tasks._admin_client", return_value=mock_admin):
            resp = client.get(f"/api/tasks/{TASK_ID}")

        assert resp.status_code == 200
        assert resp.json()["task"]["title"] == "Mine"

    def test_delete_rejects_other_user(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _override_app_user

        task = {"id": TASK_ID, "user_id": OTHER_USER_ID}
        mock_admin = _mock_admin_with_table([task])

        with patch("routes.tasks._admin_client", return_value=mock_admin):
            resp = client.delete(f"/api/tasks/{TASK_ID}")

        assert resp.status_code == 403

    def test_patch_status_validates_value(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _override_app_user

        resp = client.patch(
            f"/api/tasks/{TASK_ID}/status",
            json={"status": "invalid_status"},
        )
        assert resp.status_code == 422

    def test_invalid_uuid_returns_422(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _override_app_user

        with patch("routes.tasks._admin_client", return_value=_mock_admin_with_table()):
            resp = client.get("/api/tasks/not-a-uuid")

        assert resp.status_code == 422


# ── Stats tests ───────────────────────────────────────────────────────────


class TestTaskStats:
    def test_stats_empty(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _override_app_user

        with patch("routes.tasks._admin_client", return_value=_mock_admin_with_table([])):
            resp = client.get("/api/tasks/stats")

        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["completion_rate"] == 0
        assert data["streak"] == 0

    def test_stats_with_tasks(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _override_app_user

        tasks = [
            {"id": "a1", "status": "completed", "due_date": None, "completed_at": "2026-04-07T10:00:00+00:00", "created_at": "2026-04-06T10:00:00+00:00"},
            {"id": "a2", "status": "not_started", "due_date": "2026-04-05T00:00:00+00:00", "completed_at": None, "created_at": "2026-04-04T10:00:00+00:00"},
            {"id": "a3", "status": "in_progress", "due_date": "2026-04-10T00:00:00+00:00", "completed_at": None, "created_at": "2026-04-06T10:00:00+00:00"},
        ]

        with patch("routes.tasks._admin_client", return_value=_mock_admin_with_table(tasks)):
            resp = client.get("/api/tasks/stats")

        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 3
        assert data["completed"] == 1
        assert data["in_progress"] == 1
        assert data["not_started"] == 1
        # a2 is overdue (due Apr 5, status not_started)
        assert data["overdue"] >= 1
