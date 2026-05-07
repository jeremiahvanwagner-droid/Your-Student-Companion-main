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

APP_USER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"


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
        clerk_user_id="user_focus_test",
        email="student@example.com",
        claims={"sub": "user_focus_test"},
        app_user_id=APP_USER_ID,
        role="student",
    )


def _make_table_mock(rows=None):
    mock = MagicMock()
    result = MagicMock()
    result.data = rows if rows is not None else []
    for method in ("select", "insert", "update", "delete", "eq", "in_", "order", "range", "limit"):
        getattr(mock, method).return_value = mock
    mock.execute.return_value = result
    return mock


def _mock_admin(rows=None):
    admin = MagicMock()
    admin.table.return_value = _make_table_mock(rows)
    return admin


# ── Auth ──────────────────────────────────────────────────────────────────

class TestFocusAuth:
    def test_stats_requires_auth(self, client: TestClient):
        assert client.get("/api/focus/stats").status_code == 401

    def test_sessions_requires_auth(self, client: TestClient):
        assert client.get("/api/focus/sessions").status_code == 401

    def test_legacy_import_requires_auth(self, client: TestClient):
        assert client.post("/api/focus/legacy-import", json={"minutes": 100}).status_code == 401


# ── Legacy import ─────────────────────────────────────────────────────────

class TestLegacyImport:
    def test_happy_path_creates_import_record(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.focus as focus_routes

        # First table call (focus_migrations select) returns no rows → not migrated
        # Subsequent calls succeed (insert focus_migrations, insert focus_logs)
        table_calls = [0]
        no_rows_mock = _make_table_mock([])
        success_mock = _make_table_mock([{"id": "new-row"}])

        def table_side(name):
            table_calls[0] += 1
            if table_calls[0] == 1:
                return no_rows_mock  # check migration exists
            return success_mock  # insert migration + log

        admin = MagicMock()
        admin.table.side_effect = table_side

        with patch.object(focus_routes, "_admin_client", return_value=admin):
            resp = client.post("/api/focus/legacy-import", json={"minutes": 150})

        assert resp.status_code == 201
        data = resp.json()
        assert data["imported"] is True
        assert data["minutes"] == 150

    def test_idempotent_second_call_returns_409(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.focus as focus_routes

        # Focus migrations table returns an existing row → already migrated
        existing = [{"id": "existing-row", "minutes_imported": 150}]
        with patch.object(focus_routes, "_admin_client", return_value=_mock_admin(existing)):
            resp = client.post("/api/focus/legacy-import", json={"minutes": 150})

        assert resp.status_code == 409
        detail = resp.json()["detail"]
        assert detail["minutes_imported"] == 150

    def test_validates_minutes_range(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        resp = client.post("/api/focus/legacy-import", json={"minutes": 0})
        assert resp.status_code == 422

    def test_validates_minutes_positive(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        resp = client.post("/api/focus/legacy-import", json={"minutes": -1})
        assert resp.status_code == 422
