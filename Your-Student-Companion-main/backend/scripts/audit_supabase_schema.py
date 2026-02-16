"""
Audit Supabase + Stripe readiness for the YSC store stack.

Checks:
- Required env vars
- Table existence and required columns
- Seed counts for core catalog tables
- Stripe webhook endpoint presence and required events
- Supabase Edge webhook endpoint reachability

Usage:
  python backend/scripts/audit_supabase_schema.py
  python backend/scripts/audit_supabase_schema.py --warn-only
"""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

import requests
import stripe
from dotenv import load_dotenv
from supabase import Client, create_client


CURRENT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = CURRENT_DIR.parent
ROOT_DIR = BACKEND_DIR.parent

REQUIRED_EVENTS = {
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_failed",
}

EXPECTED_TABLE_COLUMNS: Dict[str, List[str]] = {
    "users": ["id", "clerk_id", "email", "role", "created_at", "updated_at"],
    "student_profiles": [
        "id",
        "user_id",
        "display_name",
        "grade_level",
        "year_level",
        "timezone",
        "weekly_goal_hours",
        "onboarding_completed",
        "created_at",
    ],
    "academic_levels": ["id", "name", "slug", "display_order", "description", "created_at"],
    "degree_plans": [
        "id",
        "name",
        "slug",
        "category",
        "description",
        "icon_name",
        "is_active",
        "created_at",
    ],
    "course_packs": [
        "id",
        "degree_plan_id",
        "academic_level_id",
        "name",
        "slug",
        "price",
        "stripe_price_id",
        "stripe_product_id",
        "is_active",
        "created_at",
    ],
    "user_purchases": [
        "id",
        "user_id",
        "course_pack_id",
        "stripe_checkout_session_id",
        "stripe_payment_intent_id",
        "amount_paid",
        "currency",
        "status",
        "purchased_at",
    ],
    "user_subscriptions": [
        "id",
        "user_id",
        "plan_type",
        "stripe_subscription_id",
        "status",
        "current_period_start",
        "current_period_end",
        "created_at",
    ],
    "content_items": [
        "id",
        "course_pack_id",
        "content_type",
        "title",
        "content_json",
        "difficulty",
        "display_order",
        "is_published",
        "created_at",
    ],
    "subjects": ["id", "user_id", "name", "color", "icon_name", "created_at"],
    "assignments": [
        "id",
        "user_id",
        "subject_id",
        "title",
        "due_date",
        "priority",
        "estimated_minutes",
        "status",
        "created_at",
        "updated_at",
    ],
    "study_sessions": [
        "id",
        "user_id",
        "subject_id",
        "intention",
        "duration_planned_minutes",
        "duration_actual_minutes",
        "session_type",
        "started_at",
        "completed_at",
    ],
    "focus_logs": [
        "id",
        "user_id",
        "study_session_id",
        "focus_minutes",
        "break_minutes",
        "distractions_noted",
        "logged_at",
    ],
    "notes": [
        "id",
        "user_id",
        "subject_id",
        "title",
        "content",
        "tags",
        "is_archived",
        "created_at",
        "updated_at",
    ],
    "review_cards": [
        "id",
        "user_id",
        "note_id",
        "front_text",
        "back_text",
        "difficulty",
        "next_review_at",
        "review_count",
        "created_at",
    ],
    "weekly_reports": [
        "id",
        "user_id",
        "week_start",
        "tasks_completed",
        "tasks_missed",
        "focus_minutes_total",
        "top_subject",
        "created_at",
    ],
    "reminders": [
        "id",
        "user_id",
        "reminder_type",
        "title",
        "message",
        "trigger_at",
        "is_read",
        "created_at",
    ],
    "ai_interactions": [
        "id",
        "user_id",
        "course_pack_id",
        "prompt",
        "response",
        "tokens_used",
        "created_at",
    ],
    "feature_flags": ["id", "flag_name", "is_enabled", "target_roles", "metadata", "updated_at"],
    "audit_logs": ["id", "actor_id", "action", "entity_type", "entity_id", "metadata", "created_at"],
}


@dataclass
class Env:
    supabase_url: str
    supabase_service_role_key: str
    stripe_secret_key: str | None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit Supabase/Stripe readiness for YSC.")
    parser.add_argument(
        "--warn-only",
        action="store_true",
        help="Always exit 0, even if checks fail.",
    )
    return parser.parse_args()


def load_environment() -> Env:
    load_dotenv(BACKEND_DIR / ".env")
    load_dotenv(ROOT_DIR / ".env.local")

    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("REACT_APP_SUPABASE_URL")
    supabase_service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    stripe_secret_key = os.getenv("STRIPE_SECRET_KEY")

    if not supabase_url:
        raise RuntimeError("Missing SUPABASE_URL (or REACT_APP_SUPABASE_URL).")
    if not supabase_service_role_key:
        raise RuntimeError("Missing SUPABASE_SERVICE_ROLE_KEY.")

    return Env(
        supabase_url=supabase_url,
        supabase_service_role_key=supabase_service_role_key,
        stripe_secret_key=stripe_secret_key,
    )


def check_table_columns(client: Client, table: str, columns: List[str]) -> Tuple[bool, str]:
    try:
        client.table(table).select(",".join(columns)).limit(1).execute()
        return True, "ok"
    except Exception as exc:  # pylint: disable=broad-except
        message = str(exc)
        if "Could not find the table" in message:
            return False, f"missing table: {table}"
        if "column" in message.lower() and "does not exist" in message.lower():
            return False, f"missing column(s) in {table}: {message}"
        return False, f"query error for {table}: {message}"


