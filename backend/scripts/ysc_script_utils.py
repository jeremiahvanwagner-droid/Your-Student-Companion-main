"""
Small helpers shared by the operational scripts in backend/scripts.

Scripts are run as `python backend/scripts/<name>.py`, so this module is
importable as a sibling (`import ysc_script_utils`). It deliberately has no
dependency on the backend package so it can be imported before sys.path is
adjusted.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv


SCRIPTS_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPTS_DIR.parent
ROOT_DIR = BACKEND_DIR.parent

LIVE_KEY_PREFIX = "sk_live_"
MIGRATIONS_HINT = (
    "Apply the schema from supabase/migrations/ with `supabase db push` "
    "(see docs/runbooks/database.md)."
)


def load_environment() -> None:
    """Load backend/.env then root .env.local (first value wins, as python-dotenv does)."""
    load_dotenv(BACKEND_DIR / ".env")
    load_dotenv(ROOT_DIR / ".env.local")


def is_live_stripe_key(key: Optional[str]) -> bool:
    return bool(key) and str(key).startswith(LIVE_KEY_PREFIX)


def stripe_key_guard_error(key: Optional[str], allow_live: bool) -> Optional[str]:
    """
    Return an error message when `key` is a Stripe Live secret key and the
    caller did not pass --live; None when the key is acceptable.

    Every Stripe-touching script refuses `sk_live_` keys by default so a
    Test-mode procedure can never be pointed at the Live account by a stray
    environment variable.
    """
    if is_live_stripe_key(key) and not allow_live:
        return (
            "STRIPE_SECRET_KEY is a LIVE key (sk_live_...). Refusing to continue. "
            "Re-run with --live only if you intend to modify the Live Stripe account."
        )
    return None


def ensure_backend_on_path() -> None:
    """Make `lib.*` importable when a script is run from the repo root."""
    import sys

    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))


def env_or_none(name: str) -> Optional[str]:
    value = os.getenv(name)
    return value if value else None
