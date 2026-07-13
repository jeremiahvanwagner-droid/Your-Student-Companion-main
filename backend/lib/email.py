"""
Transactional email via Resend's HTTPS API (Market Thirteen #8).

Uses `requests` directly — no SDK dependency — and follows the repo's
no-op contract: without RESEND_API_KEY every send returns False silently,
so local dev and CI never need email credentials.

Opt-out: callers pass the recipient's student_profiles.study_preferences
dict; if it contains email_opt_out=True the send is skipped. Every
outbound email must include the unsubscribe link the templates render.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

import requests

logger = logging.getLogger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"
SEND_TIMEOUT_SECONDS = 10


def email_enabled() -> bool:
    return bool(os.getenv("RESEND_API_KEY"))


def default_sender() -> str:
    return os.getenv("EMAIL_FROM", "Your Student Companion <onboarding@resend.dev>")


def is_opted_out(study_preferences: Optional[Dict[str, Any]]) -> bool:
    if not isinstance(study_preferences, dict):
        return False
    return bool(study_preferences.get("email_opt_out"))


def send_email(
    *,
    to: str,
    subject: str,
    html: str,
    study_preferences: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Send one email. Returns True on acceptance by Resend, False on any
    skip or failure — callers treat email as best-effort and never block
    a user-facing flow on it.
    """
    if not to or "@" not in to:
        return False
    if is_opted_out(study_preferences):
        return False

    api_key = os.getenv("RESEND_API_KEY")
    if not api_key:
        return False

    try:
        response = requests.post(
            RESEND_ENDPOINT,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": default_sender(),
                "to": [to],
                "subject": subject,
                "html": html,
            },
            timeout=SEND_TIMEOUT_SECONDS,
        )
        if response.status_code in (200, 201):
            return True
        logger.warning(
            "resend_send_failed", extra={"status": response.status_code}
        )
        return False
    except requests.RequestException:
        logger.warning("resend_send_exception", exc_info=True)
        return False


# ---------------------------------------------------------------------------
# Templates — deliberately simple table-free HTML that renders everywhere.
# ---------------------------------------------------------------------------

def _frame(inner: str, unsubscribe_url: Optional[str]) -> str:
    footer_link = (
        f'<p style="font-size:12px;color:#8892b0;">Too many emails? '
        f'<a href="{unsubscribe_url}" style="color:#64ffda;">Unsubscribe</a> '
        f"or manage preferences in Settings.</p>"
        if unsubscribe_url
        else ""
    )
    return f"""
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#0a192f;color:#ccd6f6;border-radius:12px;">
  <p style="font-weight:bold;color:#64ffda;margin:0 0 16px;">Your Student Companion</p>
  {inner}
  {footer_link}
</div>
""".strip()


def welcome_email_html(display_name: Optional[str], app_url: str, unsubscribe_url: Optional[str]) -> str:
    name = display_name or "there"
    inner = f"""
  <h2 style="color:#e6f1ff;margin:0 0 12px;">Welcome, {name} 👋</h2>
  <p>Your study companion is ready. Three things worth doing in your first five minutes:</p>
  <ol>
    <li>Add your next assignment to the task board</li>
    <li>Start one 25-minute focus session</li>
    <li>Ask the AI mentor to help plan your week</li>
  </ol>
  <p><a href="{app_url}" style="color:#0a192f;background:#64ffda;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold;">Open your dashboard</a></p>
"""
    return _frame(inner, unsubscribe_url)


def weekly_reset_email_html(
    display_name: Optional[str],
    report: Dict[str, Any],
    app_url: str,
    unsubscribe_url: Optional[str],
) -> str:
    name = display_name or "there"
    tasks_done = report.get("tasks_completed", 0)
    focus_minutes = report.get("focus_minutes_total", 0)
    top_subject = report.get("top_subject") or "—"
    next_week = report.get("next_week") or {}
    due_next = next_week.get("assignments_due", 0)

    priorities = ""
    for task in (next_week.get("top_priorities") or [])[:3]:
        priorities += f'<li>{task.get("title", "Assignment")}</li>'
    priorities_block = (
        f"<p>Start with:</p><ul>{priorities}</ul>" if priorities else ""
    )

    inner = f"""
  <h2 style="color:#e6f1ff;margin:0 0 12px;">Your weekly reset, {name}</h2>
  <p>Last week: <strong>{tasks_done}</strong> tasks completed ·
     <strong>{focus_minutes}</strong> focus minutes ·
     top subject <strong>{top_subject}</strong>.</p>
  <p>Next week you have <strong>{due_next}</strong> assignment{"s" if due_next != 1 else ""} due.</p>
  {priorities_block}
  <p><a href="{app_url}/app/planner" style="color:#0a192f;background:#64ffda;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold;">Plan your week</a></p>
"""
    return _frame(inner, unsubscribe_url)
