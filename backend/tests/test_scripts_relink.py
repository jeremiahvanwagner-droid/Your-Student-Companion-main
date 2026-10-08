"""
Unit tests for backend/scripts/relink_stripe_catalog.py.

Stripe and the Supabase admin client are replaced with in-memory fakes
(same FakeAdminClient idea as test_subscriptions.py, extended with update
tracking) so the matching rules can be asserted without network access.
"""

from __future__ import annotations

from pathlib import Path
import sys
from types import SimpleNamespace
from typing import Any, Dict, List

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = BACKEND_DIR / "scripts"
for path in (BACKEND_DIR, SCRIPTS_DIR):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

import relink_stripe_catalog as relink  # noqa: E402
import ysc_script_utils  # noqa: E402


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------

class FakeQuery:
    def __init__(self, table: "FakeTable", op: str = "select", payload: Dict[str, Any] | None = None):
        self._table = table
        self._op = op
        self._payload = payload or {}
        self._filters: List[tuple] = []

    def select(self, *_a, **_kw):
        return self

    def eq(self, col, val):
        self._filters.append((col, val))
        return self

    def order(self, *_a, **_kw):
        return self

    def limit(self, *_a, **_kw):
        return self

    def execute(self):
        rows = [r for r in self._table.rows if all(str(r.get(c)) == str(v) for c, v in self._filters)]
        if self._op == "update":
            for row in rows:
                row.update(self._payload)
            self._table.client.updates.append((self._table.name, dict(self._filters), dict(self._payload)))
        return SimpleNamespace(data=[dict(r) for r in rows])


class FakeTable:
    def __init__(self, name: str, client: "FakeAdminClient"):
        self.name = name
        self.client = client
        self.rows = client.data_map.setdefault(name, [])

    def select(self, *_a, **_kw):
        return FakeQuery(self)

    def update(self, payload):
        return FakeQuery(self, op="update", payload=payload)


class FakeAdminClient:
    def __init__(self, data_map: Dict[str, List[Dict[str, Any]]]):
        self.data_map = data_map
        self.updates: List[tuple] = []

    def table(self, name: str):
        return FakeTable(name, self)


class FakeListResult:
    def __init__(self, data: List[Dict[str, Any]]):
        self.data = list(data)

    def auto_paging_iter(self):
        return iter(self.data)


class FakeStripe:
    """Minimal stripe module stand-in: Product.search/list/modify, Price.list/modify."""

    def __init__(self, products: List[Dict[str, Any]], prices: List[Dict[str, Any]], *, search_error: Exception | None = None):
        self.products = products
        self.prices = prices
        self.search_error = search_error
        self.calls: List[tuple] = []
        outer = self

        class Product:
            @staticmethod
            def search(query: str, limit: int = 100):
                outer.calls.append(("Product.search", query))
                if outer.search_error is not None:
                    raise outer.search_error
                # Parse the key/value out of the query the script builds.
                key = query.split("metadata['")[1].split("']")[0]
                value = query.split(":'")[-1].rstrip("'")
                matches = [
                    p for p in outer.products
                    if p.get("active", True) and str((p.get("metadata") or {}).get(key)) == value
                ]
                return FakeListResult(matches)

            @staticmethod
            def list(active: bool = True, limit: int = 100):
                outer.calls.append(("Product.list", active))
                return FakeListResult([p for p in outer.products if p.get("active", True) == active])

            @staticmethod
            def modify(product_id: str, **kwargs):
                outer.calls.append(("Product.modify", product_id, kwargs))
                for p in outer.products:
                    if p["id"] == product_id:
                        if "metadata" in kwargs:
                            p.setdefault("metadata", {}).update(kwargs["metadata"])
                        if "active" in kwargs:
                            p["active"] = kwargs["active"]
                        return p
                raise KeyError(product_id)

        class Price:
            @staticmethod
            def list(product: str, active: bool = True, limit: int = 100):
                outer.calls.append(("Price.list", product))
                return FakeListResult(
                    [p for p in outer.prices if p["product"] == product and p.get("active", True) == active]
                )

            @staticmethod
            def modify(price_id: str, **kwargs):
                outer.calls.append(("Price.modify", price_id, kwargs))
                for p in outer.prices:
                    if p["id"] == price_id:
                        p.update(kwargs)
                        return p
                raise KeyError(price_id)

        self.Product = Product
        self.Price = Price

    def modify_calls(self, kind: str) -> List[tuple]:
        return [c for c in self.calls if c[0] == kind]


