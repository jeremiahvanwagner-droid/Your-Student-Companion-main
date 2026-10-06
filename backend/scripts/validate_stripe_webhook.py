"""
Validate the FastAPI Stripe webhook end-to-end against a real (Test-mode)
Stripe account and the Supabase project the backend is configured for.

Target: {API_BASE_URL}/api/webhooks/stripe (decision D5: FastAPI is the only
Stripe webhook; the Supabase Edge function is gone).

What it does
------------
1. Picks an existing application user, or inserts a temporary `public.users`
   row directly through the service-role client. There are no Supabase Auth
   users under the Clerk-only identity model (D2), so nothing touches
   /auth/v1/admin/users.
2. Creates a real Stripe Checkout Session in payment mode (no payment is
   taken), posts a signed `checkout.session.completed` event for it, and
   asserts a `user_purchases` row was written for that session id. The event
   body is the real session with `payment_status` set to "paid" so the handler
   records a completed purchase; the session itself is expired afterwards.
3. Posts a signed synthetic `customer.subscription.created` event carrying
   `metadata {user_id, tier: "degree_bundle", cadence: "monthly",
   degree_plan_id}` for a fake `sub_validate_...` id.
   * Default (no --expect-ledger): the response and any resulting row are
     printed for information only and never fail the run.
   * With --expect-ledger: asserts the `user_subscriptions` row has `tier`,
     `plan_type` and `trial_end`, that a `stripe_webhook_events` ledger row
     exists for the event id, then posts the identical event again and asserts
     the replay is acknowledged (HTTP 200), still exactly one subscription row
     exists, and the ledger row shows the replay (attempts >= 2, processed).
4. Cleans up everything it created: subscription/purchase/ledger rows, the
   temporary user (if one was created), and the Checkout Session.

Why --expect-ledger defaults to False
-------------------------------------
The webhook handler changes that persist `tier` / `degree_plan_id` /
`trial_end` and write the `stripe_webhook_events` ledger (rebuild plan
section 4, items 1-2) ship in a later PR. Until that merges the subscription
step is informational so this script stays usable for the checkout path.
Flip the default (or always pass the flag) once that PR lands.

Environment (backend/.env): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, API_BASE_URL (or --api-base-url).
Optional: SUPABASE_PROJECT_REF (enforced by get_supabase_admin_client).

Usage:
  python backend/scripts/validate_stripe_webhook.py
  python backend/scripts/validate_stripe_webhook.py --api-base-url http://127.0.0.1:8000
  python backend/scripts/validate_stripe_webhook.py --expect-ledger
  python backend/scripts/validate_stripe_webhook.py --live   # only against the Live account

Exit code 0 on PASS, 1 on FAIL or configuration error.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import secrets
import string
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
import stripe


CURRENT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = CURRENT_DIR.parent

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from lib.supabase_client import SupabaseConfigError, get_supabase_admin_client  # noqa: E402
from ysc_script_utils import load_environment, stripe_key_guard_error  # noqa: E402

WEBHOOK_PATH = "/api/webhooks/stripe"

# The 7 events the Stripe destination must deliver (STORE_WEBHOOK_RUNBOOK.md section 6).
REQUIRED_EVENTS = [
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.trial_will_end",
    "invoice.paid",
    "invoice.payment_failed",
]

DAY_SECONDS = 86_400
TRIAL_DAYS = 14


@dataclass
class Env:
    stripe_secret_key: str
    stripe_webhook_secret: str
    api_base_url: str


class ValidationFailure(Exception):
    """A hard assertion failed; the run reports FAIL."""


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate the FastAPI Stripe webhook end-to-end.")
    parser.add_argument(
        "--api-base-url",
        default=None,
        help="Backend base URL (default: env API_BASE_URL), e.g. https://ysc-api.onrender.com",
    )
    parser.add_argument(
        "--expect-ledger",
        action="store_true",
        help=(
            "Assert tier/plan_type/trial_end persistence, the stripe_webhook_events "
            "ledger row and replay idempotency. Off by default until the webhook "
            "rewrite PR lands (see module docstring)."
        ),
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Allow running against a Stripe LIVE secret key (sk_live_...). Refused otherwise.",
    )
    return parser.parse_args(argv)


def _require(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def load_env(api_base_url_override: Optional[str]) -> Env:
    load_environment()
    api_base_url = (api_base_url_override or os.getenv("API_BASE_URL") or "").strip()
    if not api_base_url:
        raise RuntimeError("Missing API_BASE_URL (or pass --api-base-url).")
    return Env(
        stripe_secret_key=_require("STRIPE_SECRET_KEY"),
        stripe_webhook_secret=_require("STRIPE_WEBHOOK_SECRET"),
        api_base_url=api_base_url.rstrip("/"),
    )


# ---------------------------------------------------------------------------
# Signing / posting
# ---------------------------------------------------------------------------

def sign_payload(payload: bytes, webhook_secret: str, timestamp: Optional[int] = None) -> str:
    """Build a `Stripe-Signature` header exactly as Stripe does (t=...,v1=...)."""
    ts = int(timestamp if timestamp is not None else time.time())
    signed_payload = f"{ts}.".encode("utf-8") + payload
    signature = hmac.new(
        webhook_secret.encode("utf-8"),
        signed_payload,
        hashlib.sha256,
    ).hexdigest()
    return f"t={ts},v1={signature}"


def encode_event(event: Dict[str, Any]) -> bytes:
    return json.dumps(event, separators=(",", ":"), default=str).encode("utf-8")


def post_event(url: str, event: Dict[str, Any], webhook_secret: str) -> requests.Response:
    payload = encode_event(event)
    header = sign_payload(payload, webhook_secret)
    # Self-check with the exact call the backend makes (Webhook.construct_event
    # decodes the raw bytes before verifying; WebhookSignature.verify_header does
    # not, so it must not be handed bytes). A signing bug in this script is
    # therefore caught here rather than reported as a backend failure.
    stripe.Webhook.construct_event(payload, header, webhook_secret, tolerance=300)
    return requests.post(
        url,
        data=payload,
        headers={"content-type": "application/json", "stripe-signature": header},
        timeout=30,
    )


def random_suffix(length: int = 8) -> str:
    alphabet = string.ascii_lowercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


# ---------------------------------------------------------------------------
# Event builders
# ---------------------------------------------------------------------------

def build_checkout_event(session: Any, suffix: str) -> Dict[str, Any]:
    """Wrap a real Checkout Session in a synthetic completed event."""
    session_obj = session.to_dict_recursive() if hasattr(session, "to_dict_recursive") else dict(session)
    # Simulate the completed checkout: no card is ever charged by this script.
    session_obj["payment_status"] = "paid"
    session_obj["status"] = "complete"
    return {
        "id": f"evt_validate_checkout_{suffix}",
        "object": "event",
        "api_version": stripe.api_version,
        "type": "checkout.session.completed",
        "created": int(time.time()),
        "livemode": bool(session_obj.get("livemode", False)),
        "data": {"object": session_obj},
    }


def build_subscription_created_event(
    *,
    suffix: str,
    user_id: str,
    degree_plan_id: Any,
    price_id: str,
    customer_id: Optional[str],
    now: Optional[int] = None,
) -> Dict[str, Any]:
    """Synthetic customer.subscription.created mirroring store.py checkout metadata."""
    ts = int(now if now is not None else time.time())
    metadata = {
        "user_id": user_id,
        "tier": "degree_bundle",
        "cadence": "monthly",
        "degree_plan_id": str(degree_plan_id),
        "source": "ysc-webhook-validation",
    }
    period_end = ts + 30 * DAY_SECONDS
    subscription = {
        "id": f"sub_validate_{suffix}",
        "object": "subscription",
        "customer": customer_id,
        "status": "trialing",
        "metadata": metadata,
        "current_period_start": ts,
        "current_period_end": period_end,
        "trial_start": ts,
        "trial_end": ts + TRIAL_DAYS * DAY_SECONDS,
        "cancel_at_period_end": False,
        "livemode": False,
        "items": {
            "object": "list",
            "data": [
                {
                    "id": f"si_validate_{suffix}",
                    "object": "subscription_item",
                    "current_period_start": ts,
                    "current_period_end": period_end,
                    "price": {
                        "id": price_id,
                        "object": "price",
                        "currency": "usd",
                        "unit_amount": 799,
                        "type": "recurring",
                        "recurring": {"interval": "month", "interval_count": 1},
                    },
                    "quantity": 1,
                }
            ],
        },
    }
    return {
        "id": f"evt_validate_sub_{suffix}",
        "object": "event",
        "api_version": stripe.api_version,
        "type": "customer.subscription.created",
        "created": ts,
        "livemode": False,
        "data": {"object": subscription},
    }


# ---------------------------------------------------------------------------
# Supabase helpers (service-role client only; no Supabase Auth)
# ---------------------------------------------------------------------------

def create_temp_validation_user(supabase) -> Dict[str, Any]:
    suffix = random_suffix(10)
    row = {
        "email": f"webhook-validate-{suffix}@example.com",
        "clerk_id": f"clerk_webhook_validate_{suffix}",
        "role": "student",
    }
    inserted = supabase.table("users").insert(row).execute().data or []
    if not inserted or not inserted[0].get("id"):
        raise RuntimeError("Temporary users row insert returned no id.")
    return {"id": str(inserted[0]["id"]), **row}


def delete_temp_validation_user(supabase, user_id: str) -> None:
    # Child rows cascade from users in the baseline schema; delete explicitly
    # anyway so cleanup also works against a database without the cascades.
    for table, column in (
        ("user_subscriptions", "user_id"),
        ("user_purchases", "user_id"),
        ("student_profiles", "user_id"),
        ("users", "id"),
    ):
        try:
            supabase.table(table).delete().eq(column, user_id).execute()
        except Exception:  # pylint: disable=broad-except
            pass


def fetch_subscription_rows(supabase, stripe_subscription_id: str) -> List[Dict[str, Any]]:
    return (
        supabase.table("user_subscriptions")
        .select(
            "id,user_id,tier,plan_type,degree_plan_id,status,trial_end,"
            "current_period_start,current_period_end,cancel_at_period_end,stripe_subscription_id"
        )
        .eq("stripe_subscription_id", stripe_subscription_id)
        .execute()
        .data
        or []
    )


def fetch_ledger_row(supabase, event_id: str) -> Optional[Dict[str, Any]]:
    try:
        rows = (
            supabase.table("stripe_webhook_events")
            .select("event_id,event_type,status,attempts,received_at,processed_at,error")
            .eq("event_id", event_id)
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception as exc:  # pylint: disable=broad-except
        print(f"[warn] stripe_webhook_events query failed: {exc}")
        return None
    return rows[0] if rows else None


# ---------------------------------------------------------------------------
# Assertions
# ---------------------------------------------------------------------------

def assert_subscription_persisted(rows: List[Dict[str, Any]], expected_user_id: str) -> Dict[str, Any]:
    if len(rows) != 1:
        raise ValidationFailure(f"expected exactly 1 user_subscriptions row, found {len(rows)}")
    row = rows[0]
    problems = []
    if str(row.get("user_id")) != expected_user_id:
        problems.append(f"user_id={row.get('user_id')!r} (expected {expected_user_id})")
    if row.get("tier") != "degree_bundle":
        problems.append(f"tier={row.get('tier')!r} (expected 'degree_bundle')")
    if row.get("plan_type") != "degree_bundle_monthly":
        problems.append(f"plan_type={row.get('plan_type')!r} (expected 'degree_bundle_monthly')")
    if not row.get("trial_end"):
        problems.append("trial_end is NULL (expected the Stripe trial_end)")
    if row.get("degree_plan_id") in (None, ""):
        problems.append("degree_plan_id is NULL (expected the metadata degree_plan_id)")
    if problems:
        raise ValidationFailure("user_subscriptions row incomplete: " + "; ".join(problems))
    return row


def assert_ledger_row(row: Optional[Dict[str, Any]], event_id: str, *, min_attempts: int) -> None:
    if row is None:
        raise ValidationFailure(f"no stripe_webhook_events row for {event_id}")
    if row.get("status") != "processed":
        raise ValidationFailure(
            f"ledger row {event_id} status={row.get('status')!r} (expected 'processed'); error={row.get('error')!r}"
        )
    attempts = int(row.get("attempts") or 0)
    if attempts < min_attempts:
        raise ValidationFailure(f"ledger row {event_id} attempts={attempts} (expected >= {min_attempts})")


# ---------------------------------------------------------------------------
# Pre-flight: Stripe destination for this URL (informational)
# ---------------------------------------------------------------------------

def report_stripe_destination(webhook_url: str) -> None:
    try:
        endpoints = list(stripe.WebhookEndpoint.list(limit=100).auto_paging_iter())
    except Exception as exc:  # pylint: disable=broad-except
        print(f"[warn] could not list Stripe webhook endpoints: {exc}")
        return

    target = next((endpoint for endpoint in endpoints if endpoint.url == webhook_url), None)
    if target is None:
        print(f"[warn] no Stripe webhook destination registered for {webhook_url}")
        print("[warn] real Stripe events will not reach this backend until one exists")
        return

    enabled = set(target.enabled_events or [])
    if "*" in enabled:
        print(f"[ok] Stripe destination {target.id} ({target.status}) enabled events: *")
        return
    missing = [event for event in REQUIRED_EVENTS if event not in enabled]
    if missing:
        print(f"[warn] Stripe destination {target.id} is missing events: {', '.join(missing)}")
    else:
        print(f"[ok] Stripe destination {target.id} ({target.status}) carries all {len(REQUIRED_EVENTS)} events")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)

    try:
        env = load_env(args.api_base_url)
    except RuntimeError as exc:
        print(f"[fatal] {exc}")
        return 1

    guard_error = stripe_key_guard_error(env.stripe_secret_key, args.live)
    if guard_error:
        print(f"[fatal] {guard_error}")
        return 1

    stripe.api_key = env.stripe_secret_key
    try:
        supabase = get_supabase_admin_client()
    except SupabaseConfigError as exc:
        print(f"[fatal] {exc}")
        return 1

    webhook_url = env.api_base_url + WEBHOOK_PATH
    print(f"Target webhook: {webhook_url}")
    print(f"Ledger assertions: {'ON (--expect-ledger)' if args.expect_ledger else 'off (informational)'}")

    print("\nStep 0/7: Stripe destination pre-flight")
    report_stripe_destination(webhook_url)

    failures: List[str] = []
    created_temp_user = False
    user_id: Optional[str] = None
    session = None
    checkout_event_id: Optional[str] = None
    purchase_pack_id: Optional[str] = None
    sub_event_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None

    try:
        print("\nStep 1/7: Selecting an application user")
        users = supabase.table("users").select("id,clerk_id,email").limit(1).execute().data or []
        if not users:
            print("No users found; inserting a temporary validation user (public.users only)")
            temp_user = create_temp_validation_user(supabase)
            created_temp_user = True
            users = [temp_user]
        user_id = str(users[0]["id"])
        print(f"Using app user_id: {user_id}")

        print("\nStep 2/7: Finding a Stripe-linked course pack the user does not own")
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
            .select("id,slug,stripe_price_id")
            .eq("is_active", True)
            .not_.is_("stripe_price_id", "null")
            .order("id")
            .execute()
            .data
            or []
        )
        candidate_pack = next((pack for pack in packs if str(pack.get("id")) not in owned_pack_ids), None)
        if not candidate_pack:
            raise RuntimeError(
                "No unused Stripe-linked course pack found. Run relink_stripe_catalog.py "
                "first, or clear a test purchase row for this user."
            )
        purchase_pack_id = str(candidate_pack["id"])
        price_id = candidate_pack["stripe_price_id"]
        print(f"Using course_pack_id={purchase_pack_id} ({candidate_pack.get('slug')}) price={price_id}")

        suffix = random_suffix()

        print("\nStep 3/7: Creating a Stripe Checkout Session (payment mode, no charge)")
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
                "course_pack_id": purchase_pack_id,
                "source": "ysc-webhook-validation",
            },
        )
        print(f"Checkout Session: {session.id}")

        print("\nStep 4/7: Posting signed checkout.session.completed")
        checkout_event = build_checkout_event(session, suffix)
        checkout_event_id = checkout_event["id"]
        response = post_event(webhook_url, checkout_event, env.stripe_webhook_secret)
        print(f"Webhook response: {response.status_code} {response.text[:300]}")
        if response.status_code != 200:
            failures.append(f"checkout.session.completed returned {response.status_code}")

        purchase_rows = (
            supabase.table("user_purchases")
            .select(
                "user_id,course_pack_id,status,amount_paid,currency,"
                "stripe_checkout_session_id,stripe_payment_intent_id,lifetime_access,purchased_at"
            )
            .eq("user_id", user_id)
            .eq("course_pack_id", purchase_pack_id)
            .eq("stripe_checkout_session_id", session.id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if purchase_rows:
            print("[ok] user_purchases row written:")
            print(json.dumps(purchase_rows[0], indent=2, default=str))
            if purchase_rows[0].get("status") != "completed":
                failures.append(f"user_purchases.status={purchase_rows[0].get('status')!r}, expected 'completed'")
        else:
            failures.append("no user_purchases row for this checkout session")
            print("[fail] no user_purchases row written for this checkout session")

        print("\nStep 5/7: Posting signed customer.subscription.created (degree_bundle / monthly)")
        degree_plans = (
            supabase.table("degree_plans")
            .select("id,slug")
            .eq("is_active", True)
            .order("id")
            .limit(1)
            .execute()
            .data
            or []
        )
        if not degree_plans:
            raise RuntimeError("No active degree_plans row; seed migrations not applied?")
        degree_plan_id = degree_plans[0]["id"]

        plan_rows = (
            supabase.table("subscription_plans")
            .select("stripe_monthly_price_id")
            .eq("tier", "degree_bundle")
            .limit(1)
            .execute()
            .data
            or []
        )
        monthly_price_id = (plan_rows[0].get("stripe_monthly_price_id") if plan_rows else None) or (
            f"price_validate_degree_monthly_{suffix}"
        )
        customer_id = (
            supabase.table("users").select("stripe_customer_id").eq("id", user_id).limit(1).execute().data or [{}]
        )[0].get("stripe_customer_id")

        sub_event = build_subscription_created_event(
            suffix=suffix,
            user_id=user_id,
            degree_plan_id=degree_plan_id,
            price_id=monthly_price_id,
            customer_id=customer_id,
        )
        sub_event_id = sub_event["id"]
        stripe_subscription_id = sub_event["data"]["object"]["id"]

        response = post_event(webhook_url, sub_event, env.stripe_webhook_secret)
        print(f"Webhook response: {response.status_code} {response.text[:300]}")
        sub_rows = fetch_subscription_rows(supabase, stripe_subscription_id)
        ledger_row = fetch_ledger_row(supabase, sub_event_id)
        print(f"user_subscriptions rows for {stripe_subscription_id}: {len(sub_rows)}")
        if sub_rows:
            print(json.dumps(sub_rows[0], indent=2, default=str))
        print(f"stripe_webhook_events row: {json.dumps(ledger_row, default=str) if ledger_row else 'none'}")

        if args.expect_ledger:
            if response.status_code != 200:
                failures.append(f"customer.subscription.created returned {response.status_code}")
            try:
                assert_subscription_persisted(sub_rows, user_id)
                assert_ledger_row(ledger_row, sub_event_id, min_attempts=1)
                print("[ok] subscription row + ledger row assertions passed")
            except ValidationFailure as exc:
                failures.append(str(exc))
                print(f"[fail] {exc}")

            print("\nStep 6/7: Replaying the identical event (idempotency)")
            replay = post_event(webhook_url, sub_event, env.stripe_webhook_secret)
            print(f"Replay response: {replay.status_code} {replay.text[:300]}")
            if replay.status_code != 200:
                failures.append(f"replay of customer.subscription.created returned {replay.status_code}")
            sub_rows_after = fetch_subscription_rows(supabase, stripe_subscription_id)
            ledger_after = fetch_ledger_row(supabase, sub_event_id)
            try:
                if len(sub_rows_after) != 1:
                    raise ValidationFailure(
                        f"after replay expected exactly 1 user_subscriptions row, found {len(sub_rows_after)}"
                    )
                assert_ledger_row(ledger_after, sub_event_id, min_attempts=2)
                print("[ok] replay left exactly one subscription row; ledger recorded the retry")
            except ValidationFailure as exc:
                failures.append(str(exc))
                print(f"[fail] {exc}")
        else:
            print("\nStep 6/7: Replay + ledger assertions skipped (pass --expect-ledger to enforce)")
            if response.status_code != 200:
                print(
                    "[info] subscription event was rejected; expected until the webhook "
                    "rewrite PR persists tier/trial_end and writes the ledger."
                )

    except Exception as exc:  # pylint: disable=broad-except
        failures.append(f"unexpected error: {exc}")
        print(f"[fail] {exc}")

    finally:
        print("\nStep 7/7: Cleanup")
        if stripe_subscription_id:
            try:
                supabase.table("user_subscriptions").delete().eq(
                    "stripe_subscription_id", stripe_subscription_id
                ).execute()
            except Exception:  # pylint: disable=broad-except
                pass
        for event_id in (checkout_event_id, sub_event_id):
            if not event_id:
                continue
            try:
                supabase.table("stripe_webhook_events").delete().eq("event_id", event_id).execute()
            except Exception:  # pylint: disable=broad-except
                pass
        if session is not None and user_id and purchase_pack_id:
            try:
                supabase.table("user_purchases").delete().eq("user_id", user_id).eq(
                    "course_pack_id", purchase_pack_id
                ).eq("stripe_checkout_session_id", session.id).execute()
            except Exception:  # pylint: disable=broad-except
                pass
            try:
                stripe.checkout.Session.expire(session.id)
            except Exception:  # pylint: disable=broad-except
                pass
        if created_temp_user and user_id:
            print("Removing temporary validation user")
            delete_temp_validation_user(supabase, user_id)

    print("\n== Result ==")
    if failures:
        print("Validation result: FAIL")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("Validation result: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
