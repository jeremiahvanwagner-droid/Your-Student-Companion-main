from __future__ import annotations

from decimal import Decimal
import os
from typing import Any, Dict, Optional
from uuid import UUID

import stripe
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from lib.supabase_client import SupabaseConfigError, get_supabase_admin_client

router = APIRouter(prefix="/api/store", tags=["Store"])


class CheckoutRequest(BaseModel):
    user_id: str
    course_pack_id: str
    success_url: str
    cancel_url: str
    quantity: int = Field(default=1, ge=1, le=10)


class CheckoutResponse(BaseModel):
    session_id: str
    checkout_url: str
    course_pack_id: str
    status: str


class LegacyPurchaseRequest(BaseModel):
    pack_id: str
    user_id: Optional[str] = None
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


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


def _is_uuid(value: str) -> bool:
    try:
        UUID(value)
        return True
    except (ValueError, TypeError):
        return False


def _is_integer_identifier(value: str) -> bool:
    if value is None:
        return False
    return str(value).isdigit()


def _ensure_purchase_tables_ready(admin_client) -> None:
    try:
        admin_client.table("user_purchases").select("id").limit(1).execute()
        admin_client.table("user_subscriptions").select("id").limit(1).execute()
    except Exception as exc:  # pylint: disable=broad-except
        raise HTTPException(
            status_code=503,
            detail=(
                "Store purchase tables are not installed in Supabase. "
                "Run backend/migrations/003_store_payment_bootstrap.sql in SQL Editor."
            ),
        ) from exc


def _fetch_level_map(admin_client) -> Dict[str, Dict[str, Any]]:
    levels = (
        admin_client.table("academic_levels")
        .select("id,name,slug,display_order,description")
        .execute()
        .data
        or []
    )
    return {str(level["id"]): level for level in levels}


def _fetch_degree_plan_map(admin_client) -> Dict[str, Dict[str, Any]]:
    plans = (
        admin_client.table("degree_plans")
        .select("id,name,slug,category,description,icon_name,is_active")
        .execute()
        .data
        or []
    )
    return {str(plan["id"]): plan for plan in plans}


def _fetch_pack_by_identifier(admin_client, pack_identifier: str) -> Dict[str, Any]:
    query = admin_client.table("course_packs").select(
        "id,degree_plan_id,academic_level_id,name,slug,description,price,"
        "stripe_price_id,stripe_product_id,features,is_active,created_at"
    )

    if _is_uuid(pack_identifier):
        packs = query.eq("id", pack_identifier).limit(1).execute().data or []
    elif _is_integer_identifier(pack_identifier):
        packs = query.eq("id", int(pack_identifier)).limit(1).execute().data or []
    else:
        packs = query.eq("slug", pack_identifier).limit(1).execute().data or []

    if not packs:
        raise HTTPException(status_code=404, detail="Course pack not found")

    return packs[0]


