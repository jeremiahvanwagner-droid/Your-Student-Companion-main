from __future__ import annotations

from pathlib import Path
import sys
from types import SimpleNamespace
from typing import Any, Dict, List

from fastapi.testclient import TestClient
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from lib.clerk_auth import AppAuthContext, get_app_auth_context
import routes.store as store_routes
from server import app


APP_USER_ID = "11111111-1111-4111-8111-111111111111"

DEFAULT_PLAN_ROWS = [
    {
        "id": 1,
        "tier": "degree_bundle",
        "name": "Degree Bundle",
        "stripe_product_id": "prod_degree",
        "stripe_monthly_price_id": "price_degree_monthly",
        "stripe_annual_price_id": "price_degree_annual",
        "trial_days": 14,
        "is_active": True,
    },
    {
        "id": 2,
        "tier": "all_access",
        "name": "All-Access",
        "stripe_product_id": "prod_all",
        "stripe_monthly_price_id": "price_all_monthly",
        "stripe_annual_price_id": "price_all_annual",
        "trial_days": 14,
        "is_active": True,
    },
]


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def clear_overrides():
    app.dependency_overrides = {}
    yield
    app.dependency_overrides = {}


def _override_app_user() -> AppAuthContext:
    return AppAuthContext(
        clerk_user_id="user_test_123",
        email="student@example.com",
        claims={"sub": "user_test_123"},
        app_user_id=APP_USER_ID,
        role="student",
    )


class FakeQuery:
    def __init__(self, data: List[Dict[str, Any]], table: "FakeTable | None" = None):
        self._data = data
        self._table = table
        self._filters: List[tuple] = []
        self._limit: int | None = None

    def select(self, *_a, **_kw):
        return self

    def eq(self, col, val):
        self._filters.append((col, val))
        return self

    def order(self, *_a, **_kw):
        return self

    def limit(self, n, *_a, **_kw):
        self._limit = n
        return self

    def execute(self):
        rows = list(self._data)
        for col, val in self._filters:
            rows = [r for r in rows if str(r.get(col)) == str(val)]
        if self._limit is not None:
            rows = rows[: self._limit]
        return SimpleNamespace(data=rows)


class FakeTable:
    def __init__(self, name: str, data_map: Dict[str, List[Dict[str, Any]]]):
        self._name = name
        self._data_map = data_map

    def select(self, *_a, **_kw):
        return FakeQuery(self._data_map.get(self._name, []), table=self)

    def insert(self, payload):
        rows = self._data_map.setdefault(self._name, [])
        rows.append(dict(payload))
        return FakeQuery([dict(payload)])

    def update(self, _payload):
        return FakeQuery([])

    def upsert(self, payload, **_kw):
        rows = self._data_map.setdefault(self._name, [])
        rows.append(dict(payload))
        return FakeQuery([dict(payload)])


class FakeAdminClient:
    def __init__(self, data_map: Dict[str, List[Dict[str, Any]]]):
        self._data_map = data_map

    def table(self, name: str):
        return FakeTable(name, self._data_map)


class FakeStripeSession:
    def __init__(self, id: str, url: str, **extras):
        self.id = id
        self.url = url
        for key, value in extras.items():
            setattr(self, key, value)


def _install_fakes(
    monkeypatch,
    *,
    plan_rows: List[Dict[str, Any]] | None = None,
    degree_rows: List[Dict[str, Any]] | None = None,
    user_rows: List[Dict[str, Any]] | None = None,
    prior_subs: List[Dict[str, Any]] | None = None,
    capture: Dict[str, Any] | None = None,
):
    data_map: Dict[str, List[Dict[str, Any]]] = {
        "subscription_plans": plan_rows if plan_rows is not None else list(DEFAULT_PLAN_ROWS),
        "degree_plans": degree_rows if degree_rows is not None else [
            {"id": 1, "name": "Nursing", "slug": "nursing", "is_active": True},
        ],
        "users": user_rows if user_rows is not None else [
            {
                "id": APP_USER_ID,
                "stripe_customer_id": "cus_existing",
                "email": "student@example.com",
                "clerk_id": "user_test_123",
            }
        ],
        "user_subscriptions": list(prior_subs) if prior_subs else [],
        "audit_logs": [],
    }

    fake_admin = FakeAdminClient(data_map)
    monkeypatch.setattr(store_routes, "_admin_client", lambda: fake_admin)
    monkeypatch.setattr(store_routes, "_ensure_purchase_tables_ready", lambda _admin: None)
    monkeypatch.setattr(store_routes, "write_audit_log", lambda *_a, **_kw: None)

    captured = capture if capture is not None else {}

    class FakeCheckout:
        @staticmethod
        def create(**kwargs):
            captured["create_kwargs"] = kwargs
            return FakeStripeSession(
                id="cs_test_abc",
                url="https://stripe.example/checkout/cs_test_abc",
            )

    class FakePortal:
        class Session:
            @staticmethod
            def create(**kwargs):
                captured["portal_kwargs"] = kwargs
                return FakeStripeSession(
                    id="bps_test_xyz",
                    url="https://stripe.example/portal/bps_test_xyz",
                )

    class FakeStripe:
        class checkout:
            Session = FakeCheckout

        billing_portal = FakePortal

    monkeypatch.setattr(store_routes, "_stripe_client", lambda: FakeStripe)

    return captured, data_map


