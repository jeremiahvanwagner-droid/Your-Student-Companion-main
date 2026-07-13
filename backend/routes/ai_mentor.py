import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

import requests
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from lib.clerk_auth import AppAuthContext, get_app_auth_context
from lib.rate_limit import limiter
from lib.supabase_client import SupabaseConfigError, get_supabase_admin_client

router = APIRouter(prefix="/api/ai", tags=["AI Mentor"])

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

# Per-user daily OpenAI spend ceiling (Market Thirteen #7). Counted from
# ai_interactions.tokens_used since midnight UTC; <= 0 disables the check.
AI_DAILY_TOKEN_BUDGET = int(os.environ.get("AI_DAILY_TOKEN_BUDGET", "50000"))
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY")
OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"

BASE_SYSTEM_PROMPT = (
    "You are The Mentor for Your Student Companion (YSC), a supportive study coach. "
    "Use clear, practical language at about an 8th-9th grade reading level. "
    "Give short, actionable steps, examples, and checks for understanding. "
    "Never help with cheating, plagiarism, or bypassing school policies. "
    "If asked to cheat, refuse briefly and offer a safe alternative."
)

FREE_TIER_CONTEXT = (
    "This student is on the free tier. You can still provide useful general study support, "
    "time management guidance, and concept explanations without paid specialization."
)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    conversation_history: Optional[List[ChatMessage]] = []
    unlocked_packs: Optional[List[str]] = []
    user_id: Optional[str] = None
    voice_enabled: Optional[bool] = False


class ChatResponse(BaseModel):
    message: str
    audio_url: Optional[str] = None
    tokens_used: Optional[int] = None


class VoiceRequest(BaseModel):
    text: str
    voice_id: Optional[str] = "default"
    speed: Optional[float] = 1.0


class VoiceResponse(BaseModel):
    audio_url: str
    duration: Optional[float] = None


# Legacy fallback context map retained for compatibility when pack slugs are sent from client.
PACK_CONTEXTS = {
    "nursing": {
        "name": "Nursing",
        "system_prompt": "Focus on nursing terminology, pharmacology, patient safety, and care planning.",
    },
    "psych101": {
        "name": "Psychology 101",
        "system_prompt": "Focus on introductory psychology theories, methods, and practical examples.",
    },
    "business-law": {
        "name": "Business Law",
        "system_prompt": "Focus on legal terms, contracts, compliance, and applied business-law scenarios.",
    },
    "pre-med": {
        "name": "Pre-Med",
        "system_prompt": "Focus on pre-med foundations, anatomy, biochemistry, and MCAT-aligned reasoning.",
    },
    "stem": {
        "name": "STEM Foundations",
        "system_prompt": "Focus on STEM fundamentals with worked problem-solving steps.",
    },
}


def _admin_client():
    try:
        return get_supabase_admin_client()
    except SupabaseConfigError:
        return None


def _is_uuid(value: Optional[str]) -> bool:
    if not value:
        return False
    try:
        UUID(value)
        return True
    except (ValueError, TypeError):
        return False


def _safe_trim(text: Optional[str]) -> str:
    return (text or "").strip()


def _normalize_history(history: Optional[List[ChatMessage]], max_messages: int = 12) -> List[Dict[str, str]]:
    if not history:
        return []

    normalized: List[Dict[str, str]] = []
    for message in history[-max_messages:]:
        role = (message.role or "").strip().lower()
        content = _safe_trim(message.content)

        if role not in {"user", "assistant"} or not content:
            continue

        normalized.append({"role": role, "content": content})

    return normalized


def _fetch_catalog_maps(admin_client) -> tuple[Dict[str, Any], Dict[str, Any]]:
    degree_map: Dict[str, Any] = {}
    level_map: Dict[str, Any] = {}

    try:
        degrees = (
            admin_client.table("degree_plans")
            .select("id,name,slug,category")
            .execute()
            .data
            or []
        )
        levels = (
            admin_client.table("academic_levels")
            .select("id,name,slug,display_order")
            .execute()
            .data
            or []
        )

        degree_map = {str(row.get("id")): row for row in degrees}
        level_map = {str(row.get("id")): row for row in levels}
    except Exception:
        degree_map = {}
        level_map = {}

    return degree_map, level_map


