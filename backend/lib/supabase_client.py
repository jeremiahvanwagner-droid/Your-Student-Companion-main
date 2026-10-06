"""
Supabase client helpers for backend routes and scripts.

Only a service-role client exists (decision D2: Clerk is the sole identity
provider, RLS is deny-all for `anon`/`authenticated`, and every backend read
or write goes through `service_role`). The anon client was removed with the
Supabase Auth cutover; nothing imported it.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from dotenv import load_dotenv
from supabase import Client, create_client


BACKEND_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BACKEND_DIR.parent

# Load env files eagerly so routes work when uvicorn is started without manual export.
load_dotenv(BACKEND_DIR / ".env")
load_dotenv(ROOT_DIR / ".env.local")

# Hosts accepted when SUPABASE_PROJECT_REF is the literal "local"
# (`supabase start` serves PostgREST on 127.0.0.1:54321).
LOCAL_PROJECT_REF = "local"
LOCAL_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})


class SupabaseConfigError(RuntimeError):
    """Raised when required Supabase environment variables are missing or inconsistent."""


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise SupabaseConfigError(f"Missing required environment variable: {name}")
    return value


def project_ref_mismatch(supabase_url: str, expected_ref: Optional[str]) -> Optional[str]:
    """
    Return a human-readable reason when `supabase_url` does not point at the
    expected Supabase project, or None when it does (or when no expectation
    is set).

    `expected_ref` is either a project ref (the `<ref>` in
    `https://<ref>.supabase.co`) or the literal "local", which accepts the
    loopback hosts used by `supabase start`.

    This exists to kill the Windows env-collision failure mode: a User-scope
    `SUPABASE_URL` silently overriding `backend/.env` and pointing every script
    at the wrong (or a deleted) project. The check is env-based on purpose —
    `supabase/config.toml` is not in the backend Docker image.
    """
    expected = (expected_ref or "").strip()
    if not expected:
        return None

    host = (urlparse(supabase_url).hostname or "").lower()
    if not host:
        return f"SUPABASE_URL has no parseable host: {supabase_url!r}"

    if expected.lower() == LOCAL_PROJECT_REF:
        if host in LOCAL_HOSTS:
            return None
        return (
            f"SUPABASE_PROJECT_REF is 'local' but SUPABASE_URL host is {host!r} "
            f"(expected one of {sorted(LOCAL_HOSTS)})"
        )

    if expected.lower() in host:
        return None

    return (
        f"SUPABASE_URL host {host!r} does not contain SUPABASE_PROJECT_REF {expected!r}. "
        "Check for a stale User-scope SUPABASE_URL overriding backend/.env "
        "(see memory: env var collision footgun)."
    )


def assert_project_ref(supabase_url: str, expected_ref: Optional[str]) -> None:
    """Raise SupabaseConfigError when `project_ref_mismatch` reports a problem."""
    reason = project_ref_mismatch(supabase_url, expected_ref)
    if reason:
        raise SupabaseConfigError(reason)


@lru_cache(maxsize=1)
def get_supabase_admin_client() -> Client:
    """
    Returns a cached Supabase client configured with service role credentials.
    Use this for privileged backend operations (webhooks, catalog updates, etc).

    When `SUPABASE_PROJECT_REF` is set, the `SUPABASE_URL` host must contain it
    (or be a loopback host when the ref is "local"); otherwise a
    SupabaseConfigError is raised before any network call is made.
    """
    supabase_url = _require_env("SUPABASE_URL")
    service_role_key = _require_env("SUPABASE_SERVICE_ROLE_KEY")
    assert_project_ref(supabase_url, os.getenv("SUPABASE_PROJECT_REF"))
    return create_client(supabase_url, service_role_key)
