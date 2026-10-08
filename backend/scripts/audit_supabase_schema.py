"""
Audit Supabase + Stripe readiness for the YSC stack.

This is the verification oracle for local (`supabase start`), CI (`db-migrate`
job) and production. It talks to Supabase only through PostgREST with the
service-role key, so it proves what the backend will actually see.

Checks:
- Required env vars, and that SUPABASE_URL points at the expected project
  (--expect-project-ref / SUPABASE_PROJECT_REF). A mismatch is always fatal.
- Every expected table exists with its expected columns. The baseline is
  supabase/migrations/20261006000000_baseline.sql (30 public tables).
- Seed counts: academic_levels >= 4, degree_plans >= 14, course_packs >= 56,
  subscription_plans == 2.
- FastAPI webhook reachability: GET {API_BASE_URL}/api/webhooks/stripe must
  answer 405 (the route is POST-only). Skipped with a warning when
  API_BASE_URL is unset (e.g. CI against a local database).
- The Stripe webhook destination for that URL carries the 7 required events
  (backend/STORE_WEBHOOK_RUNBOOK.md section 6). Skipped with a warning when
  STRIPE_SECRET_KEY or API_BASE_URL is unset.

Usage:
  python backend/scripts/audit_supabase_schema.py
  python backend/scripts/audit_supabase_schema.py --expect-project-ref local
  python backend/scripts/audit_supabase_schema.py --expect-project-ref <project-ref>
  python backend/scripts/audit_supabase_schema.py --warn-only

Exit codes: 0 when every critical check passed (or --warn-only), 1 otherwise.
Skipped checks are reported as warnings and never fail the run; a
project-ref mismatch fails the run even with --warn-only because every other
result would be about the wrong database.
"""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import requests
import stripe
from supabase import Client, create_client


CURRENT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = CURRENT_DIR.parent
ROOT_DIR = BACKEND_DIR.parent

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from lib.supabase_client import project_ref_mismatch  # noqa: E402  (loads backend/.env)
from ysc_script_utils import load_environment  # noqa: E402

WEBHOOK_PATH = "/api/webhooks/stripe"

# The 7 events the Stripe destination must deliver (STORE_WEBHOOK_RUNBOOK.md section 6).
REQUIRED_EVENTS = {
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.trial_will_end",
    "invoice.paid",
    "invoice.payment_failed",
}

# Seed expectations from the seed migrations (20261006000100 / 000200).
SEED_MINIMUMS = {
    "academic_levels": 4,
    "degree_plans": 14,
    "course_packs": 56,
}
SEED_EXACT = {
    "subscription_plans": 2,
}

