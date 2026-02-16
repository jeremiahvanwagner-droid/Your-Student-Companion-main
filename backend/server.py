from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Student Companion API",
    description="Backend API for Your Student Companion PWA",
    version="1.0.0",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import and include routers
from routes.ai_mentor import router as ai_mentor_router
from routes.store import router as store_router
from routes.webhooks import router as webhooks_router
from routes.users import router as users_router

app.include_router(ai_mentor_router)
app.include_router(store_router)
app.include_router(webhooks_router)
app.include_router(users_router)


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
            "stripe_webhook": "/api/store/webhook",
            "users_resolve": "/api/users/resolve",
            "health": "/health",
        },
    }

