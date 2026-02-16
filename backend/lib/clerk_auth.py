from __future__ import annotations

import base64
import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, Optional

import jwt
from fastapi import Depends, Header, HTTPException
from jwt import PyJWKClient

from lib.supabase_client import SupabaseConfigError, get_supabase_admin_client


@dataclass
class ClerkAuthContext:
    clerk_user_id: str
    email: Optional[str]
    claims: Dict[str, Any]


@dataclass
class AppAuthContext(ClerkAuthContext):
    app_user_id: str
    role: str

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


def _extract_bearer_token(authorization: Optional[str]) -> str:
    header = (authorization or "").strip()
    if not header:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    prefix = "Bearer "
    if not header.startswith(prefix):
        raise HTTPException(status_code=401, detail="Invalid Authorization header")

    token = header[len(prefix) :].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")

    return token


def _decode_publishable_key_domain(publishable_key: str) -> Optional[str]:
    try:
        encoded = publishable_key.split("_", 2)[2]
    except Exception:
        return None

    padded = encoded + "=" * (-len(encoded) % 4)
    try:
        decoded = base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8")
    except Exception:
        return None

    domain = decoded.rstrip("$").strip()
    return domain or None


def _resolve_clerk_issuer() -> str:
    explicit = (
        os.getenv("CLERK_ISSUER")
        or os.getenv("CLERK_ISSUER_URL")
        or os.getenv("CLERK_FRONTEND_API")
        or os.getenv("CLERK_DOMAIN")
    )

    if explicit:
        return explicit if explicit.startswith("http") else f"https://{explicit}"

    publishable = os.getenv("REACT_APP_CLERK_PUBLISHABLE_KEY") or os.getenv(
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
    )
    if publishable:
        domain = _decode_publishable_key_domain(publishable)
        if domain:
            return f"https://{domain}"

    raise HTTPException(
        status_code=503,
        detail=(
            "Clerk token verification is not configured. "
            "Set CLERK_ISSUER (or CLERK_ISSUER_URL / CLERK_FRONTEND_API)."
        ),
    )


def _resolve_jwks_url(issuer: str) -> str:
    return os.getenv("CLERK_JWKS_URL") or f"{issuer.rstrip('/')}/.well-known/jwks.json"


def _resolve_audience() -> Optional[str]:
    return os.getenv("CLERK_JWT_AUDIENCE") or None


@lru_cache(maxsize=1)
def _get_jwks_client() -> PyJWKClient:
    issuer = _resolve_clerk_issuer()
    jwks_url = _resolve_jwks_url(issuer)
    return PyJWKClient(jwks_url)


def _verify_token(token: str) -> Dict[str, Any]:
    issuer = _resolve_clerk_issuer()
    audience = _resolve_audience()

    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        decode_kwargs: Dict[str, Any] = {
            "algorithms": ["RS256"],
            "issuer": issuer,
            "options": {"verify_aud": bool(audience)},
        }
        if audience:
            decode_kwargs["audience"] = audience

        claims = jwt.decode(token, signing_key.key, **decode_kwargs)
    except HTTPException:
        raise
    except Exception as exc:  # pylint: disable=broad-except
        raise HTTPException(status_code=401, detail=f"Invalid Clerk token: {exc}") from exc

    clerk_user_id = str(claims.get("sub") or "").strip()
    if not clerk_user_id.startswith("user_"):
        raise HTTPException(status_code=401, detail="Invalid Clerk token subject")

    return claims


def get_clerk_auth_context(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> ClerkAuthContext:
    token = _extract_bearer_token(authorization)
    claims = _verify_token(token)

    email = claims.get("email") or claims.get("email_address")

    return ClerkAuthContext(
        clerk_user_id=str(claims["sub"]),
        email=str(email) if email else None,
        claims=claims,
    )


def _find_public_user_by_clerk_id(clerk_user_id: str) -> Optional[Dict[str, Any]]:
    try:
        admin_client = get_supabase_admin_client()
    except SupabaseConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

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


def get_app_auth_context(
    clerk_auth: ClerkAuthContext = Depends(get_clerk_auth_context),
) -> AppAuthContext:
    user_row = _find_public_user_by_clerk_id(clerk_auth.clerk_user_id)
    if not user_row:
        raise HTTPException(
            status_code=404,
            detail=(
                "Application user not found for authenticated Clerk user. "
                "Call /api/users/resolve first."
            ),
        )

    return AppAuthContext(
        clerk_user_id=clerk_auth.clerk_user_id,
        email=clerk_auth.email,
        claims=clerk_auth.claims,
        app_user_id=str(user_row["id"]),
        role=str(user_row.get("role") or "student"),
    )


def ensure_owner_or_admin(actor: AppAuthContext, target_user_id: str) -> None:
    if actor.is_admin:
        return

    if str(target_user_id).strip() != actor.app_user_id:
        raise HTTPException(status_code=403, detail="Forbidden: user scope mismatch")