def test_subscription_checkout_creates_session_with_trial(client, monkeypatch):
    app.dependency_overrides[get_app_auth_context] = _override_app_user

    captured, data_map = _install_fakes(monkeypatch)

    response = client.post(
        "/api/store/subscriptions/checkout",
        json={
            "tier": "degree_bundle",
            "cadence": "monthly",
            "degree_plan_id": 1,
            "success_url": "https://example.com/success",
            "cancel_url": "https://example.com/cancel",
        },
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["checkout_url"].startswith("https://stripe.example/")
    assert body["tier"] == "degree_bundle"
    assert body["cadence"] == "monthly"

    kwargs = captured["create_kwargs"]
    assert kwargs["mode"] == "subscription"
    assert kwargs["customer"] == "cus_existing"
    assert kwargs["line_items"] == [
        {"price": "price_degree_monthly", "quantity": 1}
    ]
    assert kwargs["subscription_data"]["trial_period_days"] == 14
    assert kwargs["subscription_data"]["metadata"]["tier"] == "degree_bundle"
    assert kwargs["subscription_data"]["metadata"]["degree_plan_id"] == "1"

    # Pending subscription row was written
    assert any(
        row.get("tier") == "degree_bundle" and row.get("status") == "pending"
        for row in data_map["user_subscriptions"]
    )


def test_subscription_checkout_skips_trial_for_returning_user(client, monkeypatch):
    app.dependency_overrides[get_app_auth_context] = _override_app_user

    captured, _ = _install_fakes(
        monkeypatch,
        prior_subs=[{"id": 999, "user_id": APP_USER_ID}],
    )

    response = client.post(
        "/api/store/subscriptions/checkout",
        json={
            "tier": "all_access",
            "cadence": "annual",
            "success_url": "https://example.com/success",
            "cancel_url": "https://example.com/cancel",
        },
    )

    assert response.status_code == 200, response.text
    kwargs = captured["create_kwargs"]
    assert kwargs["line_items"] == [
        {"price": "price_all_annual", "quantity": 1}
    ]
    assert "trial_period_days" not in kwargs["subscription_data"]


def test_subscription_checkout_requires_degree_for_degree_bundle(client, monkeypatch):
    app.dependency_overrides[get_app_auth_context] = _override_app_user

    _install_fakes(monkeypatch)

    response = client.post(
        "/api/store/subscriptions/checkout",
        json={
            "tier": "degree_bundle",
            "cadence": "monthly",
            "success_url": "https://example.com/success",
            "cancel_url": "https://example.com/cancel",
        },
    )

    assert response.status_code == 422
    assert "degree_plan_id" in response.json()["detail"]


def test_subscription_me_returns_null_when_none(client, monkeypatch):
    app.dependency_overrides[get_app_auth_context] = _override_app_user

    _install_fakes(monkeypatch, prior_subs=[])

    response = client.get("/api/store/subscriptions/me")

    assert response.status_code == 200
    assert response.json() is None


def test_subscription_me_returns_latest_row(client, monkeypatch):
    app.dependency_overrides[get_app_auth_context] = _override_app_user

    _install_fakes(
        monkeypatch,
        prior_subs=[
            {
                "id": 7,
                "user_id": APP_USER_ID,
                "tier": "all_access",
                "plan_type": "all_access_monthly",
                "degree_plan_id": None,
                "status": "trialing",
                "current_period_start": None,
                "current_period_end": None,
                "trial_end": "2026-06-06T00:00:00+00:00",
                "cancel_at_period_end": False,
                "stripe_subscription_id": "sub_test",
            }
        ],
    )

    response = client.get("/api/store/subscriptions/me")
    assert response.status_code == 200
    body = response.json()
    assert body["tier"] == "all_access"
    assert body["status"] == "trialing"


def test_portal_returns_404_without_stripe_customer(client, monkeypatch):
    app.dependency_overrides[get_app_auth_context] = _override_app_user

    _install_fakes(
        monkeypatch,
        user_rows=[
            {
                "id": APP_USER_ID,
                "stripe_customer_id": None,
                "email": "student@example.com",
                "clerk_id": "user_test_123",
            }
        ],
    )

    response = client.post(
        "/api/store/subscriptions/portal",
        json={"return_url": "https://example.com/back"},
    )

    assert response.status_code == 404
    assert "Stripe customer" in response.json()["detail"]


def test_portal_returns_url_when_customer_present(client, monkeypatch):
    app.dependency_overrides[get_app_auth_context] = _override_app_user

    captured, _ = _install_fakes(monkeypatch)

    response = client.post(
        "/api/store/subscriptions/portal",
        json={"return_url": "https://example.com/back"},
    )

    assert response.status_code == 200
    assert response.json()["portal_url"].startswith("https://stripe.example/portal/")
    assert captured["portal_kwargs"]["customer"] == "cus_existing"
    assert captured["portal_kwargs"]["return_url"] == "https://example.com/back"
