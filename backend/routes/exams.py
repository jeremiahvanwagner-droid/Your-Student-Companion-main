from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from lib.clerk_auth import AppAuthContext, get_app_auth_context
from lib.supabase_client import SupabaseConfigError, get_supabase_admin_client

router = APIRouter(prefix="/api/exams", tags=["Exams"])


# ── Helpers ──────────────────────────────────────────────────────────────


def _admin_client():
    try:
        return get_supabase_admin_client()
    except SupabaseConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _fetch_user_state(admin_client, user_id: str) -> Optional[str]:
    """Read the current user's `student_profiles.state`, if set."""
    rows = (
        admin_client.table("student_profiles")
        .select("state")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return None
    state = rows[0].get("state")
    if not state or not isinstance(state, str):
        return None
    return state.strip().upper() or None


def _exam_summary(row: Dict[str, Any]) -> Dict[str, Any]:
    """Lightweight exam shape for list endpoints."""
    return {
        "id": str(row.get("id")),
        "slug": row.get("slug"),
        "name": row.get("name"),
        "full_name": row.get("full_name"),
        "category": row.get("category"),
        "region_state": row.get("region_state"),
        "region_metro": row.get("region_metro"),
        "grade_band": row.get("grade_band"),
        "description": row.get("description"),
        "total_time_minutes": row.get("total_time_minutes"),
        "total_questions": row.get("total_questions"),
        "scoring_model": row.get("scoring_model"),
        "icon_name": row.get("icon_name"),
        "is_published": bool(row.get("is_published")),
    }


def _strip_answer_key(choices: Any) -> List[Dict[str, Any]]:
    """Remove `is_correct` from preview choices so the answer key isn't revealed."""
    if not isinstance(choices, list):
        return []
    cleaned: List[Dict[str, Any]] = []
    for choice in choices:
        if not isinstance(choice, dict):
            continue
        cleaned.append({k: v for k, v in choice.items() if k != "is_correct"})
    return cleaned


# ── Routes ───────────────────────────────────────────────────────────────


@router.get("")
def list_exams(
    state: Optional[str] = Query(None, min_length=2, max_length=2),
    grade_band: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    """
    Catalog of published exams.

    Query parameters:
    - `state`: explicit 2-char US state code. When omitted, defaults to the
      caller's `student_profiles.state` if set. National exams
      (`region_state IS NULL`) are always returned regardless of state filter.
    - `grade_band`: exact match (e.g. `high_school`, `grades_6_8`).
    - `category`: exact match (e.g. `state_eoc_assessment`).

    Returns published exams only. Entitlement is NOT enforced here —
    callers see what's available; access to questions/attempts is gated
    in Phase 7.3.
    """
    admin_client = _admin_client()

    effective_state = state.strip().upper() if state else _fetch_user_state(
        admin_client, auth.app_user_id
    )

    rows = (
        admin_client.table("exams")
        .select("*")
        .eq("is_published", True)
        .order("name", desc=False)
        .execute()
        .data
        or []
    )

    filtered: List[Dict[str, Any]] = []
    for row in rows:
        if grade_band and row.get("grade_band") != grade_band:
            continue
        if category and row.get("category") != category:
            continue
        if effective_state:
            region = row.get("region_state")
            # National tests (region_state IS NULL) always pass; state-specific
            # tests must match the active state filter.
            if region is not None and str(region).strip().upper() != effective_state:
                continue
        filtered.append(_exam_summary(row))

    return {
        "exams": filtered,
        "count": len(filtered),
        "applied_state_filter": effective_state,
    }


@router.get("/{slug}")
def get_exam(slug: str, auth: AppAuthContext = Depends(get_app_auth_context)):
    """
    Full exam detail with sections and a count of published questions
    currently available. No question content is returned here — that's
    behind the preview endpoint (sample) or the attempt flow (full set,
    Phase 7.3).
    """
    admin_client = _admin_client()

    exam_rows = (
        admin_client.table("exams")
        .select("*")
        .eq("slug", slug)
        .eq("is_published", True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not exam_rows:
        raise HTTPException(
            status_code=404,
            detail=f"Exam '{slug}' not found or not published",
        )
    exam = exam_rows[0]

    section_rows = (
        admin_client.table("exam_sections")
        .select("*")
        .eq("exam_id", exam["id"])
        .order("display_order", desc=False)
        .execute()
        .data
        or []
    )

    published_question_rows = (
        admin_client.table("exam_questions")
        .select("id")
        .eq("exam_id", exam["id"])
        .eq("is_published", True)
        .execute()
        .data
        or []
    )

    summary = _exam_summary(exam)
    return {
        "exam": {
            **summary,
            "sections_count": exam.get("sections_count") or len(section_rows),
            "scoring_metadata": exam.get("scoring_metadata") or {},
            "content_source": exam.get("content_source"),
            "is_official_partnership": bool(exam.get("is_official_partnership")),
            "available_question_count": len(published_question_rows),
            "sections": [
                {
                    "id": str(section.get("id")),
                    "slug": section.get("slug"),
                    "name": section.get("name"),
                    "display_order": section.get("display_order") or 0,
                    "time_minutes": section.get("time_minutes"),
                    "total_questions": section.get("total_questions"),
                    "description": section.get("description"),
                }
                for section in section_rows
            ],
        }
    }


@router.get("/{slug}/preview")
def preview_exam(slug: str, auth: AppAuthContext = Depends(get_app_auth_context)):
    """
    Free sample questions for an exam.

    The number of returned questions is governed by
    `exams.scoring_metadata.free_sample_question_count`. When that key is
    missing, null, or `0`, this endpoint returns an empty list — exams
    remain fully gated by default and content teams opt into a free
    preview per exam.

    Returned choices have the `is_correct` flag stripped so this endpoint
    never leaks the answer key. The full answer + explanation is returned
    only after a submitted attempt (Phase 7.3).
    """
    admin_client = _admin_client()

    exam_rows = (
        admin_client.table("exams")
        .select("id,slug,scoring_metadata")
        .eq("slug", slug)
        .eq("is_published", True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not exam_rows:
        raise HTTPException(
            status_code=404,
            detail=f"Exam '{slug}' not found or not published",
        )
    exam = exam_rows[0]

    metadata = exam.get("scoring_metadata") or {}
    try:
        sample_count = int(metadata.get("free_sample_question_count") or 0)
    except (TypeError, ValueError):
        sample_count = 0

    if sample_count <= 0:
        return {
            "exam_slug": slug,
            "sample_question_count": 0,
            "questions": [],
        }

    question_rows = (
        admin_client.table("exam_questions")
        .select("*")
        .eq("exam_id", exam["id"])
        .eq("is_published", True)
        .order("display_order", desc=False)
        .limit(sample_count)
        .execute()
        .data
        or []
    )

    return {
        "exam_slug": slug,
        "sample_question_count": len(question_rows),
        "questions": [
            {
                "id": str(question.get("id")),
                "question_type": question.get("question_type"),
                "stem": question.get("stem"),
                "section_id": str(question["section_id"]) if question.get("section_id") else None,
                "difficulty": question.get("difficulty") or 3,
                "topic_tags": question.get("topic_tags") or [],
                "choices": _strip_answer_key(question.get("choices")),
            }
            for question in question_rows
        ],
    }
