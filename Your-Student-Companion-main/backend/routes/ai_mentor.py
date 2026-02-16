from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import os

router = APIRouter(prefix="/api/ai", tags=["AI Mentor"])

# Environment variables for future API integration
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY")


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    conversation_history: Optional[List[ChatMessage]] = []
    unlocked_packs: Optional[List[str]] = []
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


# Course pack context for AI specialization
PACK_CONTEXTS = {
    "nursing": {
        "name": "Nursing",
        "system_prompt": "You are a specialized nursing tutor. Focus on medical terminology, pharmacology, patient care procedures, and nursing best practices.",
        "keywords": ["medical", "nursing", "pharmacology", "patient care", "anatomy"]
    },
    "psych101": {
        "name": "Psychology 101",
        "system_prompt": "You are a psychology tutor specializing in introductory psychology. Cover theories, research methods, cognitive processes, and behavioral studies.",
        "keywords": ["psychology", "behavior", "cognitive", "mental", "therapy"]
    },
    "business-law": {
        "name": "Business Law",
        "system_prompt": "You are a business law tutor. Focus on contract law, corporate regulations, legal terminology, and case precedents.",
        "keywords": ["law", "contract", "corporate", "legal", "regulation"]
    },
    "pre-med": {
        "name": "Pre-Med",
        "system_prompt": "You are a pre-medical tutor. Focus on MCAT preparation, anatomy, biochemistry, and medical school requirements.",
        "keywords": ["MCAT", "anatomy", "biochemistry", "medical", "biology"]
    },
    "stem": {
        "name": "STEM Foundations",
        "system_prompt": "You are a STEM tutor covering physics, chemistry, and advanced mathematics for engineering students.",
        "keywords": ["physics", "chemistry", "math", "engineering", "calculus"]
    }
}


def build_system_prompt(unlocked_packs: List[str]) -> str:
    """
    Build a combined system prompt based on unlocked course packs.
    """
    if not unlocked_packs:
        return "You are The Mentor, an AI study companion. The user has not unlocked any course packs yet."
    
    pack_prompts = []
    for pack_id in unlocked_packs:
        if pack_id in PACK_CONTEXTS:
            pack_prompts.append(PACK_CONTEXTS[pack_id]["system_prompt"])
    
    if not pack_prompts:
        return "You are The Mentor, an AI study companion."
    
    base_prompt = "You are The Mentor, a specialized AI study companion. "
    if len(pack_prompts) == 1:
        return base_prompt + pack_prompts[0]
    else:
        return base_prompt + "You have expertise in multiple areas: " + " ".join(pack_prompts)


@router.post("/chat", response_model=ChatResponse)
async def chat_with_mentor(request: ChatRequest):
    """
    Chat endpoint for The Mentor AI.
    
    Currently returns placeholder responses.
    Will be integrated with OpenAI Realtime API for voice conversations.
    """
    # Check if user has unlocked any packs
    if not request.unlocked_packs:
        return ChatResponse(
            message="I am your specialized AI Agent. Unlock a Course Pack to activate my voice.",
            audio_url=None,
            tokens_used=0
        )
    
    # Build context-aware response (placeholder)
    system_prompt = build_system_prompt(request.unlocked_packs)
    
    # TODO: Integrate with OpenAI Realtime API
    # For now, return a contextual placeholder response
    pack_names = [PACK_CONTEXTS.get(p, {}).get("name", p) for p in request.unlocked_packs]
    
    placeholder_response = (
        f"I am The Mentor, your AI tutor specialized in {', '.join(pack_names)}. "
        f"This is a demo response. Once integrated with OpenAI Realtime API, "
        f"I will provide intelligent, voice-enabled tutoring for your studies. "
        f"Your question was: '{request.message}'"
    )
    
    return ChatResponse(
        message=placeholder_response,
        audio_url=None,
        tokens_used=0
    )


@router.post("/voice/synthesize", response_model=VoiceResponse)
async def synthesize_voice(request: VoiceRequest):
    """
    Voice synthesis endpoint for The Mentor.
    
    Will be integrated with ElevenLabs for text-to-speech.
    Currently returns a placeholder.
    """
    # Check if ElevenLabs API key is configured
    if not ELEVENLABS_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Voice synthesis not configured. ElevenLabs API key required."
        )
    
    # TODO: Integrate with ElevenLabs API
    # Example integration:
    # response = await elevenlabs_client.synthesize(
    #     text=request.text,
    #     voice_id=request.voice_id,
    #     speed=request.speed
    # )
    
    return VoiceResponse(
        audio_url="/api/ai/audio/placeholder.mp3",
        duration=0
    )


@router.get("/voice/voices")
async def list_available_voices():
    """
    List available voices for TTS.
    Will return ElevenLabs voices when integrated.
    """
    return {
        "voices": [
            {"id": "default", "name": "Default", "preview_url": None},
            {"id": "professional", "name": "Professional", "preview_url": None},
            {"id": "friendly", "name": "Friendly", "preview_url": None}
        ],
        "provider": "placeholder",
        "note": "Voice synthesis will be powered by ElevenLabs"
    }


@router.get("/status")
async def get_ai_status():
    """
    Check AI service status and available features.
    """
    return {
        "status": "operational",
        "features": {
            "chat": {
                "available": True,
                "provider": "placeholder",
                "note": "Will use OpenAI Realtime API"
            },
            "voice_input": {
                "available": False,
                "provider": "pending",
                "note": "Speech-to-text via OpenAI Whisper"
            },
            "voice_output": {
                "available": ELEVENLABS_API_KEY is not None,
                "provider": "elevenlabs" if ELEVENLABS_API_KEY else "not_configured",
                "note": "Text-to-speech via ElevenLabs"
            }
        },
        "unlocked_packs_required": True
    }


@router.get("/packs")
async def get_available_packs():
    """
    Get list of available course packs with their AI contexts.
    """
    packs = []
    for pack_id, context in PACK_CONTEXTS.items():
        packs.append({
            "id": pack_id,
            "name": context["name"],
            "keywords": context["keywords"]
        })
    return {"packs": packs}
