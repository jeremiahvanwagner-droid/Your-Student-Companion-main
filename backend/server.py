import concurrent.futures
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

logger = logging.getLogger(__name__)


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

# CORS configuration. Registered BEFORE RequestIdMiddleware so that — under
# Starlette's reverse-stack semantics (last add_middleware runs first) —
# RequestIdMiddleware ends up outermost and runs on every request,
# including the CORS-handled OPTIONS preflight. Without that ordering CORS
# would short-circuit preflight before request_id is generated, leaving
# preflight responses without an X-Request-ID header and Sentry events
# without the request_id tag.
#
# X-Request-ID must be in allow_headers so cross-origin browser clients
# can propagate their own request id; without it CORS preflight rejects
# the header and the backend always generates a new id, breaking
# end-to-end correlation.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Requested-With",
        "Accept",
        "Origin",
        "X-Request-ID",
    ],
    expose_headers=["X-Request-ID"],
)

# Per-request id middleware. Added LAST so the Starlette stack puts it
# outermost — runs first on every request (including CORS preflight) and
# wraps every other middleware + handler in the request_id Sentry scope.
app.add_middleware(RequestIdMiddleware)

# Import and include routers.
#
# lib.supabase_client runs load_dotenv(backend/.env) at import time, so it
# must stay below init_sentry(): imported any earlier it would feed
# backend/.env into the environment init_sentry() reads and turn every
# local pytest/uvicorn run into a Sentry reporter whenever that file
# carries a DSN. The routes import the same module from here already.
from lib.supabase_client import get_supabase_admin_client
from routes.ai_mentor import router as ai_mentor_router
from routes.store import router as store_router
from routes.webhooks import router as webhooks_router
from routes.users import router as users_router
from routes.tasks import router as tasks_router
from routes.subjects import router as subjects_router
from routes.focus import router as focus_router
from routes.exams import router as exams_router
from routes.notes import router as notes_router
from routes.planner import router as planner_router
from routes.reports import router as reports_router
from routes.reminders import router as reminders_router
from routes.email_ops import router as email_ops_router

app.include_router(ai_mentor_router)
app.include_router(store_router)
app.include_router(webhooks_router)
app.include_router(users_router)
app.include_router(tasks_router)
app.include_router(subjects_router)
app.include_router(focus_router)
app.include_router(exams_router)
app.include_router(notes_router)
app.include_router(planner_router)
app.include_router(reports_router)
app.include_router(reminders_router)
app.include_router(email_ops_router)


# ============================================
# HEALTH CHECK ENDPOINTS
# ============================================
# Liveness (/health) is static and cheap: Render's healthCheckPath and the
# Dockerfile HEALTHCHECK hit it, and it must keep answering 200 while the
# database is down so the platform does not restart a healthy process.
# Readiness (/api/health/ready) proves the service can reach the database;
# the uptime monitor watches it for the "db":"ok" keyword.
#
# Both are exempt from rate limiting: uptime monitors and platform probes
# share a handful of source IPs and would otherwise trip the default limit
# once SlowAPIMiddleware is enabled.


@app.get("/health")
@limiter.exempt
async def kubernetes_health_check():
    """Liveness probe (no /api prefix) — static, never touches the DB."""
    return {"status": "healthy"}


# Hard ceiling for the readiness probe. The Supabase client's own HTTP
# timeout is far longer (120s by default), so without this a hung database
# would hang the probe and the monitor would see a timeout instead of a 503.
READY_TIMEOUT_SECONDS = 2.0

# Dedicated, bounded executor so a stalled probe can never starve Starlette's
# shared threadpool. A probe that outlives READY_TIMEOUT_SECONDS keeps its
# worker busy until the HTTP call returns on its own; two workers absorb that
# while the next probe still gets a prompt answer.
_ready_executor = concurrent.futures.ThreadPoolExecutor(
    max_workers=2, thread_name_prefix="health-ready"
)


def _probe_database() -> None:
    """
    Cheapest possible round-trip through PostgREST with the service-role
    client: one row id from feature_flags (seeded by the baseline migration;
    an empty table still answers 200). Raises on any failure.
    """
    admin = get_supabase_admin_client()
    admin.table("feature_flags").select("id").limit(1).execute()


@app.get("/api/health/ready")
@limiter.exempt
def api_readiness_check():
    """
    Readiness probe — 200 {"status":"ready","db":"ok"} when the database
    answers within READY_TIMEOUT_SECONDS, else 503 {"status":"not_ready",
    "db":"error"}. Deliberately a plain `def`: FastAPI runs it on the
    threadpool, so the blocking wait below never stalls the event loop.
    Failure detail goes to the logs/Sentry breadcrumbs only — never to the
    client.
    """
    future = _ready_executor.submit(_probe_database)
    try:
        future.result(timeout=READY_TIMEOUT_SECONDS)
    except Exception:  # any DB/config failure means "not ready"; detail stays server-side
        if not future.done():
            # Still queued or running past the deadline: a wait timeout,
            # not a probe failure. Cancel drops it if it never started; a
            # running probe cannot be interrupted and finishes on its own.
            future.cancel()
            logger.warning(
                "readiness probe timed out",
                extra={"timeout_seconds": READY_TIMEOUT_SECONDS},
            )
        else:
            logger.warning("readiness probe failed", exc_info=True)
        return JSONResponse(
            status_code=503, content={"status": "not_ready", "db": "error"}
        )
    return {"status": "ready", "db": "ok"}


@app.get("/api/health")
async def api_health_check():
    """Detailed health check for API consumers"""
    return {
        "status": "healthy",
        "services": {
            "api": "operational",
            "ai_mentor": "openai_or_fallback",
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
            "notes": "/api/notes",
            "review_cards": "/api/notes/cards",
            "planner_blocks": "/api/planner/blocks",
            "planner_suggest": "/api/planner/suggest",
            "weekly_report_current": "/api/reports/weekly/current",
            "weekly_report_history": "/api/reports/weekly/history",
            "reminders": "/api/reminders",
            "reminders_sync": "/api/reminders/sync",
            "health": "/health",
            "health_ready": "/api/health/ready",
        },
    }
