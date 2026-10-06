# Runbook — Backend Production Deploy (Render)

**Market Thirteen item #1 / Advancement 1** ([brief](../advancements/01-advancement-backend-production-deploy.md)).
The FastAPI backend has never had a production host; this runbook takes it live on
Render using the repo's `render.yaml` blueprint and `backend/Dockerfile`, then flips
the frontend to use it.

## 0. Prerequisites
- **G1 passed:** `supabase db push` done against `ysc-prod` (every file in
  `supabase/migrations/`, nothing else) and the CI `db-migrate` job green on
  `main` — see [database.md](database.md). The backend 500s on every route
  without the schema, and the project that previously held it was deleted
  (CURRENT_STATE.md S-INCIDENT-DB-001), so do not deploy ahead of G1.
- PR-1 merged (`render.yaml` carries the env inventory below; the old
  `SUPABASE_ANON_KEY` is gone).
- Render account with GitHub access to this repo.

### Local image smoke test (optional but cheap)
```bash
docker build -t ysc-backend ./backend
docker run --rm --env-file backend/.env -p 8000:8000 ysc-backend
curl -s http://localhost:8000/health        # {"status":"healthy"}
```

## 1. Environment variable inventory

These are every variable the backend reads (`grep os.getenv backend/`). Secrets
marked 🔒 are prompted by the blueprint (`sync: false`) — never commit them.

