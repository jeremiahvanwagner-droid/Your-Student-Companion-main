# Runbook — Secret inventory

**Plan §3.1 / §24 (key custody).** One row per secret or credential, by **name only** —
this file never holds a value, a fragment of a value, or a URL that embeds one. Derived on
2026-10-06 by grepping `os.getenv` across `backend/`, `process.env` across `src/`,
`scripts/`, `craco.config.js`, the two workflows under `.github/workflows/`, `render.yaml`,
`vercel.json`, and the variable *names* present in `backend/.env` / `.env.local`.

**Homes** (the only places a value may live):

| Home | What goes there |
|---|---|
| **PM** — password manager, vault *YSC* | the canonical copy of every secret, plus the ones no service reads (DB password, age private key, keystore) |
| **Render** — service `ysc-backend` env (+ cron `ysc-weekly-reset`) | everything the FastAPI backend reads at runtime (`render.yaml` `sync: false` entries) |
| **Vercel** — project env | only `REACT_APP_*` publishable values and the Sentry build-time trio. **Never** a `SERVICE_ROLE`, `SECRET`, or `WEBHOOK` name (CRA inlines every `REACT_APP_*` into the public bundle; CI greps for it) |
| **GHA** — GitHub Actions repository secrets | `db-backup.yml` inputs only |
| **`backend/.env`** (git-ignored) | local copy of the Render set |
| **`.env.local`** (git-ignored) | local copy of the Vercel set |

**Status vocabulary:** `set` = exists in its home today · `to-be-generated` = does not exist
yet · `to-be-set` = exists somewhere but not yet in the listed home · `dead` = value
belonged to the deleted project / dead endpoint and must be replaced · `retire` = delete
from the named file, nothing reads it · `parked` = feature deferred (D7), keep in PM only.

Rotation owner is the repo owner (Jeremiah) for every row; the column says **when**.

## 1. Supabase (`ysc-prod`)

| Name | What | Home(s) | Read by | Rotate | Status |
|---|---|---|---|---|---|
| `SUPABASE_URL` | `https://<ref>.supabase.co` (config, not secret) | Render, `backend/.env` | `backend/lib/supabase_client.py:40`, `backend/scripts/audit_supabase_schema.py:221` | on project change | **dead** → to-be-set after project creation |
| `SUPABASE_SERVICE_ROLE_KEY` | the `sb_secret_…` key (new key format; legacy JWT keys retire end-2026) | PM, Render, `backend/.env` | `backend/lib/supabase_client.py:41`, `audit_supabase_schema.py:222` | on any suspected exposure; at Live cutover | **dead** → to-be-generated |
| `SUPABASE_PROJECT_REF` | the 20-char project ref (config) | Render, `backend/.env` | `audit_supabase_schema.py --expect-project-ref` (plan §3.5), `supabase link` | on project change | to-be-set |
| *Database password* | Postgres password chosen at project creation | **PM only** | nothing in code; composed into `SUPABASE_DB_URL` and typed at `supabase link` | at Live cutover; on exposure | to-be-generated |
| `SUPABASE_DB_URL` | **Session-pooler** URI (`…pooler.supabase.com:5432`, password percent-encoded) | GHA | `.github/workflows/db-backup.yml` | with the DB password | to-be-generated |
| `sb_publishable_…` key | publishable API key (public by design) | PM | nothing — the frontend never talks to Supabase; used only for the anon-denial curl check in plan §8 | on project change | to-be-generated |
| `SUPABASE_ACCESS_TOKEN` | personal access token for `supabase login` / `link` / `db push` | PM (+ CLI keychain) | Supabase CLI only | yearly; on exposure | to-be-generated |
| Supabase MCP connector | OAuth grant held by the claude.ai connector | claude.ai connector settings | MCP read-only calls (`list_migrations`, `get_advisors`, …) | revoke + re-grant after the incident review | set |
| `SUPABASE_ANON_KEY` | legacy anon JWT of the dead project | `backend/.env` | nothing — `get_supabase_anon_client` was deleted from `backend/lib/supabase_client.py` and `validate_supabase_webhook.py` was replaced by `validate_stripe_webhook.py` on 2026-10-06; `render.yaml` no longer lists it | — | **retire** (plan §3.6) |
| `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY` | frontend Supabase vars | `.env.local`, Vercel | nothing — `src/lib/supabase.js` and the `@supabase/supabase-js` dependency were deleted and `scripts/check-env.js` no longer lists them (2026-10-06) | — | **retire** — delete from `.env.local` and Vercel |
| `REACT_APP_SUPABASE_SERVICE_ROLE_KEY` | a service-role key under a `REACT_APP_` name | `.env.local` | nothing — but CRA inlined it into a local `build/` on 2026-07-13 (plan §4-8) | — | **retire immediately**; also delete the local `build/` directory |