def _fetch_purchased_pack_contexts(user_id: Optional[str]) -> List[Dict[str, Any]]:
    if not user_id:
        return []

    admin_client = _admin_client()
    if admin_client is None:
        return []

    try:
        purchase_rows = (
            admin_client.table("user_purchases")
            .select("course_pack_id,status")
            .eq("user_id", user_id)
            .eq("status", "completed")
            .execute()
            .data
            or []
        )
    except Exception:
        return []

    pack_ids = sorted(
        {
            str(row.get("course_pack_id"))
            for row in purchase_rows
            if row.get("course_pack_id") is not None
        }
    )
    if not pack_ids:
        return []

    pack_rows: List[Dict[str, Any]] = []
    try:
        pack_rows = (
            admin_client.table("course_packs")
            .select("id,name,slug,description,degree_plan_id,academic_level_id")
            .in_("id", pack_ids)
            .execute()
            .data
            or []
        )
    except Exception:
        numeric_ids = [int(pack_id) for pack_id in pack_ids if str(pack_id).isdigit()]
        if numeric_ids:
            try:
                pack_rows = (
                    admin_client.table("course_packs")
                    .select("id,name,slug,description,degree_plan_id,academic_level_id")
                    .in_("id", numeric_ids)
                    .execute()
                    .data
                    or []
                )
            except Exception:
                pack_rows = []

    if not pack_rows:
        return []

    degree_map, level_map = _fetch_catalog_maps(admin_client)

    enriched: List[Dict[str, Any]] = []
    for row in pack_rows:
        degree = degree_map.get(str(row.get("degree_plan_id")))
        level = level_map.get(str(row.get("academic_level_id")))

        enriched.append(
            {
                "id": str(row.get("id")),
                "slug": row.get("slug"),
                "name": row.get("name"),
                "description": row.get("description"),
                "degree_plan": degree,
                "academic_level": level,
            }
        )

    return enriched


def _build_pack_context_text(packs: List[Dict[str, Any]], fallback_ids: List[str]) -> str:
    if packs:
        lines = []
        for pack in packs:
            degree_name = ((pack.get("degree_plan") or {}).get("name") or "General")
            level_name = ((pack.get("academic_level") or {}).get("name") or "Unspecified level")
            pack_name = pack.get("name") or pack.get("slug") or "Unknown pack"
            lines.append(f"- {pack_name} ({degree_name}, {level_name})")

        return (
            "The student has unlocked these course packs. Prioritize these contexts when relevant:\n"
            + "\n".join(lines)
        )

    if not fallback_ids:
        return FREE_TIER_CONTEXT

    fallback_lines = []
    for pack_id in fallback_ids:
        pack_context = PACK_CONTEXTS.get(pack_id)
        if pack_context:
            fallback_lines.append(f"- {pack_context['name']}: {pack_context['system_prompt']}")
        else:
            fallback_lines.append(f"- Purchased pack id: {pack_id}")

    return (
        "Client supplied unlocked packs; use them as soft context when relevant:\n"
        + "\n".join(fallback_lines)
    )


