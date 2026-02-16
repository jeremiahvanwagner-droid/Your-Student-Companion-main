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


def main() -> None:
    env = load_env()

    stripe.api_key = env.stripe_secret_key
    supabase = create_client(env.supabase_url, env.service_role_key)

    print("Step 1/5: Finding a purchasable course pack...")
    packs = (
        supabase.table("course_packs")
        .select("id,stripe_price_id")
        .not_.is_("stripe_price_id", "null")
        .limit(1)
        .execute()
        .data
        or []
    )

    if not packs:
        raise RuntimeError("No course pack with stripe_price_id found.")

    pack_id = str(packs[0]["id"])
    price_id = packs[0]["stripe_price_id"]

    suffix = random_suffix()
    user_id = f"edge_validate_{suffix}"

    print("Step 2/5: Creating Stripe Checkout Session...")
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

    print("Step 3/5: Posting signed webhook payload to Supabase Edge function...")
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

    print("Step 4/5: Checking public.user_purchases...")
    rows = (
        supabase.table("user_purchases")
        .select(
            "user_id,course_pack_id,status,amount_paid,currency,stripe_checkout_session_id,stripe_payment_intent_id,purchased_at"
        )
        .eq("user_id", user_id)
        .eq("course_pack_id", pack_id)
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
        print("No matching row written to public.user_purchases.")

    print("Step 5/5: Cleanup")
    if rows:
        supabase.table("user_purchases").delete().eq("user_id", user_id).eq(
            "course_pack_id", pack_id
        ).execute()

    try:
        stripe.checkout.Session.expire(session.id)
    except Exception:
        pass


if __name__ == "__main__":
    main()
