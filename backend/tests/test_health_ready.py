"""
Health endpoint tests for server.py.

/health is the liveness probe (Render healthCheckPath + Dockerfile
HEALTHCHECK) and must stay static: it answers 200 even while the database
is unreachable so the platform never restarts a healthy process over a DB
outage. /api/health/ready is the readiness probe: it must prove one
round-trip through the service-role client within READY_TIMEOUT_SECONDS,
answer 503 otherwise, and never echo failure detail to the caller.
"""

from __future__ import annotations

from pathlib import Path
import sys
import threading
from unittest.mock import MagicMock

from fastapi.testclient import TestClient
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import server
from lib.supabase_client import SupabaseConfigError
from server import app


@pytest.fixture()
def client():
    return TestClient(app)


def _admin_client(execute_side_effect):
    """
    Mock admin client whose table().select().limit().execute() chain ends in
    `execute_side_effect` (a return-value callable or an exception instance).
    """
    admin = MagicMock()
    builder = MagicMock()
    for method in ("select", "limit"):
        getattr(builder, method).return_value = builder
    builder.execute.side_effect = execute_side_effect
    admin.table.return_value = builder
    return admin


def _result(rows):
    result = MagicMock()
    result.data = rows
    return result


# ── Liveness ──────────────────────────────────────────────────────────────


class TestLiveness:
    def test_health_is_static_and_never_touches_db(self, client, monkeypatch):
        # If liveness ever reached for the DB client this would blow up.
        monkeypatch.setattr(
            server,
            "get_supabase_admin_client",
            MagicMock(side_effect=AssertionError("liveness must not touch the DB")),
        )
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "healthy"}

    def test_api_health_no_longer_claims_voice(self, client):
        # Plan §4-20: the voice mentor is deferred and was never a backend
        # service; /api/health must not advertise it.
        resp = client.get("/api/health")
        assert resp.status_code == 200
        services = resp.json()["services"]
        assert "voice" not in services
        assert "elevenlabs" not in resp.text.lower()
        assert services["api"] == "operational"

    def test_root_lists_readiness_endpoint(self, client):
        resp = client.get("/api/")
        assert resp.status_code == 200
        endpoints = resp.json()["endpoints"]
        assert endpoints["health"] == "/health"
        assert endpoints["health_ready"] == "/api/health/ready"


# ── Readiness ─────────────────────────────────────────────────────────────


class TestReadiness:
    def test_ready_when_db_answers(self, client, monkeypatch):
        admin = _admin_client(lambda: _result([{"id": 1}]))
        monkeypatch.setattr(server, "get_supabase_admin_client", lambda: admin)

        resp = client.get("/api/health/ready")

        assert resp.status_code == 200
        assert resp.json() == {"status": "ready", "db": "ok"}
        # Exactly the cheap query the plan specifies (§3.10).
        admin.table.assert_called_once_with("feature_flags")
        builder = admin.table.return_value
        builder.select.assert_called_once_with("id")
        builder.limit.assert_called_once_with(1)
        builder.execute.assert_called_once_with()

    def test_ready_when_table_is_empty(self, client, monkeypatch):
        # An unseeded feature_flags table still proves connectivity.
        admin = _admin_client(lambda: _result([]))
        monkeypatch.setattr(server, "get_supabase_admin_client", lambda: admin)

        resp = client.get("/api/health/ready")

        assert resp.status_code == 200
        assert resp.json() == {"status": "ready", "db": "ok"}

    def test_not_ready_when_query_raises_and_detail_is_not_leaked(self, client, monkeypatch):
        sensitive = "connection refused host=db.internal.example password=hunter2"
        admin = _admin_client(RuntimeError(sensitive))
        monkeypatch.setattr(server, "get_supabase_admin_client", lambda: admin)

        resp = client.get("/api/health/ready")

        assert resp.status_code == 503
        assert resp.json() == {"status": "not_ready", "db": "error"}
        assert "hunter2" not in resp.text
        assert "db.internal.example" not in resp.text
        assert "RuntimeError" not in resp.text

    def test_not_ready_when_client_factory_raises(self, client, monkeypatch):
        # Misconfiguration (missing env / wrong project ref) is "not ready",
        # and the variable name must not reach the caller either.
        monkeypatch.setattr(
            server,
            "get_supabase_admin_client",
            MagicMock(
                side_effect=SupabaseConfigError(
                    "Missing required environment variable: SUPABASE_URL"
                )
            ),
        )

        resp = client.get("/api/health/ready")

        assert resp.status_code == 503
        assert resp.json() == {"status": "not_ready", "db": "error"}
        assert "SUPABASE_URL" not in resp.text

    def test_not_ready_when_db_hangs_past_timeout(self, client, monkeypatch):
        started = threading.Event()
        release = threading.Event()

        def hang():
            started.set()
            # Simulates PostgREST never answering. Released in `finally` so
            # the worker thread does not outlive this test.
            release.wait(timeout=10)
            return _result([])

        admin = _admin_client(hang)
        monkeypatch.setattr(server, "get_supabase_admin_client", lambda: admin)
        # The handler reads the module-level deadline at call time, so the
        # test can shrink it instead of waiting the real 2 seconds.
        monkeypatch.setattr(server, "READY_TIMEOUT_SECONDS", 0.05)

        try:
            resp = client.get("/api/health/ready")
        finally:
            release.set()

        assert started.is_set(), "probe must actually have been submitted"
        assert resp.status_code == 503
        assert resp.json() == {"status": "not_ready", "db": "error"}

    def test_recovers_after_a_failure(self, client, monkeypatch):
        # A failed probe must not poison the executor or the cached client
        # path: the very next call with a healthy DB is ready again.
        failing = _admin_client(RuntimeError("boom"))
        monkeypatch.setattr(server, "get_supabase_admin_client", lambda: failing)
        assert client.get("/api/health/ready").status_code == 503

        healthy = _admin_client(lambda: _result([{"id": 1}]))
        monkeypatch.setattr(server, "get_supabase_admin_client", lambda: healthy)
        resp = client.get("/api/health/ready")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ready", "db": "ok"}
