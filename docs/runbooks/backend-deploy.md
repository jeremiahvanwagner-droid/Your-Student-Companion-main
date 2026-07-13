# Runbook — Backend Production Deploy

**Service:** FastAPI (`backend/server.py`) · **Container:** `backend/Dockerfile` (python:3.11-slim, non-root, `${PORT}`-aware)
**Recommended host:** Render Web Service (long-lived ASGI: JWKS caching in `clerk_auth.py`, Stripe webhook latency, slowapi in-memory limits all fight serverless cold starts)
**Companion brief:** [docs/advancements/01-advancement-backend-production-deploy.md](../advancements/01-advancement-backend-production-deploy.md)

## Local smoke test (run before every first-time host setup)

```bash
cd backend
docker build -t ysc-api .
docker run --rm -p 8000:8000 --env-file .env ysc-api
curl -s http://localhost:8000/health        # {"status":"healthy"}
curl -s http://localhost:8000/api/health    # detailed payload
```

## Render setup (one-time, dashboard)

1. New → Web Service → connect `jeremiahvanwagner-droid/Your-Student-Companion-main`.
2. Root directory: `backend` · Runtime: Docker · Region: **us-east** (matches Supabase) · Health check path: `/health` · Auto-deploy: on merge to `main`.
3. Environment variables (values live in `backend/.env` locally — never commit them):

| Variable | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | DB access |
| `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | JWT verification |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | payments |
| `SENTRY_DSN` | backend error reporting |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | AI mentor |
| `RESEND_API_KEY` | email (Advancement 6) |
| `LOG_LEVEL` | `INFO` |
| `CORS_ALLOWED_ORIGINS` | `https://ysc.growthbychoice.com,https://your-student-companion-main.vercel.app` |

4. Vercel → Project Settings → Environment Variables → `REACT_APP_API_BASE_URL=https://<service>.onrender.com` (Production + Preview) → redeploy frontend.
5. Better Stack → new monitor on `https://<service>.onrender.com/api/health`, alert after 2 consecutive failures → `support@truthjblue.com`.

## Deploy-on-merge behavior

Render rebuilds the Docker image on every push to `main` (`backend/` root). Frontend deploys via Vercel on the same merge — backend and frontend ship together.

## Rollback

- **Bad backend deploy:** Render dashboard → Deploys → "Rollback" to the previous image (~1 min). Service is stateless; all state is in Supabase.
- **Kill the backend entirely:** Render → Settings → Suspend; then blank `REACT_APP_API_BASE_URL` in Vercel and redeploy (frontend degrades to pre-deploy behavior).
- **Dependency prune regression:** `git revert` the commit touching `backend/requirements.txt`; the previous pin list is fully restored.

## Verification checklist after any deploy

- [ ] `curl https://<api>/health` → 200
- [ ] Sign in on ysc.growthbychoice.com → dashboard loads `/api/tasks/stats` (Network tab: 200, CORS clean)
- [ ] Sentry backend project shows the release; no new 5xx in first hour
- [ ] Better Stack monitor green
