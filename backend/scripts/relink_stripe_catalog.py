"""
Re-link the Supabase catalog to the Stripe Products/Prices that already exist.

Why: the Supabase project was rebuilt from supabase/migrations/, which seeds
course_packs and subscription_plans with NULL Stripe ids. The Stripe Test
account still holds the Products/Prices created earlier, each tagged with the
metadata the create_* scripts wrote (decision D4: reuse them). Running
create_stripe_products.py against empty ids would create 56 duplicates; this
script matches instead and leaves both create scripts with nothing to do.

Matching rules
--------------
Course packs (active rows):
  Product -> stripe.Product.search("active:'true' AND metadata['course_pack_slug']:'<slug>'"),
             newest `created` wins. When Search is unavailable the script
             falls back to one paginated stripe.Product.list(active=True)
             pass and indexes products by metadata in memory.
  Price   -> active one-time Price on that Product whose unit_amount equals
             round(price * 100) in --currency; newest wins.
  Writes  -> course_packs.stripe_product_id / stripe_price_id (only when
             different) and Product metadata course_pack_id=<new bigint id>
             (only when different). A pack whose Product matched but whose
             Price did not gets the product id written and the price reported
             as unmatched, so create_stripe_products.py can mint just the Price.

Subscription plans (active rows):
  Product -> metadata['tier'] in (degree_bundle, all_access), newest wins.
  Prices  -> active recurring Prices on that Product: interval=month matching
             monthly_amount_cents, interval=year matching annual_amount_cents.
  Writes  -> subscription_plans.stripe_product_id / stripe_monthly_price_id /
             stripe_annual_price_id and Product metadata ysc_plan_id=<new id>.

Flags
-----
  --dry-run             print every intended write; change nothing
  --report-unmatched    list every pack / plan / price that found no Stripe object
  --archive-duplicates  after linking the newest Product for a slug/tier, archive
                        (active=false) the older duplicates and their active Prices
  --live                required to run against an sk_live_ key
  --currency usd        currency the Prices must be in
  --only packs|plans    restrict to one catalog

Idempotent: re-running after a successful run performs zero writes.
Exit code: 0 when everything matched; 1 on any unmatched row or API/DB error.

Usage:
  python backend/scripts/relink_stripe_catalog.py --dry-run --report-unmatched
  python backend/scripts/relink_stripe_catalog.py
  python backend/scripts/relink_stripe_catalog.py --archive-duplicates
"""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import stripe


CURRENT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = CURRENT_DIR.parent

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from lib.supabase_client import SupabaseConfigError, get_supabase_admin_client  # noqa: E402
from ysc_script_utils import load_environment, stripe_key_guard_error  # noqa: E402

PACK_SLUG_KEY = "course_pack_slug"
PACK_ID_KEY = "course_pack_id"
PLAN_TIER_KEY = "tier"
PLAN_ID_KEY = "ysc_plan_id"
PLAN_TIERS = ("degree_bundle", "all_access")

PACK_SELECT = "id,name,slug,price,is_active,stripe_product_id,stripe_price_id"
PLAN_SELECT = (
    "id,tier,name,is_active,stripe_product_id,stripe_monthly_price_id,"
    "stripe_annual_price_id,monthly_amount_cents,annual_amount_cents"
)


# ---------------------------------------------------------------------------
# Small helpers (pure; unit-tested)
# ---------------------------------------------------------------------------

def to_cents(amount: Any) -> int:
    """19.99 -> 1999 with half-up rounding (never trust float * 100)."""
    value = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return int(value * 100)


def _created(obj: Any) -> int:
    try:
        return int(obj.get("created") or 0)
    except (TypeError, ValueError, AttributeError):
        return 0


def newest_first(objs: Iterable[Any]) -> List[Any]:
    """Sort Stripe objects by `created` descending (newest wins ties by original order)."""
    return sorted(list(objs), key=_created, reverse=True)


def _metadata(obj: Any) -> Dict[str, Any]:
    metadata = obj.get("metadata") or {}
    return dict(metadata)


def _iter_all(result: Any) -> List[Any]:
    """Drain a Stripe list/search result (or a plain iterable used by tests)."""
    if hasattr(result, "auto_paging_iter"):
        return list(result.auto_paging_iter())
    if isinstance(result, dict) and "data" in result:
        return list(result["data"])
    data = getattr(result, "data", None)
    if data is not None:
        return list(data)
    return list(result)


def search_query(key: str, value: str) -> str:
    escaped = str(value).replace("\\", "\\\\").replace("'", "\\'")
    return f"active:'true' AND metadata['{key}']:'{escaped}'"