## 2. Backups

| Name | What | Home(s) | Read by | Rotate | Status |
|---|---|---|---|---|---|
| `BACKUP_AGE_PUBLIC_KEY` | `age1…` recipient | GHA (+ PM, in the same entry as the private key) | `.github/workflows/db-backup.yml` | only together with the private key | to-be-generated (`age-keygen`) |
| *Backup age private key* | `AGE-SECRET-KEY-1…` | **PM only — never GHA, never the repo** | the restore drill (`docs/runbooks/database.md` §7), by a human | if PM is compromised; re-encrypt nothing (old artifacts stay readable with the old key — keep both in PM) | to-be-generated |

## 3. Stripe

| Name | What | Home(s) | Read by | Rotate | Status |
|---|---|---|---|---|---|
| `STRIPE_SECRET_KEY` (Test, `sk_test_…`) | Test-mode API key | PM, Render, `backend/.env` | `backend/routes/store.py:85`, `backend/routes/users.py:440`, `backend/routes/webhooks.py:26`, `backend/scripts/audit_supabase_schema.py:223`, `backend/scripts/create_stripe_products.py:154`, `backend/scripts/create_stripe_subscriptions.py:146`, new `relink_stripe_catalog.py` | yearly; on exposure | set (local) · to-be-set (Render) |
| `STRIPE_SECRET_KEY` (Live, `sk_live_…`) | Live-mode API key — scripts refuse it without `--live` (plan §3.5) | PM, Render (at cutover) | same readers | at cutover; on exposure | to-be-generated (Phase 4) |
| `STRIPE_WEBHOOK_SECRET` (Test, `whsec_…`) | signing secret of the Test webhook destination `https://<render>/api/webhooks/stripe` | PM, Render, `backend/.env` | `backend/routes/webhooks.py:38` | whenever the destination is recreated | **dead** (belonged to the deleted Edge endpoint) → to-be-generated when the Render destination is created |
| `STRIPE_WEBHOOK_SECRET` (Live) | Live destination secret | PM, Render | same | at cutover | to-be-generated (Phase 4) |
| Stripe CLI `whsec_…` (local `stripe listen`) | ephemeral per-session secret | nowhere persistent | `backend/.env` during a local run only | n/a | n/a |
| `STRIPE_PUBLISHABLE_KEY` | `pk_test_…` — not read by any code (Checkout is Stripe-hosted) | `backend/.env` | nothing | — | **retire** (plan §3.6) |
| `STRIPE_ENDPOINT_URL` | URL of the dead Edge webhook | `backend/.env` | nothing | — | **retire** |

## 4. Clerk