| Variable | 🔒 | Source of truth |
|---|---|---|
| `APP_ENV` | | `production` (set in blueprint) |
| `LOG_LEVEL` | | `INFO` (blueprint) |
| `AI_DAILY_TOKEN_BUDGET` | | `50000` (blueprint) — per-user daily OpenAI token ceiling; `0` disables |
| `CORS_ALLOWED_ORIGINS` | | prod + vercel domains (blueprint; comma-separated, no spaces) |
| `SUPABASE_URL` | | Supabase dashboard → Project Settings → API (`ysc-prod`) |
| `SUPABASE_SERVICE_ROLE_KEY` | 🔒 | Supabase dashboard → API keys → the `sb_secret_…` key (backend only, never frontend; the only role the schema grants) |
| `SUPABASE_PROJECT_REF` | | the `ysc-prod` project ref — `audit_supabase_schema.py --expect-project-ref` asserts `SUPABASE_URL` matches it, so the backend can never be pointed at the wrong project silently |
| `REACT_APP_CLERK_PUBLISHABLE_KEY` | 🔒 | Clerk dashboard (backend derives the issuer from it) |
| `CLERK_ISSUER` | 🔒 | Clerk dashboard → API → Frontend API URL (explicit override; preferred in prod) |
| `CLERK_SECRET_KEY` | 🔒 | Clerk dashboard → API keys — Backend API calls (server-side age gate writes `publicMetadata`, account deletion removes the Clerk user; plan §4-5/§4-7) |
| `STRIPE_SECRET_KEY` | 🔒 | Stripe dashboard (Test now; swap at Live cutover, item #3) |
| `STRIPE_WEBHOOK_SECRET` | 🔒 | Stripe webhook destination config |
| `SENTRY_DSN` | 🔒 | Sentry project settings |
| `SENTRY_ENVIRONMENT` | | `production` (blueprint) |
| `OPENAI_API_KEY` | 🔒 | OpenAI dashboard — **required for real mentor chat**: `routes/ai_mentor.py` reads it at import and `/api/ai/chat` degrades to a canned fallback without it |
| `OPENAI_MODEL` | | defaults to `gpt-4.1-mini` in code; set only to override |
| Optional: `ELEVENLABS_API_KEY` | 🔒 | voice synthesis endpoints are placeholders today; conversational voice runs client-side via `@elevenlabs/react` |
| `RESEND_API_KEY` | 🔒 | Resend dashboard — email layer (welcome + weekly reset). Absent = emails silently no-op |
| `EMAIL_FROM` | | verified sender, e.g. `Your Student Companion <hello@ysc.growthbychoice.com>` (verify the domain in Resend first) |
| `CRON_SECRET` | 🔒 | any long random string; shared between the API service and the `ysc-weekly-reset` cron job (blueprint) which POSTs `/api/email/weekly-reset-run` Sundays 23:00 UTC |
| `API_BASE_URL` | | this service's public URL — builds unsubscribe links in outbound email (email refuses to start when `RESEND_API_KEY` is set and this is not) |
| `FRONTEND_BASE_URL` | | `https://ysc.growthbychoice.com` — Stripe success/cancel/portal return URLs are validated against this origin (no open redirect) |
| `FORWARDED_ALLOW_IPS` | | `*` (blueprint) — uvicorn trusts Render's `X-Forwarded-For`, so rate limits key on the real client IP instead of the proxy |
| Optional: `CLERK_JWKS_URL`, `CLERK_JWT_AUDIENCE`, `SENTRY_RELEASE` | | only if overriding defaults (`RENDER_GIT_COMMIT` already feeds the release tag) |

## 2. Deploy
1. Render → **New → Blueprint** → select this repo (`render.yaml` auto-detected).
2. Fill the prompted secrets from §1. Apply. First build ≈ 5–8 min (Docker).
3. Note the service URL, e.g. `https://ysc-backend.onrender.com`.

## 3. Smoke test (before touching the frontend)
```bash
curl -s https://<service>/health           # → {"status":"healthy"}  (static liveness)
curl -s https://<service>/api/health/ready # → {"db":"ok"}          (touches feature_flags; 503 if the DB is unreachable)
curl -s https://<service>/api/             # → endpoint directory JSON
curl -s -o /dev/null -w "%{http_code}" \
  https://<service>/api/tasks              # → 401 (auth enforced, not 500)
```
Confirm a JSON log line per request in Render logs and an `X-Request-ID` response header.

## 3a. Create the Stripe webhook destination
The FastAPI route is the only Stripe webhook (decision D5 — the Supabase Edge
function is gone, and the May 2026 destination pointed at the deleted project).
1. Stripe Dashboard (Test mode through beta) → Developers → Webhooks → **Add
   destination** → `https://<service>/api/webhooks/stripe` → the 7 events in
   [backend/STORE_WEBHOOK_RUNBOOK.md §6](../../backend/STORE_WEBHOOK_RUNBOOK.md).
2. Copy the new `whsec_…` into Render → service → Environment →
   `STRIPE_WEBHOOK_SECRET` (the service redeploys).
3. Disable/delete the old `…supabase.co/functions/v1/stripe-webhook` destination.
4. Stripe → destination → **Send test event** → 200 in Render logs. Then
   `python backend/scripts/validate_stripe_webhook.py` → `PASS`.

## 4. Flip the frontend
1. Vercel → Project → Settings → Environment Variables →
   `REACT_APP_API_BASE_URL = https://<service>` (Production + Preview).
2. Redeploy the frontend. Sign in on production: dashboard stats, task create,
   bell sync, and mentor chat must all succeed (Network tab: calls hit the
   Render host, no CORS errors).

## 5. Monitoring
1. Better Stack → new monitor on `https://<service>/api/health/ready`, 3-min
   interval, **keyword match `"db":"ok"`**, alert after 2 failures. This is the
   probe that would have caught the July 2026 project deletion; the static
   `/health` cannot. Add a second monitor on `https://ysc.growthbychoice.com`
   (today only the `*.vercel.app` URL is watched).
2. Sentry → confirm a deliberate test error from the backend arrives tagged with
   `request_id` and `environment=production`.

## 6. Rollback
Render → service → **Rollback** to the previous deploy (one click). The frontend
needs no change — the API URL is stable. If the service is hard-down, set
Vercel `REACT_APP_API_BASE_URL` back to the previous value (or empty to fail
closed) and redeploy.

## Notes
- ✅ Image size: `requirements.txt` pruned 32 → 14 pins on 2026-07-13
  (S-DEPLOY-PREP-001) — dead heavyweights (pandas, numpy, boto3, motor, pymongo,
  et al.) removed; full 156-test suite verified green in a fresh venv containing
  only the pruned set. Dev/test tooling lives in `requirements-dev.txt`.
- The Dockerfile honors `$PORT` (Render) and defaults to 8000 (local/K8s);
  `/health` doubles as the container HEALTHCHECK and the platform probe.
