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


# ── Daily token budget (Market Thirteen #7) ──────────────────────────────

def _budget_table_mock(rows):
    table_mock = MagicMock()
    result = MagicMock()
    result.data = rows
    for method in ("select", "insert", "update", "delete", "eq", "in_", "gte", "order", "limit"):
        getattr(table_mock, method).return_value = table_mock
    table_mock.execute.return_value = result
    admin = MagicMock()
    admin.table.return_value = table_mock
    return admin


class TestDailyBudget:
    def test_exhausted_budget_returns_429(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.ai_mentor as ai_mentor

        with patch.object(ai_mentor, "OPENAI_API_KEY", "sk-test"), \
             patch.object(ai_mentor, "AI_DAILY_TOKEN_BUDGET", 50000), \
             patch.object(ai_mentor, "_fetch_purchased_pack_contexts", return_value=[]), \
             patch.object(ai_mentor, "_tokens_used_today", return_value=50000) as used, \
             patch.object(ai_mentor, "_call_openai") as call_openai:
            resp = client.post("/api/ai/chat", json={"message": "Help me plan"})

        assert resp.status_code == 429
        assert "limit" in resp.json()["detail"].lower()
        used.assert_called_once_with(APP_USER_ID)
        call_openai.assert_not_called()

    def test_under_budget_proceeds(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.ai_mentor as ai_mentor

        with patch.object(ai_mentor, "OPENAI_API_KEY", "sk-test"), \
             patch.object(ai_mentor, "AI_DAILY_TOKEN_BUDGET", 50000), \
             patch.object(ai_mentor, "_fetch_purchased_pack_contexts", return_value=[]), \
             patch.object(ai_mentor, "_tokens_used_today", return_value=120), \
             patch.object(ai_mentor, "_call_openai", return_value=("Sure, here's a plan.", 42)), \
             patch.object(ai_mentor, "_persist_ai_interaction"):
            resp = client.post("/api/ai/chat", json={"message": "Help me plan"})

        assert resp.status_code == 200
        body = resp.json()
        assert body["message"] == "Sure, here's a plan."
        assert body["tokens_used"] == 42

    def test_budget_disabled_skips_check(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.ai_mentor as ai_mentor

        with patch.object(ai_mentor, "OPENAI_API_KEY", "sk-test"), \
             patch.object(ai_mentor, "AI_DAILY_TOKEN_BUDGET", 0), \
             patch.object(ai_mentor, "_fetch_purchased_pack_contexts", return_value=[]), \
             patch.object(ai_mentor, "_tokens_used_today") as used, \
             patch.object(ai_mentor, "_call_openai", return_value=("ok", 5)), \
             patch.object(ai_mentor, "_persist_ai_interaction"):
            resp = client.post("/api/ai/chat", json={"message": "hi"})

        assert resp.status_code == 200
        used.assert_not_called()

    def test_tokens_used_today_sums_and_ignores_nulls(self):
        import routes.ai_mentor as ai_mentor

        admin = _budget_table_mock(
            [{"tokens_used": 30}, {"tokens_used": None}, {"tokens_used": 12}]
        )
        with patch.object(ai_mentor, "_admin_client", return_value=admin):
            assert ai_mentor._tokens_used_today(APP_USER_ID) == 42

    def test_tokens_used_today_fails_open(self):
        import routes.ai_mentor as ai_mentor

        admin = MagicMock()
        admin.table.side_effect = RuntimeError("supabase down")
        with patch.object(ai_mentor, "_admin_client", return_value=admin):
            assert ai_mentor._tokens_used_today(APP_USER_ID) == 0
