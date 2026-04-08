from __future__ import annotations

from typing import Any, Dict, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from lib.audit import write_audit_log
from lib.clerk_auth import AppAuthContext, get_app_auth_context
from lib.supabase_client import SupabaseConfigError, get_supabase_admin_client

router = APIRouter(prefix="/api/subjects", tags=["Subjects"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class SubjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    color: Optional[str] = Field(default=None, max_length=20)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _admin_client():
    try:
        return get_supabase_admin_client()
    except SupabaseConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


SUBJECT_COLUMNS = "id,user_id,name,color,created_at"


# ---------------------------------------------------------------------------
# LIST subjects for current user
# ---------------------------------------------------------------------------

@router.get("")
async def list_subjects(
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()

    rows = (
        admin.table("subjects")
        .select(SUBJECT_COLUMNS)
        .eq("user_id", auth.app_user_id)
        .order("name")
        .execute()
        .data
        or []
    )
    return {"subjects": rows}


# ---------------------------------------------------------------------------
# CREATE subject
# ---------------------------------------------------------------------------

@router.post("", status_code=201)
async def create_subject(
    body: SubjectCreate,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()

    payload: Dict[str, Any] = {
        "user_id": auth.app_user_id,
        "name": body.name.strip(),
    }
    if body.color is not None:
        payload["color"] = body.color.strip()

    result = admin.table("subjects").insert(payload).execute()
    subject = (result.data or [{}])[0]

    write_audit_log(
        admin,
        actor_id=auth.app_user_id,
        action="subject.create",
        entity_type="subject",
        entity_id=subject.get("id"),
    )

    return {"subject": subject}


# ---------------------------------------------------------------------------
# DELETE subject
# ---------------------------------------------------------------------------

@router.delete("/{subject_id}", status_code=204)
async def delete_subject(
    subject_id: str,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()

    try:
        sid = str(UUID(subject_id.strip()))
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=422, detail="Invalid subject_id format.") from exc

    rows = (
        admin.table("subjects")
        .select("id,user_id")
        .eq("id", sid)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Subject not found")
    if str(rows[0].get("user_id")) != auth.app_user_id:
        raise HTTPException(status_code=403, detail="Forbidden: user scope mismatch")

    admin.table("subjects").delete().eq("id", sid).execute()

    write_audit_log(
        admin,
        actor_id=auth.app_user_id,
        action="subject.delete",
        entity_type="subject",
        entity_id=sid,
    )
