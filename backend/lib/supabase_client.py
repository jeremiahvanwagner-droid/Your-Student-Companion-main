"""
Supabase client helpers for backend routes and scripts.
"""

from __future__ import annotations

import os
from functools import lru_cache

from supabase import Client, create_client


class SupabaseConfigError(RuntimeError):
    """Raised when required Supabase environment variables are missing."""


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise SupabaseConfigError(f"Missing required environment variable: {name}")
    return value


@lru_cache(maxsize=1)
def get_supabase_admin_client() -> Client:
    """
    Returns a cached Supabase client configured with service role credentials.
    Use this for privileged backend operations (webhooks, catalog updates, etc).
    """
    supabase_url = _require_env("SUPABASE_URL")
    service_role_key = _require_env("SUPABASE_SERVICE_ROLE_KEY")
    return create_client(supabase_url, service_role_key)


@lru_cache(maxsize=1)
def get_supabase_anon_client() -> Client:
    """
    Returns a cached Supabase client configured with anon key credentials.
    Useful for backend reads that should mirror client-side RLS behavior.
    """
    supabase_url = _require_env("SUPABASE_URL")
    anon_key = _require_env("SUPABASE_ANON_KEY")
    return create_client(supabase_url, anon_key)
