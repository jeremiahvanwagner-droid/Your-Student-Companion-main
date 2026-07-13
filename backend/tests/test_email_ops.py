from __future__ import annotations

import os
from pathlib import Path
import sys
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from lib import email as email_lib
from routes.email_ops import weekly_reset_reference
from server import app

USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def clear_overrides():
    app.dependency_overrides = {}
    yield
    app.dependency_overrides = {}


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


# ── lib/email.py ──────────────────────────────────────────────────────────

class TestSendEmail:
    def test_noop_without_api_key(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("RESEND_API_KEY", None)
            assert email_lib.send_email(to="a@b.com", subject="s", html="<p>x</p>") is False

    def test_skips_opted_out_recipients(self):
        with patch.dict(os.environ, {"RESEND_API_KEY": "re_test"}):
            with patch.object(email_lib.requests, "post") as post:
                ok = email_lib.send_email(
                    to="a@b.com",
                    subject="s",
                    html="<p>x</p>",
                    study_preferences={"email_opt_out": True},
                )
        assert ok is False
        post.assert_not_called()

    def test_sends_via_resend_api(self):
        response = MagicMock()
        response.status_code = 200
        with patch.dict(os.environ, {"RESEND_API_KEY": "re_test", "EMAIL_FROM": "YSC <hi@ysc.app>"}):
            with patch.object(email_lib.requests, "post", return_value=response) as post:
                ok = email_lib.send_email(to="a@b.com", subject="Hello", html="<p>x</p>")

        assert ok is True
        kwargs = post.call_args.kwargs
        assert kwargs["headers"]["Authorization"] == "Bearer re_test"
        assert kwargs["json"]["to"] == ["a@b.com"]
        assert kwargs["json"]["from"] == "YSC <hi@ysc.app>"

    def test_send_failure_returns_false(self):
        with patch.dict(os.environ, {"RESEND_API_KEY": "re_test"}):
            with patch.object(
                email_lib.requests, "post", side_effect=email_lib.requests.RequestException()
            ):
                assert email_lib.send_email(to="a@b.com", subject="s", html="x") is False

    def test_rejects_invalid_recipient(self):
        assert email_lib.send_email(to="not-an-email", subject="s", html="x") is False


# ── weekly reset runner ───────────────────────────────────────────────────

class TestWeeklyResetRun:
    def test_requires_configured_secret(self, client: TestClient):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("CRON_SECRET", None)
            resp = client.post("/api/email/weekly-reset-run")
        assert resp.status_code == 503

    def test_rejects_bad_token(self, client: TestClient):
        with patch.dict(os.environ, {"CRON_SECRET": "topsecret"}):
            resp = client.post(
                "/api/email/weekly-reset-run", headers={"X-Cron-Token": "wrong"}
            )
        assert resp.status_code == 403

    def test_creates_reminders_and_sends_email(self, client: TestClient):
        import routes.email_ops as email_ops

        profiles = [
            {
                "user_id": USER_ID,
                "display_name": "Maya",
                "study_preferences": {},
                "onboarding_completed": True,
            }
        ]
        admin, mocks = _mock_admin_tables(
            {
                "student_profiles": profiles,
                "reminders": [{"id": "new-reminder"}],
                "users": [{"email": "maya@example.com"}],
            }
        )

        fake_report = {
            "tasks_completed": 4,
            "focus_minutes_total": 90,
            "top_subject": "Biology",
            "next_week": {"assignments_due": 2, "top_priorities": []},
        }

        with patch.dict(os.environ, {"CRON_SECRET": "topsecret"}), \
             patch.object(email_ops, "_admin_client", return_value=admin), \
             patch.object(email_ops, "_compute_week", return_value=fake_report), \
             patch.object(email_ops, "email_enabled", return_value=True), \
             patch.object(email_ops, "send_email", return_value=True) as send:
            resp = client.post(
                "/api/email/weekly-reset-run", headers={"X-Cron-Token": "topsecret"}
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["processed"] == 1
        assert body["reminders_created"] == 1
        assert body["emails_sent"] == 1

        upsert_call = mocks["reminders"].upsert.call_args
        payload = upsert_call[0][0]
        assert payload["reminder_type"] == "weekly_reset"
        assert payload["reference_id"] == weekly_reset_reference(
            USER_ID, body["week_start"]
        )
        assert upsert_call[1]["ignore_duplicates"] is True
        send.assert_called_once()

    def test_opted_out_user_gets_reminder_but_no_email(self, client: TestClient):
        import routes.email_ops as email_ops

        profiles = [
            {
                "user_id": USER_ID,
                "display_name": "Maya",
                "study_preferences": {"email_opt_out": True},
                "onboarding_completed": True,
            }
        ]
        admin, _ = _mock_admin_tables(
            {
                "student_profiles": profiles,
                "reminders": [{"id": "new-reminder"}],
                "users": [{"email": "maya@example.com"}],
            }
        )
        fake_report = {
            "tasks_completed": 0,
            "focus_minutes_total": 0,
            "top_subject": None,
            "next_week": {"assignments_due": 0, "top_priorities": []},
        }

        with patch.dict(os.environ, {"CRON_SECRET": "topsecret"}), \
             patch.object(email_ops, "_admin_client", return_value=admin), \
             patch.object(email_ops, "_compute_week", return_value=fake_report), \
             patch.object(email_ops, "email_enabled", return_value=True), \
             patch.object(email_ops, "send_email") as send:
            resp = client.post(
                "/api/email/weekly-reset-run", headers={"X-Cron-Token": "topsecret"}
            )

        assert resp.status_code == 200
        assert resp.json()["reminders_created"] == 1
        assert resp.json()["emails_sent"] == 0
        send.assert_not_called()

    def test_reference_is_deterministic(self):
        a = weekly_reset_reference(USER_ID, "2026-07-13")
        b = weekly_reset_reference(USER_ID, "2026-07-13")
        c = weekly_reset_reference(USER_ID, "2026-07-20")
        assert a == b
        assert a != c


# ── unsubscribe ───────────────────────────────────────────────────────────

class TestUnsubscribe:
    def test_rejects_malformed_id(self, client: TestClient):
        import routes.email_ops as email_ops

        with patch.object(email_ops, "_admin_client", return_value=MagicMock()):
            resp = client.get("/api/email/unsubscribe?u=not-a-uuid")
        assert resp.status_code == 422

    def test_sets_opt_out_and_renders_page(self, client: TestClient):
        import routes.email_ops as email_ops

        rows = [{"id": "profile-1", "study_preferences": {"subjects": ["bio"]}}]
        admin, mocks = _mock_admin_tables({"student_profiles": rows})
        with patch.object(email_ops, "_admin_client", return_value=admin):
            resp = client.get(f"/api/email/unsubscribe?u={USER_ID}")

        assert resp.status_code == 200
        assert "unsubscribed" in resp.text.lower()
        updates = mocks["student_profiles"].update.call_args[0][0]
        assert updates["study_preferences"]["email_opt_out"] is True
        assert updates["study_preferences"]["subjects"] == ["bio"]

    def test_unknown_user_still_renders_success(self, client: TestClient):
        import routes.email_ops as email_ops

        admin, _ = _mock_admin_tables({"student_profiles": []})
        with patch.object(email_ops, "_admin_client", return_value=admin):
            resp = client.get(f"/api/email/unsubscribe?u={USER_ID}")
        assert resp.status_code == 200
        assert "unsubscribed" in resp.text.lower()
