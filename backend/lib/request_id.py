"""
Request ID middleware.

Generates (or echoes) an X-Request-ID header on every request, attaches it
to request.state.request_id, propagates it to Sentry scope and the
structured-logging context, and stamps the response header so the client
can quote it back when reporting an issue.

Why per-request ids:
  - On a multi-worker FastAPI deploy, the only way to correlate a frontend
    error report with a specific backend log line is a shared id.
  - Sentry events carry this id as `tags.request_id`, so a single value
    on a user's screen drills into both the frontend stack trace and the
    matching backend log/Sentry event.
"""

from __future__ import annotations

import logging
import uuid
from typing import Awaitable, Callable

import sentry_sdk
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)

REQUEST_ID_HEADER = "X-Request-ID"


def _generate_request_id() -> str:
    return uuid.uuid4().hex


def _is_valid_incoming_id(value: str) -> bool:
    """
    Cap length and restrict charset on inbound ids — we put this value
    in log lines and Sentry tags, so we don't want anyone injecting
    structured-logging syntax or oversized payloads via a client header.
    """
    if not value:
        return False
    if len(value) > 64:
        return False
    return all(ch.isalnum() or ch in "-_" for ch in value)


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        incoming = request.headers.get(REQUEST_ID_HEADER, "").strip()
        request_id = incoming if _is_valid_incoming_id(incoming) else _generate_request_id()

        request.state.request_id = request_id

        # Stamp the Sentry scope so any exception captured during this
        # request carries the id as a searchable tag.
        scope = sentry_sdk.get_current_scope()
        scope.set_tag("request_id", request_id)

        response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = request_id
        return response