def match_price(
    prices: Iterable[Any],
    *,
    amount_cents: int,
    currency: str,
    recurring_interval: Optional[str] = None,
) -> Optional[Any]:
    """
    Pick the newest active Price matching amount + currency. With
    recurring_interval=None only one-time Prices qualify; otherwise only
    recurring Prices with that interval (month | year).
    """
    wanted_currency = currency.lower()
    candidates = []
    for price in prices:
        if price.get("active") is False:
            continue
        if (price.get("currency") or "").lower() != wanted_currency:
            continue
        if price.get("unit_amount") != amount_cents:
            continue
        recurring = price.get("recurring")
        if recurring_interval is None:
            if recurring:
                continue
        elif not recurring or recurring.get("interval") != recurring_interval:
            continue
        candidates.append(price)
    ordered = newest_first(candidates)
    return ordered[0] if ordered else None


# ---------------------------------------------------------------------------
# Stripe product lookup (Search with List fallback)
# ---------------------------------------------------------------------------

class ProductIndex:
    """
    Finds active Products by a metadata key/value, newest first.

    Uses Product.search per lookup. On the first Stripe error from Search
    (not available on every account, and the search index lags writes) it
    switches to a single paginated Product.list(active=True) pass and serves
    every later lookup from that in-memory index.
    """

    def __init__(self, stripe_api: Any) -> None:
        self._stripe = stripe_api
        self._fallback: Optional[Dict[Tuple[str, str], List[Any]]] = None
        self.used_fallback = False

    def find(self, key: str, value: str) -> List[Any]:
        value = str(value)
        if self._fallback is None:
            try:
                result = self._stripe.Product.search(query=search_query(key, value), limit=100)
                products = [p for p in _iter_all(result) if _metadata(p).get(key) == value]
                return newest_first(products)
            except Exception as exc:  # pylint: disable=broad-except
                print(f"[warn] Product.search unavailable ({exc}); falling back to Product.list")
                self._build_fallback()

        assert self._fallback is not None
        return newest_first(self._fallback.get((key, value), []))

    def _build_fallback(self) -> None:
        index: Dict[Tuple[str, str], List[Any]] = {}
        for product in _iter_all(self._stripe.Product.list(active=True, limit=100)):
            if product.get("active") is False:
                continue
            for meta_key, meta_value in _metadata(product).items():
                index.setdefault((str(meta_key), str(meta_value)), []).append(product)
        self._fallback = index
        self.used_fallback = True


def list_active_prices(stripe_api: Any, product_id: str) -> List[Any]:
    return _iter_all(stripe_api.Price.list(product=product_id, active=True, limit=100))


# ---------------------------------------------------------------------------
# Relink
# ---------------------------------------------------------------------------

