"""
Sentry backend integration.

Called once from server.py at module import (before FastAPI() construction)
so the SDK can hook into every uvicorn worker. No-ops cleanly when SENTRY_DSN
is missing — local dev and CI runs without Sentry credentials still work.

PII handling: scrub_pii_event drops Clerk emails and Authorization headers
from every event before send. We never want a captured exception to carry
a JWT bearer token (an attacker reading our Sentry inbox could replay it)
or the user's email (we report on stable Clerk user ids only).
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

logger = logging.getLogger(__name__)

DEFAULT_TRACES_SAMPLE_RATE = 0.1
DEFAULT_PROFILES_SAMPLE_RATE = 0.0  # Profiling off by default — opt-in later.

_initialized = False


def _scrub_request_headers(headers: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Strip Authorization and Cookie headers regardless of casing."""
    if not headers:
        return headers
    cleaned: Dict[str, Any] = {}
    for name, value in headers.items():
        lower = name.lower()
        if lower in ("authorization", "cookie"):
            continue
        cleaned[name] = value
    return cleaned


def scrub_pii_event(event: Dict[str, Any], hint: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Sentry before_send hook. Mutates the event payload in place so PII never
    leaves the process. Returns the event so it is still sent — we want
    errors reported, just not the PII fields on them. Returning None would
    drop the event entirely.
    """
    if not event:
        return event

    # User scope: keep only id. setUser(id=...) is the only call site that
    # writes here, but Sentry's auto-context may add email/ip via the
    # FastAPI integration on certain code paths.
    user = event.get("user")
    if isinstance(user, dict):
        for key in ("email", "username", "ip_address"):
            user.pop(key, None)

    request = event.get("request")
    if isinstance(request, dict):
        request["headers"] = _scrub_request_headers(request.get("headers"))
        request.pop("cookies", None)

    return event


def init_sentry(
    dsn: Optional[str] = None,
    environment: Optional[str] = None,
    release: Optional[str] = None,
    traces_sample_rate: float = DEFAULT_TRACES_SAMPLE_RATE,
    profiles_sample_rate: float = DEFAULT_PROFILES_SAMPLE_RATE,
) -> bool:
    """
    Initialize Sentry. Safe to call multiple times — subsequent calls no-op.
    Reads from env when args are omitted.

    Returns True if Sentry was initialized, False if skipped (no DSN).
    """
    global _initialized

    if _initialized:
        return True

    resolved_dsn = dsn if dsn is not None else os.getenv("SENTRY_DSN")
    if not resolved_dsn:
        logger.info("[sentry] SENTRY_DSN not set — skipping init (SDK no-op)")
        return False

    resolved_env = environment or os.getenv("SENTRY_ENVIRONMENT") or os.getenv("APP_ENV") or "development"
    # Vercel and Render both expose the commit sha as different env vars.
    # Falling back through both keeps backend release stamping aligned with
    # the frontend webpack source-map plugin (which uses the same sha).
    resolved_release = (
        release
        or os.getenv("SENTRY_RELEASE")
        or os.getenv("RENDER_GIT_COMMIT")
        or os.getenv("VERCEL_GIT_COMMIT_SHA")
        or None
    )

    sentry_sdk.init(
        dsn=resolved_dsn,
        environment=resolved_env,
        release=resolved_release,
        traces_sample_rate=traces_sample_rate,
        profiles_sample_rate=profiles_sample_rate,
        send_default_pii=False,
        integrations=[
            FastApiIntegration(),
            StarletteIntegration(),
        ],
        before_send=scrub_pii_event,
    )

    _initialized = True
    logger.info("[sentry] initialized (env=%s)", resolved_env)
    return True


def identify_sentry_user(clerk_user_id: Optional[str], app_user_id: Optional[str] = None) -> None:
    """
    Tag the current Sentry scope with the Clerk user id so subsequent
    captured errors carry it. We deliberately do NOT include email — the
    scrub hook would drop it anyway, this is belt-and-suspenders.
    """
    if not clerk_user_id:
        return
    payload: Dict[str, Any] = {"id": clerk_user_id}
    if app_user_id:
        payload["app_user_id"] = app_user_id
    sentry_sdk.set_user(payload)


def reset_for_tests() -> None:
    """Reset the initialized flag so tests can re-init with different config."""
    global _initialized
    _initialized = False