# One entry per public table in the baseline migration. Column lists are the
# columns the backend selects or writes (routes/*.py) plus the design columns
# from the rebuild plan section 3.2. Keep this in lockstep with
# supabase/migrations/20261006000000_baseline.sql.
EXPECTED_TABLE_COLUMNS: Dict[str, List[str]] = {
    # ---- identity ---------------------------------------------------------
    "users": [
        "id",
        "clerk_id",
        "email",
        "role",
        "stripe_customer_id",
        "created_at",
        "updated_at",
    ],
    "student_profiles": [
        "id",
        "user_id",
        "display_name",
        "grade_level",
        "school",
        "major",
        "year_level",
        "timezone",
        "weekly_goal_hours",
        "study_preferences",
        "onboarding_completed",
        "state",
        "email_opt_out",
        "created_at",
        "updated_at",
    ],
    # ---- catalog (bigint identity ids) ------------------------------------
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
        "description",
        "price",
        "features",
        "stripe_price_id",
        "stripe_product_id",
        "is_active",
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
    # ---- commerce ---------------------------------------------------------
    "subscription_plans": [
        "id",
        "tier",
        "name",
        "description",
        "stripe_product_id",
        "stripe_monthly_price_id",
        "stripe_annual_price_id",
        "monthly_amount_cents",
        "annual_amount_cents",
        "trial_days",
        "is_active",
        "created_at",
        "updated_at",
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
        "lifetime_access",
        "purchased_at",
    ],
    "user_subscriptions": [
        "id",
        "user_id",
        "tier",
        "plan_type",
        "degree_plan_id",
        "stripe_subscription_id",
        "stripe_customer_id",
        "stripe_price_id",
        "status",
        "current_period_start",
        "current_period_end",
        "trial_end",
        "cancel_at_period_end",
        "created_at",
        "updated_at",
    ],
    "stripe_webhook_events": [
        "event_id",
        "event_type",
        "status",
        "attempts",
        "received_at",
        "processed_at",
        "error",
        "payload",
    ],
    # ---- student-owned ----------------------------------------------------
    "subjects": ["id", "user_id", "name", "color", "icon_name", "archived", "created_at"],
    "assignments": [
        "id",
        "user_id",
        "subject_id",
        "title",
        "description",
        "due_date",
        "priority",
        "estimated_minutes",
        "status",
        "completed_at",
        "created_at",
        "updated_at",
    ],
    # study_sessions has NO created_at (the baseline never had one; focus.py
    # orders by started_at). Do not add it here.
    "study_sessions": [
        "id",
        "user_id",
        "subject_id",
        "intention",
        "duration_planned_minutes",
        "duration_actual_minutes",
        "reflection",
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
    "focus_migrations": ["id", "user_id", "minutes_imported", "imported_at"],
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
        "ease_factor",
        "interval_days",
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
        "insights_json",
        "created_at",
    ],
    "reminders": [
        "id",
        "user_id",
        "reminder_type",
        "title",
        "message",
        "trigger_at",
        "reference_id",
        "is_read",
        "created_at",
    ],
    "ai_interactions": [
        "id",
        "user_id",
        "course_pack_id",
        "prompt",
        "response",
        "context_metadata",
        "tokens_used",
        "flagged",
        "flag_reason",
        "created_at",
    ],
    "planner_blocks": [
        "id",
        "user_id",
        "subject_id",
        "assignment_id",
        "title",
        "goal",
        "scheduled_start",
        "scheduled_end",
        "completed",
        "source",
        "created_at",
        "updated_at",
    ],
    # ---- platform ---------------------------------------------------------
    "audit_logs": ["id", "actor_id", "action", "entity_type", "entity_id", "metadata", "created_at"],
    "feature_flags": ["id", "flag_name", "is_enabled", "target_roles", "metadata", "updated_at"],
    # ---- exams (docs/phases/step-7-exams.md section 6; 7 tables) ----------
    "exams": [
        "id",
        "slug",
        "name",
        "full_name",
        "category",
        "region_state",
        "region_metro",
        "grade_band",
        "description",
        "total_time_minutes",
        "total_questions",
        "sections_count",
        "scoring_model",
        "scoring_metadata",
        "content_source",
        "content_provenance",
        "icon_name",
        "is_published",
        "is_official_partnership",
        "created_at",
        "updated_at",
    ],
    "exam_sections": [
        "id",
        "exam_id",
        "slug",
        "name",
        "display_order",
        "time_minutes",
        "total_questions",
        "scoring_weight",
        "description",
    ],
    "exam_passages": [
        "id",
        "exam_id",
        "section_id",
        "title",
        "content",
        "content_html",
        "estimated_read_time_seconds",
        "source_type",
        "source_attribution",
        "year_released",
        "created_at",
    ],
    "exam_questions": [
        "id",
        "exam_id",
        "section_id",
        "passage_id",
        "question_type",
        "stem",
        "stem_html",
        "choices",
        "correct_answer",
        "explanation",
        "difficulty",
        "topic_tags",
        "standards_alignment",
        "source_type",
        "source_attribution",
        "year_released",
        "display_order",
        "is_published",
        "created_at",
        "updated_at",
    ],
    "exam_attempts": [
        "id",
        "user_id",
        "exam_id",
        "mode",
        "status",
        "entitlement_source",
        "entitlement_reference_id",
        "started_at",
        "completed_at",
        "time_spent_seconds",
        "score_raw",
        "score_scaled",
        "score_composite",
        "score_percentile",
        "section_scores",
        "question_ids",
        "created_at",
    ],
    "exam_attempt_responses": [
        "id",
        "attempt_id",
        "question_id",
        "response_value",
        "is_correct",
        "time_spent_seconds",
        "flagged_for_review",
        "skipped",
        "answered_at",
    ],
    "course_pack_exams": ["id", "course_pack_id", "exam_id", "created_at"],
}


@dataclass
class Env:
    supabase_url: str
    supabase_service_role_key: str
    stripe_secret_key: Optional[str]
    api_base_url: Optional[str]


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit Supabase/Stripe readiness for YSC.")
    parser.add_argument(
        "--warn-only",
        action="store_true",
        help="Exit 0 even if checks fail (a project-ref mismatch still exits 1).",
    )
    parser.add_argument(
        "--expect-project-ref",
        metavar="REF|local",
        default=None,
        help=(
            "Assert that the SUPABASE_URL host contains this Supabase project ref "
            "('local' accepts 127.0.0.1/localhost). Defaults to env SUPABASE_PROJECT_REF."
        ),
    )
    return parser.parse_args(argv)