def _call_openai(messages: List[Dict[str, str]]) -> tuple[str, Optional[int]]:
    if not OPENAI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="AI chat is not configured. Missing OPENAI_API_KEY.",
        )

    try:
        response = requests.post(
            OPENAI_CHAT_URL,
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": OPENAI_MODEL,
                "messages": messages,
                "temperature": 0.4,
            },
            timeout=45,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"OpenAI request failed: {exc}") from exc

    if response.status_code >= 400:
        detail = "OpenAI request failed."
        try:
            payload = response.json()
            detail = (payload.get("error") or {}).get("message") or detail
        except ValueError:
            detail = response.text or detail

        raise HTTPException(status_code=502, detail=f"OpenAI error: {detail}")

    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise HTTPException(status_code=502, detail="OpenAI returned no choices.")

    message_payload = choices[0].get("message") or {}
    content = message_payload.get("content")
    if isinstance(content, list):
        text = "".join(
            part.get("text", "") for part in content if isinstance(part, dict)
        ).strip()
    else:
        text = _safe_trim(content)

    if not text:
        raise HTTPException(status_code=502, detail="OpenAI returned an empty message.")

    tokens_used = (data.get("usage") or {}).get("total_tokens")
    return text, tokens_used


def _fallback_response(user_message: str, has_unlocked_context: bool) -> str:
    starter = (
        "I can help with that. "
        if has_unlocked_context
        else "I can still help on the free tier. "
    )

    return (
        f"{starter}Here is a quick study plan for your question: '{user_message}'. "
        "1) Restate the task in one sentence. "
        "2) Break it into 3 short steps. "
        "3) Do a 25-minute focus block and write what you still do not understand. "
        "Share your draft answer and I will help you improve it."
    )


def _persist_ai_interaction(
    user_id: Optional[str],
    pack_id: Optional[str],
    prompt: str,
    response: str,
    tokens_used: Optional[int],
) -> None:
    if not _is_uuid(user_id):
        return

    admin_client = _admin_client()
    if admin_client is None:
        return

    try:
        admin_client.table("ai_interactions").insert(
            {
                "user_id": user_id,
                "course_pack_id": pack_id,
                "prompt": prompt,
                "response": response,
                "tokens_used": tokens_used,
                "context_metadata": {},
            }
        ).execute()
    except Exception:
        # Best-effort logging; avoid failing user chat on analytics persistence.
        return


def _tokens_used_today(user_id: str) -> int:
    """
    Sum tokens_used across the user's ai_interactions since midnight UTC.
    Fail-open (return 0) on any lookup problem — a tutoring app should not
    hard-down chat because the analytics query hiccuped.
    """
    if not _is_uuid(user_id):
        return 0

    admin_client = _admin_client()
    if admin_client is None:
        return 0

    day_start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    try:
        rows = (
            admin_client.table("ai_interactions")
            .select("tokens_used")
            .eq("user_id", user_id)
            .gte("created_at", day_start.isoformat())
            .execute()
            .data
            or []
        )
    except Exception:
        return 0

    return sum(int(row.get("tokens_used") or 0) for row in rows)


