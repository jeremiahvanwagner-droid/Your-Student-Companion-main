from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from lib.audit import write_audit_log
from lib.clerk_auth import AppAuthContext, get_app_auth_context
from lib.supabase_client import SupabaseConfigError, get_supabase_admin_client

router = APIRouter(prefix="/api/reminders", tags=["Reminders"])


class ReminderCreate(BaseModel):
    reminder_type: str = Field(..., pattern=r"^(due_soon|overdue|study_block|weekly_reset)$")
    title: str = Field(..., min_length=1, max_length=200)
    message: Optional[str] = Field(default=None, max_length=1000)
    trigger_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _admin_client():
    try:
        return get_supabase_admin_client()
    except SupabaseConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _parse_uuid(value: str, field_name: str) -> str:
    try:
        return str(UUID(str(value).strip()))
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=422, detail=f"Invalid {field_name} format. Expected UUID."
        ) from exc


def _ensure_owner(row: Optional[Dict[str, Any]], user_id: str) -> Dict[str, Any]:
    if not row:
        raise HTTPException(status_code=404, detail="Reminder not found")
    if str(row.get("user_id")) != user_id:
        raise HTTPException(status_code=403, detail="Forbidden: user scope mismatch")
    return row


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


REMINDER_COLUMNS = (
    "id,user_id,reminder_type,title,message,trigger_at,reference_id,is_read,created_at"
)

DUE_SOON_WINDOW_HOURS = 24
STUDY_BLOCK_WINDOW_MINUTES = 60


