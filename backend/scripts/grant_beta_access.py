"""
Grant (or revoke) free-beta entitlement for one user (decision D6).

Beta cohort members get an admin-granted subscription row instead of a Stripe
subscription. The row is shaped exactly like a Stripe-backed one so the
entitlement code paths (routes/store.py, routes/users.py) need no special
case:

  stripe_subscription_id  "beta_<uuid4 hex>"   (NOT NULL UNIQUE; never a sub_... id)
  tier                    all_access | degree_bundle
  plan_type               all_access_annual | degree_bundle_annual
  degree_plan_id          required for degree_bundle, NULL for all_access
  status                  active
  current_period_start    now
  current_period_end      now + --months
  cancel_at_period_end    true   (never renews; the period end is the off-switch
                                  once the entitlement query filters on
                                  current_period_end -- plan section 4-1/4-10.
                                  Until then use --revoke to end access early.)

Every grant / revoke writes an audit_logs row (actor_id NULL, action
store.beta_access.grant | store.beta_access.revoke) with the details in
metadata. audit_logs.entity_id is a uuid column and the subscription id is a
bigint, so the row id lives in metadata instead.

Idempotent: a repeat grant for a user who already has a beta row updates that
row (new period end / tier) instead of inserting a second one. --revoke sets
the user's beta row(s) to status canceled; revoking twice is a no-op.

Usage:
  python backend/scripts/grant_beta_access.py --clerk-id user_abc123
  python backend/scripts/grant_beta_access.py --user-id <uuid> --months 6
  python backend/scripts/grant_beta_access.py --clerk-id user_abc123 --tier degree_bundle --degree-plan-id 3
  python backend/scripts/grant_beta_access.py --clerk-id user_abc123 --revoke
  python backend/scripts/grant_beta_access.py --clerk-id user_abc123 --dry-run

Exit code 0 on success (including "nothing to revoke"), 1 on any error.
"""

from __future__ import annotations

import argparse
import calendar
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4


CURRENT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = CURRENT_DIR.parent

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from lib.supabase_client import SupabaseConfigError, get_supabase_admin_client  # noqa: E402
from ysc_script_utils import load_environment  # noqa: E402

BETA_PREFIX = "beta_"
ACTION_GRANT = "store.beta_access.grant"
ACTION_REVOKE = "store.beta_access.revoke"
TIERS = ("all_access", "degree_bundle")
DEFAULT_TIER = "all_access"
DEFAULT_MONTHS = 3

SUBSCRIPTION_SELECT = (
    "id,user_id,tier,plan_type,degree_plan_id,status,current_period_start,"
    "current_period_end,cancel_at_period_end,stripe_subscription_id"
)


class GrantError(RuntimeError):
    """A validation or persistence problem the operator must see."""


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------

def add_months(moment: datetime, months: int) -> datetime:
    """Calendar-month arithmetic with end-of-month clamping (Jan 31 + 1 -> Feb 28/29)."""
    month_index = moment.month - 1 + months
    year = moment.year + month_index // 12
    month = month_index % 12 + 1
    day = min(moment.day, calendar.monthrange(year, month)[1])
    return moment.replace(year=year, month=month, day=day)


def new_beta_subscription_id() -> str:
    return BETA_PREFIX + uuid4().hex


def is_beta_subscription_id(value: Optional[str]) -> bool:
    return bool(value) and str(value).startswith(BETA_PREFIX)


def plan_type_for(tier: str) -> str:
    return f"{tier}_annual"


def build_grant_payload(
    *,
    user_id: str,
    tier: str,
    degree_plan_id: Optional[int],
    months: int,
    now: datetime,
) -> Dict[str, Any]:
    if tier not in TIERS:
        raise GrantError(f"Unknown tier {tier!r}; expected one of {TIERS}")
    if months < 1:
        raise GrantError("--months must be >= 1")
    if tier == "degree_bundle" and degree_plan_id is None:
        raise GrantError("--degree-plan-id is required when --tier degree_bundle")
    if tier == "all_access" and degree_plan_id is not None:
        raise GrantError("--degree-plan-id only applies to --tier degree_bundle")

    return {
        "user_id": user_id,
        "tier": tier,
        "plan_type": plan_type_for(tier),
        "degree_plan_id": degree_plan_id,
        "status": "active",
        "current_period_start": now.isoformat(),
        "current_period_end": add_months(now, months).isoformat(),
        "cancel_at_period_end": True,
    }


# ---------------------------------------------------------------------------
# Supabase access
# ---------------------------------------------------------------------------