@router.post("/chat", response_model=ChatResponse)
@limiter.limit("10/minute")
async def chat_with_mentor(
    request: Request,
    chat_request: ChatRequest,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    user_message = _safe_trim(chat_request.message)
    if not user_message:
        raise HTTPException(status_code=422, detail="message is required")

    # Use the authenticated user's app_user_id, ignoring any client-supplied user_id.
    authenticated_user_id = auth.app_user_id

    history = _normalize_history(chat_request.conversation_history)

    supplied_pack_ids = [
        str(pack_id).strip()
        for pack_id in (chat_request.unlocked_packs or [])
        if str(pack_id).strip()
    ]

    purchased_pack_contexts = _fetch_purchased_pack_contexts(authenticated_user_id)
    pack_context_text = _build_pack_context_text(
        purchased_pack_contexts,
        supplied_pack_ids,
    )

    messages: List[Dict[str, str]] = [
        {
            "role": "system",
            "content": f"{BASE_SYSTEM_PROMPT}\n\n{pack_context_text}",
        },
        *history,
        {"role": "user", "content": user_message},
    ]

    if not OPENAI_API_KEY:
        message = _fallback_response(
            user_message=user_message,
            has_unlocked_context=bool(purchased_pack_contexts or supplied_pack_ids),
        )
        return ChatResponse(message=message, audio_url=None, tokens_used=0)

    # Budget gate sits after the free fallback path — only metered OpenAI
    # calls count against the daily ceiling.
    if AI_DAILY_TOKEN_BUDGET > 0:
        used_today = _tokens_used_today(authenticated_user_id)
        if used_today >= AI_DAILY_TOKEN_BUDGET:
            raise HTTPException(
                status_code=429,
                detail=(
                    "You've reached today's AI mentor limit. It resets at "
                    "midnight UTC — a great time to review your notes or "
                    "run a focus session."
                ),
            )

    ai_message, tokens_used = _call_openai(messages)

    first_pack_id = None
    if purchased_pack_contexts:
        first_pack_id = purchased_pack_contexts[0].get("id")
    elif supplied_pack_ids:
        first_pack_id = supplied_pack_ids[0]

    _persist_ai_interaction(
        user_id=authenticated_user_id,
        pack_id=first_pack_id,
        prompt=user_message,
        response=ai_message,
        tokens_used=tokens_used,
    )

    return ChatResponse(message=ai_message, audio_url=None, tokens_used=tokens_used)


class VoiceTranscriptMessage(BaseModel):
    role: str
    content: str
    timestamp: Optional[str] = None


class VoiceTranscriptRequest(BaseModel):
    messages: List[VoiceTranscriptMessage]
    conversation_id: Optional[str] = None


@router.post("/voice/transcript", status_code=201)
@limiter.limit("20/minute")
async def save_voice_transcript(
    request: Request,
    body: VoiceTranscriptRequest,
    auth: AppAuthContext = Depends(get_app_auth_context),
):
    if not body.messages:
        return {"saved": 0}

    user_turns = [m.content for m in body.messages if (m.role or "").lower() == "user"]
    assistant_turns = [m.content for m in body.messages if (m.role or "").lower() == "assistant"]

    prompt_summary = " | ".join(user_turns[:5]) or "(voice session)"
    response_summary = " | ".join(assistant_turns[:5]) or "(no response recorded)"

    _persist_ai_interaction(
        user_id=auth.app_user_id,
        pack_id=None,
        prompt=prompt_summary[:2000],
        response=response_summary[:2000],
        tokens_used=None,
    )

    return {"saved": len(body.messages)}


@router.post("/voice/synthesize", response_model=VoiceResponse)
async def synthesize_voice(request: VoiceRequest):
    if not ELEVENLABS_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Voice synthesis not configured. ElevenLabs API key required.",
        )

    return VoiceResponse(audio_url="/api/ai/audio/placeholder.mp3", duration=0)


@router.get("/voice/voices")
async def list_available_voices():
    return {
        "voices": [
            {"id": "default", "name": "Default", "preview_url": None},
            {"id": "professional", "name": "Professional", "preview_url": None},
            {"id": "friendly", "name": "Friendly", "preview_url": None},
        ],
        "provider": "placeholder",
        "note": "Voice synthesis will be powered by ElevenLabs",
    }


@router.get("/status")
async def get_ai_status():
    return {
        "status": "operational",
        "features": {
            "chat": {
                "available": True,
                "provider": "openai" if OPENAI_API_KEY else "fallback",
                "model": OPENAI_MODEL if OPENAI_API_KEY else None,
            },
            "voice_input": {
                "available": False,
                "provider": "pending",
                "note": "Speech-to-text via OpenAI Whisper",
            },
            "voice_output": {
                "available": ELEVENLABS_API_KEY is not None,
                "provider": "elevenlabs" if ELEVENLABS_API_KEY else "not_configured",
                "note": "Text-to-speech via ElevenLabs",
            },
        },
        "unlocked_packs_specialize_responses": True,
        "free_tier_general_chat": True,
    }


@router.get("/packs")
async def get_available_packs():
    packs = []
    for pack_id, context in PACK_CONTEXTS.items():
        packs.append({"id": pack_id, "name": context["name"]})

    return {"packs": packs}
