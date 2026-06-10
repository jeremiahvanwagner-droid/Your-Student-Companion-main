from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from lib.audit import write_audit_log
from lib.clerk_auth import AppAuthContext, get_app_auth_context
from lib.supabase_client import SupabaseConfigError, get_supabase_admin_client

router = APIRouter(prefix="/api/reports", tags=["Reports"])


PRIORITY_ORDER = {"urgent": 0, "high": 1, "medium": 2, "low": 3}


class GenerateRequest(BaseModel):
    week_start: Optional[str] = None  # YYYY-MM-DD; snapped to Monday


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _admin_client():
    try:
        return get_supabase_admin_client()
    except SupabaseConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _parse_week_start(value: Optional[str]) -> date:
    if value:
        try:
            requested = date.fromisoformat(value)
        except (ValueError, TypeError) as exc:
            raise HTTPException(
                status_code=422, detail="Invalid week_start. Expected YYYY-MM-DD."
            ) from exc
    else:
        requested = datetime.now(timezone.utc).date()
    return requested - timedelta(days=requested.weekday())


def _parse_ts(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _compute_week(admin, user_id: str, week_start: date) -> Dict[str, Any]:
    """
    Aggregate one calendar week (Mon..Sun, UTC) of activity across
    assignments, focus_logs, study_sessions, and planner_blocks.
    """
    start_dt = datetime(week_start.year, week_start.month, week_start.day, tzinfo=timezone.utc)
    end_dt = start_dt + timedelta(days=7)
    now = datetime.now(timezone.utc)

    assignments = (
        admin.table("assignments")
        .select("id,subject_id,title,priority,status,due_date,completed_at")
        .eq("user_id", user_id)
        .execute()
        .data
        or []
    )

    focus_logs = (
        admin.table("focus_logs")
        .select("focus_minutes,logged_at")
        .eq("user_id", user_id)
        .gte("logged_at", start_dt.isoformat())
        .lt("logged_at", end_dt.isoformat())
        .execute()
        .data
        or []
    )

    sessions = (
        admin.table("study_sessions")
        .select("subject_id,duration_actual_minutes,completed_at")
        .eq("user_id", user_id)
        .gte("completed_at", start_dt.isoformat())
        .lt("completed_at", end_dt.isoformat())
        .execute()
        .data
        or []
    )

    blocks = (
        admin.table("planner_blocks")
        .select("id,completed,scheduled_start")
        .eq("user_id", user_id)
        .gte("scheduled_start", start_dt.isoformat())
        .lt("scheduled_start", end_dt.isoformat())
        .execute()
        .data
        or []
    )

    # Daily skeleton so charts always render a full week
    daily: List[Dict[str, Any]] = [
        {
            "date": (week_start + timedelta(days=i)).isoformat(),
            "focus_minutes": 0,
            "tasks_completed": 0,
        }
        for i in range(7)
    ]
    daily_index = {row["date"]: row for row in daily}

    tasks_completed = 0
    tasks_missed = 0
    subject_task_counts: Dict[str, int] = defaultdict(int)

    for task in assignments:
        completed_at = _parse_ts(task.get("completed_at"))
        if completed_at and start_dt <= completed_at < end_dt:
            tasks_completed += 1
            key = completed_at.date().isoformat()
            if key in daily_index:
                daily_index[key]["tasks_completed"] += 1
            if task.get("subject_id"):
                subject_task_counts[str(task["subject_id"])] += 1

        due = _parse_ts(task.get("due_date"))
        if (
            due
            and start_dt <= due < end_dt
            and due < now
            and task.get("status") in ("not_started", "in_progress")
        ):
            tasks_missed += 1

    focus_minutes_total = 0
    for log in focus_logs:
        minutes = int(log.get("focus_minutes") or 0)
        focus_minutes_total += minutes
        logged = _parse_ts(log.get("logged_at"))
        if logged:
            key = logged.date().isoformat()
            if key in daily_index:
                daily_index[key]["focus_minutes"] += minutes

    subject_focus_minutes: Dict[str, int] = defaultdict(int)
    for session in sessions:
        if session.get("subject_id"):
            subject_focus_minutes[str(session["subject_id"])] += int(
                session.get("duration_actual_minutes") or 0
            )

    # Top subject: most focused minutes this week, falling back to most
    # completed tasks when no subject-tagged sessions exist.
    top_subject_id = None
    if subject_focus_minutes:
        top_subject_id = max(subject_focus_minutes, key=subject_focus_minutes.get)
    elif subject_task_counts:
        top_subject_id = max(subject_task_counts, key=subject_task_counts.get)

    top_subject = None
    if top_subject_id:
        subject_rows = (
            admin.table("subjects")
            .select("id,name")
            .eq("id", top_subject_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        top_subject = subject_rows[0].get("name") if subject_rows else None

    blocks_scheduled = len(blocks)
    blocks_completed = sum(1 for b in blocks if b.get("completed"))

    # Next-week preview feeds the "Next Week Plan" card
    next_start = end_dt
    next_end = end_dt + timedelta(days=7)
    upcoming = []
    for task in assignments:
        due = _parse_ts(task.get("due_date"))
        if (
            due
            and next_start <= due < next_end
            and task.get("status") in ("not_started", "in_progress")
        ):
            upcoming.append(task)
    upcoming.sort(
        key=lambda t: (
            PRIORITY_ORDER.get(t.get("priority"), 4),
            t.get("due_date") or "",
        )
    )

    return {
        "week_start": week_start.isoformat(),
        "week_end": (week_start + timedelta(days=6)).isoformat(),
        "tasks_completed": tasks_completed,
        "tasks_missed": tasks_missed,
        "focus_minutes_total": focus_minutes_total,
        "top_subject": top_subject,
        "blocks_scheduled": blocks_scheduled,
        "blocks_completed": blocks_completed,
        "daily": daily,
        "next_week": {
            "assignments_due": len(upcoming),
            "top_priorities": [
                {
                    "id": t.get("id"),
                    "title": t.get("title"),
                    "priority": t.get("priority"),
                    "due_date": t.get("due_date"),
                }
                for t in upcoming[:3]
            ],
        },
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/weekly/current")
async def current_week_report(
    week_start: Optional[str] = Query(default=None),
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()
    snapped = _parse_week_start(week_start)
    report = _compute_week(admin, auth.app_user_id, snapped)
    return {"report": report}


@router.post("/weekly/generate", status_code=201)
async def generate_weekly_report(
    body: GenerateRequest,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()
    snapped = _parse_week_start(body.week_start)
    report = _compute_week(admin, auth.app_user_id, snapped)

    payload = {
        "user_id": auth.app_user_id,
        "week_start": report["week_start"],
        "tasks_completed": report["tasks_completed"],
        "tasks_missed": report["tasks_missed"],
        "focus_minutes_total": report["focus_minutes_total"],
        "top_subject": report["top_subject"],
        "insights_json": {
            "daily": report["daily"],
            "blocks_scheduled": report["blocks_scheduled"],
            "blocks_completed": report["blocks_completed"],
            "next_week": report["next_week"],
        },
    }

    result = (
        admin.table("weekly_reports")
        .upsert(payload, on_conflict="user_id,week_start")
        .execute()
    )
    saved = (result.data or [{}])[0]

    write_audit_log(
        admin,
        actor_id=auth.app_user_id,
        action="weekly_report.generate",
        entity_type="weekly_report",
        entity_id=saved.get("id"),
        metadata={"week_start": report["week_start"]},
    )

    return {"report": saved}


@router.get("/weekly/history")
async def weekly_report_history(
    limit: int = Query(default=12, ge=1, le=52),
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()
    rows = (
        admin.table("weekly_reports")
        .select(
            "id,week_start,tasks_completed,tasks_missed,"
            "focus_minutes_total,top_subject,insights_json,created_at"
        )
        .eq("user_id", auth.app_user_id)
        .order("week_start", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )
    return {"reports": rows, "count": len(rows)}