def resolve_user(admin: Any, *, clerk_id: Optional[str] = None, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    if bool(clerk_id) == bool(user_id):
        raise GrantError("Pass exactly one of --clerk-id or --user-id")

    query = admin.table("users").select("id,clerk_id,email,role")
    if user_id:
        try:
            UUID(str(user_id))
        except (ValueError, TypeError) as exc:
            raise GrantError(f"--user-id must be a UUID, got {user_id!r}") from exc
        query = query.eq("id", str(user_id))
    else:
        query = query.eq("clerk_id", clerk_id)

    rows = query.limit(1).execute().data or []
    return rows[0] if rows else None


def find_beta_rows(admin: Any, user_id: str) -> List[Dict[str, Any]]:
    """Newest-first beta rows for the user (stripe_subscription_id LIKE 'beta_%')."""
    rows = (
        admin.table("user_subscriptions")
        .select(SUBSCRIPTION_SELECT)
        .eq("user_id", user_id)
        .like("stripe_subscription_id", BETA_PREFIX + "%")
        .execute()
        .data
        or []
    )
    return sorted(rows, key=lambda row: int(row.get("id") or 0), reverse=True)


def write_audit(admin: Any, *, action: str, metadata: Dict[str, Any]) -> None:
    """Insert the audit row; unlike lib.audit.write_audit_log this raises on failure."""
    payload = {
        "actor_id": None,
        "action": action,
        "entity_type": "user_subscriptions",
        "entity_id": None,
        "metadata": metadata,
    }
    try:
        admin.table("audit_logs").insert(payload).execute()
    except Exception as exc:  # pylint: disable=broad-except
        raise GrantError(f"audit_logs insert failed after the change was applied: {exc}") from exc


# ---------------------------------------------------------------------------
# Operations
# ---------------------------------------------------------------------------

def grant_access(
    admin: Any,
    *,
    user: Dict[str, Any],
    tier: str = DEFAULT_TIER,
    degree_plan_id: Optional[int] = None,
    months: int = DEFAULT_MONTHS,
    now: Optional[datetime] = None,
    dry_run: bool = False,
) -> Dict[str, Any]:
    moment = now or datetime.now(timezone.utc)
    user_id = str(user["id"])
    payload = build_grant_payload(
        user_id=user_id,
        tier=tier,
        degree_plan_id=degree_plan_id,
        months=months,
        now=moment,
    )

    existing = find_beta_rows(admin, user_id)
    target = existing[0] if existing else None

    result: Dict[str, Any] = {
        "action": "grant",
        "dry_run": dry_run,
        "user_id": user_id,
        "clerk_id": user.get("clerk_id"),
        "tier": tier,
        "plan_type": payload["plan_type"],
        "degree_plan_id": degree_plan_id,
        "months": months,
        "current_period_end": payload["current_period_end"],
        "created": target is None,
        "stripe_subscription_id": target["stripe_subscription_id"] if target else None,
        "subscription_row_id": target["id"] if target else None,
    }

    if dry_run:
        result["payload"] = payload
        return result

    if target is not None:
        admin.table("user_subscriptions").update(payload).eq("id", target["id"]).execute()
    else:
        payload["stripe_subscription_id"] = new_beta_subscription_id()
        inserted = admin.table("user_subscriptions").insert(payload).execute().data or []
        result["stripe_subscription_id"] = payload["stripe_subscription_id"]
        result["subscription_row_id"] = inserted[0].get("id") if inserted else None

    write_audit(
        admin,
        action=ACTION_GRANT,
        metadata={key: value for key, value in result.items() if key not in ("action", "dry_run")},
    )
    return result


def revoke_access(
    admin: Any,
    *,
    user: Dict[str, Any],
    now: Optional[datetime] = None,
    dry_run: bool = False,
) -> Dict[str, Any]:
    moment = now or datetime.now(timezone.utc)
    user_id = str(user["id"])
    rows = find_beta_rows(admin, user_id)
    to_revoke = [row for row in rows if row.get("status") != "canceled"]

    result: Dict[str, Any] = {
        "action": "revoke",
        "dry_run": dry_run,
        "user_id": user_id,
        "clerk_id": user.get("clerk_id"),
        "beta_rows": len(rows),
        "revoked": len(to_revoke),
        "stripe_subscription_ids": [row["stripe_subscription_id"] for row in to_revoke],
        "revoked_at": moment.isoformat(),
    }

    if dry_run or not to_revoke:
        return result

    update = {"status": "canceled", "cancel_at_period_end": True}
    for row in to_revoke:
        admin.table("user_subscriptions").update(update).eq("id", row["id"]).execute()

    write_audit(
        admin,
        action=ACTION_REVOKE,
        metadata={key: value for key, value in result.items() if key not in ("action", "dry_run")},
    )
    return result


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Grant or revoke free-beta access for one user (D6).")
    who = parser.add_mutually_exclusive_group(required=True)
    who.add_argument("--clerk-id", help="Clerk user id (users.clerk_id), e.g. user_2abc...")
    who.add_argument("--user-id", help="Application user uuid (users.id)")
    parser.add_argument("--tier", choices=TIERS, default=DEFAULT_TIER, help=f"Default: {DEFAULT_TIER}")
    parser.add_argument(
        "--degree-plan-id",
        type=int,
        default=None,
        help="degree_plans.id; required for --tier degree_bundle",
    )
    parser.add_argument("--months", type=int, default=DEFAULT_MONTHS, help=f"Default: {DEFAULT_MONTHS}")
    parser.add_argument("--revoke", action="store_true", help="Set the user's beta row(s) to canceled.")
    parser.add_argument("--dry-run", action="store_true", help="Print the intended change; write nothing.")
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    load_environment()

    try:
        admin = get_supabase_admin_client()
    except SupabaseConfigError as exc:
        print(f"Error: {exc}")
        return 1

    try:
        user = resolve_user(admin, clerk_id=args.clerk_id, user_id=args.user_id)
        if user is None:
            who = args.clerk_id or args.user_id
            print(f"Error: no users row for {who!r}. The user must sign in once before access can be granted.")
            return 1

        if args.revoke:
            result = revoke_access(admin, user=user, dry_run=args.dry_run)
        else:
            result = grant_access(
                admin,
                user=user,
                tier=args.tier,
                degree_plan_id=args.degree_plan_id,
                months=args.months,
                dry_run=args.dry_run,
            )
    except GrantError as exc:
        print(f"Error: {exc}")
        return 1
    except Exception as exc:  # pylint: disable=broad-except
        print(f"Error: {exc}")
        return 1

    print(json.dumps(result, indent=2, default=str))
    if args.dry_run:
        print("[dry-run] nothing written.")
    elif args.revoke and not result.get("revoked"):
        print("[ok] no active beta row to revoke.")
    else:
        print("[ok] change applied and audited.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
