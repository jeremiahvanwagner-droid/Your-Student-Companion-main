"""
Validate Supabase Edge webhook wiring for YSC store purchases.

This script creates a real Stripe Checkout Session (no payment), posts a signed
`checkout.session.completed` event to the Supabase Edge webhook endpoint, then
checks whether `public.user_purchases` was updated.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import string
import time
from dataclasses import dataclass
from typing import Any

import requests
import stripe
from dotenv import load_dotenv
from supabase import create_client


@dataclass
class Env:
    supabase_url: str
    service_role_key: str
    anon_key: str | None
    stripe_secret_key: str
    stripe_webhook_secret: str


REQUIRED_EVENTS = [
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_failed",
]


def _require(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def load_env() -> Env:
    load_dotenv("backend/.env")
    return Env(
        supabase_url=_require("SUPABASE_URL"),
        service_role_key=_require("SUPABASE_SERVICE_ROLE_KEY"),
        anon_key=os.getenv("SUPABASE_ANON_KEY"),
        stripe_secret_key=_require("STRIPE_SECRET_KEY"),
        stripe_webhook_secret=_require("STRIPE_WEBHOOK_SECRET"),
    )


def sign_payload(payload: bytes, webhook_secret: str) -> str:
    timestamp = int(time.time())
    signed_payload = f"{timestamp}.".encode("utf-8") + payload
    signature = hmac.new(
        webhook_secret.encode("utf-8"),
        signed_payload,
        hashlib.sha256,
    ).hexdigest()
    return f"t={timestamp},v1={signature}"


def random_suffix(length: int = 8) -> str:
    alphabet = string.ascii_lowercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _supabase_admin_headers(env: Env) -> dict[str, str]:
    return {
        "apikey": env.service_role_key,
        "authorization": f"Bearer {env.service_role_key}",
        "content-type": "application/json",
    }


def create_temp_validation_user(env: Env, supabase) -> dict[str, Any]:
    suffix = random_suffix(10)
    email = f"webhook-validate-{suffix}@example.com"
    clerk_id = f"clerk_webhook_validate_{suffix}"

    auth_response = requests.post(
        env.supabase_url.rstrip("/") + "/auth/v1/admin/users",
        headers=_supabase_admin_headers(env),
        json={
            "email": email,
            "email_confirm": True,
            "user_metadata": {"source": "ysc-webhook-validation"},
        },
        timeout=30,
    )

    if auth_response.status_code >= 300:
        raise RuntimeError(
            f"Failed to create temp auth user: {auth_response.status_code} {auth_response.text[:300]}"
        )

    auth_user = auth_response.json()
    auth_user_id = auth_user.get("id")
    if not auth_user_id:
        raise RuntimeError("Temp auth user creation returned no id.")

    supabase.table("users").upsert(
        {
            "id": auth_user_id,
            "email": email,
            "clerk_id": clerk_id,
            "role": "student",
        }
    ).execute()

    return {"id": auth_user_id, "email": email, "clerk_id": clerk_id}


def cleanup_temp_validation_user(env: Env, supabase, user_id: str) -> None:
    try:
        supabase.table("user_subscriptions").delete().eq("user_id", user_id).execute()
        supabase.table("user_purchases").delete().eq("user_id", user_id).execute()
        supabase.table("student_profiles").delete().eq("user_id", user_id).execute()
        supabase.table("users").delete().eq("id", user_id).execute()
    except Exception:
        pass

    try:
        requests.delete(
            env.supabase_url.rstrip("/") + f"/auth/v1/admin/users/{user_id}",
            headers=_supabase_admin_headers(env),
            timeout=30,
        )
    except Exception:
        pass


def main() -> None:
    env = load_env()

    stripe.api_key = env.stripe_secret_key
    supabase = create_client(env.supabase_url, env.service_role_key)
    created_temp_user = False
    temp_user_id: str | None = None

    print("Step 1/6: Selecting an existing application user (UUID)...")
    users = (
        supabase.table("users")
        .select("id,clerk_id,email")
        .limit(1)
        .execute()
        .data
        or []
    )

    if not users:
        print("No existing users found. Bootstrapping a temporary validation user...")
        temp_user = create_temp_validation_user(env, supabase)
        created_temp_user = True
        temp_user_id = str(temp_user["id"])
        users = [temp_user]

    user_id = str(users[0]["id"])
    print(f"Using app user_id: {user_id}")

    print("Step 2/6: Finding a purchasable course pack not already owned by that user...")
    owned_pack_ids = {
        str(row.get("course_pack_id"))
        for row in (
            supabase.table("user_purchases")
            .select("course_pack_id")
            .eq("user_id", user_id)
            .execute()
            .data
            or []
        )
        if row.get("course_pack_id") is not None
    }

    packs = (
        supabase.table("course_packs")
        .select("id,stripe_price_id")
        .not_.is_("stripe_price_id", "null")
        .execute()
        .data
        or []
    )

    candidate_pack = next(
        (pack for pack in packs if str(pack.get("id")) not in owned_pack_ids),
        None,
    )

    if not candidate_pack:
        raise RuntimeError(
            "No unused course pack found for selected user. Use another user or clear a test purchase row."
        )

    pack_id = str(candidate_pack["id"])
    price_id = candidate_pack["stripe_price_id"]

    suffix = random_suffix()

    print("Step 3/6: Creating Stripe Checkout Session...")
    session = stripe.checkout.Session.create(
        mode="payment",
        payment_method_types=["card"],
        line_items=[{"price": price_id, "quantity": 1}],
        success_url="https://example.com/success",
        cancel_url="https://example.com/cancel",
        client_reference_id=user_id,
        allow_promotion_codes=True,
        metadata={
            "user_id": user_id,
            "course_pack_id": pack_id,
            "source": "ysc-webhook-validation",
        },
    )

    print("Step 4/6: Posting signed webhook payload to Supabase Edge function...")
    webhook_url = env.supabase_url.rstrip("/") + "/functions/v1/stripe-webhook"
    event = {
        "id": f"evt_validate_{suffix}",
        "object": "event",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": session.id,
                "object": "checkout.session",
            }
        },
        "created": int(time.time()),
        "livemode": bool(session.livemode),
    }

    payload = json.dumps(event, separators=(",", ":")).encode("utf-8")
    headers = {
        "content-type": "application/json",
        "stripe-signature": sign_payload(payload, env.stripe_webhook_secret),
    }

    if env.anon_key:
        headers["apikey"] = env.anon_key
        headers["authorization"] = f"Bearer {env.anon_key}"

    response = requests.post(webhook_url, data=payload, headers=headers, timeout=30)

    print(f"Webhook response: {response.status_code}")
    print(response.text[:300])

    print("Step 5/6: Checking public.user_purchases...")
    rows = (
        supabase.table("user_purchases")
        .select(
            "user_id,course_pack_id,status,amount_paid,currency,stripe_checkout_session_id,stripe_payment_intent_id,purchased_at"
        )
        .eq("user_id", user_id)
        .eq("course_pack_id", pack_id)
        .eq("stripe_checkout_session_id", session.id)
        .limit(1)
        .execute()
        .data
        or []
    )

    if rows:
        print("Validation result: PASS")
        print(json.dumps(rows[0], indent=2, default=str))
    else:
        print("Validation result: FAIL")
        print("No matching row written to public.user_purchases for this checkout session.")

    print("Step 6/6: Cleanup")
    if rows:
        supabase.table("user_purchases").delete().eq("user_id", user_id).eq(
            "course_pack_id", pack_id
        ).eq("stripe_checkout_session_id", session.id).execute()

    try:
        stripe.checkout.Session.expire(session.id)
    except Exception:
        pass

    if created_temp_user and temp_user_id:
        print("Cleaning up temporary validation user...")
        cleanup_temp_validation_user(env, supabase, temp_user_id)


if __name__ == "__main__":
    main()
