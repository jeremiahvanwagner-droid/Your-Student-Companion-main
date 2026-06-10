# Runbook — Backend Production Deploy (Render)

**Market Thirteen item #1.** The FastAPI backend has never had a production host;
this runbook takes it live on Render using the repo's `render.yaml` blueprint and
`backend/Dockerfile`, then flips the frontend to use it.

## 0. Prerequisites
- Migrations applied to the Supabase project **in order**: `007_planner_blocks.sql`,
  `008_private_is_admin.sql`, `009_reminders_reference_and_sm2.sql`
  (Market Thirteen item #2 — planner/reminders/SM-2 500 without them).
- Render account with GitHub access to this repo.

## 1. Environment variable inventory

These are every variable the backend reads (`grep os.getenv backend/`). Secrets
marked 🔒 are prompted by the blueprint (`sync: false`) — never commit them.

| Variable | 🔒 | Source of truth |
|---|---|---|
| `APP_ENV` | | `production` (set in blueprint) |
| `LOG_LEVEL` | | `INFO` (blueprint) |
| `CORS_ALLOWED_ORIGINS` | | prod + vercel domains (blueprint; comma-separated, no spaces) |
| `SUPABASE_URL` | | Supabase dashboard → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | 🔒 | Supabase dashboard (service role — backend only, never frontend) |
| `SUPABASE_ANON_KEY` | 🔒 | Supabase dashboard |
| `REACT_APP_CLERK_PUBLISHABLE_KEY` | 🔒 | Clerk dashboard (backend derives the issuer from it) |
| `CLERK_ISSUER` | 🔒 | Clerk dashboard → API → Frontend API URL (explicit override; preferred in prod) |
| `STRIPE_SECRET_KEY` | 🔒 | Stripe dashboard (Test now; swap at Live cutover, item #3) |
| `STRIPE_WEBHOOK_SECRET` | 🔒 | Stripe webhook destination config |
| `SENTRY_DSN` | 🔒 | Sentry project settings |
| `SENTRY_ENVIRONMENT` | | `production` (blueprint) |
| Optional: `CLERK_JWKS_URL`, `CLERK_JWT_AUDIENCE`, `FRONTEND_BASE_URL`, `SENTRY_RELEASE` | | only if overriding defaults (`RENDER_GIT_COMMIT` already feeds the release tag) |

> OpenAI / ElevenLabs keys: the AI mentor routes currently resolve their providers
> at request time; add `OPENAI_API_KEY` / `ELEVENLABS_API_KEY` here when those
> integrations move from frontend/Edge to this service.

## 2. Deploy
1. Render → **New → Blueprint** → select this repo (`render.yaml` auto-detected).
2. Fill the prompted secrets from §1. Apply. First build ≈ 5–8 min (Docker).
3. Note the service URL, e.g. `https://ysc-backend.onrender.com`.

## 3. Smoke test (before touching the frontend)
```bash
curl -s https://<service>/health           # → {"status":"healthy"}
curl -s https://<service>/api/             # → endpoint directory JSON
curl -s -o /dev/null -w "%{http_code}" \
  https://<service>/api/tasks              # → 401 (auth enforced, not 500)
```
Confirm a JSON log line per request in Render logs and an `X-Request-ID` response header.

## 4. Flip the frontend
1. Vercel → Project → Settings → Environment Variables →
   `REACT_APP_API_BASE_URL = https://<service>` (Production + Preview).
2. Redeploy the frontend. Sign in on production: dashboard stats, task create,
   bell sync, and mentor chat must all succeed (Network tab: calls hit the
   Render host, no CORS errors).

## 5. Monitoring
1. Better Stack → new monitor on `https://<service>/api/health`, 3-min interval,
   alert after 2 failures (same policy as the frontend monitor).
2. Sentry → confirm a deliberate test error from the backend arrives tagged with
   `request_id` and `environment=production`.

## 6. Rollback
Render → service → **Rollback** to the previous deploy (one click). The frontend
needs no change — the API URL is stable. If the service is hard-down, set
Vercel `REACT_APP_API_BASE_URL` back to the previous value (or empty to fail
closed) and redeploy.

## Notes
- Image size: `requirements.txt` carries unused heavyweights (pandas, numpy,
  boto3, motor). Trimming them is a follow-up — verify no imports first.
- The Dockerfile honors `$PORT` (Render) and defaults to 8000 (local/K8s);
  `/health` doubles as the container HEALTHCHECK and the platform probe.
