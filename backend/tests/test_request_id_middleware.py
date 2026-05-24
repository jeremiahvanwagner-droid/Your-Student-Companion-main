from __future__ import annotations

from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import re

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from lib.request_id import REQUEST_ID_HEADER, RequestIdMiddleware


def _build_app() -> FastAPI:
    """
    Build a minimal app exercising only the request-id middleware so the
    test stays hermetic from the full server.py wiring (auth + Sentry +
    JSON logging would otherwise need to be torn down per-test).
    """
    app = FastAPI()
    app.add_middleware(RequestIdMiddleware)

    @app.get("/ping")
    def ping(request: Request):
        return {"request_id_on_state": request.state.request_id}

    return app


def test_request_id_generated_when_missing():
    client = TestClient(_build_app())
    resp = client.get("/ping")
    assert resp.status_code == 200
    rid = resp.headers.get(REQUEST_ID_HEADER)
    assert rid is not None
    # uuid4 hex is 32 chars, alphanumeric
    assert re.fullmatch(r"[a-f0-9]{32}", rid), rid
    assert resp.json()["request_id_on_state"] == rid


def test_request_id_echoed_when_valid_id_provided():
    client = TestClient(_build_app())
    provided = "frontend-abc-123"
    resp = client.get("/ping", headers={REQUEST_ID_HEADER: provided})
    assert resp.headers.get(REQUEST_ID_HEADER) == provided
    assert resp.json()["request_id_on_state"] == provided


def test_request_id_replaced_when_too_long():
    client = TestClient(_build_app())
    too_long = "x" * 100
    resp = client.get("/ping", headers={REQUEST_ID_HEADER: too_long})
    rid = resp.headers.get(REQUEST_ID_HEADER)
    assert rid != too_long
    assert len(rid) == 32  # generated uuid4 hex


def test_request_id_replaced_when_contains_invalid_chars():
    client = TestClient(_build_app())
    bad = "bad id with spaces and (parens)"
    resp = client.get("/ping", headers={REQUEST_ID_HEADER: bad})
    rid = resp.headers.get(REQUEST_ID_HEADER)
    assert rid != bad
    assert re.fullmatch(r"[a-f0-9]{32}", rid)


def test_request_id_replaced_when_empty_string():
    client = TestClient(_build_app())
    resp = client.get("/ping", headers={REQUEST_ID_HEADER: ""})
    rid = resp.headers.get(REQUEST_ID_HEADER)
    assert rid is not None
    assert re.fullmatch(r"[a-f0-9]{32}", rid)


def test_request_id_is_unique_per_request():
    client = TestClient(_build_app())
    rid1 = client.get("/ping").headers[REQUEST_ID_HEADER]
    rid2 = client.get("/ping").headers[REQUEST_ID_HEADER]
    assert rid1 != rid2


def test_underscore_and_dash_are_accepted_in_incoming_id():
    client = TestClient(_build_app())
    provided = "abc_123-def"
    resp = client.get("/ping", headers={REQUEST_ID_HEADER: provided})
    assert resp.headers.get(REQUEST_ID_HEADER) == provided