def _product(pid: str, created: int, **metadata) -> Dict[str, Any]:
    return {"id": pid, "object": "product", "active": True, "created": created, "metadata": metadata}


def _price(pid: str, product: str, amount: int, *, created: int = 1, interval: str | None = None, currency: str = "usd") -> Dict[str, Any]:
    return {
        "id": pid,
        "object": "price",
        "product": product,
        "active": True,
        "created": created,
        "currency": currency,
        "unit_amount": amount,
        "recurring": {"interval": interval} if interval else None,
    }


def _pack(pack_id: int, slug: str, price: float, **overrides) -> Dict[str, Any]:
    row = {
        "id": pack_id,
        "name": slug.replace("-", " ").title(),
        "slug": slug,
        "price": price,
        "is_active": True,
        "stripe_product_id": None,
        "stripe_price_id": None,
    }
    row.update(overrides)
    return row


def _run_packs(admin, fake_stripe, packs, **kwargs):
    index = relink.ProductIndex(fake_stripe)
    defaults = dict(index=index, currency="usd", dry_run=False, archive_duplicates=False)
    defaults.update(kwargs)
    stats = relink.relink_packs(admin, fake_stripe, packs, **defaults)
    return stats, index


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------

def test_to_cents_rounds_half_up():
    assert relink.to_cents("19.99") == 1999
    assert relink.to_cents(19.99) == 1999
    assert relink.to_cents("7.995") == 800
    assert relink.to_cents(34) == 3400


def test_search_query_escapes_quotes():
    assert relink.search_query("course_pack_slug", "nursing-freshman") == (
        "active:'true' AND metadata['course_pack_slug']:'nursing-freshman'"
    )
    assert "\\'" in relink.search_query("tier", "o'neil")


def test_match_price_prefers_one_time_when_no_interval():
    prices = [
        _price("price_recurring", "prod_1", 1999, created=50, interval="month"),
        _price("price_old", "prod_1", 1999, created=10),
        _price("price_new", "prod_1", 1999, created=20),
        _price("price_other_amount", "prod_1", 2499, created=99),
        _price("price_eur", "prod_1", 1999, created=99, currency="eur"),
        {**_price("price_inactive", "prod_1", 1999, created=999), "active": False},
    ]
    chosen = relink.match_price(prices, amount_cents=1999, currency="usd")
    assert chosen["id"] == "price_new"


def test_match_price_by_interval():
    prices = [
        _price("price_m", "prod_1", 799, interval="month"),
        _price("price_y", "prod_1", 7999, interval="year"),
        _price("price_one_time", "prod_1", 799),
    ]
    assert relink.match_price(prices, amount_cents=799, currency="usd", recurring_interval="month")["id"] == "price_m"
    assert relink.match_price(prices, amount_cents=7999, currency="usd", recurring_interval="year")["id"] == "price_y"
    assert relink.match_price(prices, amount_cents=799, currency="usd", recurring_interval="year") is None


# ---------------------------------------------------------------------------
# Course packs
# ---------------------------------------------------------------------------

def test_slug_match_newest_wins_and_metadata_relinked():
    products = [
        _product("prod_old", 100, course_pack_slug="nursing-freshman", course_pack_id="7"),
        _product("prod_new", 200, course_pack_slug="nursing-freshman", course_pack_id="7"),
    ]
    prices = [
        _price("price_old", "prod_old", 1999),
        _price("price_new", "prod_new", 1999),
    ]
    fake_stripe = FakeStripe(products, prices)
    admin = FakeAdminClient({"course_packs": [_pack(42, "nursing-freshman", 19.99)]})

    stats, _ = _run_packs(admin, fake_stripe, admin.data_map["course_packs"])

    assert stats.ok
    assert stats.matched == 1 and stats.rows_updated == 1
    row = admin.data_map["course_packs"][0]
    assert row["stripe_product_id"] == "prod_new"
    assert row["stripe_price_id"] == "price_new"
    # Product metadata now points at the new bigint id, only for the winner.
    assert fake_stripe.modify_calls("Product.modify") == [("Product.modify", "prod_new", {"metadata": {"course_pack_id": "42"}})]
    assert stats.archived == 0  # duplicates untouched without --archive-duplicates