def build_sync_payloads(
    user_id: str,
    assignments: List[Dict[str, Any]],
    blocks: List[Dict[str, Any]],
    now: datetime,
) -> List[Dict[str, Any]]:
    """
    Derive in-app reminders from current activity. Pure function — the
    route upserts the result with conflict-skip on
    (user_id, reminder_type, reference_id) so repeated syncs are no-ops.
    """
    payloads: List[Dict[str, Any]] = []
    due_horizon = now + timedelta(hours=DUE_SOON_WINDOW_HOURS)
    block_horizon = now + timedelta(minutes=STUDY_BLOCK_WINDOW_MINUTES)

    for task in assignments:
        if task.get("status") not in ("not_started", "in_progress"):
            continue
        due = _parse_ts(task.get("due_date"))
        if not due:
            continue

        title = str(task.get("title") or "Assignment")
        if due < now:
            payloads.append(
                {
                    "user_id": user_id,
                    "reminder_type": "overdue",
                    "title": f"Overdue: {title}"[:200],
                    "message": f"This assignment was due {due.date().isoformat()}. "
                    "Knock it out or reschedule it so it stops weighing on you.",
                    "trigger_at": now.isoformat(),
                    "reference_id": task.get("id"),
                }
            )
        elif due <= due_horizon:
            payloads.append(
                {
                    "user_id": user_id,
                    "reminder_type": "due_soon",
                    "title": f"Due soon: {title}"[:200],
                    "message": "This assignment is due within 24 hours. "
                    "A focused session now beats a scramble later.",
                    "trigger_at": now.isoformat(),
                    "reference_id": task.get("id"),
                }
            )

    for block in blocks:
        if block.get("completed"):
            continue
        start = _parse_ts(block.get("scheduled_start"))
        if not start or start < now or start > block_horizon:
            continue
        title = str(block.get("title") or "Study block")
        payloads.append(
            {
                "user_id": user_id,
                "reminder_type": "study_block",
                "title": f"Starting soon: {title}"[:200],
                "message": f"Your study block starts at "
                f"{start.strftime('%H:%M')} UTC. Get your space ready.",
                "trigger_at": now.isoformat(),
                "reference_id": block.get("id"),
            }
        )

    return payloads


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("")
async def list_reminders(
    unread_only: bool = Query(default=False),
    include_upcoming: bool = Query(default=False),
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()

    query = (
        admin.table("reminders")
        .select(REMINDER_COLUMNS)
        .eq("user_id", auth.app_user_id)
        .order("trigger_at", desc=True)
        .range(offset, offset + limit - 1)
    )
    if unread_only:
        query = query.eq("is_read", False)
    if not include_upcoming:
        query = query.lte("trigger_at", datetime.now(timezone.utc).isoformat())

    rows = query.execute().data or []

    # Count unread across ALL reminders, not just this page, so the bell
    # badge stays accurate when unread items fall outside the page limit.
    count_result = (
        admin.table("reminders")
        .select("id", count="exact")
        .eq("user_id", auth.app_user_id)
        .eq("is_read", False)
        .limit(1)
        .execute()
    )
    unread = count_result.count or 0

    return {"reminders": rows, "count": len(rows), "unread": unread}


@router.post("", status_code=201)
async def create_reminder(
    body: ReminderCreate,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()

    trigger_at = body.trigger_at or datetime.now(timezone.utc)
    payload: Dict[str, Any] = {
        "user_id": auth.app_user_id,
        "reminder_type": body.reminder_type,
        "title": body.title.strip(),
        "trigger_at": trigger_at.isoformat(),
    }
    if body.message:
        payload["message"] = body.message.strip()

    result = admin.table("reminders").insert(payload).execute()
    reminder = (result.data or [{}])[0]

    write_audit_log(
        admin,
        actor_id=auth.app_user_id,
        action="reminder.create",
        entity_type="reminder",
        entity_id=reminder.get("id"),
    )

    return {"reminder": reminder}


@router.post("/sync")
async def sync_reminders(
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    """
    Generate due_soon / overdue / study_block reminders from the user's
    current assignments and planner blocks. Idempotent: the unique index on
    (user_id, reminder_type, reference_id) makes repeats conflict-and-skip,
    so the bell can call this on every open without spamming.
    """
    admin = _admin_client()
    now = datetime.now(timezone.utc)

    assignments = (
        admin.table("assignments")
        .select("id,title,status,due_date")
        .eq("user_id", auth.app_user_id)
        .in_("status", ["not_started", "in_progress"])
        .execute()
        .data
        or []
    )

    blocks = (
        admin.table("planner_blocks")
        .select("id,title,scheduled_start,completed")
        .eq("user_id", auth.app_user_id)
        .gte("scheduled_start", now.isoformat())
        .lte("scheduled_start", (now + timedelta(minutes=STUDY_BLOCK_WINDOW_MINUTES)).isoformat())
        .execute()
        .data
        or []
    )

    payloads = build_sync_payloads(auth.app_user_id, assignments, blocks, now)

    created = 0
    if payloads:
        result = (
            admin.table("reminders")
            .upsert(
                payloads,
                on_conflict="user_id,reminder_type,reference_id",
                ignore_duplicates=True,
            )
            .execute()
        )
        created = len(result.data or [])

    return {"generated": created, "candidates": len(payloads)}


@router.patch("/{reminder_id}/read")
async def mark_read(
    reminder_id: str,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()
    rid = _parse_uuid(reminder_id, "reminder_id")

    rows = (
        admin.table("reminders")
        .select("id,user_id")
        .eq("id", rid)
        .limit(1)
        .execute()
        .data
        or []
    )
    _ensure_owner(rows[0] if rows else None, auth.app_user_id)

    result = admin.table("reminders").update({"is_read": True}).eq("id", rid).execute()
    reminder = (result.data or [{}])[0]
    return {"reminder": reminder}


@router.post("/read-all")
async def mark_all_read(
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()
    (
        admin.table("reminders")
        .update({"is_read": True})
        .eq("user_id", auth.app_user_id)
        .eq("is_read", False)
        .execute()
    )
    return {"ok": True}


@router.delete("/{reminder_id}", status_code=204)
async def delete_reminder(
    reminder_id: str,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()
    rid = _parse_uuid(reminder_id, "reminder_id")

    rows = (
        admin.table("reminders")
        .select("id,user_id")
        .eq("id", rid)
        .limit(1)
        .execute()
        .data
        or []
    )
    _ensure_owner(rows[0] if rows else None, auth.app_user_id)

    admin.table("reminders").delete().eq("id", rid).execute()
