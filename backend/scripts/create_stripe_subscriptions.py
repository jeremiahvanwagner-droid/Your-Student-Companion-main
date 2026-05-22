"""
Create Stripe Products + recurring Prices for the v1 subscription tiers
(Degree Bundle, All-Access) and persist the IDs back into
public.subscription_plans.

Usage:
  python backend/scripts/create_stripe_subscriptions.py
  python backend/scripts/create_stripe_subscriptions.py --dry-run
  python backend/scripts/create_stripe_subscriptions.py --force

Reads pricing from subscription_plans (monthly_amount_cents,
annual_amount_cents) and writes back stripe_product_id,
stripe_monthly_price_id, stripe_annual_price_id. Idempotent — re-runs
with --force will create new Stripe resources and update the DB;
otherwise existing IDs are kept.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any, Dict, List

import stripe
from dotenv import load_dotenv


CURRENT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = CURRENT_DIR.parent
ROOT_DIR = BACKEND_DIR.parent

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from lib.supabase_client import SupabaseConfigError, get_supabase_admin_client


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create Stripe subscription products + monthly/annual recurring prices "
        "for each row in public.subscription_plans.",
    )
    parser.add_argument(
        "--currency",
        default="usd",
        help="Three-letter ISO currency code. Default: usd",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Recreate Stripe Product + Prices even if IDs already exist in the DB.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print intended actions without creating Stripe resources or writing to Supabase.",
    )
    return parser.parse_args()


def load_environment() -> None:
    load_dotenv(BACKEND_DIR / ".env")
    load_dotenv(ROOT_DIR / ".env.local")


def fetch_subscription_plans() -> List[Dict[str, Any]]:
    supabase = get_supabase_admin_client()

    response = (
        supabase.table("subscription_plans")
        .select(
            "id,tier,name,description,stripe_product_id,"
            "stripe_monthly_price_id,stripe_annual_price_id,"
            "monthly_amount_cents,annual_amount_cents,trial_days,is_active"
        )
        .eq("is_active", True)
        .execute()
    )
    return response.data or []


def update_subscription_plan(plan_id: str, payload: Dict[str, str]) -> None:
    supabase = get_supabase_admin_client()
    supabase.table("subscription_plans").update(payload).eq("id", plan_id).execute()


def ensure_product(plan: Dict[str, Any], force: bool, dry_run: bool) -> str:
    existing_id = plan.get("stripe_product_id")
    if existing_id and not force:
        return existing_id

    if dry_run:
        return existing_id or f"prod_dry_run_{plan['tier']}"

    product = stripe.Product.create(
        name=f"YSC — {plan['name']}",
        description=plan.get("description") or "",
        metadata={
            "ysc_plan_id": str(plan["id"]),
            "tier": plan["tier"],
        },
    )
    return product.id


def ensure_price(
    plan: Dict[str, Any],
    product_id: str,
    *,
    cadence: str,
    amount_cents: int,
    existing_id: str | None,
    currency: str,
    force: bool,
    dry_run: bool,
) -> str:
    if existing_id and not force:
        return existing_id

    if dry_run:
        return existing_id or f"price_dry_run_{plan['tier']}_{cadence}"

    interval = "month" if cadence == "monthly" else "year"

    price = stripe.Price.create(
        product=product_id,
        unit_amount=amount_cents,
        currency=currency.lower(),
        recurring={"interval": interval},
        nickname=f"{plan['name']} ({cadence})",
        metadata={
            "ysc_plan_id": str(plan["id"]),
            "tier": plan["tier"],
            "cadence": cadence,
        },
    )
    return price.id


def main() -> int:
    args = parse_args()
    load_environment()

    stripe_key = os.getenv("STRIPE_SECRET_KEY")
    if not stripe_key and not args.dry_run:
        print("Error: STRIPE_SECRET_KEY is required unless --dry-run is used.")
        return 1

    if stripe_key:
        stripe.api_key = stripe_key

    try:
        plans = fetch_subscription_plans()
    except SupabaseConfigError as exc:
        print(f"Error: {exc}")
        return 1

    if not plans:
        print(
            "No active subscription_plans rows found. "
            "Has the subscription_v1_schema migration been applied?"
        )
        return 1

    created_products = 0
    created_prices = 0
    updated_rows = 0
    failures = 0

    for plan in plans:
        try:
            prior_product_id = plan.get("stripe_product_id")
            prior_monthly_id = plan.get("stripe_monthly_price_id")
            prior_annual_id = plan.get("stripe_annual_price_id")

            product_id = ensure_product(plan, args.force, args.dry_run)

            monthly_price_id = ensure_price(
                plan,
                product_id,
                cadence="monthly",
                amount_cents=plan["monthly_amount_cents"],
                existing_id=prior_monthly_id,
                currency=args.currency,
                force=args.force,
                dry_run=args.dry_run,
            )

            annual_price_id = ensure_price(
                plan,
                product_id,
                cadence="annual",
                amount_cents=plan["annual_amount_cents"],
                existing_id=prior_annual_id,
                currency=args.currency,
                force=args.force,
                dry_run=args.dry_run,
            )

            payload: Dict[str, str] = {}
            if product_id != prior_product_id:
                payload["stripe_product_id"] = product_id
                created_products += 1
            if monthly_price_id != prior_monthly_id:
                payload["stripe_monthly_price_id"] = monthly_price_id
                created_prices += 1
            if annual_price_id != prior_annual_id:
                payload["stripe_annual_price_id"] = annual_price_id
                created_prices += 1

            if payload:
                updated_rows += 1
                if not args.dry_run:
                    update_subscription_plan(plan["id"], payload)

            print(
                f"[ok] {plan['tier']} -> product={product_id} "
                f"monthly={monthly_price_id} annual={annual_price_id}"
                + (" (dry-run)" if args.dry_run else "")
            )
        except Exception as exc:  # pylint: disable=broad-except
            failures += 1
            print(f"[error] {plan.get('tier', plan.get('id'))}: {exc}")

    print(
        "Summary: "
        f"processed={len(plans)} "
        f"updated={updated_rows} "
        f"products_created={created_products} "
        f"prices_created={created_prices} "
        f"failures={failures}"
    )

    return 1 if failures > 0 else 0


if __name__ == "__main__":
    raise SystemExit(main())
