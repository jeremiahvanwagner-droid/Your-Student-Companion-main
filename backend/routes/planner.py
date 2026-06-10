from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator

from lib.audit import write_audit_log
from lib.clerk_auth import AppAuthContext, get_app_auth_context
from lib.supabase_client import SupabaseConfigError, get_supabase_admin_client

router = APIRouter(prefix="/api/planner", tags=["Planner"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class BlockCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    goal: Optional[str] = Field(default=None, max_length=500)
    subject_id: Optional[str] = None
    assignment_id: Optional[str] = None
    scheduled_start: datetime
    scheduled_end: datetime
    source: str = Field(default="manual", pattern=r"^(manual|auto_suggest)$")

    @model_validator(mode="after")
    def _end_after_start(self):
        if self.scheduled_end <= self.scheduled_start:
            raise ValueError("scheduled_end must be after scheduled_start")
        return self


class BlockBulkCreate(BaseModel):
    blocks: List[BlockCreate] = Field(..., min_length=1, max_length=20)


class BlockUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=300)
    goal: Optional[str] = Field(default=None, max_length=500)
    subject_id: Optional[str] = None
    assignment_id: Optional[str] = None
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None

    @model_validator(mode="after")
    def _end_after_start(self):
        if (
            self.scheduled_start is not None
            and self.scheduled_end is not None
            and self.scheduled_end <= self.scheduled_start
        ):
            raise ValueError("scheduled_end must be after scheduled_start")
        return self


class BlockCompletePatch(BaseModel):
    completed: bool


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


def _ensure_block_owner(row: Optional[Dict[str, Any]], user_id: str) -> Dict[str, Any]:
    if not row:
        raise HTTPException(status_code=404, detail="Planner block not found")
    if str(row.get("user_id")) != user_id:
        raise HTTPException(status_code=403, detail="Forbidden: user scope mismatch")
    return row


def _parse_iso(value: str, field_name: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid {field_name}. Expected ISO-8601 datetime.",
        ) from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _block_insert_payload(user_id: str, body: BlockCreate) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "user_id": user_id,
        "title": body.title.strip(),
        "scheduled_start": body.scheduled_start.isoformat(),
        "scheduled_end": body.scheduled_end.isoformat(),
        "source": body.source,
    }
    if body.goal:
        payload["goal"] = body.goal.strip()
    if body.subject_id:
        payload["subject_id"] = _parse_uuid(body.subject_id, "subject_id")
    if body.assignment_id:
        payload["assignment_id"] = _parse_uuid(body.assignment_id, "assignment_id")
    return payload


BLOCK_COLUMNS = (
    "id,user_id,subject_id,assignment_id,title,goal,"
    "scheduled_start,scheduled_end,completed,source,created_at,updated_at"
)

SUGGEST_WINDOW_DAYS = 7
SUGGEST_DEFAULT_MINUTES = 45
SUGGEST_MAX_MINUTES = 120
SUGGEST_LOCAL_START_HOUR = 17  # 5pm local: after school, before late evening