| Name | What | Home(s) | Read by | Rotate | Status |
|---|---|---|---|---|---|
| `REACT_APP_CLERK_PUBLISHABLE_KEY` | `pk_test_…` / `pk_live_…` (public, per-instance) | Vercel, Render, `.env.local` | `src/App.js:49`, `src/components/Gatekeeper.jsx:10`, `src/components/Header.jsx:11`, `src/components/layout/AppShell.jsx:10`, `src/pages/LandingPage.jsx:28`, `backend/lib/clerk_auth.py:77`, `scripts/check-env.js:61` | at Clerk production instance creation (Phase 4) | set |
| `CLERK_SECRET_KEY` | `sk_test_…` / `sk_live_…` Backend API key | PM, Render (Phase 2), `backend/.env` | nothing today; plan §4-5 / §4-7 (server-side age gate, user deletion) | yearly; on exposure | set in `backend/.env` · **retire from `.env.local`** (a secret under a CRA env file) · to-be-set on Render |
| `CLERK_ISSUER` (aliases `CLERK_ISSUER_URL`, `CLERK_FRONTEND_API`, `CLERK_DOMAIN`) | issuer URL (config) | Render, `backend/.env` | `backend/lib/clerk_auth.py:68-71` | with the instance | to-be-set in `backend/.env` (plan §3.6) |
| `CLERK_JWKS_URL`, `CLERK_JWT_AUDIENCE` | optional overrides (config) | Render | `backend/lib/clerk_auth.py:95,99` | n/a | unset (derived) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Next.js-era alias | `backend/.env`, `.env.local` | `src/*` fallbacks, `scripts/check-env.js:62` | — | **retire** |

## 5. AI providers

| Name | What | Home(s) | Read by | Rotate | Status |
|---|---|---|---|---|---|
| `OPENAI_API_KEY` | project-scoped key with a **$30 hard cap** (plan §6 W3–W4) | PM, Render, `backend/.env` | `backend/routes/ai_mentor.py:16` | quarterly; on exposure | to-be-generated (absent from `backend/.env` today) |
| `OPENAI_MODEL`, `AI_DAILY_TOKEN_BUDGET` | config | `render.yaml` | `backend/routes/ai_mentor.py:20-21` | n/a | set |
| `ELEVENLABS_API_KEY` | voice-mentor key | PM (parked) | `backend/routes/ai_mentor.py:22` | on exposure | **parked** (D7 `voice_enabled=false`) · **retire from `.env.local`** |
| `REACT_APP_ELEVENLABS_AGENT_ID` | public agent id | Vercel (parked) | `src/hooks/useElevenLabs.js:6` | n/a | parked |

## 6. Email + cron

| Name | What | Home(s) | Read by | Rotate | Status |
|---|---|---|---|---|---|
| `RESEND_API_KEY` | Resend API key | PM, `backend/.env`; **Render: leave unset until G3** (plan §3.4 — a fresh DB would re-send every welcome email) | `backend/lib/email.py:27,57` | yearly; on exposure | set (local) · deliberately unset (Render) |
| `EMAIL_FROM` | sender string (config) | `render.yaml` | `backend/lib/email.py:31` | n/a | set |
| `CRON_SECRET` | shared secret for `POST /api/email/weekly-reset-run` (`X-Cron-Token`) | PM, Render web + cron services, `backend/.env` | `backend/routes/email_ops.py:50`; `render.yaml` cron `dockerCommand` | yearly | to-be-generated (`openssl rand -hex 32`) |
| `API_BASE_URL`, `FRONTEND_BASE_URL`, `CORS_ALLOWED_ORIGINS` | public URLs (config) | Render, `backend/.env` | `backend/routes/email_ops.py:34,38`, `backend/routes/users.py:67-68`, `backend/routes/store.py:566`, `backend/server.py:46` | n/a | to-be-set in `backend/.env` |

## 7. Observability + analytics

