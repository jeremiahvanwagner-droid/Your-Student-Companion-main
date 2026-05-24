# Observability Runbook

**Status:** Active
**Last updated:** 2026-05-24
**Companion:** [next-ten-implementation.md §#1](../strategy/next-ten-implementation.md)

> Single source of truth for how Your Student Companion's error reporting,
> logging, and uptime monitoring are wired. When something is on fire in
> production, start here.

---

## 1. Where the dashboards live

| Surface | Where |
|---|---|
| Frontend errors | Sentry project: `javascript-react` (organization-scoped) |
| Backend errors | Same Sentry project — events tagged `platform:python` |
| Structured backend logs | stdout, JSON-formatted via `python-json-logger`. Aggregated wherever the FastAPI deploy ships logs (TBD until backend hosting is chosen). |
| Uptime (frontend) | TBD — Better Stack or UptimeRobot signup pending |
| Uptime (backend) | TBD — depends on backend deploy target |

When the backend host is decided, add the runtime-logs dashboard URL here.

---

## 2. How the wiring is composed

### Frontend (`src/lib/sentry.js`)

- `initSentry()` runs at app boot in [`src/index.js`](../../src/index.js) before `<App />` mounts.
- No-ops when `REACT_APP_SENTRY_DSN` is missing (local dev without Sentry creds).
- `scrubPII` is the `beforeSend` hook — drops `user.email`, `user.username`, `user.ip_address`, `Authorization` / `Cookie` headers, `request.cookies` before the event leaves the browser.
- `Sentry.ErrorBoundary` wraps the routes in [`src/App.js`](../../src/App.js) — unhandled render errors get captured and the user sees `GlobalErrorFallback` with a "Try again" button.
- `identifySentryUser(clerkUserId)` runs from [`src/components/AppAccessGuard.jsx`](../../src/components/AppAccessGuard.jsx) once Clerk resolves signed-in. The Sentry user payload is `{ id: clerk_user_id }` — never email.
- `clearSentryUser()` runs from [`src/components/Gatekeeper.jsx`](../../src/components/Gatekeeper.jsx) on any unauthenticated session resolve.

### Backend (`backend/lib/sentry_init.py` + `backend/lib/request_id.py`)

- `init_sentry()` is called from [`backend/server.py`](../../backend/server.py) at module import, before `FastAPI()` is constructed. Hooks `FastApiIntegration` + `StarletteIntegration`.
- `scrub_pii_event` mirrors the frontend `scrubPII` — same fields, applied to Python event payloads.
- `RequestIdMiddleware` is registered before CORS. Per request:
  - Echoes the incoming `X-Request-ID` header if it's valid (≤64 chars, alphanumeric / underscore / hyphen).
  - Otherwise generates a `uuid4().hex`.
  - Attaches to `request.state.request_id`.
  - Stamps `sentry_sdk.set_tag("request_id", ...)` on the active scope.
  - Echoes back on the response header (and CORS exposes it).
- `identify_sentry_user(clerk_user_id, app_user_id=...)` is called from `get_clerk_auth_context` (and again from `get_app_auth_context`) so any error raised in a route handler carries the Clerk + app user ids.
- Stripe webhook handler in [`backend/routes/webhooks.py`](../../backend/routes/webhooks.py) adds a `category: "stripe"` breadcrumb with the event id and type after signature verification.

### Logging

- Backend logs are JSON-formatted via `python-json-logger`.
- `LOG_LEVEL` env var controls the level (default `INFO`).
- Each line includes `ts`, `level`, `name`, `message` fields. Stack traces from `logger.exception(...)` are serialized.

### Source-map upload

- Production builds upload source maps via `@sentry/webpack-plugin` wired into [`craco.config.js`](../../craco.config.js).
- Required at Vercel build time:
  - `SENTRY_AUTH_TOKEN` (secret — scopes: `project:releases`, `org:read`)
  - `SENTRY_ORG_SLUG`
  - `SENTRY_PROJECT_SLUG`
- If any are missing, the plugin no-ops with a console warning. Build still succeeds.
- After upload, `.map` files are deleted from `./build/**` so they aren't world-readable on the CDN.

---

## 3. Cross-system debugging — using the request id

Every request gets a 32-char hex id. When a user reports an error:

1. Ask them to **inspect the failed network request in DevTools Network tab** → look for the `X-Request-ID` response header. Or for a captured error, the id will appear under the Sentry event's `tags.request_id`.
2. Search Sentry: `tags.request_id:<value>` → finds frontend + backend events for the same request.
3. Search backend logs for the id → finds every log line emitted during that request.
4. If the request touched Stripe, `tags.stripe_event_id` is also stamped — replayable from the Stripe dashboard.

---

## 4. Environments

Events are tagged with `environment` so prod vs staging vs dev is filterable:

| Build context | `environment` value | Why |
|---|---|---|
| Vercel production | `production` (from `REACT_APP_VERCEL_ENV`) | Real users |
| Vercel preview | `preview` | PR previews |
| Vercel dev | `development` | Local `vercel dev` |
| `npm start` locally | `development` (NODE_ENV fallback) | Local dev |
| Backend prod | `production` (set via `SENTRY_ENVIRONMENT` or `APP_ENV` env) | Real users |
| Backend local | `development` | Local uvicorn |

When debugging a noisy issue, filter by environment first.

---

## 5. Alert routing

**Currently pending** — alert channels aren't configured yet. When this is set up, document here:

- Sentry project → Settings → Alerts → new issue alerts go to: `<channel>`
- Uptime monitor → alerts on 2 consecutive failures → notifies: `<channel>`

Until then, alerts are visible only by checking the Sentry dashboard.

---

## 6. PII guarantees + what to do if a leak is suspected

The `scrubPII` (frontend) / `scrub_pii_event` (backend) hooks strip:

- `user.email`, `user.username`, `user.ip_address`
- HTTP headers: `Authorization`, `Cookie` (case-insensitive)
- `request.cookies` object

Verifying after a Sentry event is captured:

1. Open the event in Sentry → click "JSON" view in the top-right.
2. Search the JSON for `email`, `Bearer`, `cookie` (case-insensitive).
3. The only allowed match should be `user.id` (Clerk id, opaque string starting `user_`).

If a leak is found:

1. **Immediately rotate the leaked credential.** Clerk session tokens have ~1-hour expiry but assume worst case.
2. Delete the offending event from Sentry: event → "..." menu → Delete. This removes it from the dashboard but Sentry retains for 30 days.
3. File a follow-up issue to harden `scrubPII` for whatever field leaked.
4. If a Stripe webhook payload was involved: verify in Stripe dashboard that no card / customer secret data was attached to the event — Stripe events should never carry that, but a custom metadata field could.

---

## 7. Cost + sampling

| Knob | Current value | Where to change |
|---|---|---|
| Sentry plan | TBD (recommended: Team $26/mo) | sentry.io billing |
| `tracesSampleRate` (frontend) | 0.1 | [`src/lib/sentry.js`](../../src/lib/sentry.js) `DEFAULT_TRACES_SAMPLE_RATE` |
| `traces_sample_rate` (backend) | 0.1 | [`backend/lib/sentry_init.py`](../../backend/lib/sentry_init.py) `DEFAULT_TRACES_SAMPLE_RATE` |
| `profiles_sample_rate` (backend) | 0.0 | same file, `DEFAULT_PROFILES_SAMPLE_RATE` |

If Sentry quota becomes a concern at scale, **reduce traces sample rate first** (errors are cheap, performance traces are expensive). Errors aren't sampled — every captured exception is sent.

---

## 8. Smoke test

Run this after any change to the observability wiring to confirm capture still works end-to-end. **Two-minute test.**

1. **Frontend smoke:**
   - `npm start`
   - Sign in.
   - Open browser devtools → console.
   - Run: `throw new Error("sentry-smoke-test-" + Date.now())`
   - Within 1 minute, the error appears in the Sentry feed.
   - Click into it → confirm `user.id` is your Clerk id, `tags.request_id` is set, **no email in the JSON payload**.

2. **Backend smoke:**
   - With the backend running locally, hit a temporary debug endpoint that raises, e.g. add this to `server.py`:
     ```python
     @app.get("/api/_debug/boom")
     def _boom():
         raise RuntimeError("sentry-smoke-test")
     ```
   - `curl http://localhost:8000/api/_debug/boom -H "X-Request-ID: smoke-test-123"`
   - Within 1 minute, the error appears in the Sentry feed with `tags.request_id:smoke-test-123`.
   - Remove the debug endpoint before committing.

---

## 9. Disabling observability (emergency)

If Sentry is causing application errors (rare but documented):

- **Frontend:** unset `REACT_APP_SENTRY_DSN` in Vercel env, redeploy. SDK no-ops.
- **Backend:** unset `SENTRY_DSN` in backend deploy env, redeploy. `init_sentry()` returns False, no calls go to Sentry.
- **Uptime monitor:** pause the monitor in provider dashboard.

No database or product impact from any of these.