def build_suggestions(
    assignments: List[Dict[str, Any]],
    planned_assignment_ids: set,
    tz_name: str,
    now: datetime,
) -> List[Dict[str, Any]]:
    """
    Propose one study block per due-soon assignment that has no future block
    yet. Blocks land the day before the due date at 5pm in the student's
    timezone (or the next full hour when that has already passed), staggered
    when several fall on the same day. Pure function: persisting is the
    client's call via POST /blocks or /blocks/bulk.
    """
    try:
        tz = ZoneInfo(tz_name)
    except Exception:  # pylint: disable=broad-except
        tz = ZoneInfo("America/New_York")

    suggestions: List[Dict[str, Any]] = []
    used_starts: Dict[str, int] = {}  # local date iso -> count scheduled that day

    def _next_start(local_day: datetime) -> datetime:
        day_key = local_day.date().isoformat()
        offset_slots = used_starts.get(day_key, 0)
        start = local_day.replace(
            hour=SUGGEST_LOCAL_START_HOUR, minute=0, second=0, microsecond=0
        ) + timedelta(minutes=75 * offset_slots)
        used_starts[day_key] = offset_slots + 1
        return start

    for assignment in assignments:
        if str(assignment.get("id")) in planned_assignment_ids:
            continue

        due_raw = assignment.get("due_date")
        if not due_raw:
            continue
        try:
            due = datetime.fromisoformat(str(due_raw).replace("Z", "+00:00"))
        except (ValueError, TypeError):
            continue
        if due.tzinfo is None:
            due = due.replace(tzinfo=timezone.utc)

        local_due = due.astimezone(tz)
        local_now = now.astimezone(tz)

        target_day = local_due - timedelta(days=1)
        if target_day.date() < local_now.date():
            target_day = local_now

        start = _next_start(target_day)
        if start <= local_now:
            start = (local_now + timedelta(hours=1)).replace(
                minute=0, second=0, microsecond=0
            )

        minutes = assignment.get("estimated_minutes") or SUGGEST_DEFAULT_MINUTES
        minutes = max(15, min(int(minutes), SUGGEST_MAX_MINUTES))
        end = start + timedelta(minutes=minutes)

        suggestions.append(
            {
                "title": f"Study: {assignment.get('title', 'Assignment')}"[:300],
                "goal": f"Prepare for due date {local_due.date().isoformat()}",
                "subject_id": assignment.get("subject_id"),
                "assignment_id": assignment.get("id"),
                "scheduled_start": start.astimezone(timezone.utc).isoformat(),
                "scheduled_end": end.astimezone(timezone.utc).isoformat(),
                "source": "auto_suggest",
                "assignment_title": assignment.get("title"),
                "assignment_due": due.isoformat(),
                "priority": assignment.get("priority"),
            }
        )

    return suggestions


# ---------------------------------------------------------------------------
# Blocks CRUD
# ---------------------------------------------------------------------------

