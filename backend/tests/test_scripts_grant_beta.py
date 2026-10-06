"""
Unit tests for backend/scripts/grant_beta_access.py.

The Supabase admin client is an in-memory fake (FakeAdminClient pattern from
test_subscriptions.py, extended with like/update/insert-id support) so the
grant / revoke / audit behaviour can be asserted without a database.
"""

from __future__ import annotations

from datetime import datetime, timezone
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

import grant_beta_access as grant  # noqa: E402


USER_ID = "11111111-1111-4111-8111-111111111111"
OTHER_USER_ID = "22222222-2222-4222-8222-222222222222"
NOW = datetime(2026, 10, 6, 12, 0, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------

class FakeQuery:
    def __init__(self, table: "FakeTable", op: str = "select", payload: Dict[str, Any] | None = None):
        self._table = table
        self._op = op
        self._payload = payload or {}
        self._filters: List[tuple] = []
        self._limit: int | None = None

    def select(self, *_a, **_kw):
        return self

    def eq(self, col, val):
        self._filters.append(("eq", col, val))
        return self

    def like(self, col, pattern):
        self._filters.append(("like", col, pattern))
        return self

    def order(self, *_a, **_kw):
        return self

    def limit(self, n, *_a, **_kw):
        self._limit = n
        return self

    def _matches(self, row: Dict[str, Any]) -> bool:
        for kind, col, val in self._filters:
            if kind == "eq" and str(row.get(col)) != str(val):
                return False
            if kind == "like":
                prefix = str(val).rstrip("%")
                if not str(row.get(col) or "").startswith(prefix):
                    return False
        return True

    def execute(self):
        rows = [r for r in self._table.rows if self._matches(r)]
        if self._op == "update":
            for row in rows:
                row.update(self._payload)
            self._table.client.calls.append(("update", self._table.name, dict(self._payload)))
        if self._limit is not None:
            rows = rows[: self._limit]
        return SimpleNamespace(data=[dict(r) for r in rows])


class FakeInsert:
    def __init__(self, table: "FakeTable", payload: Dict[str, Any]):
        self._table = table
        self._payload = payload

    def execute(self):
        if self._table.fail_insert:
            raise RuntimeError("insert refused")
        row = dict(self._payload)
        row.setdefault("id", self._table.client.next_id())
        self._table.rows.append(row)
        self._table.client.calls.append(("insert", self._table.name, dict(row)))
        return SimpleNamespace(data=[dict(row)])


class FakeTable:
    def __init__(self, name: str, client: "FakeAdminClient"):
        self.name = name
        self.client = client
        self.rows = client.data_map.setdefault(name, [])
        self.fail_insert = name in client.failing_tables

    def select(self, *_a, **_kw):
        return FakeQuery(self)

    def insert(self, payload):
        return FakeInsert(self, payload)

    def update(self, payload):
        return FakeQuery(self, op="update", payload=payload)


class FakeAdminClient:
    def __init__(self, data_map: Dict[str, List[Dict[str, Any]]], failing_tables: set | None = None):
        self.data_map = data_map
        self.calls: List[tuple] = []
        self.failing_tables = failing_tables or set()
        self._seq = 100

    def next_id(self) -> int:
        self._seq += 1
        return self._seq

    def table(self, name: str):
        return FakeTable(name, self)


def _client(**extra) -> FakeAdminClient:
    data_map: Dict[str, List[Dict[str, Any]]] = {
        "users": [
            {"id": USER_ID, "clerk_id": "user_beta_1", "email": "beta@example.com", "role": "student"},
            {"id": OTHER_USER_ID, "clerk_id": "user_other", "email": "other@example.com", "role": "student"},
        ],
        "user_subscriptions": [],
        "audit_logs": [],
    }
    data_map.update(extra)
    return FakeAdminClient(data_map)


def _user(admin: FakeAdminClient) -> Dict[str, Any]:
    return admin.data_map["users"][0]


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------

def test_add_months_clamps_to_month_end():
    assert grant.add_months(datetime(2026, 1, 31, tzinfo=timezone.utc), 1) == datetime(2026, 2, 28, tzinfo=timezone.utc)
    assert grant.add_months(datetime(2028, 1, 31, tzinfo=timezone.utc), 1) == datetime(2028, 2, 29, tzinfo=timezone.utc)
    assert grant.add_months(datetime(2026, 11, 15, tzinfo=timezone.utc), 3) == datetime(2027, 2, 15, tzinfo=timezone.utc)
    assert grant.add_months(NOW, 12) == NOW.replace(year=2027)


def test_beta_subscription_ids_are_unique_and_prefixed():
    ids = {grant.new_beta_subscription_id() for _ in range(50)}
    assert len(ids) == 50
    assert all(grant.is_beta_subscription_id(value) for value in ids)
    assert not grant.is_beta_subscription_id("sub_123")


def test_build_grant_payload_validation():
    with pytest.raises(grant.GrantError):
        grant.build_grant_payload(user_id=USER_ID, tier="degree_bundle", degree_plan_id=None, months=3, now=NOW)
    with pytest.raises(grant.GrantError):
        grant.build_grant_payload(user_id=USER_ID, tier="all_access", degree_plan_id=4, months=3, now=NOW)
    with pytest.raises(grant.GrantError):
        grant.build_grant_payload(user_id=USER_ID, tier="all_access", degree_plan_id=None, months=0, now=NOW)
    with pytest.raises(grant.GrantError):
        grant.build_grant_payload(user_id=USER_ID, tier="platinum", degree_plan_id=None, months=1, now=NOW)

    payload = grant.build_grant_payload(user_id=USER_ID, tier="degree_bundle", degree_plan_id=4, months=3, now=NOW)
    assert payload["plan_type"] == "degree_bundle_annual"
    assert payload["degree_plan_id"] == 4
    assert payload["status"] == "active"
    assert payload["cancel_at_period_end"] is True
    assert payload["current_period_start"] == NOW.isoformat()
    assert payload["current_period_end"] == NOW.replace(year=2027, month=1).isoformat()


# ---------------------------------------------------------------------------
# resolve_user
# ---------------------------------------------------------------------------

def test_resolve_user_by_clerk_id_and_uuid():
    admin = _client()
    assert grant.resolve_user(admin, clerk_id="user_beta_1")["id"] == USER_ID
    assert grant.resolve_user(admin, user_id=USER_ID)["clerk_id"] == "user_beta_1"
    assert grant.resolve_user(admin, clerk_id="user_missing") is None
    with pytest.raises(grant.GrantError):
        grant.resolve_user(admin, user_id="not-a-uuid")
    with pytest.raises(grant.GrantError):
        grant.resolve_user(admin, clerk_id="x", user_id=USER_ID)
    with pytest.raises(grant.GrantError):
        grant.resolve_user(admin)


# ---------------------------------------------------------------------------
# grant_access
# ---------------------------------------------------------------------------

def test_grant_inserts_all_access_row_and_audit():
    admin = _client()

    result = grant.grant_access(admin, user=_user(admin), now=NOW)

    subs = admin.data_map["user_subscriptions"]
    assert len(subs) == 1
    row = subs[0]
    assert row["user_id"] == USER_ID
    assert row["tier"] == "all_access"
    assert row["plan_type"] == "all_access_annual"
    assert row["degree_plan_id"] is None
    assert row["status"] == "active"
    assert row["cancel_at_period_end"] is True
    assert row["stripe_subscription_id"].startswith("beta_") and len(row["stripe_subscription_id"]) == 5 + 32
    assert row["current_period_start"] == NOW.isoformat()
    assert row["current_period_end"] == NOW.replace(year=2027, month=1).isoformat()

    assert result["created"] is True
    assert result["stripe_subscription_id"] == row["stripe_subscription_id"]
    assert result["subscription_row_id"] == row["id"]

    audits = admin.data_map["audit_logs"]
    assert len(audits) == 1
    audit = audits[0]
    assert audit["actor_id"] is None
    assert audit["action"] == "store.beta_access.grant"
    assert audit["entity_type"] == "user_subscriptions"
    assert audit["entity_id"] is None
    assert audit["metadata"]["user_id"] == USER_ID
    assert audit["metadata"]["clerk_id"] == "user_beta_1"
    assert audit["metadata"]["stripe_subscription_id"] == row["stripe_subscription_id"]
    assert audit["metadata"]["months"] == 3


def test_grant_degree_bundle_requires_plan_and_sets_it():
    admin = _client()
    with pytest.raises(grant.GrantError):
        grant.grant_access(admin, user=_user(admin), tier="degree_bundle", now=NOW)
    assert admin.data_map["user_subscriptions"] == []
    assert admin.data_map["audit_logs"] == []

    grant.grant_access(admin, user=_user(admin), tier="degree_bundle", degree_plan_id=7, months=1, now=NOW)
    row = admin.data_map["user_subscriptions"][0]
    assert row["tier"] == "degree_bundle"
    assert row["plan_type"] == "degree_bundle_annual"
    assert row["degree_plan_id"] == 7
    assert row["current_period_end"] == NOW.replace(month=11).isoformat()


def test_grant_is_idempotent_updates_existing_beta_row():
    admin = _client()
    first = grant.grant_access(admin, user=_user(admin), months=1, now=NOW)
    later = NOW.replace(day=20)
    second = grant.grant_access(admin, user=_user(admin), months=6, now=later)

    subs = admin.data_map["user_subscriptions"]
    assert len(subs) == 1
    assert second["created"] is False
    assert second["stripe_subscription_id"] == first["stripe_subscription_id"]
    assert subs[0]["current_period_end"] == grant.add_months(later, 6).isoformat()
    assert subs[0]["status"] == "active"
    assert len(admin.data_map["audit_logs"]) == 2
    assert [c[0] for c in admin.calls if c[1] == "user_subscriptions"] == ["insert", "update"]


def test_grant_does_not_touch_other_users_or_stripe_rows():
    admin = _client(user_subscriptions=[
        {"id": 1, "user_id": USER_ID, "stripe_subscription_id": "sub_real", "status": "active",
         "tier": "all_access", "plan_type": "all_access_monthly", "degree_plan_id": None},
        {"id": 2, "user_id": OTHER_USER_ID, "stripe_subscription_id": "beta_other", "status": "active",
         "tier": "all_access", "plan_type": "all_access_annual", "degree_plan_id": None},
    ])

    result = grant.grant_access(admin, user=_user(admin), now=NOW)

    assert result["created"] is True
    subs = admin.data_map["user_subscriptions"]
    assert len(subs) == 3
    assert subs[0]["stripe_subscription_id"] == "sub_real" and subs[0]["plan_type"] == "all_access_monthly"
    assert subs[1]["stripe_subscription_id"] == "beta_other"


def test_grant_dry_run_writes_nothing():
    admin = _client()

    result = grant.grant_access(admin, user=_user(admin), dry_run=True, now=NOW)

    assert result["dry_run"] is True
    assert result["payload"]["plan_type"] == "all_access_annual"
    assert admin.data_map["user_subscriptions"] == []
    assert admin.data_map["audit_logs"] == []
    assert admin.calls == []


def test_grant_surfaces_audit_failure():
    admin = _client()
    admin.failing_tables = {"audit_logs"}

    with pytest.raises(grant.GrantError, match="audit_logs insert failed"):
        grant.grant_access(admin, user=_user(admin), now=NOW)

    # The entitlement was applied before the audit failed; the operator is told loudly.
    assert len(admin.data_map["user_subscriptions"]) == 1


# ---------------------------------------------------------------------------
# revoke_access
# ---------------------------------------------------------------------------

def test_revoke_sets_canceled_and_audits_once():
    admin = _client()
    granted = grant.grant_access(admin, user=_user(admin), now=NOW)

    result = grant.revoke_access(admin, user=_user(admin), now=NOW)

    row = admin.data_map["user_subscriptions"][0]
    assert row["status"] == "canceled"
    assert row["cancel_at_period_end"] is True
    assert row["stripe_subscription_id"] == granted["stripe_subscription_id"]
    assert result["revoked"] == 1
    assert result["stripe_subscription_ids"] == [granted["stripe_subscription_id"]]

    audits = admin.data_map["audit_logs"]
    assert [a["action"] for a in audits] == ["store.beta_access.grant", "store.beta_access.revoke"]
    assert audits[1]["actor_id"] is None
    assert audits[1]["metadata"]["revoked"] == 1

    # Revoking again is a no-op: no update, no extra audit row.
    again = grant.revoke_access(admin, user=_user(admin), now=NOW)
    assert again["revoked"] == 0 and again["beta_rows"] == 1
    assert len(admin.data_map["audit_logs"]) == 2


def test_revoke_leaves_stripe_backed_rows_alone():
    admin = _client(user_subscriptions=[
        {"id": 1, "user_id": USER_ID, "stripe_subscription_id": "sub_real", "status": "active"},
    ])

    result = grant.revoke_access(admin, user=_user(admin), now=NOW)

    assert result["revoked"] == 0 and result["beta_rows"] == 0
    assert admin.data_map["user_subscriptions"][0]["status"] == "active"
    assert admin.data_map["audit_logs"] == []


def test_revoke_dry_run_writes_nothing():
    admin = _client()
    grant.grant_access(admin, user=_user(admin), now=NOW)
    calls_before = len(admin.calls)

    result = grant.revoke_access(admin, user=_user(admin), dry_run=True, now=NOW)

    assert result["revoked"] == 1 and result["dry_run"] is True
    assert admin.data_map["user_subscriptions"][0]["status"] == "active"
    assert len(admin.calls) == calls_before
    assert len(admin.data_map["audit_logs"]) == 1


def test_grant_after_revoke_reactivates_same_row():
    admin = _client()
    first = grant.grant_access(admin, user=_user(admin), now=NOW)
    grant.revoke_access(admin, user=_user(admin), now=NOW)

    second = grant.grant_access(admin, user=_user(admin), now=NOW)

    subs = admin.data_map["user_subscriptions"]
    assert len(subs) == 1
    assert subs[0]["status"] == "active"
    assert second["created"] is False
    assert second["stripe_subscription_id"] == first["stripe_subscription_id"]


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _wire_main(monkeypatch, admin: FakeAdminClient) -> None:
    monkeypatch.setattr(grant, "load_environment", lambda: None)
    monkeypatch.setattr(grant, "get_supabase_admin_client", lambda: admin)


def test_main_grant_by_clerk_id(monkeypatch, capsys):
    admin = _client()
    _wire_main(monkeypatch, admin)

    assert grant.main(["--clerk-id", "user_beta_1"]) == 0

    out = capsys.readouterr().out
    assert "change applied and audited" in out
    assert len(admin.data_map["user_subscriptions"]) == 1
    assert admin.data_map["user_subscriptions"][0]["plan_type"] == "all_access_annual"


def test_main_unknown_user_and_bad_tier_combo_exit_1(monkeypatch, capsys):
    admin = _client()
    _wire_main(monkeypatch, admin)

    assert grant.main(["--clerk-id", "user_nobody"]) == 1
    assert "no users row" in capsys.readouterr().out

    assert grant.main(["--user-id", USER_ID, "--tier", "degree_bundle"]) == 1
    assert "--degree-plan-id is required" in capsys.readouterr().out
    assert admin.data_map["user_subscriptions"] == []


def test_main_revoke_and_dry_run(monkeypatch, capsys):
    admin = _client()
    _wire_main(monkeypatch, admin)

    assert grant.main(["--user-id", USER_ID, "--dry-run"]) == 0
    assert "[dry-run] nothing written" in capsys.readouterr().out
    assert admin.data_map["user_subscriptions"] == []

    assert grant.main(["--user-id", USER_ID, "--months", "2"]) == 0
    capsys.readouterr()
    assert grant.main(["--user-id", USER_ID, "--revoke"]) == 0
    assert admin.data_map["user_subscriptions"][0]["status"] == "canceled"
    assert grant.main(["--user-id", USER_ID, "--revoke"]) == 0
    assert "no active beta row to revoke" in capsys.readouterr().out
