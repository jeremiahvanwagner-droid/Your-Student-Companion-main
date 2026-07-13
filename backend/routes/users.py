from __future__ import annotations

import secrets
from typing import Any, Dict, Optional, Tuple
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from lib.audit import write_audit_log
from lib.clerk_auth import (
    AppAuthContext,
    ClerkAuthContext,
    ensure_owner_or_admin,
    get_app_auth_context,
    get_clerk_auth_context,
)
from lib.supabase_client import SupabaseConfigError, get_supabase_admin_client

router = APIRouter(prefix="/api/users", tags=["Users"])


class ResolveUserRequest(BaseModel):
    clerk_user_id: Optional[str] = Field(default=None, min_length=3, max_length=128)
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class ResolveUserResponse(BaseModel):
    user_id: str
    clerk_user_id: str
    created: bool


class StudentProfileUpsertRequest(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=120)
    grade_level: Optional[str] = Field(default=None, max_length=120)
    school: Optional[str] = Field(default=None, max_length=160)
    major: Optional[str] = Field(default=None, max_length=160)
    year_level: Optional[str] = Field(
        default=None,
        pattern=r"^(freshman|sophomore|junior|senior|other)$",
    )
    timezone: Optional[str] = Field(default=None, max_length=80)
    weekly_goal_hours: Optional[int] = Field(default=None, ge=1, le=168)
    study_preferences: Optional[Dict[str, Any]] = None
    onboarding_completed: Optional[bool] = None


def _admin_client():
    try:
        return get_supabase_admin_client()
    except SupabaseConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _parse_uuid_or_422(value: str, field_name: str) -> str:
    try:
        return str(UUID(str(value).strip()))
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid {field_name} format. Expected UUID.",
        ) from exc


def _normalize_email(clerk_user_id: str, email: Optional[str]) -> str:
    cleaned = (email or "").strip().lower()
    if cleaned:
        return cleaned

    safe_id = "".join(ch if ch.isalnum() else "-" for ch in clerk_user_id.strip().lower())
    return f"{safe_id}@clerk.users.local"


