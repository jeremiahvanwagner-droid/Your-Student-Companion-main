from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
import os
from typing import Any, Dict, Optional
from uuid import UUID

import stripe
from fastapi import APIRouter, Header, HTTPException, Request

from lib.supabase_client import SupabaseConfigError, get_supabase_admin_client

router = APIRouter(tags=["Webhooks"])


def _admin_client():
    try:
        return get_supabase_admin_client()
    except SupabaseConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _stripe_client():
    stripe_key = os.getenv("STRIPE_SECRET_KEY")
    if not stripe_key:
        raise HTTPException(
            status_code=503,
            detail="Stripe is not configured. Missing STRIPE_SECRET_KEY.",
        )

    stripe.api_key = stripe_key
    return stripe


def _webhook_secret() -> str:
    secret = os.getenv("STRIPE_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(
            status_code=503,
            detail="Stripe webhook secret is missing. Set STRIPE_WEBHOOK_SECRET.",
        )
    return secret


def _timestamp_to_iso(value: Optional[int]) -> Optional[str]:
    if value is None:
        return None
    return datetime.fromtimestamp(value, tz=timezone.utc).isoformat()


def _amount_to_decimal(amount_in_cents: Optional[int]) -> Optional[float]:
    if amount_in_cents is None:
        return None
    return float((Decimal(amount_in_cents) / Decimal(100)).quantize(Decimal("0.01")))


def _is_uuid(value: Optional[str]) -> bool:
    if not value:
        return False

    try:
        UUID(str(value).strip())
        return True
    except (ValueError, TypeError):
        return False


def _resolve_app_user_id(admin_client, raw_user_id: Optional[str]) -> Optional[str]:
    candidate = str(raw_user_id or "").strip()
    if not candidate:
        return None

    if _is_uuid(candidate):
        user_rows = (
            admin_client.table("users")
            .select("id")
            .eq("id", candidate)
            .limit(1)
            .execute()
            .data
            or []
        )
        if user_rows:
            return str(user_rows[0]["id"])

    by_clerk = (
        admin_client.table("users")
        .select("id")
        .eq("clerk_id", candidate)
        .limit(1)
        .execute()
        .data
        or []
    )
    if by_clerk:
        return str(by_clerk[0]["id"])

    return None


def _normalize_subscription_status(status: Optional[str]) -> str:
    if not status:
        return "active"

    status_map = {
        "active": "active",
        "trialing": "active",
        "past_due": "past_due",
        "unpaid": "past_due",
        "incomplete": "pending",
        "incomplete_expired": "canceled",
        "canceled": "canceled",
        "paused": "paused",
    }
    return status_map.get(status, status)


def _infer_plan_type(subscription: Dict[str, Any], metadata: Dict[str, Any]) -> str:
    explicit = metadata.get("plan_type")
    if explicit in {"all_access_monthly", "all_access_annual"}:
        return explicit

    items = ((subscription or {}).get("items") or {}).get("data") or []
    if items:
        recurring = ((items[0].get("price") or {}).get("recurring") or {})
        interval = recurring.get("interval")
        if interval == "year":
            return "all_access_annual"

    return "all_access_monthly"


def _upsert_subscription_from_stripe_subscription(subscription: Dict[str, Any]) -> Dict[str, Any]:
    admin_client = _admin_client()

    metadata = subscription.get("metadata") or {}
    raw_user_id = metadata.get("user_id")
    user_id = _resolve_app_user_id(admin_client, raw_user_id)
    if not user_id:
        return {
            "updated": False,
            "reason": "Subscription metadata missing resolvable user_id",
        }

    payload = {
        "user_id": user_id,
        "plan_type": _infer_plan_type(subscription, metadata),
        "stripe_subscription_id": subscription.get("id"),
        "status": _normalize_subscription_status(subscription.get("status")),
        "current_period_start": _timestamp_to_iso(subscription.get("current_period_start")),
        "current_period_end": _timestamp_to_iso(subscription.get("current_period_end")),
    }

    existing = (
        admin_client.table("user_subscriptions")
        .select("id")
        .eq("stripe_subscription_id", subscription.get("id"))
        .limit(1)
        .execute()
        .data
        or []
    )

    if existing:
        admin_client.table("user_subscriptions").update(payload).eq(
            "id", existing[0]["id"]
        ).execute()
    else:
        admin_client.table("user_subscriptions").insert(payload).execute()

    return {
        "updated": True,
        "stripe_subscription_id": subscription.get("id"),
        "status": payload["status"],
    }


