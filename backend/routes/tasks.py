from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from lib.audit import write_audit_log
from lib.clerk_auth import AppAuthContext, get_app_auth_context
from lib.rate_limit import limiter
from lib.supabase_client import SupabaseConfigError, get_supabase_admin_client

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    description: Optional[str] = Field(default=None, max_length=2000)
    subject_id: Optional[str] = None
    due_date: Optional[str] = None
    priority: str = Field(default="medium", pattern=r"^(low|medium|high|urgent)$")
    estimated_minutes: Optional[int] = Field(default=None, ge=1, le=1440)


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=300)
    description: Optional[str] = Field(default=None, max_length=2000)
    subject_id: Optional[str] = None
    due_date: Optional[str] = None
    priority: Optional[str] = Field(default=None, pattern=r"^(low|medium|high|urgent)$")
    estimated_minutes: Optional[int] = Field(default=None, ge=1, le=1440)
    status: Optional[str] = Field(
        default=None,
        pattern=r"^(not_started|in_progress|submitted|completed)$",
    )


class StatusPatch(BaseModel):
    status: str = Field(..., pattern=r"^(not_started|in_progress|submitted|completed)$")


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
            status_code=422,
            detail=f"Invalid {field_name} format. Expected UUID.",
        ) from exc


def _ensure_task_owner(row: Optional[Dict[str, Any]], user_id: str) -> Dict[str, Any]:
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    if str(row.get("user_id")) != user_id:
        raise HTTPException(status_code=403, detail="Forbidden: user scope mismatch")
    return row


TASK_COLUMNS = (
    "id,user_id,subject_id,title,description,due_date,"
    "priority,estimated_minutes,status,completed_at,created_at,updated_at"
)


# ---------------------------------------------------------------------------
# LIST tasks
# ---------------------------------------------------------------------------

