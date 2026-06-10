from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from lib.audit import write_audit_log
from lib.clerk_auth import AppAuthContext, get_app_auth_context
from lib.supabase_client import SupabaseConfigError, get_supabase_admin_client

router = APIRouter(prefix="/api/notes", tags=["Notes"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class NoteCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    content: Optional[str] = Field(default=None, max_length=50000)
    subject_id: Optional[str] = None
    tags: List[str] = Field(default_factory=list, max_length=20)


class NoteUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=300)
    content: Optional[str] = Field(default=None, max_length=50000)
    subject_id: Optional[str] = None
    tags: Optional[List[str]] = Field(default=None, max_length=20)
    is_archived: Optional[bool] = None


class CardCreate(BaseModel):
    front_text: str = Field(..., min_length=1, max_length=1000)
    back_text: str = Field(..., min_length=1, max_length=2000)
    note_id: Optional[str] = None


class CardReview(BaseModel):
    rating: str = Field(..., pattern=r"^(again|hard|good|easy)$")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _admin_client():
    try:
        return get_supabase_admin_client()
    except SupabaseConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _parse_uuid(value: str, field_name: str) -> str:
    try:
        return str(UUID(str(value).strip()))
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=422, detail=f"Invalid {field_name} format. Expected UUID."
        ) from exc


def _ensure_owner(row: Optional[Dict[str, Any]], user_id: str, label: str) -> Dict[str, Any]:
    if not row:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    if str(row.get("user_id")) != user_id:
        raise HTTPException(status_code=403, detail="Forbidden: user scope mismatch")
    return row


def _normalize_tags(tags: List[str]) -> List[str]:
    seen: List[str] = []
    for raw in tags:
        tag = str(raw).strip().lower()[:50]
        if tag and tag not in seen:
            seen.append(tag)
    return seen


def _sanitize_search_term(term: str) -> str:
    # PostgREST `or=` filter syntax treats commas/parens as separators; strip
    # them so user input can't break out of the ilike pattern.
    cleaned = term.replace(",", " ").replace("(", " ").replace(")", " ")
    return " ".join(cleaned.split())[:200]


NOTE_COLUMNS = "id,user_id,subject_id,title,content,tags,is_archived,created_at,updated_at"
CARD_COLUMNS = (
    "id,user_id,note_id,front_text,back_text,difficulty,"
    "next_review_at,review_count,ease_factor,interval_days,created_at"
)

# SM-2 (SuperMemo-2) scheduling. Ratings map onto SM-2 quality scores:
# again=2 (lapse), hard=3, good=4, easy=5. Quality < 3 resets the interval
# and re-queues the card in 10 minutes; otherwise intervals run 1 day,
# 6 days, then interval*ease_factor. Ease factor never drops below 1.3.
SM2_QUALITY = {"again": 2, "hard": 3, "good": 4, "easy": 5}
SM2_MIN_EASE = 1.3
SM2_LAPSE_REQUEUE = timedelta(minutes=10)


def apply_sm2(rating: str, ease_factor: float, interval_days: int) -> tuple[float, int]:
    """Return the next (ease_factor, interval_days) per SM-2."""
    quality = SM2_QUALITY[rating]

    next_ease = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    next_ease = max(round(next_ease, 2), SM2_MIN_EASE)

    if quality < 3:
        return next_ease, 0
    if interval_days <= 0:
        return next_ease, 1
    if interval_days == 1:
        return next_ease, 6
    return next_ease, max(1, round(interval_days * next_ease))


# ---------------------------------------------------------------------------
# Review cards (declared before /{note_id} so "cards" never matches as an id)
# ---------------------------------------------------------------------------