def _attach_catalog_context(
    pack: Dict[str, Any],
    level_map: Dict[str, Dict[str, Any]],
    degree_plan_map: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    enriched = dict(pack)
    enriched["academic_level"] = level_map.get(str(pack.get("academic_level_id")))
    enriched["degree_plan"] = degree_plan_map.get(str(pack.get("degree_plan_id")))
    return enriched


def _decimal_or_none(value: Optional[Decimal]) -> Optional[float]:
    if value is None:
        return None
    return float(value)


@router.get("/degree-plans")
def get_degree_plans(include_inactive: bool = False):
    admin_client = _admin_client()

    degree_query = admin_client.table("degree_plans").select(
        "id,name,slug,category,description,icon_name,is_active"
    )
    if not include_inactive:
        degree_query = degree_query.eq("is_active", True)

    degree_plans = degree_query.order("category").order("name").execute().data or []

    pack_query = admin_client.table("course_packs").select(
        "id,degree_plan_id,price,is_active"
    )
    if not include_inactive:
        pack_query = pack_query.eq("is_active", True)

    packs = pack_query.execute().data or []

    stats: Dict[str, Dict[str, Any]] = {}
    for pack in packs:
        degree_plan_id = str(pack["degree_plan_id"])
        price = Decimal(str(pack["price"]))

        bucket = stats.setdefault(
            degree_plan_id,
            {
                "pack_count": 0,
                "min_price": None,
                "max_price": None,
            },
        )

        bucket["pack_count"] += 1
        bucket["min_price"] = (
            price if bucket["min_price"] is None else min(bucket["min_price"], price)
        )
        bucket["max_price"] = (
            price if bucket["max_price"] is None else max(bucket["max_price"], price)
        )

    result = []
    for plan in degree_plans:
        plan_stats = stats.get(
            str(plan["id"]), {"pack_count": 0, "min_price": None, "max_price": None}
        )
        enriched_plan = dict(plan)
        enriched_plan["pack_count"] = plan_stats["pack_count"]
        enriched_plan["min_price"] = _decimal_or_none(plan_stats["min_price"])
        enriched_plan["max_price"] = _decimal_or_none(plan_stats["max_price"])
        result.append(enriched_plan)

    return {"degree_plans": result, "total": len(result)}


@router.get("/degree-plans/{degree_slug}/packs")
def get_degree_plan_packs(degree_slug: str, include_inactive: bool = False):
    admin_client = _admin_client()

    degree_query = admin_client.table("degree_plans").select(
        "id,name,slug,category,description,icon_name,is_active"
    )
    degree_plan = degree_query.eq("slug", degree_slug).limit(1).execute().data or []

    if not degree_plan:
        raise HTTPException(status_code=404, detail="Degree plan not found")

    degree_plan = degree_plan[0]

    if not include_inactive and not degree_plan.get("is_active", False):
        raise HTTPException(status_code=404, detail="Degree plan not found")

    level_map = _fetch_level_map(admin_client)
    degree_plan_map = {str(degree_plan["id"]): degree_plan}

    pack_query = admin_client.table("course_packs").select(
        "id,degree_plan_id,academic_level_id,name,slug,description,price,"
        "stripe_price_id,stripe_product_id,features,is_active,created_at"
    ).eq("degree_plan_id", degree_plan["id"])

    if not include_inactive:
        pack_query = pack_query.eq("is_active", True)

    packs = pack_query.execute().data or []

    enriched = [
        _attach_catalog_context(pack, level_map, degree_plan_map) for pack in packs
    ]

    enriched.sort(
        key=lambda p: (
            (p.get("academic_level") or {}).get("display_order", 9999),
            p.get("name", ""),
        )
    )

    return {
        "degree_plan": degree_plan,
        "packs": enriched,
        "total": len(enriched),
    }


@router.get("/packs")
def get_all_packs(include_inactive: bool = False):
    admin_client = _admin_client()
    level_map = _fetch_level_map(admin_client)
    degree_plan_map = _fetch_degree_plan_map(admin_client)

    pack_query = admin_client.table("course_packs").select(
        "id,degree_plan_id,academic_level_id,name,slug,description,price,"
        "stripe_price_id,stripe_product_id,features,is_active,created_at"
    )
    if not include_inactive:
        pack_query = pack_query.eq("is_active", True)

    packs = pack_query.execute().data or []
    enriched = [
        _attach_catalog_context(pack, level_map, degree_plan_map) for pack in packs
    ]

    enriched.sort(
        key=lambda p: (
            (p.get("degree_plan") or {}).get("name", ""),
            (p.get("academic_level") or {}).get("display_order", 9999),
            p.get("name", ""),
        )
    )

    return {"packs": enriched, "total": len(enriched)}


@router.get("/packs/{pack_id}")
def get_pack_details(pack_id: str):
    admin_client = _admin_client()
    level_map = _fetch_level_map(admin_client)
    degree_plan_map = _fetch_degree_plan_map(admin_client)

    pack = _fetch_pack_by_identifier(admin_client, pack_id)
    if not pack.get("is_active", False):
        raise HTTPException(status_code=404, detail="Course pack not found")

    return _attach_catalog_context(pack, level_map, degree_plan_map)


@router.post("/checkout", response_model=CheckoutResponse)
def create_checkout_session(request: CheckoutRequest):
    if not request.user_id:
        raise HTTPException(status_code=422, detail="user_id is required")

    admin_client = _admin_client()
    _ensure_purchase_tables_ready(admin_client)
    stripe_client = _stripe_client()

    pack = _fetch_pack_by_identifier(admin_client, request.course_pack_id)

    if not pack.get("is_active", False):
        raise HTTPException(status_code=404, detail="Course pack not found")

    if not pack.get("stripe_price_id"):
        raise HTTPException(
            status_code=409,
            detail="This course pack is not purchasable yet. Missing Stripe price mapping.",
        )

    existing_completed = (
        admin_client.table("user_purchases")
        .select("id,status")
        .eq("user_id", request.user_id)
        .eq("course_pack_id", str(pack["id"]))
        .eq("status", "completed")
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing_completed:
        raise HTTPException(status_code=409, detail="Course pack already purchased")

    try:
        session = stripe_client.checkout.Session.create(
            mode="payment",
            payment_method_types=["card"],
            line_items=[{"price": pack["stripe_price_id"], "quantity": request.quantity}],
            success_url=request.success_url,
            cancel_url=request.cancel_url,
            client_reference_id=request.user_id,
            allow_promotion_codes=True,
            metadata={
                "user_id": request.user_id,
                "course_pack_id": str(pack["id"]),
                "course_pack_slug": pack["slug"],
            },
        )
    except Exception as exc:  # pylint: disable=broad-except
        raise HTTPException(
            status_code=502,
            detail=f"Stripe checkout creation failed: {exc}",
        ) from exc

    admin_client.table("user_purchases").upsert(
        {
            "user_id": request.user_id,
            "course_pack_id": str(pack["id"]),
            "stripe_checkout_session_id": session.id,
            "amount_paid": None,
            "currency": "usd",
            "status": "pending",
        },
        on_conflict="user_id,course_pack_id",
    ).execute()

    return CheckoutResponse(
        session_id=session.id,
        checkout_url=session.url,
        course_pack_id=str(pack["id"]),
        status="pending",
    )


@router.get("/user/{user_id}/purchases")
def get_user_purchases(user_id: str):
    admin_client = _admin_client()
    _ensure_purchase_tables_ready(admin_client)

    purchases = (
        admin_client.table("user_purchases")
        .select(
            "id,user_id,course_pack_id,stripe_checkout_session_id,stripe_payment_intent_id,"
            "amount_paid,currency,status,purchased_at"
        )
        .eq("user_id", user_id)
        .order("purchased_at", desc=True)
        .execute()
        .data
        or []
    )

    pack_ids = [
        purchase["course_pack_id"]
        for purchase in purchases
        if purchase.get("course_pack_id")
    ]
    pack_map: Dict[str, Dict[str, Any]] = {}

    if pack_ids:
        numeric_ids = [int(pid) for pid in pack_ids if _is_integer_identifier(str(pid))]
        if numeric_ids:
            packs = (
                admin_client.table("course_packs")
                .select("id,name,slug,description,price,features,is_active")
                .in_("id", numeric_ids)
                .execute()
                .data
                or []
            )
            pack_map = {str(pack["id"]): pack for pack in packs}

    for purchase in purchases:
        purchase["course_pack"] = pack_map.get(str(purchase.get("course_pack_id")))

    return {"purchases": purchases, "total": len(purchases)}


@router.get("/categories")
def get_categories(include_inactive: bool = False):
    admin_client = _admin_client()
    degree_query = admin_client.table("degree_plans").select("id,category,is_active")

    if not include_inactive:
        degree_query = degree_query.eq("is_active", True)

    degree_plans = degree_query.execute().data or []

    grouped: Dict[str, int] = {}
    for degree_plan in degree_plans:
        grouped[degree_plan["category"]] = grouped.get(degree_plan["category"], 0) + 1

    categories = [
        {
            "id": category,
            "name": category.replace("_", " ").title(),
            "degree_plan_count": count,
        }
        for category, count in sorted(grouped.items())
    ]

    return {"categories": categories, "total": len(categories)}


@router.get("/featured")
def get_featured_packs(limit: int = 6):
    admin_client = _admin_client()
    level_map = _fetch_level_map(admin_client)
    degree_plan_map = _fetch_degree_plan_map(admin_client)

    packs = (
        admin_client.table("course_packs")
        .select(
            "id,degree_plan_id,academic_level_id,name,slug,description,price,"
            "stripe_price_id,stripe_product_id,features,is_active,created_at"
        )
        .eq("is_active", True)
        .order("id")
        .limit(limit)
        .execute()
        .data
        or []
    )

    featured = [
        _attach_catalog_context(pack, level_map, degree_plan_map) for pack in packs
    ]
    return {"featured": featured, "total": len(featured)}


@router.post("/purchase")
def purchase_pack_legacy(request: LegacyPurchaseRequest):
    """
    Backward-compatible endpoint retained while frontend migrates to /checkout.
    """
    if not request.user_id:
        raise HTTPException(status_code=400, detail="user_id is required for checkout")

    frontend_base_url = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000")
    success_url = request.success_url or f"{frontend_base_url}/app/store?checkout=success"
    cancel_url = request.cancel_url or f"{frontend_base_url}/app/store?checkout=cancel"

    checkout_request = CheckoutRequest(
        user_id=request.user_id,
        course_pack_id=request.pack_id,
        success_url=success_url,
        cancel_url=cancel_url,
        quantity=1,
    )

    checkout_response = create_checkout_session(checkout_request)

    return {
        "success": True,
        "pack_id": request.pack_id,
        "message": "Checkout session created",
        "checkout_url": checkout_response.checkout_url,
        "session_id": checkout_response.session_id,
        "status": checkout_response.status,
    }
