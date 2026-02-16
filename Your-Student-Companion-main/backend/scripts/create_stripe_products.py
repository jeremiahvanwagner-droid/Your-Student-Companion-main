"""
Create Stripe products/prices for course packs and persist IDs in Supabase.

Usage:
  python backend/scripts/create_stripe_products.py
  python backend/scripts/create_stripe_products.py --dry-run --limit 5
"""

from __future__ import annotations

import argparse
import os
import sys
from decimal import Decimal, ROUND_HALF_UP
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
        description="Create Stripe products/prices for Supabase course packs."
    )
    parser.add_argument(
        "--currency",
        default="usd",
        help="Three-letter ISO currency code for prices. Default: usd",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Optional max number of packs to process.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Recreate Stripe resources even if IDs already exist.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print intended updates without creating Stripe resources or writing to Supabase.",
    )
    return parser.parse_args()


def load_environment() -> None:
    # Support both backend/.env and root/.env.local style setups.
    load_dotenv(BACKEND_DIR / ".env")
    load_dotenv(ROOT_DIR / ".env.local")


def to_cents(amount: Any) -> int:
    value = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return int(value * 100)


def fetch_course_packs() -> List[Dict[str, Any]]:
    supabase = get_supabase_admin_client()
    response = (
        supabase.table("course_packs")
        .select(
            "id,name,slug,description,price,is_active,stripe_product_id,stripe_price_id"
        )
        .eq("is_active", True)
        .execute()
    )
    return response.data or []


def update_course_pack(pack_id: str, payload: Dict[str, str]) -> None:
    supabase = get_supabase_admin_client()
    supabase.table("course_packs").update(payload).eq("id", pack_id).execute()


def ensure_product(pack: Dict[str, Any], force: bool, dry_run: bool) -> str:
    existing_id = pack.get("stripe_product_id")
    if existing_id and not force:
        return existing_id

    if dry_run:
        return existing_id or f"prod_dry_run_{pack['slug']}"

    product = stripe.Product.create(
        name=pack["name"],
        description=pack.get("description") or "",
        metadata={
            "course_pack_id": pack["id"],
            "course_pack_slug": pack["slug"],
        },
    )
    return product.id


def ensure_price(
    pack: Dict[str, Any], product_id: str, currency: str, force: bool, dry_run: bool
) -> str:
    existing_id = pack.get("stripe_price_id")
    if existing_id and not force:
        return existing_id

    if dry_run:
        return existing_id or f"price_dry_run_{pack['slug']}"

    price = stripe.Price.create(
        product=product_id,
        unit_amount=to_cents(pack["price"]),
        currency=currency.lower(),
        metadata={
            "course_pack_id": pack["id"],
            "course_pack_slug": pack["slug"],
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
        packs = fetch_course_packs()
    except SupabaseConfigError as exc:
        print(f"Error: {exc}")
        return 1

    if not packs:
        print("No active course packs found.")
        return 0

    if not args.force:
        packs = [
            pack
            for pack in packs
            if not pack.get("stripe_product_id") or not pack.get("stripe_price_id")
        ]

    if args.limit > 0:
        packs = packs[: args.limit]

    if not packs:
        print("No course packs require Stripe creation.")
        return 0

    created_products = 0
    created_prices = 0
    updated_rows = 0
    failures = 0

    for pack in packs:
        try:
            prior_product_id = pack.get("stripe_product_id")
            prior_price_id = pack.get("stripe_price_id")

            product_id = ensure_product(pack, args.force, args.dry_run)
            price_id = ensure_price(
                pack, product_id, args.currency, args.force, args.dry_run
            )

            payload = {}
            if product_id != prior_product_id:
                payload["stripe_product_id"] = product_id
                created_products += 1
            if price_id != prior_price_id:
                payload["stripe_price_id"] = price_id
                created_prices += 1

            if payload and not args.dry_run:
                update_course_pack(pack["id"], payload)
                updated_rows += 1
            elif payload and args.dry_run:
                updated_rows += 1

            print(
                f"[ok] {pack['slug']} -> product={product_id} price={price_id}"
                + (" (dry-run)" if args.dry_run else "")
            )
        except Exception as exc:  # pylint: disable=broad-except
            failures += 1
            print(f"[error] {pack.get('slug', pack.get('id'))}: {exc}")

    print(
        "Summary: "
        f"processed={len(packs)} "
        f"updated={updated_rows} "
        f"products_created={created_products} "
        f"prices_created={created_prices} "
        f"failures={failures}"
    )

    return 1 if failures > 0 else 0


if __name__ == "__main__":
    raise SystemExit(main())