def load_env() -> Env:
    load_environment()

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url:
        raise RuntimeError("Missing SUPABASE_URL.")
    if not supabase_service_role_key:
        raise RuntimeError("Missing SUPABASE_SERVICE_ROLE_KEY.")

    return Env(
        supabase_url=supabase_url,
        supabase_service_role_key=supabase_service_role_key,
        stripe_secret_key=os.getenv("STRIPE_SECRET_KEY") or None,
        api_base_url=(os.getenv("API_BASE_URL") or "").strip() or None,
    )


def webhook_url_for(api_base_url: str) -> str:
    return api_base_url.rstrip("/") + WEBHOOK_PATH


# ---------------------------------------------------------------------------
# Schema checks
# ---------------------------------------------------------------------------

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


def count_rows(client: Client, table: str, id_column: str = "id") -> Optional[int]:
    try:
        response = client.table(table).select(id_column, count="exact", head=True).execute()
        return response.count
    except Exception:  # pylint: disable=broad-except
        return None


def check_seed_expectations(client: Client) -> Tuple[int, List[Tuple[str, str]]]:
    """Return (failure_count, [(level, message)]) for the seed thresholds."""
    failures = 0
    messages: List[Tuple[str, str]] = []

    counts: Dict[str, Optional[int]] = {}
    for table in list(SEED_MINIMUMS) + list(SEED_EXACT):
        counts[table] = count_rows(client, table)

    for table, minimum in SEED_MINIMUMS.items():
        count = counts[table]
        if count is None:
            failures += 1
            messages.append(("fail", f"{table} count unavailable"))
        elif count < minimum:
            failures += 1
            messages.append(("fail", f"{table} count too low: {count} (expected >= {minimum})"))
        else:
            messages.append(("ok", f"{table} count: {count} (expected >= {minimum})"))

    for table, exact in SEED_EXACT.items():
        count = counts[table]
        if count is None:
            failures += 1
            messages.append(("fail", f"{table} count unavailable"))
        elif count != exact:
            failures += 1
            messages.append(("fail", f"{table} count: {count} (expected exactly {exact})"))
        else:
            messages.append(("ok", f"{table} count: {count} (expected exactly {exact})"))

    # Informational: how much of the catalog is linked to Stripe. NULL ids are
    # expected on a fresh database until relink_stripe_catalog.py has run.
    try:
        stripe_mapped = (
            client.table("course_packs")
            .select("id", count="exact", head=True)
            .not_.is_("stripe_price_id", "null")
            .execute()
            .count
        )
        total = counts.get("course_packs") or 0
        messages.append(("info", f"course_packs.stripe_price_id mapped: {stripe_mapped}/{total}"))
    except Exception:  # pylint: disable=broad-except
        messages.append(("info", "course_packs.stripe_price_id mapping check unavailable"))

    try:
        plans_mapped = (
            client.table("subscription_plans")
            .select("id", count="exact", head=True)
            .not_.is_("stripe_monthly_price_id", "null")
            .execute()
            .count
        )
        total = counts.get("subscription_plans") or 0
        messages.append(
            ("info", f"subscription_plans.stripe_monthly_price_id mapped: {plans_mapped}/{total}")
        )
    except Exception:  # pylint: disable=broad-except
        messages.append(("info", "subscription_plans Stripe mapping check unavailable"))

    return failures, messages


# ---------------------------------------------------------------------------
# Webhook checks
# ---------------------------------------------------------------------------

def check_api_webhook_reachability(api_base_url: Optional[str]) -> Tuple[str, str]:
    """
    GET the FastAPI webhook route. The route only accepts POST, so a healthy
    deployment answers 405. Returns (status, message) with status in
    {"ok", "fail", "skip"}.
    """
    if not api_base_url:
        return "skip", "API_BASE_URL unset; skipped FastAPI webhook reachability check."

    url = webhook_url_for(api_base_url)
    try:
        response = requests.get(url, timeout=15, allow_redirects=False)
    except Exception as exc:  # pylint: disable=broad-except
        return "fail", f"webhook request failed: {url}: {exc}"

    if response.status_code == 405:
        return "ok", f"webhook reachable, GET -> 405 as expected ({url})"
    if response.status_code == 404:
        return "fail", f"webhook route not found (404): {url}"
    return "fail", f"webhook GET returned {response.status_code}, expected 405 ({url})"


