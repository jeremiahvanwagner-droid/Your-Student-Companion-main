from __future__ import annotations

from pathlib import Path
import sys

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from lib.clerk_auth import AppAuthContext, ClerkAuthContext, get_app_auth_context, get_clerk_auth_context
import routes.users as users_routes
from server import app

APP_USER_ID = "11111111-1111-4111-8111-111111111111"
OTHER_USER_ID = "22222222-2222-4222-8222-222222222222"
PROFILE_ID = "33333333-3333-4333-8333-333333333333"


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


def _override_clerk_user() -> ClerkAuthContext:
    return ClerkAuthContext(
        clerk_user_id="user_test_123",
        email="student@example.com",
        claims={"sub": "user_test_123"},
    )


def test_protected_endpoint_requires_auth_header(client: TestClient):
    response = client.get("/api/users/me/profile")
    assert response.status_code == 401
    assert "Authorization" in response.json()["detail"]


def test_resolve_rejects_body_clerk_id_mismatch(client: TestClient):
    app.dependency_overrides[get_clerk_auth_context] = _override_clerk_user

    response = client.post(
        "/api/users/resolve",
        json={"clerk_user_id": "user_spoofed_999", "email": "x@example.com"},
    )

    assert response.status_code == 403
    assert "does not match" in response.json()["detail"]


def test_checkout_rejects_spoofed_user_id(client: TestClient):
    app.dependency_overrides[get_app_auth_context] = _override_app_user

    response = client.post(
        "/api/store/checkout",
        json={
            "user_id": OTHER_USER_ID,
            "course_pack_id": "1",
            "success_url": "https://example.com/success",
            "cancel_url": "https://example.com/cancel",
            "quantity": 1,
        },
    )

    assert response.status_code == 403
    assert "user_id does not match" in response.json()["detail"]


def test_purchases_reject_cross_user_access(client: TestClient):
    app.dependency_overrides[get_app_auth_context] = _override_app_user

    response = client.get(f"/api/store/user/{OTHER_USER_ID}/purchases")

    assert response.status_code == 403
    assert "user scope mismatch" in response.json()["detail"]


def test_owner_profile_routes_allow_authenticated_owner(client: TestClient, monkeypatch):
    app.dependency_overrides[get_app_auth_context] = _override_app_user

    monkeypatch.setattr(users_routes, "_admin_client", lambda: object())
    monkeypatch.setattr(
        users_routes,
        "_fetch_student_profile",
        lambda _admin, user_id: {
            "id": PROFILE_ID,
            "user_id": user_id,
            "onboarding_completed": False,
        },
    )

    get_response = client.get(f"/api/users/profile/{APP_USER_ID}")
    assert get_response.status_code == 200
    assert get_response.json()["profile"]["user_id"] == APP_USER_ID

    monkeypatch.setattr(users_routes, "_ensure_public_user_exists", lambda *_args, **_kwargs: {"id": APP_USER_ID})
    monkeypatch.setattr(
        users_routes,
        "_upsert_student_profile",
        lambda _admin, user_id, payload: (
            {
                "id": PROFILE_ID,
                "user_id": user_id,
                "onboarding_completed": payload.get("onboarding_completed", False),
            },
            False,
        ),
    )
    monkeypatch.setattr(users_routes, "write_audit_log", lambda *_args, **_kwargs: None)

    put_response = client.put(
        f"/api/users/profile/{APP_USER_ID}",
        json={"onboarding_completed": True, "timezone": "America/New_York"},
    )

    assert put_response.status_code == 200
    assert put_response.json()["profile"]["onboarding_completed"] is True


# ── Account deletion (Market Thirteen #5) ────────────────────────────────

class TestAccountDeletion:
    def test_delete_me_requires_auth(self, client):
        assert client.delete("/api/users/me").status_code == 401

    def test_delete_me_cascades_and_reports(self, client):
        app.dependency_overrides[get_app_auth_context] = _override_app_user
        import routes.users as users_routes

        table_mock = MagicMock()
        result = MagicMock()
        result.data = []
        for method in ("select", "insert", "update", "delete", "eq", "in_", "limit"):
            getattr(table_mock, method).return_value = table_mock
        table_mock.execute.return_value = result
        admin = MagicMock()
        admin.table.return_value = table_mock

        with patch.object(users_routes, "_admin_client", return_value=admin), \
             patch.object(users_routes, "_cancel_stripe_subscriptions", return_value=1) as cancel:
            resp = client.delete("/api/users/me")

        assert resp.status_code == 200
        body = resp.json()
        assert body["deleted"] is True
        assert body["stripe_subscriptions_cancelled"] == 1
        cancel.assert_called_once()
        # users row deleted
        table_mock.delete.assert_called()

    def test_delete_me_500_when_delete_fails(self, client):
        app.dependency_overrides[get_app_auth_context] = _override_app_user
        import routes.users as users_routes

        admin = MagicMock()
        calls = {"n": 0}

        def table_side(name):
            table_mock = MagicMock()
            result = MagicMock()
            result.data = []
            for method in ("select", "insert", "update", "delete", "eq", "in_", "limit"):
                getattr(table_mock, method).return_value = table_mock
            if name == "users":
                table_mock.execute.side_effect = RuntimeError("fk violation")
            else:
                table_mock.execute.return_value = result
            return table_mock

        admin.table.side_effect = table_side

        with patch.object(users_routes, "_admin_client", return_value=admin), \
             patch.object(users_routes, "_cancel_stripe_subscriptions", return_value=0):
            resp = client.delete("/api/users/me")

        assert resp.status_code == 500
