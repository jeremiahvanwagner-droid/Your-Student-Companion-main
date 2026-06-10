from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from lib.clerk_auth import AppAuthContext, get_app_auth_context
from server import app

APP_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
OTHER_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
NOTE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
CARD_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def clear_overrides():
    app.dependency_overrides = {}
    yield
    app.dependency_overrides = {}


def _auth_user() -> AppAuthContext:
    return AppAuthContext(
        clerk_user_id="user_notes_test",
        email="student@example.com",
        claims={"sub": "user_notes_test"},
        app_user_id=APP_USER_ID,
        role="student",
    )


TABLE_METHODS = (
    "select", "insert", "update", "delete", "upsert",
    "eq", "in_", "or_", "contains", "gte", "lte", "lt",
    "order", "range", "limit",
)


def _make_table_mock(rows=None):
    mock = MagicMock()
    result = MagicMock()
    result.data = rows if rows is not None else []
    for method in TABLE_METHODS:
        getattr(mock, method).return_value = mock
    mock.execute.return_value = result
    return mock


def _mock_admin(rows=None):
    admin = MagicMock()
    admin.table.return_value = _make_table_mock(rows)
    return admin


def _mock_admin_tables(tables):
    admin = MagicMock()
    mocks = {name: _make_table_mock(rows) for name, rows in tables.items()}

    def table_side(name):
        return mocks.get(name, _make_table_mock([]))

    admin.table.side_effect = table_side
    return admin, mocks


# ── Auth ──────────────────────────────────────────────────────────────────

class TestNotesAuth:
    def test_list_requires_auth(self, client: TestClient):
        assert client.get("/api/notes").status_code == 401

    def test_create_requires_auth(self, client: TestClient):
        assert client.post("/api/notes", json={"title": "x"}).status_code == 401

    def test_cards_require_auth(self, client: TestClient):
        assert client.get("/api/notes/cards").status_code == 401


# ── Notes CRUD ────────────────────────────────────────────────────────────

