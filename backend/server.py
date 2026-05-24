import logging
import os
import sys

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pythonjsonlogger import jsonlogger
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from lib.rate_limit import limiter
from lib.request_id import RequestIdMiddleware
from lib.sentry_init import init_sentry


def _configure_structured_logging() -> None:
    """
    Switch the root logger to JSON output so log shippers (Vercel function
    logs, Render syslog, etc.) can ingest the records directly into a
    search index. Idempotent — repeated calls replace the existing handler.
    """
    log_level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    log_level = getattr(logging, log_level_name, logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    formatter = jsonlogger.JsonFormatter(
        "%(asctime)s %(levelname)s %(name)s %(message)s",
        rename_fields={"asctime": "ts", "levelname": "level"},
    )
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(log_level)


# Initialize observability *before* the FastAPI app is constructed so the
# Sentry integrations (FastApi + Starlette) hook in cleanly and the first
# import-time exception is captured.
_configure_structured_logging()
init_sentry()


def _allowed_origins() -> list[str]:
    raw = os.getenv("CORS_ALLOWED_ORIGINS") or os.getenv("FRONTEND_BASE_URL")
    if not raw:
        return ["http://localhost:3000"]

    origins = [item.strip() for item in raw.split(",") if item.strip()]
    return origins or ["http://localhost:3000"]


app = FastAPI(
    title="Student Companion API",
    description="Backend API for Your Student Companion PWA",
    version="1.0.0",
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Per-request id middleware. Registered before CORS so the id is available
# on preflight responses too — and so Sentry events captured anywhere
# downstream already carry the request_id tag.
app.add_middleware(RequestIdMiddleware)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With", "Accept", "Origin"],
    expose_headers=["X-Request-ID"],
)

# Import and include routers
from routes.ai_mentor import router as ai_mentor_router
from routes.store import router as store_router
from routes.webhooks import router as webhooks_router
from routes.users import router as users_router
from routes.tasks import router as tasks_router
from routes.subjects import router as subjects_router
from routes.focus import router as focus_router
from routes.exams import router as exams_router

app.include_router(ai_mentor_router)
app.include_router(store_router)
app.include_router(webhooks_router)
app.include_router(users_router)
app.include_router(tasks_router)
app.include_router(subjects_router)
app.include_router(focus_router)
app.include_router(exams_router)


# ============================================
# HEALTH CHECK ENDPOINTS
# ============================================
# Kubernetes liveness/readiness probes expect /health at root level
@app.get("/health")
async def kubernetes_health_check():
    """Health check endpoint for Kubernetes probes (no /api prefix)"""
    return {"status": "healthy"}


@app.get("/api/health")
async def api_health_check():
    """Detailed health check for API consumers"""
    return {
        "status": "healthy",
        "services": {
            "api": "operational",
            "ai_mentor": "openai_or_fallback",
            "voice": "elevenlabs_conversational_ai",
            "store": "supabase_stripe",
        },
    }


# ============================================
# ROOT ENDPOINT
# ============================================
@app.get("/api/")
async def root():
    return {
        "message": "Welcome to Student Companion API",
        "version": "1.0.0",
        "endpoints": {
            "ai_mentor": "/api/ai",
            "store": "/api/store",
            "stripe_webhook": "/api/webhooks/stripe",
            "users_resolve": "/api/users/resolve",
            "users_me": "/api/users/me",
            "users_me_profile": "/api/users/me/profile",
            "users_profile": "/api/users/profile/{user_id}",
            "tasks": "/api/tasks",
            "tasks_stats": "/api/tasks/stats",
            "subjects": "/api/subjects",
            "focus_sessions": "/api/focus/sessions",
            "focus_logs": "/api/focus/logs",
            "focus_stats": "/api/focus/stats",
            "health": "/health",
        },
    }
