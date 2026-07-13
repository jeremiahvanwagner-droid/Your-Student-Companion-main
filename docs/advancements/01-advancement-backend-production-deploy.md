# Advancement 1 — Deploy the FastAPI Backend to Production

- **File Evidence:**
  - [src/lib/apiClient.js:1](../../src/lib/apiClient.js) — `API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || "http://localhost:8000")` — in production this falls back to localhost; every feature page (tasks, planner, notes, mentor, reminders, store, reports) dies on first fetch.
  - [CURRENT_STATE.md:32](../../CURRENT_STATE.md) — Better Stack "Backend `/api/health` monitor deferred until FastAPI is deployed."
  - Repo-wide glob for `Dockerfile`, `render.yaml`, `railway.json`, `fly.toml`, `Procfile` → zero matches outside `node_modules`.
  - [backend/requirements.txt:4-28](../../backend/requirements.txt) — `boto3`, `pymongo`, `motor`, `pandas`, `numpy`, `typer`, `jq`, `python-jose`, `passlib`, `bcrypt`, `requests-oauthlib`, `email-validator` are pinned but have **zero imports** anywhere in `backend/` (verified by grep on 2026-07-13).
- **Current State:** Frontend live at ysc.growthbychoice.com (Vercel). FastAPI backend runs only on developer machines. `backend/server.py` is production-ready in code terms (CORS from env at [server.py:45-51](../../backend/server.py), Sentry at :42, JSON logging at :41, `/health` at :111) but has no container, no host, no public URL.
- **Proposed Enhancement:** Containerize the backend, deploy to Render (long-lived ASGI beats serverless here: JWKS caching in `clerk_auth.py`, Stripe webhook latency, slowapi in-memory limits), slim the dependency set, wire env vars, point Vercel's `REACT_APP_API_BASE_URL` at it, and add the Better Stack monitor.
- **Impact / Effort:** 10/10 · 4/10
- **Risk Eliminated:** "Demo, not product" — the entire production feature surface currently 100% non-functional for real users.
- **Mission Advancement:** Converts every module shipped since Step 1 (A–I of the scope) from staging-only to live. Prerequisite for beta cohort (scope §12).
- **Unlocks:** Advancement 4 (money-path QA needs a live API), Advancement 6 (email scheduler calls a backend endpoint), Better Stack backend monitoring, Sentry backend events from real traffic.

---

## Implementation Brief

### Files to Create/Modify/Delete

| Action | Path |
|---|---|
| Create | `backend/Dockerfile` |
| Create | `backend/.dockerignore` |
| Create | `backend/requirements-dev.txt` |
| Modify | `backend/requirements.txt` (prune dead deps) |
| Modify | `.github/workflows/ci.yml` (install both requirements files) |
| Create | `docs/runbooks/backend-deploy.md` |
| Dashboard | Render service + env vars; Vercel `REACT_APP_API_BASE_URL`; Better Stack monitor |

### Step-by-Step Instructions

**1. Prune `backend/requirements.txt` to what the code imports:**

```
fastapi==0.110.1
uvicorn==0.25.0
slowapi>=0.1.9
python-dotenv>=1.0.1
pydantic>=2.6.4
pyjwt>=2.10.1
cryptography>=42.0.8
requests>=2.31.0
tzdata>=2024.2
python-multipart>=0.0.9
supabase>=2.7.4
stripe>=11.6.0
sentry-sdk[fastapi]>=2.18.0
python-json-logger>=2.0.7
```

(`cryptography` stays: PyJWT RS256 verification in `backend/lib/clerk_auth.py` requires it. `tzdata` stays: planner suggestions use profile timezones on slim images with no OS tzdata.)

**2. Create `backend/requirements-dev.txt`:**

```
-r requirements.txt
pytest>=8.0.0
pytest-cov>=4.0.0
httpx
black>=24.1.1
isort>=5.13.2
flake8>=7.0.0
mypy>=1.8.0
```

**3. Update `.github/workflows/ci.yml`** — replace the two backend install steps ([ci.yml:53-57](../../.github/workflows/ci.yml)) with:

```yaml
      - name: Install backend dependencies
        run: pip install -r backend/requirements-dev.txt
```

**4. Create `backend/Dockerfile`:**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd --create-home appuser
USER appuser

EXPOSE 8000
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

**5. Create `backend/.dockerignore`:**

```
.env
__pycache__/
.pytest_cache/
tests/
scripts/
*.md
```

**6. Local smoke test before any hosting:**

```bash
cd backend
docker build -t ysc-api .
docker run --rm -p 8000:8000 --env-file .env ysc-api
curl -s http://localhost:8000/health   # expect {"status":"healthy"}
```

**7. Render setup (dashboard):** New Web Service → connect the GitHub repo → root directory `backend`, runtime Docker, region **us-east** (matches Supabase `ysc-staging`), health check path `/health`, auto-deploy on `main`. Set env vars (values from `backend/.env` — never commit them): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SENTRY_DSN`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `RESEND_API_KEY`, `LOG_LEVEL=INFO`, and:

```
CORS_ALLOWED_ORIGINS=https://ysc.growthbychoice.com,https://your-student-companion-main.vercel.app
```

**8. Point the frontend at it:** Vercel → Project Settings → Environment Variables → `REACT_APP_API_BASE_URL=https://<render-service>.onrender.com` (Production + Preview scopes) → redeploy. Also add the variable to `.env.example` docs if the comment block needs the prod URL noted.

**9. Better Stack:** add monitor on `https://<render-service>.onrender.com/api/health`, alert after 2 consecutive failures, notify `support@truthjblue.com`.

**10. Write `docs/runbooks/backend-deploy.md`** documenting: host, env var inventory (names + where each value lives), deploy-on-merge behavior, how to roll back a bad deploy (Render "Rollback to previous deploy" button), and the local Docker smoke test.

### Verification Checklist

- [ ] `docker build` succeeds locally; image size < 400 MB (slim deps working)
- [ ] `curl https://<api>/health` → `{"status":"healthy"}`
- [ ] `curl https://<api>/api/health` → detailed payload from [server.py:117-128](../../backend/server.py)
- [ ] Sign in on ysc.growthbychoice.com → dashboard loads task stats (Network tab: `/api/tasks/stats` 200 from the Render origin, CORS clean)
- [ ] Sentry backend project receives a request-tagged event (throw a test error per [docs/runbooks/observability.md](../runbooks/observability.md) §8)
- [ ] Better Stack monitor green for 24 h
- [ ] CI green with the split requirements files
- [ ] `python -m pytest backend/tests/ -v --cov=backend --cov-fail-under=25` still passes locally (proves no pruned dep was actually needed)

### Rollback Procedure

1. Vercel: blank out `REACT_APP_API_BASE_URL` (or restore its previous value) and redeploy — the frontend returns to its current (pre-deploy) behavior.
2. Render: suspend the service (Settings → Suspend). No data risk: the service is stateless; all state is in Supabase.
3. If the requirements prune broke something: `git revert` the commit touching `backend/requirements.txt` — the pin list is fully restored from git history.

### Definition of Done

**`curl -s https://<api-domain>/api/health` returns HTTP 200 AND a signed-in user on https://ysc.growthbychoice.com sees real task stats on the dashboard.** (Both true = done; either false = not done.)
