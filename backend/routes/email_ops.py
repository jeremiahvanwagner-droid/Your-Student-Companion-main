from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import HTMLResponse

from lib.email import (
    email_enabled,
    is_opted_out,
    send_email,
    weekly_reset_email_html,
)
from lib.rate_limit import limiter
from lib.supabase_client import SupabaseConfigError, get_supabase_admin_client
from routes.reports import _compute_week, _parse_week_start

router = APIRouter(prefix="/api/email", tags=["Email"])

RUN_USER_CAP = 500


def _admin_client():
    try:
        return get_supabase_admin_client()
    except SupabaseConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _app_base_url() -> str:
    return (os.getenv("FRONTEND_BASE_URL") or "https://ysc.growthbychoice.com").rstrip("/")


def _api_base_url() -> str:
    return (os.getenv("API_BASE_URL") or "").rstrip("/")


def weekly_reset_reference(user_id: str, week_start_iso: str) -> str:
    """
    Deterministic UUID per (user, week) so the reminders unique index
    (user_id, reminder_type, reference_id) makes repeated cron runs no-ops.
    """
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"ysc:weekly-reset:{user_id}:{week_start_iso}"))


def _require_cron_token(provided: Optional[str]) -> None:
    expected = os.getenv("CRON_SECRET")
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="Weekly reset runner is not configured. Set CRON_SECRET.",
        )
    if not provided or provided != expected:
        raise HTTPException(status_code=403, detail="Invalid cron token")


@router.post("/weekly-reset-run")
async def weekly_reset_run(
    x_cron_token: Optional[str] = Header(default=None, alias="X-Cron-Token"),
):
    """
    Weekly reset pass (Module I + Market Thirteen #8): for every onboarded
    user, write the in-app `weekly_reset` reminder (idempotent) and send the
    weekly reset email (best-effort, honors opt-out). Trigger from a
    scheduler (Render cron / GitHub Action) on Sunday evenings UTC.
    """
    _require_cron_token(x_cron_token)
    admin = _admin_client()

    week_start = _parse_week_start(None)  # Monday of the current week (UTC)
    week_iso = week_start.isoformat()
    now = datetime.now(timezone.utc)

    profiles = (
        admin.table("student_profiles")
        .select("user_id,display_name,study_preferences,onboarding_completed")
        .eq("onboarding_completed", True)
        .limit(RUN_USER_CAP)
        .execute()
        .data
        or []
    )

    reminders_created = 0
    emails_sent = 0
    processed = 0

    for profile in profiles:
        user_id = str(profile.get("user_id") or "")
        if not user_id:
            continue
        processed += 1

        report: Dict[str, Any] = _compute_week(admin, user_id, week_start)

        reference_id = weekly_reset_reference(user_id, week_iso)
        try:
            result = (
                admin.table("reminders")
                .upsert(
                    {
                        "user_id": user_id,
                        "reminder_type": "weekly_reset",
                        "title": "Weekly reset: plan your next week",
                        "message": (
                            f"Last week: {report['tasks_completed']} tasks done, "
                            f"{report['focus_minutes_total']} focus minutes. "
                            f"{report['next_week']['assignments_due']} assignments due next week."
                        ),
                        "trigger_at": now.isoformat(),
                        "reference_id": reference_id,
                    },
                    on_conflict="user_id,reminder_type,reference_id",
                    ignore_duplicates=True,
                )
                .execute()
            )
            reminders_created += len(result.data or [])
        except Exception:  # pylint: disable=broad-except
            pass

        if not email_enabled():
            continue

        prefs = profile.get("study_preferences") or {}
        if is_opted_out(prefs):
            continue

        user_rows = (
            admin.table("users")
            .select("email")
            .eq("id", user_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        email = (user_rows[0].get("email") if user_rows else None) or ""
        if not email:
            continue

        unsubscribe_url = f"{_api_base_url() or _app_base_url()}/api/email/unsubscribe?u={user_id}"
        html = weekly_reset_email_html(
            profile.get("display_name"),
            report,
            _app_base_url(),
            unsubscribe_url,
        )
        if send_email(
            to=email,
            subject="Your weekly reset — plan the week ahead",
            html=html,
            study_preferences=prefs,
        ):
            emails_sent += 1

    return {
        "week_start": week_iso,
        "processed": processed,
        "reminders_created": reminders_created,
        "emails_sent": emails_sent,
        "email_enabled": email_enabled(),
        "capped": len(profiles) >= RUN_USER_CAP,
    }


@router.get("/unsubscribe", response_class=HTMLResponse)
@limiter.limit("10/minute")
async def unsubscribe(
    request: Request,
    u: str = Query(..., min_length=8, max_length=64),
):
    """
    One-click email opt-out (capability link carried in every email).
    Merges email_opt_out=true into student_profiles.study_preferences.
    """
    try:
        user_id = str(uuid.UUID(u))
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=422, detail="Invalid unsubscribe link") from exc

    admin = _admin_client()
    rows = (
        admin.table("student_profiles")
        .select("id,study_preferences")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if rows:
        prefs = rows[0].get("study_preferences") or {}
        if not isinstance(prefs, dict):
            prefs = {}
        prefs["email_opt_out"] = True
        (
            admin.table("student_profiles")
            .update({"study_preferences": prefs})
            .eq("user_id", user_id)
            .execute()
        )

    # Always render success — the link must never leak whether an account exists.
    return HTMLResponse(
        """
<!doctype html><html><head><meta charset="utf-8"><title>Unsubscribed</title></head>
<body style="font-family:Arial,sans-serif;background:#0a192f;color:#ccd6f6;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
  <div style="text-align:center;max-width:420px;padding:24px;">
    <h1 style="color:#64ffda;font-size:20px;">You're unsubscribed</h1>
    <p style="font-size:14px;">You won't receive study emails anymore. You can turn them back on anytime in the app under Settings.</p>
  </div>
</body></html>
""".strip()
    )