def test_price_matched_by_amount_not_first_price():
    products = [_product("prod_1", 100, course_pack_slug="bio-sophomore", course_pack_id="3")]
    prices = [
        _price("price_wrong", "prod_1", 2499, created=5),
        _price("price_right", "prod_1", 2999, created=1),
        _price("price_sub", "prod_1", 2999, created=9, interval="month"),
    ]
    fake_stripe = FakeStripe(products, prices)
    admin = FakeAdminClient({"course_packs": [_pack(3, "bio-sophomore", 29.99)]})

    stats, _ = _run_packs(admin, fake_stripe, admin.data_map["course_packs"])

    assert stats.ok
    assert admin.data_map["course_packs"][0]["stripe_price_id"] == "price_right"
    # metadata already correct -> no Product.modify
    assert fake_stripe.modify_calls("Product.modify") == []


def test_unmatched_reported_for_missing_product_and_missing_price():
    products = [_product("prod_has_no_price", 100, course_pack_slug="chem-junior")]
    fake_stripe = FakeStripe(products, [])
    admin = FakeAdminClient({
        "course_packs": [
            _pack(1, "no-such-pack", 19.99),
            _pack(2, "chem-junior", 24.99),
        ]
    })

    stats, _ = _run_packs(admin, fake_stripe, admin.data_map["course_packs"])

    assert not stats.ok
    assert stats.matched == 0
    assert len(stats.unmatched) == 2
    assert any("no-such-pack" in item and "no active Product" in item for item in stats.unmatched)
    assert any("chem-junior" in item and "no active one-time Price" in item for item in stats.unmatched)
    # Product matched -> product id is still written so create_stripe_products can mint only the Price.
    assert admin.data_map["course_packs"][1]["stripe_product_id"] == "prod_has_no_price"
    assert admin.data_map["course_packs"][1]["stripe_price_id"] is None
    assert admin.data_map["course_packs"][0]["stripe_product_id"] is None


def test_dry_run_writes_nothing_but_reports_intent():
    products = [_product("prod_1", 100, course_pack_slug="math-senior", course_pack_id="old")]
    prices = [_price("price_1", "prod_1", 3499)]
    fake_stripe = FakeStripe(products, prices)
    admin = FakeAdminClient({"course_packs": [_pack(9, "math-senior", 34.99)]})

    stats, _ = _run_packs(admin, fake_stripe, admin.data_map["course_packs"], dry_run=True)

    assert stats.ok
    assert stats.rows_updated == 1 and stats.metadata_updated == 1
    assert admin.updates == []
    assert fake_stripe.modify_calls("Product.modify") == []
    assert admin.data_map["course_packs"][0]["stripe_product_id"] is None
    assert products[0]["metadata"]["course_pack_id"] == "old"


def test_relink_is_idempotent_on_second_run():
    products = [_product("prod_1", 100, course_pack_slug="eng-freshman")]
    prices = [_price("price_1", "prod_1", 1999)]
    fake_stripe = FakeStripe(products, prices)
    admin = FakeAdminClient({"course_packs": [_pack(5, "eng-freshman", 19.99)]})

    first, _ = _run_packs(admin, fake_stripe, admin.data_map["course_packs"])
    assert first.rows_updated == 1 and first.metadata_updated == 1

    second, _ = _run_packs(admin, fake_stripe, admin.data_map["course_packs"])
    assert second.ok
    assert second.matched == 1
    assert second.rows_updated == 0 and second.metadata_updated == 0
    assert len(admin.updates) == 1
    assert len(fake_stripe.modify_calls("Product.modify")) == 1