def check_stripe_webhook_configuration(
    api_base_url: Optional[str], stripe_secret_key: Optional[str]
) -> Tuple[str, List[str]]:
    """
    Verify the Stripe account has a webhook destination for the FastAPI URL
    carrying all REQUIRED_EVENTS. Returns (status, messages) with status in
    {"ok", "fail", "skip"}.
    """
    if not stripe_secret_key:
        return "skip", ["STRIPE_SECRET_KEY unset; skipped Stripe webhook destination check."]
    if not api_base_url:
        return "skip", ["API_BASE_URL unset; skipped Stripe webhook destination check."]

    stripe.api_key = stripe_secret_key
    target_url = webhook_url_for(api_base_url)
    messages: List[str] = []

    try:
        endpoints = list(stripe.WebhookEndpoint.list(limit=100).auto_paging_iter())
    except Exception as exc:  # pylint: disable=broad-except
        return "fail", [f"failed to list Stripe webhook endpoints: {exc}"]

    if not endpoints:
        return "fail", [f"no Stripe webhook endpoints found (expected one for {target_url})"]

    target = next((endpoint for endpoint in endpoints if endpoint.url == target_url), None)
    if not target:
        messages.append(f"target endpoint not found in Stripe: {target_url}")
        messages.append("available endpoints:")
        for endpoint in endpoints:
            messages.append(f"- {endpoint.id} {endpoint.url} status={endpoint.status}")
        return "fail", messages

    enabled_events = set(target.enabled_events or [])
    messages.append(f"target endpoint: {target.id} status={target.status}")

    if target.status != "enabled":
        messages.append(f"endpoint status is {target.status!r}, expected 'enabled'")
        return "fail", messages

    if "*" in enabled_events:
        messages.append("events: wildcard (*) enabled")
        return "ok", messages

    missing_events = sorted(REQUIRED_EVENTS - enabled_events)
    if missing_events:
        messages.append("missing events: " + ", ".join(missing_events))
        return "fail", messages

    messages.append(f"required events: all {len(REQUIRED_EVENTS)} present")
    return "ok", messages


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

_PREFIX = {"ok": "[ok]", "fail": "[fail]", "skip": "[warn]", "info": "[info]", "warn": "[warn]"}


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)

    try:
        env = load_env()
    except RuntimeError as exc:
        print(f"[fatal] {exc}")
        return 0 if args.warn_only else 1

    expected_ref = args.expect_project_ref or os.getenv("SUPABASE_PROJECT_REF")
    print("== Project Ref ==")
    if expected_ref:
        reason = project_ref_mismatch(env.supabase_url, expected_ref)
        if reason:
            print(f"[fatal] {reason}")
            print("[fatal] Refusing to audit the wrong database (ignores --warn-only).")
            return 1
        print(f"[ok] SUPABASE_URL matches expected project ref {expected_ref!r}")
    else:
        print(
            "[warn] no --expect-project-ref / SUPABASE_PROJECT_REF set; "
            "cannot prove SUPABASE_URL points at the intended project."
        )

    client = create_client(env.supabase_url, env.supabase_service_role_key)

    failures = 0
    warnings = 0

    print("\n== Supabase Schema Audit ==")
    for table_name, required_columns in EXPECTED_TABLE_COLUMNS.items():
        ok, detail = check_table_columns(client, table_name, required_columns)
        print(f"{'[ok]' if ok else '[fail]'} {table_name}: {detail}")
        if not ok:
            failures += 1
    print(f"[info] {len(EXPECTED_TABLE_COLUMNS)} tables expected")

    print("\n== Seed Data Checks ==")
    seed_failures, seed_messages = check_seed_expectations(client)
    failures += seed_failures
    for level, message in seed_messages:
        print(f"{_PREFIX[level]} {message}")

    print("\n== FastAPI Webhook Reachability ==")
    reach_status, reach_message = check_api_webhook_reachability(env.api_base_url)
    print(f"{_PREFIX[reach_status]} {reach_message}")
    if reach_status == "fail":
        failures += 1
    elif reach_status == "skip":
        warnings += 1

    print("\n== Stripe Webhook Configuration ==")
    stripe_status, stripe_messages = check_stripe_webhook_configuration(
        env.api_base_url, env.stripe_secret_key
    )
    for message in stripe_messages:
        print(f"{_PREFIX[stripe_status]} {message}")
    if stripe_status == "fail":
        failures += 1
    elif stripe_status == "skip":
        warnings += 1

    print("\n== Summary ==")
    if warnings:
        print(f"[warn] {warnings} check(s) skipped (see warnings above).")
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
