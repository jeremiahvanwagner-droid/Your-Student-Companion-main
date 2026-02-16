from __future__ import annotations

import secrets
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from lib.supabase_client import SupabaseConfigError, get_supabase_admin_client

router = APIRouter(prefix="/api/users", tags=["Users"])


class ResolveUserRequest(BaseModel):
    clerk_user_id: str = Field(min_length=3, max_length=128)
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class ResolveUserResponse(BaseModel):
    user_id: str
    clerk_user_id: str
    created: bool


def _admin_client():
    try:
        return get_supabase_admin_client()
    except SupabaseConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _normalize_email(clerk_user_id: str, email: Optional[str]) -> str:
    cleaned = (email or "").strip().lower()
    if cleaned:
        return cleaned

    safe_id = "".join(ch if ch.isalnum() else "-" for ch in clerk_user_id.strip().lower())
    return f"{safe_id}@clerk.users.local"


def _find_public_user_by_clerk_id(admin_client, clerk_user_id: str):
    rows = (
        admin_client.table("users")
        .select("id,clerk_id,email")
        .eq("clerk_id", clerk_user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _create_auth_user(
    admin_client,
    user_id: str,
    clerk_user_id: str,
    email: str,
    first_name: Optional[str],
    last_name: Optional[str],
):
    full_name = " ".join(part for part in [first_name or "", last_name or ""] if part).strip()

    attributes = {
        "id": user_id,
        "email": email,
        "password": secrets.token_urlsafe(32),
        "email_confirm": True,
        "user_metadata": {
            "clerk_id": clerk_user_id,
            "name": full_name or None,
            "first_name": first_name,
            "last_name": last_name,
        },
        "app_metadata": {
            "provider": "clerk",
            "source": "ysc_user_resolve",
        },
    }

    try:
        admin_client.auth.admin.create_user(attributes)
        return
    except Exception as first_exc:  # pylint: disable=broad-except
        synthetic_email = _normalize_email(clerk_user_id, None)
        if email != synthetic_email:
            attributes["email"] = synthetic_email
            try:
                admin_client.auth.admin.create_user(attributes)
                return
            except Exception as second_exc:  # pylint: disable=broad-except
                raise HTTPException(
                    status_code=502,
                    detail=f"Failed to create auth user: {second_exc}",
                ) from second_exc

        raise HTTPException(
            status_code=502,
            detail=f"Failed to create auth user: {first_exc}",
        ) from first_exc


@router.post("/resolve", response_model=ResolveUserResponse)
def resolve_user(request: ResolveUserRequest):
    admin_client = _admin_client()
    clerk_user_id = request.clerk_user_id.strip()

    if not clerk_user_id.startswith("user_"):
        raise HTTPException(status_code=422, detail="Invalid clerk_user_id format")

    existing = _find_public_user_by_clerk_id(admin_client, clerk_user_id)
    if existing:
        return ResolveUserResponse(
            user_id=str(existing["id"]),
            clerk_user_id=clerk_user_id,
            created=False,
        )

    app_user_id = str(uuid4())
    normalized_email = _normalize_email(clerk_user_id, request.email)

    _create_auth_user(
        admin_client=admin_client,
        user_id=app_user_id,
        clerk_user_id=clerk_user_id,
        email=normalized_email,
        first_name=request.first_name,
        last_name=request.last_name,
    )

    try:
        admin_client.table("users").insert(
            {
                "id": app_user_id,
                "clerk_id": clerk_user_id,
                "email": (request.email or "").strip().lower() or normalized_email,
                "role": "student",
            }
        ).execute()
    except Exception as exc:  # pylint: disable=broad-except
        existing_after_race = _find_public_user_by_clerk_id(admin_client, clerk_user_id)
        if existing_after_race:
            return ResolveUserResponse(
                user_id=str(existing_after_race["id"]),
                clerk_user_id=clerk_user_id,
                created=False,
            )

        raise HTTPException(status_code=500, detail=f"Failed to create user record: {exc}") from exc

    return ResolveUserResponse(user_id=app_user_id, clerk_user_id=clerk_user_id, created=True)
