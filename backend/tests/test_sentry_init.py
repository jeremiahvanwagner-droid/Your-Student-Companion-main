from __future__ import annotations

import os
from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import pytest

from lib.sentry_init import (
    init_sentry,
    reset_for_tests,
    scrub_pii_event,
)


# ── scrub_pii_event ────────────────────────────────────────────────────


def test_scrub_pii_removes_user_email():
    event = {"user": {"id": "user_abc", "email": "a@b.com"}}
    result = scrub_pii_event(event, {})
    assert result["user"] == {"id": "user_abc"}


def test_scrub_pii_removes_user_username():
    event = {"user": {"id": "user_abc", "username": "screenname"}}
    result = scrub_pii_event(event, {})
    assert result["user"] == {"id": "user_abc"}


def test_scrub_pii_removes_user_ip_address():
    event = {"user": {"id": "user_abc", "ip_address": "192.0.2.1"}}
    result = scrub_pii_event(event, {})
    assert result["user"] == {"id": "user_abc"}


def test_scrub_pii_preserves_user_id():
    event = {"user": {"id": "user_abc", "email": "a@b.com", "username": "x"}}
    result = scrub_pii_event(event, {})
    assert result["user"]["id"] == "user_abc"


def test_scrub_pii_removes_authorization_header_any_casing():
    event = {
        "request": {
            "headers": {
                "Authorization": "Bearer secret",
                "Content-Type": "application/json",
            }
        }
    }
    result = scrub_pii_event(event, {})
    assert result["request"]["headers"] == {"Content-Type": "application/json"}


def test_scrub_pii_removes_lowercase_authorization():
    event = {
        "request": {
            "headers": {
                "authorization": "Bearer secret",
                "content-type": "application/json",
            }
        }
    }
    result = scrub_pii_event(event, {})
    assert result["request"]["headers"] == {"content-type": "application/json"}


def test_scrub_pii_removes_cookie_header():
    event = {"request": {"headers": {"Cookie": "session=abc"}}}
    result = scrub_pii_event(event, {})
    assert result["request"]["headers"] == {}


def test_scrub_pii_removes_request_cookies():
    event = {"request": {"cookies": {"session": "abc"}, "url": "https://x.test"}}
    result = scrub_pii_event(event, {})
    assert "cookies" not in result["request"]
    assert result["request"]["url"] == "https://x.test"


def test_scrub_pii_returns_event_so_error_is_still_reported():
    event = {"user": {"id": "x", "email": "a@b.com"}}
    assert scrub_pii_event(event, {}) is not None


def test_scrub_pii_tolerates_event_without_user_or_request():
    event = {"exception": {"values": [{"type": "Error"}]}}
    result = scrub_pii_event(event, {})
    assert "exception" in result


def test_scrub_pii_tolerates_none():
    assert scrub_pii_event(None, {}) is None


# ── init_sentry ────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _reset_sentry_init():
    """Reset the singleton between tests so each starts clean."""
    reset_for_tests()
    yield
    reset_for_tests()


def test_init_sentry_returns_false_when_no_dsn(monkeypatch):
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    assert init_sentry(dsn=None) is False


def test_init_sentry_returns_false_for_empty_dsn():
    assert init_sentry(dsn="") is False


def test_init_sentry_returns_true_when_dsn_provided():
    # Use a valid-looking DSN so the SDK's init doesn't reject the format.
    # The SDK accepts any reachable-looking URL even if it doesn't ping.
    result = init_sentry(
        dsn="https://abc@o1.ingest.sentry.io/1",
        environment="test",
    )
    assert result is True


def test_init_sentry_is_idempotent():
    init_sentry(dsn="https://abc@o1.ingest.sentry.io/1", environment="test")
    assert init_sentry(dsn="https://abc@o1.ingest.sentry.io/1", environment="test") is True


def test_init_sentry_reads_env_when_dsn_omitted(monkeypatch):
    monkeypatch.setenv("SENTRY_DSN", "https://abc@o1.ingest.sentry.io/1")
    monkeypatch.setenv("APP_ENV", "test")
    assert init_sentry() is True
