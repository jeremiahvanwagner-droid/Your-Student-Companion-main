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
import routes.exams as exams_routes
from server import app


APP_USER_ID = "11111111-1111-4111-8111-111111111111"


# ── Fixtures: fake Supabase client (mirrors test_subscriptions pattern) ──


class FakeQuery:
    def __init__(self, data: List[Dict[str, Any]]):
        self._data = data
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
        return FakeQuery(self._data_map.get(self._name, []))


class FakeAdminClient:
    def __init__(self, data_map: Dict[str, List[Dict[str, Any]]]):
        self._data_map = data_map

    def table(self, name: str):
        return FakeTable(name, self._data_map)


# ── Seed data ────────────────────────────────────────────────────────────


REGENTS_ALG_I = {
    "id": "00000000-0000-4000-8000-000000000001",
    "slug": "ny-regents-algebra-i",
    "name": "NY Regents Algebra I",
    "full_name": "New York State Regents Examination in Algebra I",
    "category": "state_eoc_assessment",
    "region_state": "NY",
    "region_metro": None,
    "grade_band": "high_school",
    "description": "NY EOC for Algebra I.",
    "total_time_minutes": 180,
    "total_questions": 37,
    "sections_count": 4,
    "scoring_model": "scaled",
    "scoring_metadata": {
        "raw_max": 86,
        "scaled_min": 0,
        "scaled_max": 100,
        "passing_scaled": 65,
        "free_sample_question_count": 1,
    },
    "content_source": "state_released",
    "content_provenance": {},
    "icon_name": None,
    "is_published": True,
    "is_official_partnership": False,
}

STAAR_G8_MATH = {
    "id": "00000000-0000-4000-8000-000000000002",
    "slug": "staar-g8-math",
    "name": "STAAR Grade 8 Math",
    "full_name": "State of Texas Assessments of Academic Readiness — Grade 8 Math",
    "category": "state_mandated_assessment",
    "region_state": "TX",
    "region_metro": None,
    "grade_band": "grades_6_8",
    "description": "TX Grade 8 math assessment.",
    "total_time_minutes": 240,
    "total_questions": 42,
    "sections_count": 1,
    "scoring_model": "scaled",
    "scoring_metadata": {},  # no preview configured
    "content_source": "state_released",
    "content_provenance": {},
    "icon_name": None,
    "is_published": True,
    "is_official_partnership": False,
}

ACT_NATIONAL = {
    "id": "00000000-0000-4000-8000-000000000003",
    "slug": "act",
    "name": "ACT",
    "full_name": "American College Test",
    "category": "national_college_admission",
    "region_state": None,  # national — should appear regardless of state filter
    "region_metro": None,
    "grade_band": "college_admission",
    "description": "National college admission test.",
    "total_time_minutes": 195,
    "total_questions": 215,
    "sections_count": 4,
    "scoring_model": "composite",
    "scoring_metadata": {},
    "content_source": "licensed",
    "content_provenance": {},
    "icon_name": None,
    "is_published": True,
    "is_official_partnership": False,
}

UNPUBLISHED_DRAFT = {
    "id": "00000000-0000-4000-8000-000000000004",
    "slug": "draft-exam",
    "name": "Draft Exam",
    "full_name": "Draft Exam Awaiting Content",
    "category": "state_eoc_assessment",
    "region_state": "NY",
    "region_metro": None,
    "grade_band": "high_school",
    "description": "Should never appear in catalog responses.",
    "total_time_minutes": 60,
    "total_questions": 20,
    "sections_count": 1,
    "scoring_model": "raw",
    "scoring_metadata": {},
    "content_source": "original",
    "content_provenance": {},
    "icon_name": None,
    "is_published": False,  # ← filtered out
    "is_official_partnership": False,
}

