from __future__ import annotations

from typing import Any, Dict, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
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


class SubjectPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    color: Optional[str] = Field(default=None, max_length=20)
    archived: Optional[bool] = None


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


SUBJECT_COLUMNS = "id,user_id,name,color,archived,created_at"


# ---------------------------------------------------------------------------
# LIST subjects for current user
# ---------------------------------------------------------------------------

@router.get("")
async def list_subjects(
    include_archived: bool = Query(default=False),
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()

    query = (
        admin.table("subjects")
        .select(SUBJECT_COLUMNS)
        .eq("user_id", auth.app_user_id)
        .order("name")
    )
    if not include_archived:
        query = query.eq("archived", False)

    rows = query.execute().data or []
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
        "archived": False,
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
# PATCH subject (rename, recolor, archive/restore)
# ---------------------------------------------------------------------------

@router.patch("/{subject_id}")
async def patch_subject(
    subject_id: str,
    body: SubjectPatch,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    sid = _parse_uuid(subject_id, "subject_id")
    admin = _admin_client()

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

    updates: Dict[str, Any] = {}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.color is not None:
        updates["color"] = body.color.strip()
    if body.archived is not None:
        updates["archived"] = body.archived

    if not updates:
        # Nothing to update — return current subject
        current = (
            admin.table("subjects")
            .select(SUBJECT_COLUMNS)
            .eq("id", sid)
            .limit(1)
            .execute()
            .data
            or [{}]
        )
        return {"subject": current[0]}

    result = (
        admin.table("subjects")
        .update(updates)
        .eq("id", sid)
        .execute()
    )
    subject = (result.data or [{}])[0]

    write_audit_log(
        admin,
        actor_id=auth.app_user_id,
        action="subject.patch",
        entity_type="subject",
        entity_id=sid,
        metadata={"updates": list(updates.keys())},
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
    sid = _parse_uuid(subject_id, "subject_id")

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