def _upsert_purchase_from_checkout_session(session: Dict[str, Any]) -> Dict[str, Any]:
    admin_client = _admin_client()

    metadata = session.get("metadata") or {}
    raw_user_id = metadata.get("user_id") or session.get("client_reference_id")
    user_id = _resolve_app_user_id(admin_client, raw_user_id)
    course_pack_id = metadata.get("course_pack_id")

    if not user_id or not course_pack_id:
        return {
            "updated": False,
            "reason": "Session metadata missing resolvable user_id or course_pack_id",
        }

    status = "completed" if session.get("payment_status") == "paid" else "pending"

    payload = {
        "user_id": user_id,
        "course_pack_id": course_pack_id,
        "stripe_checkout_session_id": session.get("id"),
        "stripe_payment_intent_id": session.get("payment_intent"),
        "amount_paid": _amount_to_decimal(session.get("amount_total")),
        "currency": session.get("currency") or "usd",
        "status": status,
    }

    admin_client.table("user_purchases").upsert(
        payload,
        on_conflict="user_id,course_pack_id",
    ).execute()

    result: Dict[str, Any] = {
        "updated": True,
        "course_pack_id": course_pack_id,
        "status": status,
        "checkout_session_id": session.get("id"),
    }

    if session.get("mode") == "subscription" and session.get("subscription"):
        stripe_client = _stripe_client()
        subscription = stripe_client.Subscription.retrieve(session.get("subscription"))

        # Ensure user context is available for downstream handler.
        subscription_metadata = subscription.get("metadata") or {}
        if "user_id" not in subscription_metadata and user_id:
            subscription_metadata["user_id"] = user_id
            subscription["metadata"] = subscription_metadata

        result["subscription"] = _upsert_subscription_from_stripe_subscription(
            subscription
        )

    return result


def _handle_event(event_type: str, event_data: Dict[str, Any]) -> Dict[str, Any]:
    if event_type == "checkout.session.completed":
        return _upsert_purchase_from_checkout_session(event_data)

    if event_type in {
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    }:
        return _upsert_subscription_from_stripe_subscription(event_data)

    if event_type == "invoice.payment_failed":
        subscription_id = event_data.get("subscription")
        if not subscription_id:
            return {"updated": False, "reason": "Invoice missing subscription id"}

        admin_client = _admin_client()
        admin_client.table("user_subscriptions").update({"status": "past_due"}).eq(
            "stripe_subscription_id", subscription_id
        ).execute()

        return {
            "updated": True,
            "stripe_subscription_id": subscription_id,
            "status": "past_due",
        }

    return {"updated": False, "reason": f"Unhandled event type: {event_type}"}


@router.post("/api/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(default=None, alias="stripe-signature"),
):
    if not stripe_signature:
        raise HTTPException(status_code=400, detail="Missing Stripe signature header")

    payload = await request.body()

    stripe_client = _stripe_client()
    webhook_secret = _webhook_secret()

    try:
        event = stripe_client.Webhook.construct_event(
            payload=payload,
            sig_header=stripe_signature,
            secret=webhook_secret,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid webhook payload") from exc
    except stripe.error.SignatureVerificationError as exc:
        raise HTTPException(status_code=400, detail="Invalid webhook signature") from exc

    event_type = event.get("type")
    event_data = (event.get("data") or {}).get("object") or {}

    try:
        result = _handle_event(event_type, event_data)
    except HTTPException:
        raise
    except Exception as exc:  # pylint: disable=broad-except
        raise HTTPException(status_code=500, detail=f"Webhook handling failed: {exc}") from exc

    return {
        "received": True,
        "event_type": event_type,
        "result": result,
    }