| Name | What | Home(s) | Read by | Rotate | Status |
|---|---|---|---|---|---|
| `SENTRY_DSN` | backend DSN (semi-public) | Render, `backend/.env` | `backend/lib/sentry_init.py:89` | on abuse | set |
| `REACT_APP_SENTRY_DSN` | frontend DSN (public) | Vercel, `.env.local` | `src/lib/sentry.js:70`, `scripts/check-env.js:88` | on abuse | set · **retire from `backend/.env`** |
| `SENTRY_AUTH_TOKEN` | source-map upload token (**build-time secret**) | PM, Vercel build env, `.env.local` | `craco.config.js:111` | yearly; on exposure | set · **retire from `backend/.env`** (plan §3.6) |
| `SENTRY_ORG_SLUG`, `SENTRY_PROJECT_SLUG`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE` | config | Vercel / Render | `craco.config.js:112-113,134`, `backend/lib/sentry_init.py:94,100` | n/a | set |
| `REACT_APP_POSTHOG_KEY`, `REACT_APP_POSTHOG_HOST` | PostHog project token (`phc_…`, public by design) + host | Vercel, `.env.local` | `src/lib/analytics.js:39-40` | on abuse | **to-be-set under this name** — `.env.local` currently carries `POSTHOG_PROJECT_TOKEN` / `REACT_APP_POSTHOG_PROJECT_ID`, which nothing reads, so analytics is silently off locally |
| `POSTHOG_PROJECT_ID`, `REACT_APP_POSTHOG_PROJECT_ID`, `REACT_APP_POSTHOG_PROJECT_TOKEN` | mis-named PostHog vars | `backend/.env`, `.env.local` | nothing | — | **retire** |
| Better Stack monitors | dashboard login only | PM | nothing in code | n/a | set (account) |

## 8. Play Store (TWA)

| Name | What | Home(s) | Read by | Rotate | Status |
|---|---|---|---|---|---|
| *Upload keystore* `android.keystore` + keystore password + key password (alias `ysc-release`) | signs the TWA bundle; **losing it loses the Play listing** | **PM only** (file attachment + two passwords) | `bubblewrap build` by a human (`docs/runbooks/play-store.md` §1–2) | never (Play App Signing holds the app key; the upload key can be reset through Play support if lost) | to-be-generated at first `bubblewrap build` |
| Release SHA-256 fingerprint | public; goes in `public/.well-known/assetlinks.json` | repo | Android Digital Asset Links | with the keystore | to-be-set |
| Google Play Console login | account | PM | n/a | n/a | set (account) |

## 9. Platform accounts (no values in code)

| Credential | Home | Notes |
|---|---|---|
| GitHub (owner account, MFA) + `GITHUB_TOKEN` | PM / automatic | workflows use the automatic token with `permissions: contents: read` only |
| Supabase account (MFA — plan §3.4 step 1) | PM | one org, Pro; enable MFA before creating `ysc-prod` |
| Render, Vercel, Stripe, Clerk, OpenAI, Resend, Sentry, PostHog, Better Stack, ElevenLabs dashboards | PM | MFA where offered |
| OneDrive `YSC/backups/` | owner's Microsoft account | monthly artifact copy (database.md §6) |

## 10. Rules

1. **Add a row before adding a secret anywhere.** A secret with no row is a leak waiting
   to happen.
2. **One home per kind:** PM is canonical; Render/Vercel/GHA hold *copies* for one
   runtime each; `.env` files hold *copies* for one laptop. A value in a place not listed
   in its row is wrong.
3. **Frontend rule:** `scripts/check-env.js` hard-fails any `REACT_APP_*` name matching
   `/(SERVICE_ROLE|SECRET|WEBHOOK|PRIVATE)/i` (plan §3.6), and CI greps `build/static/js` for
   `sb_secret_` / `service_role`. Do not route around either.
4. **Rotation:** on any suspected exposure rotate first, investigate second; record the
   rotation as a `CURRENT_STATE.md` row (`S-SECRET-ROTATE-00n`) naming the row here, never
   the value.
5. **Retire list to action now** (plan §3.4 / §3.6, owner): `backend/.env` →
   `SUPABASE_ANON_KEY`, `STRIPE_ENDPOINT_URL`, `STRIPE_PUBLISHABLE_KEY`, `SENTRY_AUTH_TOKEN`,
   `REACT_APP_SENTRY_DSN`, `POSTHOG_*`, `REACT_APP_POSTHOG_*`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`;
   `.env.local` → `REACT_APP_SUPABASE_SERVICE_ROLE_KEY`, `CLERK_SECRET_KEY`, `ELEVENLABS_API_KEY`,
   `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
   `POSTHOG_PROJECT_ID`, `POSTHOG_PROJECT_TOKEN`, `REACT_APP_POSTHOG_PROJECT_ID`; plus delete
   the local `build/` directory and clear the Windows User-scope `SUPABASE_*` variables
   (database.md §5).