REGENTS_SECTIONS = [
    {
        "id": "10000000-0000-4000-8000-000000000001",
        "exam_id": REGENTS_ALG_I["id"],
        "slug": "part-i",
        "name": "Part I — Multiple Choice",
        "display_order": 1,
        "time_minutes": None,
        "total_questions": 24,
        "description": "24 multiple-choice questions.",
    },
    {
        "id": "10000000-0000-4000-8000-000000000002",
        "exam_id": REGENTS_ALG_I["id"],
        "slug": "part-ii",
        "name": "Part II — Constructed Response (2-credit)",
        "display_order": 2,
        "time_minutes": None,
        "total_questions": 8,
        "description": "Short response.",
    },
]

REGENTS_SAMPLE_QUESTION = {
    "id": "20000000-0000-4000-8000-000000000001",
    "exam_id": REGENTS_ALG_I["id"],
    "section_id": REGENTS_SECTIONS[0]["id"],
    "question_type": "multiple_choice",
    "stem": "A line passes through (2, 5) and (4, 11). What is the slope?",
    "choices": [
        {"id": "1", "text": "1/2", "is_correct": False},
        {"id": "2", "text": "2", "is_correct": False},
        {"id": "3", "text": "3", "is_correct": True},
        {"id": "4", "text": "6", "is_correct": False},
    ],
    "difficulty": 2,
    "topic_tags": ["slope", "linear_functions"],
    "display_order": 1,
    "is_published": True,
    "source_type": "original",
}


# ── Helpers ──────────────────────────────────────────────────────────────


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


def _install_fakes(
    monkeypatch,
    *,
    exam_rows: List[Dict[str, Any]] | None = None,
    section_rows: List[Dict[str, Any]] | None = None,
    question_rows: List[Dict[str, Any]] | None = None,
    profile_state: str | None = None,
):
    """Wire a fake admin client into routes.exams and override auth."""
    data_map: Dict[str, List[Dict[str, Any]]] = {
        "exams": exam_rows if exam_rows is not None else [
            REGENTS_ALG_I, STAAR_G8_MATH, ACT_NATIONAL, UNPUBLISHED_DRAFT,
        ],
        "exam_sections": section_rows if section_rows is not None else list(REGENTS_SECTIONS),
        "exam_questions": question_rows if question_rows is not None else [REGENTS_SAMPLE_QUESTION],
        "student_profiles": [
            {"user_id": APP_USER_ID, "state": profile_state}
        ] if profile_state is not None else [],
    }
    fake_admin = FakeAdminClient(data_map)
    monkeypatch.setattr(exams_routes, "_admin_client", lambda: fake_admin)
    app.dependency_overrides[get_app_auth_context] = _override_app_user
    return data_map


# ── Tests: list ──────────────────────────────────────────────────────────


def test_list_returns_published_exams_only(client, monkeypatch):
    _install_fakes(monkeypatch)
    resp = client.get("/api/exams")
    assert resp.status_code == 200
    body = resp.json()

    slugs = {e["slug"] for e in body["exams"]}
    assert "draft-exam" not in slugs, "Unpublished exam should be excluded"
    assert {"ny-regents-algebra-i", "staar-g8-math", "act"}.issubset(slugs)
    assert body["count"] == len(body["exams"])


def test_list_state_filter_keeps_nationals_and_matching_state(client, monkeypatch):
    _install_fakes(monkeypatch)
    resp = client.get("/api/exams?state=NY")
    assert resp.status_code == 200
    body = resp.json()

    slugs = {e["slug"] for e in body["exams"]}
    assert "ny-regents-algebra-i" in slugs  # matching state
    assert "act" in slugs                    # national, always
    assert "staar-g8-math" not in slugs      # TX state, filtered out
    assert body["applied_state_filter"] == "NY"


def test_list_defaults_state_to_profile_state(client, monkeypatch):
    _install_fakes(monkeypatch, profile_state="TX")
    resp = client.get("/api/exams")
    assert resp.status_code == 200
    body = resp.json()

    slugs = {e["slug"] for e in body["exams"]}
    assert "staar-g8-math" in slugs
    assert "act" in slugs
    assert "ny-regents-algebra-i" not in slugs
    assert body["applied_state_filter"] == "TX"