class TestNotesCrud:
    def test_create_note_normalizes_tags(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.notes as notes_routes

        admin, mocks = _mock_admin_tables({"notes": [{"id": NOTE_ID, "title": "Bio"}]})
        with patch.object(notes_routes, "_admin_client", return_value=admin):
            resp = client.post(
                "/api/notes",
                json={"title": "  Bio  ", "tags": [" Mitosis", "mitosis", "BIO "]},
            )

        assert resp.status_code == 201
        payload = mocks["notes"].insert.call_args[0][0]
        assert payload["title"] == "Bio"
        assert payload["tags"] == ["mitosis", "bio"]
        assert payload["user_id"] == APP_USER_ID

    def test_create_note_requires_title(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        resp = client.post("/api/notes", json={"title": ""})
        assert resp.status_code == 422

    def test_create_note_rejects_bad_subject_uuid(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.notes as notes_routes

        with patch.object(notes_routes, "_admin_client", return_value=_mock_admin()):
            resp = client.post(
                "/api/notes", json={"title": "x", "subject_id": "not-a-uuid"}
            )
        assert resp.status_code == 422

    def test_list_notes(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.notes as notes_routes

        rows = [{"id": NOTE_ID, "title": "Bio", "user_id": APP_USER_ID}]
        with patch.object(notes_routes, "_admin_client", return_value=_mock_admin(rows)):
            resp = client.get("/api/notes?q=bio&tag=Science")

        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 1
        assert data["notes"][0]["id"] == NOTE_ID

    def test_get_note_enforces_ownership(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.notes as notes_routes

        rows = [{"id": NOTE_ID, "user_id": OTHER_USER_ID}]
        with patch.object(notes_routes, "_admin_client", return_value=_mock_admin(rows)):
            resp = client.get(f"/api/notes/{NOTE_ID}")
        assert resp.status_code == 403

    def test_get_note_404_when_missing(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.notes as notes_routes

        with patch.object(notes_routes, "_admin_client", return_value=_mock_admin([])):
            resp = client.get(f"/api/notes/{NOTE_ID}")
        assert resp.status_code == 404

    def test_update_note_archives(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.notes as notes_routes

        rows = [{"id": NOTE_ID, "user_id": APP_USER_ID}]
        admin, mocks = _mock_admin_tables({"notes": rows})
        with patch.object(notes_routes, "_admin_client", return_value=admin):
            resp = client.put(f"/api/notes/{NOTE_ID}", json={"is_archived": True})

        assert resp.status_code == 200
        updates = mocks["notes"].update.call_args[0][0]
        assert updates["is_archived"] is True

    def test_delete_note(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.notes as notes_routes

        rows = [{"id": NOTE_ID, "user_id": APP_USER_ID}]
        with patch.object(notes_routes, "_admin_client", return_value=_mock_admin(rows)):
            resp = client.delete(f"/api/notes/{NOTE_ID}")
        assert resp.status_code == 204


# ── Review cards ──────────────────────────────────────────────────────────

class TestReviewCards:
    def test_create_card(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.notes as notes_routes

        admin, mocks = _mock_admin_tables(
            {"review_cards": [{"id": CARD_ID, "front_text": "Q"}]}
        )
        with patch.object(notes_routes, "_admin_client", return_value=admin):
            resp = client.post(
                "/api/notes/cards", json={"front_text": "Q", "back_text": "A"}
            )

        assert resp.status_code == 201
        payload = mocks["review_cards"].insert.call_args[0][0]
        assert payload["front_text"] == "Q"
        assert payload["user_id"] == APP_USER_ID

    def test_create_card_checks_note_ownership(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.notes as notes_routes

        admin, _ = _mock_admin_tables(
            {"notes": [{"id": NOTE_ID, "user_id": OTHER_USER_ID}]}
        )
        with patch.object(notes_routes, "_admin_client", return_value=admin):
            resp = client.post(
                "/api/notes/cards",
                json={"front_text": "Q", "back_text": "A", "note_id": NOTE_ID},
            )
        assert resp.status_code == 403

    def test_review_good_first_pass_schedules_one_day(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.notes as notes_routes

        rows = [
            {
                "id": CARD_ID, "user_id": APP_USER_ID, "difficulty": 3,
                "review_count": 0, "ease_factor": 2.5, "interval_days": 0,
            }
        ]
        admin, mocks = _mock_admin_tables({"review_cards": rows})
        before = datetime.now(timezone.utc)
        with patch.object(notes_routes, "_admin_client", return_value=admin):
            resp = client.post(f"/api/notes/cards/{CARD_ID}/review", json={"rating": "good"})

        assert resp.status_code == 200
        updates = mocks["review_cards"].update.call_args[0][0]
        assert updates["review_count"] == 1
        assert updates["difficulty"] == 3
        # SM-2: q=4 leaves ease at 2.5; first successful pass → 1 day
        assert updates["ease_factor"] == 2.5
        assert updates["interval_days"] == 1
        next_review = datetime.fromisoformat(updates["next_review_at"])
        assert timedelta(hours=23) <= next_review - before <= timedelta(hours=25)

    def test_review_good_mature_card_multiplies_by_ease(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.notes as notes_routes

        rows = [
            {
                "id": CARD_ID, "user_id": APP_USER_ID, "difficulty": 3,
                "review_count": 3, "ease_factor": 2.5, "interval_days": 6,
            }
        ]
        admin, mocks = _mock_admin_tables({"review_cards": rows})
        with patch.object(notes_routes, "_admin_client", return_value=admin):
            resp = client.post(f"/api/notes/cards/{CARD_ID}/review", json={"rating": "good"})

        assert resp.status_code == 200
        updates = mocks["review_cards"].update.call_args[0][0]
        assert updates["interval_days"] == 15  # round(6 * 2.5)

    def test_review_again_resets_interval_and_lowers_ease(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.notes as notes_routes

        rows = [
            {
                "id": CARD_ID, "user_id": APP_USER_ID, "difficulty": 5,
                "review_count": 4, "ease_factor": 2.5, "interval_days": 15,
            }
        ]
        admin, mocks = _mock_admin_tables({"review_cards": rows})
        before = datetime.now(timezone.utc)
        with patch.object(notes_routes, "_admin_client", return_value=admin):
            resp = client.post(f"/api/notes/cards/{CARD_ID}/review", json={"rating": "again"})

        assert resp.status_code == 200
        updates = mocks["review_cards"].update.call_args[0][0]
        assert updates["difficulty"] == 5  # capped at 5
        assert updates["review_count"] == 5
        assert updates["interval_days"] == 0
        assert updates["ease_factor"] == 2.18  # 2.5 + (0.1 - 3*(0.08 + 3*0.02))
        # Lapsed cards re-queue ~10 minutes out
        next_review = datetime.fromisoformat(updates["next_review_at"])
        assert next_review - before <= timedelta(minutes=15)

    def test_review_ease_never_drops_below_floor(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.notes as notes_routes

        rows = [
            {
                "id": CARD_ID, "user_id": APP_USER_ID, "difficulty": 1,
                "review_count": 1, "ease_factor": 1.3, "interval_days": 1,
            }
        ]
        admin, mocks = _mock_admin_tables({"review_cards": rows})
        with patch.object(notes_routes, "_admin_client", return_value=admin):
            resp = client.post(f"/api/notes/cards/{CARD_ID}/review", json={"rating": "again"})

        assert resp.status_code == 200
        updates = mocks["review_cards"].update.call_args[0][0]
        assert updates["ease_factor"] == 1.3

    def test_review_easy_lowers_difficulty_floor_one(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.notes as notes_routes

        rows = [
            {
                "id": CARD_ID, "user_id": APP_USER_ID, "difficulty": 1,
                "review_count": 1, "ease_factor": 2.5, "interval_days": 1,
            }
        ]
        admin, mocks = _mock_admin_tables({"review_cards": rows})
        with patch.object(notes_routes, "_admin_client", return_value=admin):
            resp = client.post(f"/api/notes/cards/{CARD_ID}/review", json={"rating": "easy"})

        assert resp.status_code == 200
        updates = mocks["review_cards"].update.call_args[0][0]
        assert updates["difficulty"] == 1
        # q=5 raises ease: 2.5 + 0.1 = 2.6; interval 1 → 6 (second pass)
        assert updates["ease_factor"] == 2.6
        assert updates["interval_days"] == 6

    def test_review_defaults_when_sm2_columns_null(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.notes as notes_routes

        # Pre-migration rows have no ease_factor/interval_days values
        rows = [
            {
                "id": CARD_ID, "user_id": APP_USER_ID, "difficulty": 3,
                "review_count": 0, "ease_factor": None, "interval_days": None,
            }
        ]
        admin, mocks = _mock_admin_tables({"review_cards": rows})
        with patch.object(notes_routes, "_admin_client", return_value=admin):
            resp = client.post(f"/api/notes/cards/{CARD_ID}/review", json={"rating": "good"})

        assert resp.status_code == 200
        updates = mocks["review_cards"].update.call_args[0][0]
        assert updates["ease_factor"] == 2.5
        assert updates["interval_days"] == 1

    def test_review_rejects_unknown_rating(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        resp = client.post(f"/api/notes/cards/{CARD_ID}/review", json={"rating": "meh"})
        assert resp.status_code == 422

    def test_due_only_filters_in_query_before_pagination(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.notes as notes_routes

        # The due predicate must be part of the DB query (or= filter +
        # next_review_at ordering) — Python-side filtering after .range()
        # hid due cards beyond the first page.
        rows = [{"id": "1"}, {"id": "3"}]
        admin, mocks = _mock_admin_tables({"review_cards": rows})
        with patch.object(notes_routes, "_admin_client", return_value=admin):
            resp = client.get("/api/notes/cards?due_only=true")

        assert resp.status_code == 200
        assert [c["id"] for c in resp.json()["cards"]] == ["1", "3"]

        or_filter = mocks["review_cards"].or_.call_args[0][0]
        assert "next_review_at.is.null" in or_filter
        assert "next_review_at.lte." in or_filter
        assert mocks["review_cards"].order.call_args[0][0] == "next_review_at"

    def test_all_cards_listing_orders_by_created(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.notes as notes_routes

        admin, mocks = _mock_admin_tables({"review_cards": []})
        with patch.object(notes_routes, "_admin_client", return_value=admin):
            resp = client.get("/api/notes/cards")

        assert resp.status_code == 200
        mocks["review_cards"].or_.assert_not_called()
        assert mocks["review_cards"].order.call_args[0][0] == "created_at"

    def test_delete_card_enforces_ownership(self, client: TestClient):
        app.dependency_overrides[get_app_auth_context] = _auth_user
        import routes.notes as notes_routes

        rows = [{"id": CARD_ID, "user_id": OTHER_USER_ID}]
        with patch.object(notes_routes, "_admin_client", return_value=_mock_admin(rows)):
            resp = client.delete(f"/api/notes/cards/{CARD_ID}")
        assert resp.status_code == 403
