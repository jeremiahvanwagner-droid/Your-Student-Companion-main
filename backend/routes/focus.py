from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from lib.audit import write_audit_log
from lib.clerk_auth import AppAuthContext, get_app_auth_context
from lib.supabase_client import SupabaseConfigError, get_supabase_admin_client

router = APIRouter(prefix="/api/focus", tags=["Focus"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class StudySessionCreate(BaseModel):
    subject_id: Optional[str] = None
    intention: Optional[str] = Field(default=None, max_length=500)
    duration_planned_minutes: int = Field(default=25, ge=1, le=480)
    session_type: str = Field(default="pomodoro", pattern=r"^(pomodoro|deep_work|review|custom)$")


class StudySessionComplete(BaseModel):
    duration_actual_minutes: int = Field(..., ge=0, le=1440)
    reflection: Optional[str] = Field(default=None, max_length=1000)


class FocusLogCreate(BaseModel):
    study_session_id: Optional[str] = None
    focus_minutes: int = Field(..., ge=0, le=1440)
    break_minutes: int = Field(default=0, ge=0, le=1440)
    distractions_noted: int = Field(default=0, ge=0)


class LegacyImportRequest(BaseModel):
    minutes: int = Field(..., ge=1, le=100000)


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


SESSION_COLUMNS = (
    "id,user_id,subject_id,intention,duration_planned_minutes,"
    "duration_actual_minutes,reflection,session_type,started_at,completed_at,created_at"
)

LOG_COLUMNS = (
    "id,user_id,study_session_id,focus_minutes,break_minutes,"
    "distractions_noted,logged_at"
)


# ---------------------------------------------------------------------------
# Study Sessions
# ---------------------------------------------------------------------------

@router.get("/sessions")
async def list_sessions(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()
    rows = (
        admin.table("study_sessions")
        .select(SESSION_COLUMNS)
        .eq("user_id", auth.app_user_id)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
        .data
        or []
    )
    return {"sessions": rows}


@router.post("/sessions", status_code=201)
async def create_session(
    body: StudySessionCreate,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()

    payload: Dict[str, Any] = {
        "user_id": auth.app_user_id,
        "duration_planned_minutes": body.duration_planned_minutes,
        "session_type": body.session_type,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }
    if body.subject_id:
        payload["subject_id"] = _parse_uuid(body.subject_id, "subject_id")
    if body.intention:
        payload["intention"] = body.intention.strip()

    result = admin.table("study_sessions").insert(payload).execute()
    session = (result.data or [{}])[0]

    write_audit_log(
        admin, actor_id=auth.app_user_id,
        action="study_session.create", entity_type="study_session",
        entity_id=session.get("id"),
    )

    return {"session": session}


@router.patch("/sessions/{session_id}/complete")
async def complete_session(
    session_id: str,
    body: StudySessionComplete,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    sid = _parse_uuid(session_id, "session_id")
    admin = _admin_client()

    existing = (
        admin.table("study_sessions")
        .select("id,user_id")
        .eq("id", sid)
        .execute()
        .data
        or []
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Session not found")
    if str(existing[0].get("user_id")) != auth.app_user_id:
        raise HTTPException(status_code=403, detail="Forbidden: user scope mismatch")

    update_payload: Dict[str, Any] = {
        "duration_actual_minutes": body.duration_actual_minutes,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    if body.reflection:
        update_payload["reflection"] = body.reflection.strip()

    result = (
        admin.table("study_sessions")
        .update(update_payload)
        .eq("id", sid)
        .execute()
    )
    session = (result.data or [{}])[0]

    write_audit_log(
        admin, actor_id=auth.app_user_id,
        action="study_session.complete", entity_type="study_session",
        entity_id=sid,
    )

    return {"session": session}


# ---------------------------------------------------------------------------
# Focus Logs
# ---------------------------------------------------------------------------

@router.get("/logs")
async def list_focus_logs(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()
    rows = (
        admin.table("focus_logs")
        .select(LOG_COLUMNS)
        .eq("user_id", auth.app_user_id)
        .order("logged_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
        .data
        or []
    )
    return {"logs": rows}


@router.post("/logs", status_code=201)
async def create_focus_log(
    body: FocusLogCreate,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()

    payload: Dict[str, Any] = {
        "user_id": auth.app_user_id,
        "focus_minutes": body.focus_minutes,
        "break_minutes": body.break_minutes,
        "distractions_noted": body.distractions_noted,
        "logged_at": datetime.now(timezone.utc).isoformat(),
    }
    if body.study_session_id:
        payload["study_session_id"] = _parse_uuid(body.study_session_id, "study_session_id")

    result = admin.table("focus_logs").insert(payload).execute()
    log = (result.data or [{}])[0]

    write_audit_log(
        admin, actor_id=auth.app_user_id,
        action="focus_log.create", entity_type="focus_log",
        entity_id=log.get("id"),
    )

    return {"log": log}


# ---------------------------------------------------------------------------
# Stats summary
# ---------------------------------------------------------------------------

@router.get("/stats")
async def focus_stats(
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()

    sessions = (
        admin.table("study_sessions")
        .select("duration_actual_minutes,session_type,completed_at")
        .eq("user_id", auth.app_user_id)
        .execute()
        .data
        or []
    )

    logs = (
        admin.table("focus_logs")
        .select("focus_minutes,break_minutes,distractions_noted")
        .eq("user_id", auth.app_user_id)
        .execute()
        .data
        or []
    )

    completed_sessions = [s for s in sessions if s.get("completed_at")]
    total_focus_minutes = sum(l.get("focus_minutes", 0) for l in logs)
    total_break_minutes = sum(l.get("break_minutes", 0) for l in logs)
    total_session_minutes = sum(s.get("duration_actual_minutes", 0) for s in completed_sessions)
    total_distractions = sum(l.get("distractions_noted", 0) for l in logs)

    return {
        "total_sessions": len(completed_sessions),
        "total_session_minutes": total_session_minutes,
        "total_focus_minutes": total_focus_minutes,
        "total_break_minutes": total_break_minutes,
        "total_distractions": total_distractions,
        "total_hours": round(total_focus_minutes / 60, 1) if total_focus_minutes else 0,
    }


# ---------------------------------------------------------------------------
# Legacy import — one-time migration from localStorage to server
# ---------------------------------------------------------------------------

@router.post("/legacy-import", status_code=201)
async def legacy_import(
    body: LegacyImportRequest,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()

    # Check idempotency: reject if already migrated
    existing = (
        admin.table("focus_migrations")
        .select("id,minutes_imported")
        .eq("user_id", auth.app_user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Already migrated",
                "minutes_imported": existing[0].get("minutes_imported"),
            },
        )

    # Record the migration
    admin.table("focus_migrations").insert(
        {
            "user_id": auth.app_user_id,
            "minutes_imported": body.minutes,
        }
    ).execute()

    # Persist a focus log for the imported minutes
    admin.table("focus_logs").insert(
        {
            "user_id": auth.app_user_id,
            "focus_minutes": body.minutes,
            "break_minutes": 0,
            "distractions_noted": 0,
            "logged_at": datetime.now(timezone.utc).isoformat(),
        }
    ).execute()

    write_audit_log(
        admin,
        actor_id=auth.app_user_id,
        action="focus.legacy_import",
        entity_type="focus_log",
        entity_id=None,
        metadata={"minutes_imported": body.minutes},
    )

    return {"imported": True, "minutes": body.minutes}