@dataclass
class RelinkStats:
    processed: int = 0
    matched: int = 0
    rows_updated: int = 0
    metadata_updated: int = 0
    archived: int = 0
    unmatched: List[str] = field(default_factory=list)
    failures: List[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.unmatched and not self.failures


def _label(dry_run: bool) -> str:
    return " (dry-run)" if dry_run else ""


def _write_row(admin: Any, table: str, row_id: Any, payload: Dict[str, Any], dry_run: bool) -> None:
    if dry_run:
        return
    admin.table(table).update(payload).eq("id", row_id).execute()


def _sync_product_metadata(
    stripe_api: Any, product: Any, key: str, value: str, stats: RelinkStats, dry_run: bool
) -> None:
    if _metadata(product).get(key) == value:
        return
    print(f"    metadata {key}={value} on {product['id']}{_label(dry_run)}")
    stats.metadata_updated += 1
    if not dry_run:
        stripe_api.Product.modify(product["id"], metadata={key: value})


def _archive_duplicates(
    stripe_api: Any, duplicates: List[Any], stats: RelinkStats, dry_run: bool
) -> None:
    for duplicate in duplicates:
        dup_id = duplicate["id"]
        print(f"    archive duplicate Product {dup_id}{_label(dry_run)}")
        stats.archived += 1
        if dry_run:
            continue
        # Archive the Prices first so the Product cannot be re-used by a stale price id.
        for price in list_active_prices(stripe_api, dup_id):
            stripe_api.Price.modify(price["id"], active=False)
        stripe_api.Product.modify(dup_id, active=False)


def relink_packs(
    admin: Any,
    stripe_api: Any,
    packs: List[Dict[str, Any]],
    *,
    index: ProductIndex,
    currency: str,
    dry_run: bool,
    archive_duplicates: bool,
) -> RelinkStats:
    stats = RelinkStats()

    for pack in packs:
        stats.processed += 1
        slug = pack.get("slug")
        pack_id = pack["id"]
        try:
            products = index.find(PACK_SLUG_KEY, slug)
            if not products:
                stats.unmatched.append(f"pack {slug}: no active Product with metadata.{PACK_SLUG_KEY}")
                print(f"[unmatched] {slug}: no Stripe Product")
                continue

            product = products[0]
            product_id = product["id"]
            amount_cents = to_cents(pack["price"])
            price = match_price(
                list_active_prices(stripe_api, product_id),
                amount_cents=amount_cents,
                currency=currency,
            )

            payload: Dict[str, Any] = {}
            if pack.get("stripe_product_id") != product_id:
                payload["stripe_product_id"] = product_id
            if price is None:
                stats.unmatched.append(
                    f"pack {slug}: Product {product_id} has no active one-time Price for "
                    f"{amount_cents} {currency}"
                )
                print(f"[unmatched] {slug}: Product {product_id} matched, no Price for {amount_cents} {currency}")
            else:
                stats.matched += 1
                if pack.get("stripe_price_id") != price["id"]:
                    payload["stripe_price_id"] = price["id"]

            if payload:
                stats.rows_updated += 1
                _write_row(admin, "course_packs", pack_id, payload, dry_run)
                print(f"[link] {slug} -> {payload}{_label(dry_run)}")
            elif price is not None:
                print(f"[ok] {slug} already linked (product={product_id} price={price['id']})")

            _sync_product_metadata(stripe_api, product, PACK_ID_KEY, str(pack_id), stats, dry_run)

            if len(products) > 1:
                dup_ids = [p["id"] for p in products[1:]]
                print(f"    duplicates for {slug}: {', '.join(dup_ids)}")
                if archive_duplicates:
                    _archive_duplicates(stripe_api, products[1:], stats, dry_run)
        except Exception as exc:  # pylint: disable=broad-except
            stats.failures.append(f"pack {slug}: {exc}")
            print(f"[error] {slug}: {exc}")

    return stats


def relink_plans(
    admin: Any,
    stripe_api: Any,
    plans: List[Dict[str, Any]],
    *,
    index: ProductIndex,
    currency: str,
    dry_run: bool,
    archive_duplicates: bool,
) -> RelinkStats:
    stats = RelinkStats()

    for plan in plans:
        stats.processed += 1
        tier = plan.get("tier")
        plan_id = plan["id"]
        try:
            if tier not in PLAN_TIERS:
                stats.unmatched.append(f"plan id={plan_id}: unknown tier {tier!r}")
                print(f"[unmatched] plan id={plan_id}: unknown tier {tier!r}")
                continue

            products = index.find(PLAN_TIER_KEY, tier)
            if not products:
                stats.unmatched.append(f"plan {tier}: no active Product with metadata.{PLAN_TIER_KEY}")
                print(f"[unmatched] {tier}: no Stripe Product")
                continue

            product = products[0]
            product_id = product["id"]
            prices = list_active_prices(stripe_api, product_id)
            monthly = match_price(
                prices,
                amount_cents=int(plan["monthly_amount_cents"]),
                currency=currency,
                recurring_interval="month",
            )
            annual = match_price(
                prices,
                amount_cents=int(plan["annual_amount_cents"]),
                currency=currency,
                recurring_interval="year",
            )

            payload: Dict[str, Any] = {}
            if plan.get("stripe_product_id") != product_id:
                payload["stripe_product_id"] = product_id

            complete = True
            for cadence, price, column, amount_key in (
                ("monthly", monthly, "stripe_monthly_price_id", "monthly_amount_cents"),
                ("annual", annual, "stripe_annual_price_id", "annual_amount_cents"),
            ):
                if price is None:
                    complete = False
                    stats.unmatched.append(
                        f"plan {tier}: Product {product_id} has no active {cadence} Price for "
                        f"{plan[amount_key]} {currency}"
                    )
                    print(f"[unmatched] {tier}: no {cadence} Price for {plan[amount_key]} {currency}")
                elif plan.get(column) != price["id"]:
                    payload[column] = price["id"]

            if complete:
                stats.matched += 1

            if payload:
                stats.rows_updated += 1
                _write_row(admin, "subscription_plans", plan_id, payload, dry_run)
                print(f"[link] {tier} -> {payload}{_label(dry_run)}")
            elif complete:
                print(
                    f"[ok] {tier} already linked (product={product_id} "
                    f"monthly={monthly['id']} annual={annual['id']})"
                )

            _sync_product_metadata(stripe_api, product, PLAN_ID_KEY, str(plan_id), stats, dry_run)

            if len(products) > 1:
                dup_ids = [p["id"] for p in products[1:]]
                print(f"    duplicates for {tier}: {', '.join(dup_ids)}")
                if archive_duplicates:
                    _archive_duplicates(stripe_api, products[1:], stats, dry_run)
        except Exception as exc:  # pylint: disable=broad-except
            stats.failures.append(f"plan {tier}: {exc}")
            print(f"[error] {tier}: {exc}")

    return stats


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Re-link course_packs and subscription_plans to existing Stripe objects by metadata."
    )
    parser.add_argument("--dry-run", action="store_true", help="Print intended writes; change nothing.")
    parser.add_argument(
        "--report-unmatched",
        action="store_true",
        help="Print a consolidated list of packs/plans/prices with no Stripe match at the end.",
    )
    parser.add_argument(
        "--archive-duplicates",
        action="store_true",
        help="Archive older duplicate Products (and their active Prices) once the newest is linked.",
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Allow running against a Stripe LIVE secret key (sk_live_...). Refused otherwise.",
    )
    parser.add_argument("--currency", default="usd", help="Currency the Prices must be in. Default: usd")
    parser.add_argument(
        "--only",
        choices=("packs", "plans"),
        default=None,
        help="Restrict to course packs or subscription plans.",
    )
    return parser.parse_args(argv)


