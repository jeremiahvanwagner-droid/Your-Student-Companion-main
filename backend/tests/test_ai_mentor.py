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

APP_USER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"


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
        clerk_user_id="user_test_mentor",
        email="student@example.com",
        claims={"sub": "user_test_mentor"},
        app_user_id=APP_USER_ID,
        role="student",
    )


def _mock_admin_client_no_supabase():
    admin = MagicMock()
    table_mock = MagicMock()
    result = MagicMock()
    result.data = []
    for method in ("select", "insert", "update", "delete", "eq", "in_", "order", "limit"):
        getattr(table_mock, method).return_value = table_mock
    table_mock.execute.return_value = result
    admin.table.return_value = table_mock
    return admin


# ── Auth ──────────────────────────────────────────────────────────────────

class TestAiMentorAuth:
    def test_chat_requires_auth(self, client: TestClient):
        resp = client.post("/api/ai/chat", json={"message": "Hello"})
        assert resp.status_code == 401

    def test_voice_transcript_requires_auth(self, client: TestClient):
        resp = client.post(
            "/api/ai/voice/transcript",
            json={"messages": [{"role": "user", "content": "Hi"}]},
        )
        assert resp.status_code == 401

    def test_status_is_public(self, client: TestClient):
        resp = client.get("/api/ai/status")
        assert resp.status_code == 200


# ── Voice transcript endpoint ─────────────────────────────────────────────

class TestVoiceTranscript:
    def test_empty_messages_returns_zero(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.ai_mentor as ai_routes
        with patch.object(ai_routes, "_admin_client", return_value=_mock_admin_client_no_supabase()):
            resp = client.post(
                "/api/ai/voice/transcript",
                json={"messages": []},
            )
        assert resp.status_code == 201
        assert resp.json()["saved"] == 0

    def test_saves_messages_and_returns_count(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.ai_mentor as ai_routes
        with patch.object(ai_routes, "_admin_client", return_value=_mock_admin_client_no_supabase()):
            resp = client.post(
                "/api/ai/voice/transcript",
                json={
                    "messages": [
                        {"role": "user", "content": "What is osmosis?"},
                        {"role": "assistant", "content": "Osmosis is the movement of water..."},
                    ],
                    "conversation_id": "conv-test-123",
                },
            )
        assert resp.status_code == 201
        assert resp.json()["saved"] == 2

    def test_validates_body(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        # Missing required 'messages' field
        resp = client.post("/api/ai/voice/transcript", json={})
        assert resp.status_code == 422


# ── Minor age-safety system prompt (gap item #2) ──────────────────────────


def _auth_user_with_claims(claims) -> AppAuthContext:
    return AppAuthContext(
        clerk_user_id="user_test_mentor",
        email="student@example.com",
        claims=claims,
        app_user_id=APP_USER_ID,
        role="student",
    )


class TestMinorSafetyPrompt:
    def _capture_system_prompt(self, client: TestClient, *, body_extra, auth):
        """POST a chat and return (system_prompt_text, ai_mentor_module)."""
        app.dependency_overrides[get_app_auth_context] = lambda: auth
        import routes.ai_mentor as ai_routes

        captured = {}

        def fake_call(messages):
            captured["messages"] = messages
            return "ok", 5

        with patch.object(ai_routes, "OPENAI_API_KEY", "test-key"), patch.object(
            ai_routes, "_call_openai", side_effect=fake_call
        ), patch.object(
            ai_routes, "_admin_client", return_value=_mock_admin_client_no_supabase()
        ):
            resp = client.post(
                "/api/ai/chat", json={"message": "help me study", **body_extra}
            )

        assert resp.status_code == 200, resp.text
        assert "messages" in captured, "OpenAI path was not exercised"
        return captured["messages"][0]["content"], ai_routes

    def test_minor_hint_injects_safety_prompt(self, client: TestClient):
        system, ai_routes = self._capture_system_prompt(
            client, body_extra={"is_minor": True}, auth=_auth_user()
        )
        assert ai_routes.MINOR_SAFETY_PROMPT in system
        assert ai_routes.BASE_SYSTEM_PROMPT in system  # base is never replaced

    def test_adult_hint_omits_safety_prompt(self, client: TestClient):
        system, ai_routes = self._capture_system_prompt(
            client, body_extra={"is_minor": False}, auth=_auth_user()
        )
        assert ai_routes.MINOR_SAFETY_PROMPT not in system
        assert ai_routes.BASE_SYSTEM_PROMPT in system

    def test_missing_hint_defaults_to_no_safety_prompt(self, client: TestClient):
        system, ai_routes = self._capture_system_prompt(
            client, body_extra={}, auth=_auth_user()
        )
        assert ai_routes.MINOR_SAFETY_PROMPT not in system

    def test_claims_minor_bracket_overrides_false_hint(self, client: TestClient):
        # JWT claim (authoritative) says minor; client hint says not. Claim wins.
        claims = {
            "sub": "user_test_mentor",
            "unsafe_metadata": {"ageGate": {"bracket": "minor_13_17"}},
        }
        system, ai_routes = self._capture_system_prompt(
            client, body_extra={"is_minor": False}, auth=_auth_user_with_claims(claims)
        )
        assert ai_routes.MINOR_SAFETY_PROMPT in system

    def test_claims_adult_bracket_overrides_true_hint(self, client: TestClient):
        claims = {
            "sub": "user_test_mentor",
            "unsafe_metadata": {"ageGate": {"bracket": "adult_18_plus"}},
        }
        system, ai_routes = self._capture_system_prompt(
            client, body_extra={"is_minor": True}, auth=_auth_user_with_claims(claims)
        )
        assert ai_routes.MINOR_SAFETY_PROMPT not in system