def count_rows(client: Client, table: str) -> int | None:
    try:
        response = client.table(table).select("id", count="exact", head=True).execute()
        return response.count
    except Exception:
        return None


def check_seed_expectations(client: Client) -> List[str]:
    messages: List[str] = []

    academic_levels_count = count_rows(client, "academic_levels")
    degree_plans_count = count_rows(client, "degree_plans")
    course_packs_count = count_rows(client, "course_packs")

    if academic_levels_count is not None:
        if academic_levels_count < 4:
            messages.append(f"academic_levels count too low: {academic_levels_count} (expected >= 4)")
        else:
            messages.append(f"academic_levels count: {academic_levels_count}")
    else:
        messages.append("academic_levels count unavailable")

    if degree_plans_count is not None:
        if degree_plans_count < 13:
            messages.append(f"degree_plans count too low: {degree_plans_count} (expected >= 13)")
        else:
            messages.append(f"degree_plans count: {degree_plans_count}")
    else:
        messages.append("degree_plans count unavailable")

    if course_packs_count is not None:
        if course_packs_count < 52:
            messages.append(f"course_packs count too low: {course_packs_count} (expected >= 52)")
        else:
            messages.append(f"course_packs count: {course_packs_count}")
    else:
        messages.append("course_packs count unavailable")

    try:
        stripe_mapped = (
            client.table("course_packs")
            .select("id", count="exact", head=True)
            .not_.is_("stripe_price_id", "null")
            .execute()
            .count
        )
        total = course_packs_count or 0
        messages.append(f"stripe_price_id mapped: {stripe_mapped}/{total}")
    except Exception:
        messages.append("stripe_price_id mapping check unavailable")

    return messages


def check_edge_function_health(supabase_url: str) -> Tuple[bool, str]:
    webhook_url = supabase_url.rstrip("/") + "/functions/v1/stripe-webhook"
    try:
        response = requests.get(webhook_url, timeout=15)
        # Healthy deployment usually returns 405 for GET because endpoint expects POST.
        if response.status_code in {400, 401, 403, 405}:
            return True, f"edge endpoint reachable ({response.status_code})"
        if response.status_code == 404:
            return False, "edge endpoint not found (404)"
        return True, f"edge endpoint reachable ({response.status_code})"
    except Exception as exc:  # pylint: disable=broad-except
        return False, f"edge endpoint request failed: {exc}"


def check_stripe_webhook_configuration(supabase_url: str, stripe_secret_key: str | None) -> Tuple[bool, List[str]]:
    messages: List[str] = []
    if not stripe_secret_key:
        return False, ["STRIPE_SECRET_KEY not set; skipped Stripe endpoint checks."]

    stripe.api_key = stripe_secret_key
    target_url = supabase_url.rstrip("/") + "/functions/v1/stripe-webhook"

    try:
        endpoints = stripe.WebhookEndpoint.list(limit=100).data
    except Exception as exc:  # pylint: disable=broad-except
        return False, [f"failed to list Stripe webhook endpoints: {exc}"]

    if not endpoints:
        return False, ["no Stripe webhook endpoints found"]

    target = next((endpoint for endpoint in endpoints if endpoint.url == target_url), None)
    if not target:
        messages.append(f"target endpoint not found in Stripe: {target_url}")
        messages.append("available endpoints:")
        for endpoint in endpoints:
            messages.append(f"- {endpoint.id} {endpoint.url} status={endpoint.status}")
        return False, messages

    enabled_events = set(target.enabled_events or [])
    missing_events = sorted(REQUIRED_EVENTS - enabled_events)
    messages.append(f"target endpoint: {target.id} status={target.status}")

    if "*" in enabled_events:
        messages.append("events: wildcard (*) enabled")
        return True, messages

    if missing_events:
        messages.append("missing events: " + ", ".join(missing_events))
        return False, messages

    messages.append("required events: present")
    return True, messages


def main() -> int:
    args = parse_args()

    try:
        env = load_environment()
    except RuntimeError as exc:
        print(f"[fatal] {exc}")
        return 0 if args.warn_only else 1

    client = create_client(env.supabase_url, env.supabase_service_role_key)

    print("== Supabase Schema Audit ==")
    failures = 0

    for table_name, required_columns in EXPECTED_TABLE_COLUMNS.items():
        ok, detail = check_table_columns(client, table_name, required_columns)
        prefix = "[ok]" if ok else "[fail]"
        print(f"{prefix} {table_name}: {detail}")
        if not ok:
            failures += 1

    print("\n== Seed Data Checks ==")
    for message in check_seed_expectations(client):
        print(f"[info] {message}")

    print("\n== Edge Function Reachability ==")
    edge_ok, edge_message = check_edge_function_health(env.supabase_url)
    print(f"{'[ok]' if edge_ok else '[fail]'} {edge_message}")
    if not edge_ok:
        failures += 1

    print("\n== Stripe Webhook Configuration ==")
    stripe_ok, stripe_messages = check_stripe_webhook_configuration(
        env.supabase_url, env.stripe_secret_key
    )
    for message in stripe_messages:
        print(f"{'[ok]' if stripe_ok else '[warn]'} {message}")
    if not stripe_ok:
        failures += 1

    print("\n== Summary ==")
    if failures == 0:
        print("[ok] All critical checks passed.")
        return 0

    print(f"[fail] {failures} critical check(s) failed.")
    if args.warn_only:
        print("[warn] --warn-only enabled; returning success exit code.")
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