def fetch_active_packs(admin: Any) -> List[Dict[str, Any]]:
    response = admin.table("course_packs").select(PACK_SELECT).eq("is_active", True).order("id").execute()
    return response.data or []


def fetch_active_plans(admin: Any) -> List[Dict[str, Any]]:
    response = admin.table("subscription_plans").select(PLAN_SELECT).eq("is_active", True).order("id").execute()
    return response.data or []


def _print_summary(name: str, stats: RelinkStats, dry_run: bool) -> None:
    print(
        f"Summary[{name}]: processed={stats.processed} matched={stats.matched} "
        f"rows_updated={stats.rows_updated} metadata_updated={stats.metadata_updated} "
        f"archived={stats.archived} unmatched={len(stats.unmatched)} failures={len(stats.failures)}"
        + _label(dry_run)
    )


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    load_environment()

    stripe_key = os.getenv("STRIPE_SECRET_KEY")
    if not stripe_key:
        print("Error: STRIPE_SECRET_KEY is required (matching needs to read the Stripe account).")
        return 1

    guard_error = stripe_key_guard_error(stripe_key, args.live)
    if guard_error:
        print(f"Error: {guard_error}")
        return 1

    stripe.api_key = stripe_key

    try:
        admin = get_supabase_admin_client()
    except SupabaseConfigError as exc:
        print(f"Error: {exc}")
        return 1

    currency = args.currency.lower()
    index = ProductIndex(stripe)
    all_stats: List[Tuple[str, RelinkStats]] = []

    if args.only in (None, "packs"):
        print("== Course packs ==")
        try:
            packs = fetch_active_packs(admin)
        except Exception as exc:  # pylint: disable=broad-except
            print(f"Error: could not read course_packs: {exc}")
            return 1
        stats = relink_packs(
            admin,
            stripe,
            packs,
            index=index,
            currency=currency,
            dry_run=args.dry_run,
            archive_duplicates=args.archive_duplicates,
        )
        all_stats.append(("packs", stats))

    if args.only in (None, "plans"):
        print("\n== Subscription plans ==")
        try:
            plans = fetch_active_plans(admin)
        except Exception as exc:  # pylint: disable=broad-except
            print(f"Error: could not read subscription_plans: {exc}")
            return 1
        stats = relink_plans(
            admin,
            stripe,
            plans,
            index=index,
            currency=currency,
            dry_run=args.dry_run,
            archive_duplicates=args.archive_duplicates,
        )
        all_stats.append(("plans", stats))

    print()
    for name, stats in all_stats:
        _print_summary(name, stats, args.dry_run)
    if index.used_fallback:
        print("[info] Product.search was unavailable; matched via Product.list fallback.")

    unmatched = [item for _, stats in all_stats for item in stats.unmatched]
    failures = [item for _, stats in all_stats for item in stats.failures]

    if args.report_unmatched and unmatched:
        print("\n== Unmatched ==")
        for item in unmatched:
            print(f"- {item}")
    elif unmatched:
        print(f"\n{len(unmatched)} unmatched item(s); re-run with --report-unmatched for the list.")

    if failures:
        print("\n== Failures ==")
        for item in failures:
            print(f"- {item}")

    return 0 if not unmatched and not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