@router.get("")
async def list_tasks(
    status: Optional[str] = Query(default=None),
    priority: Optional[str] = Query(default=None),
    subject_id: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()

    query = (
        admin.table("assignments")
        .select(TASK_COLUMNS)
        .eq("user_id", auth.app_user_id)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
    )

    if status:
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        if len(statuses) == 1:
            query = query.eq("status", statuses[0])
        else:
            query = query.in_("status", statuses)

    if priority:
        query = query.eq("priority", priority)

    if subject_id:
        query = query.eq("subject_id", subject_id)

    rows = query.execute().data or []
    return {"tasks": rows, "count": len(rows)}


# ---------------------------------------------------------------------------
# GET single task
# ---------------------------------------------------------------------------

@router.get("/stats")
async def task_stats(
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()

    all_tasks = (
        admin.table("assignments")
        .select("id,status,due_date,completed_at,created_at")
        .eq("user_id", auth.app_user_id)
        .execute()
        .data
        or []
    )

    total = len(all_tasks)
    completed = sum(1 for t in all_tasks if t.get("status") == "completed")
    in_progress = sum(1 for t in all_tasks if t.get("status") == "in_progress")
    not_started = sum(1 for t in all_tasks if t.get("status") == "not_started")

    now = datetime.now(timezone.utc)
    overdue = 0
    for t in all_tasks:
        if t.get("status") in ("not_started", "in_progress") and t.get("due_date"):
            try:
                due = datetime.fromisoformat(t["due_date"].replace("Z", "+00:00"))
                if due < now:
                    overdue += 1
            except (ValueError, TypeError):
                pass

    completion_rate = round((completed / total) * 100, 1) if total > 0 else 0

    # Streak: consecutive days with at least one completed task (counting back from today)
    completed_dates = set()
    for t in all_tasks:
        if t.get("status") == "completed" and t.get("completed_at"):
            try:
                dt = datetime.fromisoformat(t["completed_at"].replace("Z", "+00:00"))
                completed_dates.add(dt.date())
            except (ValueError, TypeError):
                pass

    streak = 0
    check_date = now.date()
    while check_date in completed_dates:
        streak += 1
        check_date = check_date - __import__("datetime").timedelta(days=1)

    return {
        "total": total,
        "completed": completed,
        "in_progress": in_progress,
        "not_started": not_started,
        "overdue": overdue,
        "completion_rate": completion_rate,
        "streak": streak,
    }


@router.get("/{task_id}")
async def get_task(
    task_id: str,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()
    task_uuid = _parse_uuid(task_id, "task_id")

    rows = (
        admin.table("assignments")
        .select(TASK_COLUMNS)
        .eq("id", task_uuid)
        .limit(1)
        .execute()
        .data
        or []
    )

    task = _ensure_task_owner(rows[0] if rows else None, auth.app_user_id)
    return {"task": task}


# ---------------------------------------------------------------------------
# CREATE task
# ---------------------------------------------------------------------------

@router.post("", status_code=201)
@limiter.limit("60/minute")
async def create_task(
    request: Request,
    body: TaskCreate,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()

    payload: Dict[str, Any] = {
        "user_id": auth.app_user_id,
        "title": body.title.strip(),
        "priority": body.priority,
        "status": "not_started",
    }

    if body.description is not None:
        payload["description"] = body.description.strip()
    if body.subject_id is not None:
        payload["subject_id"] = _parse_uuid(body.subject_id, "subject_id")
    if body.due_date is not None:
        payload["due_date"] = body.due_date
    if body.estimated_minutes is not None:
        payload["estimated_minutes"] = body.estimated_minutes

    result = admin.table("assignments").insert(payload).execute()

    task = (result.data or [{}])[0]

    write_audit_log(
        admin,
        actor_id=auth.app_user_id,
        action="task.create",
        entity_type="assignment",
        entity_id=task.get("id"),
    )

    return {"task": task}


# ---------------------------------------------------------------------------
# UPDATE task
# ---------------------------------------------------------------------------

@router.put("/{task_id}")
async def update_task(
    task_id: str,
    body: TaskUpdate,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()
    task_uuid = _parse_uuid(task_id, "task_id")

    # Verify ownership
    existing = (
        admin.table("assignments")
        .select("id,user_id")
        .eq("id", task_uuid)
        .limit(1)
        .execute()
        .data
        or []
    )
    _ensure_task_owner(existing[0] if existing else None, auth.app_user_id)

    updates: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}

    if body.title is not None:
        updates["title"] = body.title.strip()
    if body.description is not None:
        updates["description"] = body.description.strip()
    if body.subject_id is not None:
        updates["subject_id"] = _parse_uuid(body.subject_id, "subject_id")
    if body.due_date is not None:
        updates["due_date"] = body.due_date
    if body.priority is not None:
        updates["priority"] = body.priority
    if body.estimated_minutes is not None:
        updates["estimated_minutes"] = body.estimated_minutes
    if body.status is not None:
        updates["status"] = body.status
        if body.status == "completed":
            updates["completed_at"] = datetime.now(timezone.utc).isoformat()

    result = (
        admin.table("assignments")
        .update(updates)
        .eq("id", task_uuid)
        .execute()
    )

    task = (result.data or [{}])[0]

    write_audit_log(
        admin,
        actor_id=auth.app_user_id,
        action="task.update",
        entity_type="assignment",
        entity_id=task_uuid,
    )

    return {"task": task}


# ---------------------------------------------------------------------------
# PATCH status (quick transition)
# ---------------------------------------------------------------------------

@router.patch("/{task_id}/status")
async def patch_task_status(
    task_id: str,
    body: StatusPatch,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()
    task_uuid = _parse_uuid(task_id, "task_id")

    existing = (
        admin.table("assignments")
        .select("id,user_id")
        .eq("id", task_uuid)
        .limit(1)
        .execute()
        .data
        or []
    )
    _ensure_task_owner(existing[0] if existing else None, auth.app_user_id)

    updates: Dict[str, Any] = {
        "status": body.status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if body.status == "completed":
        updates["completed_at"] = datetime.now(timezone.utc).isoformat()

    result = (
        admin.table("assignments")
        .update(updates)
        .eq("id", task_uuid)
        .execute()
    )

    task = (result.data or [{}])[0]

    write_audit_log(
        admin,
        actor_id=auth.app_user_id,
        action="task.status_change",
        entity_type="assignment",
        entity_id=task_uuid,
        metadata={"new_status": body.status},
    )

    return {"task": task}


# ---------------------------------------------------------------------------
# DELETE task
# ---------------------------------------------------------------------------

@router.delete("/{task_id}", status_code=204)
async def delete_task(
    task_id: str,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()
    task_uuid = _parse_uuid(task_id, "task_id")

    existing = (
        admin.table("assignments")
        .select("id,user_id")
        .eq("id", task_uuid)
        .limit(1)
        .execute()
        .data
        or []
    )
    _ensure_task_owner(existing[0] if existing else None, auth.app_user_id)

    admin.table("assignments").delete().eq("id", task_uuid).execute()

    write_audit_log(
        admin,
        actor_id=auth.app_user_id,
        action="task.delete",
        entity_type="assignment",
        entity_id=task_uuid,
    )