def test_list_no_state_filter_when_neither_query_nor_profile(client, monkeypatch):
    _install_fakes(monkeypatch)  # no profile state, no query param
    resp = client.get("/api/exams")
    body = resp.json()
    assert body["applied_state_filter"] is None
    slugs = {e["slug"] for e in body["exams"]}
    # All published exams (NY, TX, national) should appear when nothing's filtering
    assert {"ny-regents-algebra-i", "staar-g8-math", "act"}.issubset(slugs)


def test_list_grade_band_filter(client, monkeypatch):
    _install_fakes(monkeypatch)
    resp = client.get("/api/exams?grade_band=high_school")
    body = resp.json()
    slugs = {e["slug"] for e in body["exams"]}
    assert slugs == {"ny-regents-algebra-i"}


def test_list_category_filter(client, monkeypatch):
    _install_fakes(monkeypatch)
    resp = client.get("/api/exams?category=national_college_admission")
    body = resp.json()
    slugs = {e["slug"] for e in body["exams"]}
    assert slugs == {"act"}


# ── Tests: detail ────────────────────────────────────────────────────────


def test_detail_returns_exam_with_sections(client, monkeypatch):
    _install_fakes(monkeypatch)
    resp = client.get("/api/exams/ny-regents-algebra-i")
    assert resp.status_code == 200
    body = resp.json()
    exam = body["exam"]
    assert exam["slug"] == "ny-regents-algebra-i"
    assert exam["region_state"] == "NY"
    assert exam["scoring_model"] == "scaled"
    assert len(exam["sections"]) == 2
    assert exam["sections"][0]["slug"] == "part-i"
    assert exam["available_question_count"] == 1


def test_detail_404_for_unknown_slug(client, monkeypatch):
    _install_fakes(monkeypatch)
    resp = client.get("/api/exams/does-not-exist")
    assert resp.status_code == 404


def test_detail_404_for_unpublished_slug(client, monkeypatch):
    _install_fakes(monkeypatch)
    resp = client.get("/api/exams/draft-exam")
    assert resp.status_code == 404


# ── Tests: preview ──────────────────────────────────────────────────────


def test_preview_returns_sample_when_configured(client, monkeypatch):
    _install_fakes(monkeypatch)
    resp = client.get("/api/exams/ny-regents-algebra-i/preview")
    assert resp.status_code == 200
    body = resp.json()
    assert body["sample_question_count"] == 1
    assert len(body["questions"]) == 1
    q = body["questions"][0]
    assert q["question_type"] == "multiple_choice"
    assert q["stem"].startswith("A line passes through")


def test_preview_strips_is_correct_from_choices(client, monkeypatch):
    """REGRESSION: the preview endpoint must NEVER leak the answer key."""
    _install_fakes(monkeypatch)
    resp = client.get("/api/exams/ny-regents-algebra-i/preview")
    body = resp.json()
    for choice in body["questions"][0]["choices"]:
        assert "is_correct" not in choice, (
            "Preview leaked is_correct flag — answer key exposed before submission"
        )
        # Other fields should still be present
        assert "id" in choice and "text" in choice


def test_preview_returns_empty_when_no_free_sample_configured(client, monkeypatch):
    """STAAR seed has no free_sample_question_count → preview returns empty."""
    _install_fakes(monkeypatch)
    resp = client.get("/api/exams/staar-g8-math/preview")
    assert resp.status_code == 200
    body = resp.json()
    assert body["sample_question_count"] == 0
    assert body["questions"] == []


def test_preview_404_for_unknown_slug(client, monkeypatch):
    _install_fakes(monkeypatch)
    resp = client.get("/api/exams/does-not-exist/preview")
    assert resp.status_code == 404