def _find_public_user_by_clerk_id(admin_client, clerk_user_id: str):
    rows = (
        admin_client.table("users")
        .select("id,clerk_id,email,role")
        .eq("clerk_id", clerk_user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _find_public_user_by_id(admin_client, user_id: str):
    rows = (
        admin_client.table("users")
        .select("id,clerk_id,email,role")
        .eq("id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _ensure_public_user_exists(admin_client, user_id: str) -> Dict[str, Any]:
    user_row = _find_public_user_by_id(admin_client, user_id)
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found in public.users")
    return user_row


def _fetch_student_profile(admin_client, user_id: str) -> Optional[Dict[str, Any]]:
    rows = (
        admin_client.table("student_profiles")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _clean_profile_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    cleaned = dict(payload)

    for key in ["display_name", "grade_level", "school", "major", "year_level", "timezone"]:
        if key in cleaned and isinstance(cleaned[key], str):
            cleaned[key] = cleaned[key].strip() or None

    if "study_preferences" in cleaned and cleaned["study_preferences"] is None:
        cleaned["study_preferences"] = {}

    return cleaned


def _upsert_student_profile(
    admin_client,
    *,
    user_id: str,
    payload: Dict[str, Any],
) -> Tuple[Dict[str, Any], bool]:
    existing = _fetch_student_profile(admin_client, user_id)
    created = existing is None

    if existing:
        updated_rows = (
            admin_client.table("student_profiles")
            .update(payload)
            .eq("id", existing["id"])
            .execute()
            .data
            or []
        )
        profile = updated_rows[0] if updated_rows else _fetch_student_profile(admin_client, user_id)
        return profile, created

    insert_payload = {"user_id": user_id, **payload}
    inserted_rows = admin_client.table("student_profiles").insert(insert_payload).execute().data or []
    profile = inserted_rows[0] if inserted_rows else _fetch_student_profile(admin_client, user_id)
    return profile, created


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
def resolve_user(
    request: ResolveUserRequest,
    auth: ClerkAuthContext = Depends(get_clerk_auth_context),
):
    requested_id = (request.clerk_user_id or "").strip()
    if requested_id and requested_id != auth.clerk_user_id:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: request clerk_user_id does not match authenticated token subject",
        )

    clerk_user_id = auth.clerk_user_id
    admin_client = _admin_client()

    existing = _find_public_user_by_clerk_id(admin_client, clerk_user_id)
    if existing:
        write_audit_log(
            admin_client,
            actor_id=str(existing["id"]),
            action="users.resolve",
            entity_type="users",
            entity_id=str(existing["id"]),
            metadata={"created": False, "clerk_user_id": clerk_user_id},
        )
        return ResolveUserResponse(
            user_id=str(existing["id"]),
            clerk_user_id=clerk_user_id,
            created=False,
        )

    app_user_id = str(uuid4())
    normalized_email = _normalize_email(clerk_user_id, request.email or auth.email)

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
                "email": (request.email or auth.email or "").strip().lower() or normalized_email,
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

    write_audit_log(
        admin_client,
        actor_id=app_user_id,
        action="users.resolve",
        entity_type="users",
        entity_id=app_user_id,
        metadata={"created": True, "clerk_user_id": clerk_user_id},
    )

    return ResolveUserResponse(user_id=app_user_id, clerk_user_id=clerk_user_id, created=True)


@router.get("/me")
def get_me(auth: AppAuthContext = Depends(get_app_auth_context)):
    return {
        "user": {
            "id": auth.app_user_id,
            "clerk_user_id": auth.clerk_user_id,
            "email": auth.email,
            "role": auth.role,
        }
    }


@router.get("/me/profile")
def get_my_student_profile(auth: AppAuthContext = Depends(get_app_auth_context)):
    admin_client = _admin_client()
    profile = _fetch_student_profile(admin_client, auth.app_user_id)
    return {"profile": profile}


@router.put("/me/profile")
def upsert_my_student_profile(
    request: StudentProfileUpsertRequest,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin_client = _admin_client()
    _ensure_public_user_exists(admin_client, auth.app_user_id)

    payload = _clean_profile_payload(request.model_dump(exclude_none=True))
    if not payload:
        raise HTTPException(status_code=400, detail="No profile fields were provided")

    try:
        profile, created = _upsert_student_profile(
            admin_client,
            user_id=auth.app_user_id,
            payload=payload,
        )
    except HTTPException:
        raise
    except Exception as exc:  # pylint: disable=broad-except
        raise HTTPException(status_code=500, detail=f"Failed to persist student profile: {exc}") from exc

    write_audit_log(
        admin_client,
        actor_id=auth.app_user_id,
        action="student_profiles.upsert",
        entity_type="student_profiles",
        entity_id=str(profile.get("id")) if profile else None,
        metadata={"created": created},
    )

    return {"profile": profile, "created": created}


@router.get("/profile/{user_id}")
def get_student_profile(
    user_id: str,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    parsed_user_id = _parse_uuid_or_422(user_id, "user_id")
    ensure_owner_or_admin(auth, parsed_user_id)

    admin_client = _admin_client()
    profile = _fetch_student_profile(admin_client, parsed_user_id)
    return {"profile": profile}


@router.put("/profile/{user_id}")
def upsert_student_profile(
    user_id: str,
    request: StudentProfileUpsertRequest,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    parsed_user_id = _parse_uuid_or_422(user_id, "user_id")
    ensure_owner_or_admin(auth, parsed_user_id)

    admin_client = _admin_client()
    _ensure_public_user_exists(admin_client, parsed_user_id)

    payload = _clean_profile_payload(request.model_dump(exclude_none=True))
    if not payload:
        raise HTTPException(status_code=400, detail="No profile fields were provided")

    try:
        profile, created = _upsert_student_profile(
            admin_client,
            user_id=parsed_user_id,
            payload=payload,
        )
    except HTTPException:
        raise
    except Exception as exc:  # pylint: disable=broad-except
        raise HTTPException(status_code=500, detail=f"Failed to persist student profile: {exc}") from exc

    write_audit_log(
        admin_client,
        actor_id=auth.app_user_id,
        action="student_profiles.upsert",
        entity_type="student_profiles",
        entity_id=str(profile.get("id")) if profile else None,
        metadata={"created": created, "target_user_id": parsed_user_id},
    )

    return {"profile": profile, "created": created}


# ---------------------------------------------------------------------------
# Account deletion (Market Thirteen #5 — data deletion request flow)
# ---------------------------------------------------------------------------

def _cancel_stripe_subscriptions(admin, user_id: str) -> int:
    """
    Best-effort: cancel any active Stripe subscriptions before the account
    rows disappear, so nobody keeps getting billed for a deleted account.
    Failures are swallowed (deletion proceeds) — the webhook ledger and
    Stripe dashboard remain the recovery path.
    """
    cancelled = 0
    try:
        import os

        import stripe

        stripe_key = os.getenv("STRIPE_SECRET_KEY")
        if not stripe_key:
            return 0
        stripe.api_key = stripe_key

        rows = (
            admin.table("user_subscriptions")
            .select("stripe_subscription_id,status")
            .eq("user_id", user_id)
            .in_("status", ["active", "trialing", "past_due"])
            .execute()
            .data
            or []
        )
        for row in rows:
            sub_id = row.get("stripe_subscription_id")
            if not sub_id:
                continue
            try:
                stripe.Subscription.cancel(sub_id)
                cancelled += 1
            except Exception:  # pylint: disable=broad-except
                continue
    except Exception:  # pylint: disable=broad-except
        return cancelled
    return cancelled


@router.delete("/me")
def delete_my_account(auth: AppAuthContext = Depends(get_app_auth_context)):
    """
    Delete the authenticated user's application data. The users row delete
    cascades across every owned table (assignments, notes, planner blocks,
    reminders, ai_interactions, purchases, …). The Clerk login identity is
    NOT deleted here — signing in again starts a fresh, empty account; full
    identity removal is documented in the privacy policy.
    """
    admin = _admin_client()
    user_id = auth.app_user_id

    cancelled = _cancel_stripe_subscriptions(admin, user_id)

    # Audit the request first, then detach those rows from the FK so the
    # user delete isn't blocked (audit_logs.actor_id has no cascade).
    write_audit_log(
        admin,
        actor_id=user_id,
        action="account.delete",
        entity_type="user",
        entity_id=user_id,
        metadata={"stripe_subscriptions_cancelled": cancelled},
    )
    try:
        admin.table("audit_logs").update({"actor_id": None}).eq(
            "actor_id", user_id
        ).execute()
    except Exception:  # pylint: disable=broad-except
        pass

    try:
        admin.table("users").delete().eq("id", user_id).execute()
    except Exception as exc:  # pylint: disable=broad-except
        raise HTTPException(
            status_code=500,
            detail="Account deletion failed. Please contact support.",
        ) from exc

    return {
        "deleted": True,
        "stripe_subscriptions_cancelled": cancelled,
        "clerk_identity": "retained — see privacy policy for full identity removal",
    }