def test_search_failure_falls_back_to_list_index():
    products = [
        _product("prod_a", 10, course_pack_slug="a-pack"),
        _product("prod_b_old", 20, course_pack_slug="b-pack"),
        _product("prod_b_new", 30, course_pack_slug="b-pack"),
    ]
    prices = [
        _price("price_a", "prod_a", 1999),
        _price("price_b", "prod_b_new", 1999),
    ]
    fake_stripe = FakeStripe(products, prices, search_error=RuntimeError("search not available"))
    admin = FakeAdminClient({"course_packs": [_pack(1, "a-pack", 19.99), _pack(2, "b-pack", 19.99)]})

    stats, index = _run_packs(admin, fake_stripe, admin.data_map["course_packs"])

    assert stats.ok and stats.matched == 2
    assert index.used_fallback is True
    # One search attempt, one list pass, no further searches.
    assert len([c for c in fake_stripe.calls if c[0] == "Product.search"]) == 1
    assert len([c for c in fake_stripe.calls if c[0] == "Product.list"]) == 1
    assert admin.data_map["course_packs"][1]["stripe_product_id"] == "prod_b_new"


def test_archive_duplicates_archives_older_products_and_their_prices():
    products = [
        _product("prod_old", 100, course_pack_slug="dup-pack"),
        _product("prod_new", 200, course_pack_slug="dup-pack"),
    ]
    prices = [
        _price("price_old", "prod_old", 1999),
        _price("price_new", "prod_new", 1999),
    ]
    fake_stripe = FakeStripe(products, prices)
    admin = FakeAdminClient({"course_packs": [_pack(1, "dup-pack", 19.99)]})

    stats, _ = _run_packs(admin, fake_stripe, admin.data_map["course_packs"], archive_duplicates=True)

    assert stats.ok and stats.archived == 1
    assert ("Price.modify", "price_old", {"active": False}) in fake_stripe.calls
    assert ("Product.modify", "prod_old", {"active": False}) in fake_stripe.calls
    assert products[1]["active"] is True
    assert admin.data_map["course_packs"][0]["stripe_product_id"] == "prod_new"


# ---------------------------------------------------------------------------
# Subscription plans
# ---------------------------------------------------------------------------

def test_plans_match_tier_and_interval():
    products = [
        _product("prod_degree_old", 10, tier="degree_bundle", ysc_plan_id="old"),
        _product("prod_degree", 20, tier="degree_bundle", ysc_plan_id="old"),
        _product("prod_all", 20, tier="all_access"),
    ]
    prices = [
        _price("price_degree_m", "prod_degree", 799, interval="month"),
        _price("price_degree_y", "prod_degree", 7999, interval="year"),
        _price("price_all_m", "prod_all", 1499, interval="month"),
        _price("price_all_y_old", "prod_all", 14999, created=1, interval="year"),
        _price("price_all_y", "prod_all", 14999, created=2, interval="year"),
    ]
    fake_stripe = FakeStripe(products, prices)
    plans = [
        {"id": 1, "tier": "degree_bundle", "is_active": True, "stripe_product_id": None,
         "stripe_monthly_price_id": None, "stripe_annual_price_id": None,
         "monthly_amount_cents": 799, "annual_amount_cents": 7999},
        {"id": 2, "tier": "all_access", "is_active": True, "stripe_product_id": None,
         "stripe_monthly_price_id": None, "stripe_annual_price_id": None,
         "monthly_amount_cents": 1499, "annual_amount_cents": 14999},
    ]
    admin = FakeAdminClient({"subscription_plans": plans})

    stats = relink.relink_plans(
        admin, fake_stripe, plans, index=relink.ProductIndex(fake_stripe),
        currency="usd", dry_run=False, archive_duplicates=False,
    )

    assert stats.ok and stats.matched == 2 and stats.rows_updated == 2
    degree, all_access = admin.data_map["subscription_plans"]
    assert degree["stripe_product_id"] == "prod_degree"
    assert degree["stripe_monthly_price_id"] == "price_degree_m"
    assert degree["stripe_annual_price_id"] == "price_degree_y"
    assert all_access["stripe_product_id"] == "prod_all"
    assert all_access["stripe_annual_price_id"] == "price_all_y"
    assert ("Product.modify", "prod_degree", {"metadata": {"ysc_plan_id": "1"}}) in fake_stripe.calls
    assert ("Product.modify", "prod_all", {"metadata": {"ysc_plan_id": "2"}}) in fake_stripe.calls