@router.get("/cards")
async def list_cards(
    note_id: Optional[str] = Query(default=None),
    due_only: bool = Query(default=False),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()

    query = (
        admin.table("review_cards")
        .select(CARD_COLUMNS)
        .eq("user_id", auth.app_user_id)
    )
    if note_id:
        query = query.eq("note_id", _parse_uuid(note_id, "note_id"))

    if due_only:
        # Filter in the query, not in Python, so due cards beyond the first
        # page are never hidden by pagination. Never-reviewed cards (null
        # next_review_at) count as due; most-overdue cards surface first.
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        query = query.or_(
            f"next_review_at.is.null,next_review_at.lte.{now_iso}"
        ).order("next_review_at", desc=False, nullsfirst=True)
    else:
        query = query.order("created_at", desc=True)

    rows = query.range(offset, offset + limit - 1).execute().data or []
    return {"cards": rows, "count": len(rows)}


@router.post("/cards", status_code=201)
async def create_card(
    body: CardCreate,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()

    payload: Dict[str, Any] = {
        "user_id": auth.app_user_id,
        "front_text": body.front_text.strip(),
        "back_text": body.back_text.strip(),
    }

    if body.note_id:
        note_uuid = _parse_uuid(body.note_id, "note_id")
        note_rows = (
            admin.table("notes")
            .select("id,user_id")
            .eq("id", note_uuid)
            .limit(1)
            .execute()
            .data
            or []
        )
        _ensure_owner(note_rows[0] if note_rows else None, auth.app_user_id, "Note")
        payload["note_id"] = note_uuid

    result = admin.table("review_cards").insert(payload).execute()
    card = (result.data or [{}])[0]

    write_audit_log(
        admin,
        actor_id=auth.app_user_id,
        action="review_card.create",
        entity_type="review_card",
        entity_id=card.get("id"),
    )

    return {"card": card}


@router.post("/cards/{card_id}/review")
async def review_card(
    card_id: str,
    body: CardReview,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()
    card_uuid = _parse_uuid(card_id, "card_id")

    rows = (
        admin.table("review_cards")
        .select("id,user_id,difficulty,review_count,ease_factor,interval_days")
        .eq("id", card_uuid)
        .limit(1)
        .execute()
        .data
        or []
    )
    existing = _ensure_owner(rows[0] if rows else None, auth.app_user_id, "Card")

    review_count = int(existing.get("review_count") or 0)
    difficulty = int(existing.get("difficulty") or 3)
    ease_factor = float(existing.get("ease_factor") or 2.5)
    interval_days = int(existing.get("interval_days") or 0)

    # difficulty stays a 1-5 UI hint alongside the SM-2 state
    if body.rating == "again":
        difficulty = min(difficulty + 1, 5)
    elif body.rating == "easy":
        difficulty = max(difficulty - 1, 1)

    next_ease, next_interval = apply_sm2(body.rating, ease_factor, interval_days)

    if next_interval == 0:
        next_review_at = datetime.now(timezone.utc) + SM2_LAPSE_REQUEUE
    else:
        next_review_at = datetime.now(timezone.utc) + timedelta(days=next_interval)

    result = (
        admin.table("review_cards")
        .update(
            {
                "difficulty": difficulty,
                "review_count": review_count + 1,
                "ease_factor": next_ease,
                "interval_days": next_interval,
                "next_review_at": next_review_at.isoformat(),
            }
        )
        .eq("id", card_uuid)
        .execute()
    )
    card = (result.data or [{}])[0]

    return {"card": card}


@router.delete("/cards/{card_id}", status_code=204)
async def delete_card(
    card_id: str,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()
    card_uuid = _parse_uuid(card_id, "card_id")

    rows = (
        admin.table("review_cards")
        .select("id,user_id")
        .eq("id", card_uuid)
        .limit(1)
        .execute()
        .data
        or []
    )
    _ensure_owner(rows[0] if rows else None, auth.app_user_id, "Card")

    admin.table("review_cards").delete().eq("id", card_uuid).execute()

    write_audit_log(
        admin,
        actor_id=auth.app_user_id,
        action="review_card.delete",
        entity_type="review_card",
        entity_id=card_uuid,
    )


# ---------------------------------------------------------------------------
# Notes CRUD
# ---------------------------------------------------------------------------

@router.get("")
async def list_notes(
    q: Optional[str] = Query(default=None, max_length=200),
    tag: Optional[str] = Query(default=None, max_length=50),
    subject_id: Optional[str] = Query(default=None),
    include_archived: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()

    query = (
        admin.table("notes")
        .select(NOTE_COLUMNS)
        .eq("user_id", auth.app_user_id)
        .order("updated_at", desc=True)
        .range(offset, offset + limit - 1)
    )

    if not include_archived:
        query = query.eq("is_archived", False)

    if subject_id:
        query = query.eq("subject_id", _parse_uuid(subject_id, "subject_id"))

    if tag:
        query = query.contains("tags", [tag.strip().lower()])

    if q:
        term = _sanitize_search_term(q)
        if term:
            query = query.or_(f"title.ilike.%{term}%,content.ilike.%{term}%")

    rows = query.execute().data or []
    return {"notes": rows, "count": len(rows)}


@router.post("", status_code=201)
async def create_note(
    body: NoteCreate,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()

    payload: Dict[str, Any] = {
        "user_id": auth.app_user_id,
        "title": body.title.strip(),
        "tags": _normalize_tags(body.tags),
    }
    if body.content is not None:
        payload["content"] = body.content
    if body.subject_id:
        payload["subject_id"] = _parse_uuid(body.subject_id, "subject_id")

    result = admin.table("notes").insert(payload).execute()
    note = (result.data or [{}])[0]

    write_audit_log(
        admin,
        actor_id=auth.app_user_id,
        action="note.create",
        entity_type="note",
        entity_id=note.get("id"),
    )

    return {"note": note}


@router.get("/{note_id}")
async def get_note(
    note_id: str,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()
    note_uuid = _parse_uuid(note_id, "note_id")

    rows = (
        admin.table("notes")
        .select(NOTE_COLUMNS)
        .eq("id", note_uuid)
        .limit(1)
        .execute()
        .data
        or []
    )
    note = _ensure_owner(rows[0] if rows else None, auth.app_user_id, "Note")
    return {"note": note}


@router.put("/{note_id}")
async def update_note(
    note_id: str,
    body: NoteUpdate,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()
    note_uuid = _parse_uuid(note_id, "note_id")

    rows = (
        admin.table("notes")
        .select("id,user_id")
        .eq("id", note_uuid)
        .limit(1)
        .execute()
        .data
        or []
    )
    _ensure_owner(rows[0] if rows else None, auth.app_user_id, "Note")

    updates: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if body.title is not None:
        updates["title"] = body.title.strip()
    if body.content is not None:
        updates["content"] = body.content
    if body.subject_id is not None:
        updates["subject_id"] = (
            _parse_uuid(body.subject_id, "subject_id") if body.subject_id else None
        )
    if body.tags is not None:
        updates["tags"] = _normalize_tags(body.tags)
    if body.is_archived is not None:
        updates["is_archived"] = body.is_archived

    result = admin.table("notes").update(updates).eq("id", note_uuid).execute()
    note = (result.data or [{}])[0]

    write_audit_log(
        admin,
        actor_id=auth.app_user_id,
        action="note.update",
        entity_type="note",
        entity_id=note_uuid,
    )

    return {"note": note}


@router.delete("/{note_id}", status_code=204)
async def delete_note(
    note_id: str,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    admin = _admin_client()
    note_uuid = _parse_uuid(note_id, "note_id")

    rows = (
        admin.table("notes")
        .select("id,user_id")
        .eq("id", note_uuid)
        .limit(1)
        .execute()
        .data
        or []
    )
    _ensure_owner(rows[0] if rows else None, auth.app_user_id, "Note")

    admin.table("notes").delete().eq("id", note_uuid).execute()

    write_audit_log(
        admin,
        actor_id=auth.app_user_id,
        action="note.delete",
        entity_type="note",
        entity_id=note_uuid,
    )
