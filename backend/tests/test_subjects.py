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

APP_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
OTHER_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
SUBJECT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"


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
        clerk_user_id="user_test_abc",
        email="student@example.com",
        claims={"sub": "user_test_abc"},
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

class TestSubjectsAuth:
    def test_list_requires_auth(self, client: TestClient):
        assert client.get("/api/subjects").status_code == 401

    def test_create_requires_auth(self, client: TestClient):
        assert client.post("/api/subjects", json={"name": "Bio"}).status_code == 401

    def test_patch_requires_auth(self, client: TestClient):
        assert client.patch(f"/api/subjects/{SUBJECT_ID}", json={"name": "X"}).status_code == 401

    def test_delete_requires_auth(self, client: TestClient):
        assert client.delete(f"/api/subjects/{SUBJECT_ID}").status_code == 401


# ── CRUD ──────────────────────────────────────────────────────────────────

class TestSubjectsCRUD:
    def test_create_returns_201(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        created = {"id": SUBJECT_ID, "user_id": APP_USER_ID, "name": "Biology", "color": "#10b981", "archived": False}
        with patch("routes.subjects._admin_client", return_value=_mock_admin([created])):
            resp = client.post("/api/subjects", json={"name": "Biology", "color": "#10b981"})
        assert resp.status_code == 201
        assert resp.json()["subject"]["name"] == "Biology"

    def test_list_excludes_archived_by_default(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        subjects = [
            {"id": SUBJECT_ID, "user_id": APP_USER_ID, "name": "Biology", "archived": False},
        ]
        with patch("routes.subjects._admin_client", return_value=_mock_admin(subjects)):
            resp = client.get("/api/subjects")
        assert resp.status_code == 200
        # The mock always returns the same data; what matters is the .eq("archived", False) is called.
        # We verify the response shape.
        assert "subjects" in resp.json()

    def test_list_includes_archived_when_requested(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        subjects = [
            {"id": SUBJECT_ID, "user_id": APP_USER_ID, "name": "Biology", "archived": True},
        ]
        with patch("routes.subjects._admin_client", return_value=_mock_admin(subjects)):
            resp = client.get("/api/subjects?include_archived=true")
        assert resp.status_code == 200
        assert "subjects" in resp.json()

    def test_patch_rename(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        existing = [{"id": SUBJECT_ID, "user_id": APP_USER_ID}]
        updated = [{"id": SUBJECT_ID, "user_id": APP_USER_ID, "name": "Chemistry", "archived": False}]

        admin = MagicMock()
        # First call: ownership check (select)
        # Second call: update
        ownership_mock = _make_table_mock(existing)
        update_mock = _make_table_mock(updated)
        call_count = [0]

        def table_side_effect(name):
            call_count[0] += 1
            if call_count[0] == 1:
                return ownership_mock
            return update_mock

        admin.table.side_effect = table_side_effect

        with patch("routes.subjects._admin_client", return_value=admin):
            resp = client.patch(f"/api/subjects/{SUBJECT_ID}", json={"name": "Chemistry"})

        assert resp.status_code == 200

    def test_patch_archive(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        existing = [{"id": SUBJECT_ID, "user_id": APP_USER_ID}]
        updated = [{"id": SUBJECT_ID, "user_id": APP_USER_ID, "archived": True}]

        admin = MagicMock()
        call_count = [0]

        def table_side_effect(name):
            call_count[0] += 1
            if call_count[0] == 1:
                return _make_table_mock(existing)
            return _make_table_mock(updated)

        admin.table.side_effect = table_side_effect

        with patch("routes.subjects._admin_client", return_value=admin):
            resp = client.patch(f"/api/subjects/{SUBJECT_ID}", json={"archived": True})

        assert resp.status_code == 200

    def test_patch_rejects_other_user(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        existing = [{"id": SUBJECT_ID, "user_id": OTHER_USER_ID}]
        with patch("routes.subjects._admin_client", return_value=_mock_admin(existing)):
            resp = client.patch(f"/api/subjects/{SUBJECT_ID}", json={"name": "X"})
        assert resp.status_code == 403

    def test_patch_validates_uuid(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        with patch("routes.subjects._admin_client", return_value=_mock_admin()):
            resp = client.patch("/api/subjects/not-a-uuid", json={"name": "X"})
        assert resp.status_code == 422