def test_plans_report_missing_cadence_price():
    products = [_product("prod_degree", 20, tier="degree_bundle")]
    prices = [_price("price_degree_m", "prod_degree", 799, interval="month")]
    fake_stripe = FakeStripe(products, prices)
    plans = [{
        "id": 1, "tier": "degree_bundle", "is_active": True, "stripe_product_id": None,
        "stripe_monthly_price_id": None, "stripe_annual_price_id": None,
        "monthly_amount_cents": 799, "annual_amount_cents": 7999,
    }]
    admin = FakeAdminClient({"subscription_plans": plans})

    stats = relink.relink_plans(
        admin, fake_stripe, plans, index=relink.ProductIndex(fake_stripe),
        currency="usd", dry_run=False, archive_duplicates=False,
    )

    assert not stats.ok
    assert stats.matched == 0
    assert any("annual Price" in item for item in stats.unmatched)
    # Partial link still persisted for the parts that matched.
    assert plans[0]["stripe_monthly_price_id"] == "price_degree_m"
    assert plans[0]["stripe_annual_price_id"] is None


# ---------------------------------------------------------------------------
# --live guard and CLI exit codes
# ---------------------------------------------------------------------------

def test_stripe_key_guard_refuses_live_without_flag():
    assert ysc_script_utils.stripe_key_guard_error("sk_live_abc", allow_live=False) is not None
    assert ysc_script_utils.stripe_key_guard_error("sk_live_abc", allow_live=True) is None
    assert ysc_script_utils.stripe_key_guard_error("sk_test_abc", allow_live=False) is None
    assert ysc_script_utils.stripe_key_guard_error(None, allow_live=False) is None


def test_main_refuses_live_key_before_touching_supabase(monkeypatch, capsys):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_live_do_not_use")
    monkeypatch.setattr(relink, "load_environment", lambda: None)

    def _boom():
        raise AssertionError("Supabase must not be contacted when the live guard trips")

    monkeypatch.setattr(relink, "get_supabase_admin_client", _boom)

    assert relink.main([]) == 1
    assert "LIVE key" in capsys.readouterr().out


def test_main_allows_live_key_with_flag(monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_live_intentional")
    monkeypatch.setattr(relink, "load_environment", lambda: None)
    fake_stripe = FakeStripe([], [])
    monkeypatch.setattr(relink, "stripe", fake_stripe)
    admin = FakeAdminClient({"course_packs": [], "subscription_plans": []})
    monkeypatch.setattr(relink, "get_supabase_admin_client", lambda: admin)

    assert relink.main(["--live", "--dry-run"]) == 0


def test_main_exit_code_reflects_unmatched(monkeypatch, capsys):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_123")
    monkeypatch.setattr(relink, "load_environment", lambda: None)
    fake_stripe = FakeStripe([_product("prod_1", 1, course_pack_slug="linked")], [_price("price_1", "prod_1", 1999)])
    monkeypatch.setattr(relink, "stripe", fake_stripe)
    admin = FakeAdminClient({
        "course_packs": [_pack(1, "linked", 19.99), _pack(2, "orphan", 19.99)],
        "subscription_plans": [],
    })
    monkeypatch.setattr(relink, "get_supabase_admin_client", lambda: admin)

    assert relink.main(["--report-unmatched"]) == 1
    out = capsys.readouterr().out
    assert "== Unmatched ==" in out and "orphan" in out
    assert admin.data_map["course_packs"][0]["stripe_price_id"] == "price_1"

    # Fix the orphan in Stripe and re-run: clean exit, nothing rewritten for the linked pack.
    fake_stripe.products.append(_product("prod_2", 2, course_pack_slug="orphan"))
    fake_stripe.prices.append(_price("price_2", "prod_2", 1999))
    before = len(admin.updates)
    assert relink.main([]) == 0
    assert len(admin.updates) == before + 1