@router.get("/blocks")
async def list_blocks(
    start: Optional[str] = Query(default=None),
    end: Optional[str] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()

    if start:
        range_start = _parse_iso(start, "start")
    else:
        today = datetime.now(timezone.utc)
        range_start = (today - timedelta(days=today.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

    range_end = _parse_iso(end, "end") if end else range_start + timedelta(days=7)

    if range_end <= range_start:
        raise HTTPException(status_code=422, detail="end must be after start")

    rows = (
        admin.table("planner_blocks")
        .select(BLOCK_COLUMNS)
        .eq("user_id", auth.app_user_id)
        .gte("scheduled_start", range_start.isoformat())
        .lt("scheduled_start", range_end.isoformat())
        .order("scheduled_start", desc=False)
        .range(offset, offset + limit - 1)
        .execute()
        .data
        or []
    )

    return {
        "blocks": rows,
        "count": len(rows),
        "range": {"start": range_start.isoformat(), "end": range_end.isoformat()},
    }


@router.post("/blocks", status_code=201)
async def create_block(
    body: BlockCreate,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()

    result = (
        admin.table("planner_blocks")
        .insert(_block_insert_payload(auth.app_user_id, body))
        .execute()
    )
    block = (result.data or [{}])[0]

    write_audit_log(
        admin,
        actor_id=auth.app_user_id,
        action="planner_block.create",
        entity_type="planner_block",
        entity_id=block.get("id"),
    )

    return {"block": block}


@router.post("/blocks/bulk", status_code=201)
async def create_blocks_bulk(
    body: BlockBulkCreate,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()

    payloads = [_block_insert_payload(auth.app_user_id, block) for block in body.blocks]
    result = admin.table("planner_blocks").insert(payloads).execute()
    blocks = result.data or []

    write_audit_log(
        admin,
        actor_id=auth.app_user_id,
        action="planner_block.bulk_create",
        entity_type="planner_block",
        entity_id=None,
        metadata={"count": len(payloads)},
    )

    return {"blocks": blocks, "count": len(blocks)}


@router.put("/blocks/{block_id}")
async def update_block(
    block_id: str,
    body: BlockUpdate,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()
    block_uuid = _parse_uuid(block_id, "block_id")

    rows = (
        admin.table("planner_blocks")
        .select("id,user_id,scheduled_start,scheduled_end")
        .eq("id", block_uuid)
        .limit(1)
        .execute()
        .data
        or []
    )
    existing = _ensure_block_owner(rows[0] if rows else None, auth.app_user_id)

    updates: Dict[str, Any] = {}
    if body.title is not None:
        updates["title"] = body.title.strip()
    if body.goal is not None:
        updates["goal"] = body.goal.strip()
    if body.subject_id is not None:
        updates["subject_id"] = (
            _parse_uuid(body.subject_id, "subject_id") if body.subject_id else None
        )
    if body.assignment_id is not None:
        updates["assignment_id"] = (
            _parse_uuid(body.assignment_id, "assignment_id") if body.assignment_id else None
        )
    if body.scheduled_start is not None:
        updates["scheduled_start"] = body.scheduled_start.isoformat()
    if body.scheduled_end is not None:
        updates["scheduled_end"] = body.scheduled_end.isoformat()

    # When only one bound moves, validate against the stored other bound so a
    # partial update can't invert the block.
    if ("scheduled_start" in updates) != ("scheduled_end" in updates):
        try:
            stored_start = datetime.fromisoformat(
                str(updates.get("scheduled_start", existing.get("scheduled_start"))).replace("Z", "+00:00")
            )
            stored_end = datetime.fromisoformat(
                str(updates.get("scheduled_end", existing.get("scheduled_end"))).replace("Z", "+00:00")
            )
            if stored_end <= stored_start:
                raise HTTPException(
                    status_code=422, detail="scheduled_end must be after scheduled_start"
                )
        except (ValueError, TypeError):
            pass

    if not updates:
        raise HTTPException(status_code=422, detail="No fields to update")

    result = (
        admin.table("planner_blocks").update(updates).eq("id", block_uuid).execute()
    )
    block = (result.data or [{}])[0]

    write_audit_log(
        admin,
        actor_id=auth.app_user_id,
        action="planner_block.update",
        entity_type="planner_block",
        entity_id=block_uuid,
    )

    return {"block": block}


@router.patch("/blocks/{block_id}/complete")
async def complete_block(
    block_id: str,
    body: BlockCompletePatch,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()
    block_uuid = _parse_uuid(block_id, "block_id")

    rows = (
        admin.table("planner_blocks")
        .select("id,user_id")
        .eq("id", block_uuid)
        .limit(1)
        .execute()
        .data
        or []
    )
    _ensure_block_owner(rows[0] if rows else None, auth.app_user_id)

    result = (
        admin.table("planner_blocks")
        .update({"completed": body.completed})
        .eq("id", block_uuid)
        .execute()
    )
    block = (result.data or [{}])[0]

    write_audit_log(
        admin,
        actor_id=auth.app_user_id,
        action="planner_block.complete",
        entity_type="planner_block",
        entity_id=block_uuid,
        metadata={"completed": body.completed},
    )

    return {"block": block}


@router.delete("/blocks/{block_id}", status_code=204)
async def delete_block(
    block_id: str,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()
    block_uuid = _parse_uuid(block_id, "block_id")

    rows = (
        admin.table("planner_blocks")
        .select("id,user_id")
        .eq("id", block_uuid)
        .limit(1)
        .execute()
        .data
        or []
    )
    _ensure_block_owner(rows[0] if rows else None, auth.app_user_id)

    admin.table("planner_blocks").delete().eq("id", block_uuid).execute()

    write_audit_log(
        admin,
        actor_id=auth.app_user_id,
        action="planner_block.delete",
        entity_type="planner_block",
        entity_id=block_uuid,
    )


# ---------------------------------------------------------------------------
# Auto-suggest study blocks (Module D acceptance: at least one recommendation
# appears for due-soon work)
# ---------------------------------------------------------------------------

@router.get("/suggest")
async def suggest_blocks(
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=SUGGEST_WINDOW_DAYS)

    assignments = (
        admin.table("assignments")
        .select("id,title,subject_id,due_date,priority,estimated_minutes,status")
        .eq("user_id", auth.app_user_id)
        .in_("status", ["not_started", "in_progress"])
        .gte("due_date", now.isoformat())
        .lte("due_date", horizon.isoformat())
        .order("due_date", desc=False)
        .limit(20)
        .execute()
        .data
        or []
    )

    future_blocks = (
        admin.table("planner_blocks")
        .select("assignment_id")
        .eq("user_id", auth.app_user_id)
        .gte("scheduled_start", now.isoformat())
        .execute()
        .data
        or []
    )
    planned_ids = {
        str(b["assignment_id"]) for b in future_blocks if b.get("assignment_id")
    }

    profile_rows = (
        admin.table("student_profiles")
        .select("timezone")
        .eq("user_id", auth.app_user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    tz_name = (profile_rows[0].get("timezone") if profile_rows else None) or "America/New_York"

    suggestions = build_suggestions(assignments, planned_ids, tz_name, now)

    return {"suggestions": suggestions, "count": len(suggestions)}
