# The Market Thirteen — YSC Go-to-Market Implementation Plan

**Version:** 1.0 · **Date:** 2026-06-10 · **Owner:** Jeremiah Van Wagner
**Companion docs:** [next-ten.md](next-ten.md) (operational initiatives), [CURRENT_STATE.md](../../CURRENT_STATE.md) (live status), [app-storyboard.md](../design/app-storyboard.md) (UX frames)

This is the prioritized, sequenced plan for the **thirteen things that must happen to take YSC to market — including Google Play distribution**. Every item is grounded in the current state of the repo and infrastructure as audited on 2026-06-10 (PR #9 merged: Modules D/F/H/I live, 156 backend + 96 frontend tests green).

Items are tagged by lens:
- 🏗 **Structural** — architecture that doesn't exist yet and everything else stands on
- 🛡 **Fortification** — security, reliability, compliance, cost-control
- 🚀 **Advancement** — capability and growth features that drive adoption

---

## At a Glance

| # | Item | Lens | Effort | Gates launch? | Depends on |
|---|---|---|---|---|---|
| 1 | Deploy the FastAPI backend to production | 🏗 | 2–3 d | **YES — nothing works without it** | — |
| 2 | Apply DB migrations + close security advisors | 🛡 | ½ d | YES | — |
| 3 | Production credential cutover (Clerk/Stripe/Sentry) | 🛡 | 1–2 d | YES | 1 |
| 4 | Subscription QA: manual runbook + E2E money-path | 🛡 | 2–3 d | YES | 1, 3 |
| 5 | Legal & privacy pack (ToS, Privacy, deletion flow) | 🛡 | 3–4 d | YES (also gates Play) | — |
| 6 | Frontend performance & resilience (code-split, Lighthouse CI) | 🏗 | 2–3 d | Should | — |
| 7 | AI cost & safety fortification | 🛡 | 1–2 d | Should | 1 |
| 8 | Email layer (Resend): onboarding sequence + weekly reset | 🚀 | 2–3 d | Should | 1 |
| 9 | Analytics & KPI instrumentation (PostHog) | 🚀 | 1–2 d | Should | — |
| 10 | PWA shell: service worker, icons, honest manifest | 🏗 | 2–3 d | YES for Play | 6 |
| 11 | Play Store packaging (TWA) + policy strategy | 🚀 | 3–5 d | YES for Play | 5, 10 |
| 12 | E2E test net + staging discipline | 🛡 | 2–3 d | Should | 1 |
| 13 | Beta program → public launch ops | 🚀 | 2 wks elapsed | YES | 1–5 |

Total focused build effort ≈ **4–5 engineer-weeks**, run over **~8 calendar weeks** with the beta soak.

---

## The Thirteen

### 1 · 🏗 Deploy the FastAPI backend to production
**Why it's #1:** The frontend is live at ysc.growthbychoice.com, but **no FastAPI backend is deployed anywhere** — there is no Dockerfile, no `api/` serverless config, and Better Stack explicitly deferred the `/api/health` monitor "until FastAPI is deployed." Every feature shipped this cycle (tasks, notes, planner, reminders, mentor, store) calls `REACT_APP_API_BASE_URL`; in production that's a dead letter. This is the single structural gap between "demo" and "product."

**Implementation:**
1. Add `backend/Dockerfile` (python:3.11-slim, `uvicorn server:app --host 0.0.0.0 --port 8000`, non-root user) + `.dockerignore`.
2. Host on **Render or Railway** (recommended over Vercel Python functions: the app is a long-lived ASGI service with JWKS caching and Stripe webhooks; cold-start serverless fights that). Region: us-east to match Supabase.
3. Set all backend env vars from `.env.example`; pin `CORS_ALLOWED_ORIGINS` to the prod + preview domains.
4. Point `REACT_APP_API_BASE_URL` (Vercel env) at the new API URL; remove reliance on the localhost fallback.
5. Add the Better Stack monitor on `/api/health` (2-failure alert) and a Sentry release tag for the backend service.
6. Wire deploy-on-merge from `main` (Render auto-deploy) so backend and frontend ship together.

**Acceptance:** `curl https://api.<domain>/health` returns healthy; signing in on production loads dashboard stats with zero 5xx in Sentry for 24 h; Better Stack green.

### 2 · 🛡 Apply pending DB migrations + close security advisors
**Why:** Migrations `007_planner_blocks`, `008_private_is_admin`, `009_reminders_reference_and_sm2` are authored but **not applied** to `ysc-staging`. Planner/reminders/SM-2 500 against the live DB until 007/009 land; 008 closes the `is_admin()` API-exposure advisor. Leaked-password protection is still OFF (one dashboard toggle).

**Implementation:** apply 007 → 008 → 009 in order via Supabase MCP/CLI; flip leaked-password protection ON; re-run `get_advisors(security)` and confirm zero WARNs; add a CI note that migration files must be applied before the deploy that needs them (runbook entry).

**Acceptance:** advisors clean; planner block CRUD + bell sync + SM-2 review verified against staging with a real user.

### 3 · 🛡 Production credential cutover
**Why:** Clerk runs on `pk_test_…`, Stripe on `sk_test_…`. Test-mode auth and payments cannot serve real users; this is deliberate build-phase posture that now needs a controlled cutover.

**Implementation:**
1. **Clerk:** create the production instance, configure prod domain + redirect URLs, swap `REACT_APP_CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY`, verify backend JWKS resolution against the prod issuer.
2. **Stripe:** activate Live mode; re-run `scripts/create_stripe_products.py` + `create_stripe_subscriptions.py` against Live (56 packs + 2 subs + 4 prices); create the Live webhook destination → Supabase Edge function; sync `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` to backend + Edge function per STORE_WEBHOOK_RUNBOOK.
3. **Sentry:** populate the four Vercel env vars (carry-over from session 2) so frontend Sentry activates; add backend DSN on the new host.
4. Rotate any key that ever touched a `.env` shared outside the vault; document the secret inventory (where each lives, who can read it).

**Acceptance:** real sign-up on prod domain; Live-mode $0.50 test purchase refunded; Sentry receives a thrown test event from prod with release + user id and no PII.

### 4 · 🛡 Subscription QA — the money path
**Why:** Flagged since session 2 and never done: **the subscription flow has never been manually QA'd** (STORE_WEBHOOK_RUNBOOK §12). Shipping payments untested is the fastest way to burn early-adopter trust.

**Implementation:** execute runbook §12 end-to-end in Test mode (4242 card): subscribe monthly + annual on both tiers, trial-only-on-first-sub rule, cancel → access-until-period-end, portal management, pack gating with active sub, webhook event ledger (`stripe_webhook_events`) showing exactly-once processing. Then encode the four highest-value paths as Playwright E2E (see #12) using Stripe test clocks. Fix what breaks; Sentry breadcrumbs (already wired) confirm webhook traces.

**Acceptance:** §12 checklist fully ticked with screenshots/logs attached to the issue; zero duplicate entitlements in `user_subscriptions` after webhook replay test.

### 5 · 🛡 Legal & privacy pack
**Why:** No Privacy Policy, no Terms of Service, no data-deletion flow exist. These gate public launch (scope §8), **and Play Console will not accept the listing without a privacy policy URL and a completed Data Safety form.** The audience includes minors — handle this with care, not boilerplate.

**Implementation:**
1. Privacy Policy + ToS pages (`/privacy`, `/terms`) rendered as public routes, linked in the landing footer and Clerk sign-up flow. Cover: data collected (email, display name, grade, study activity, AI chat logs), processors (Clerk, Supabase, Stripe, OpenAI, ElevenLabs, Sentry, PostHog), retention, children's privacy posture.
2. **Data deletion request flow:** `DELETE /api/users/me` backend endpoint — soft-delete `users` row (cascades exist), revoke Clerk user, cancel Stripe subscription, purge `ai_interactions` — plus a Settings "Delete account" frame with typed confirmation, and a fallback email channel documented in the policy.
3. COPPA/FERPA posture memo: target audience declared **13+** at launch (see #11); under-13 school distribution deferred until formal legal review (already flagged in scope §8).
4. Honesty sweep: `manifest.json` still claims "offline dictionary" and "**No subscription required**" — both now false. Fix alongside #10.

**Acceptance:** both pages live and linked; deletion flow verified end-to-end on staging (row soft-deleted, Clerk session killed, Stripe sub cancelled); policy URLs pasted into Play Console without rejection.

### 6 · 🏗 Frontend performance & resilience
**Why:** The bundle is a single 493 KB gzip chunk — every visitor downloads Recharts, the store, and the mentor to see the landing page. The scope's own bar is **dashboard < 2 s**; code-splitting is the cheapest structural win, and Lighthouse CI makes the bar enforceable instead of aspirational.

**Implementation:**
1. `React.lazy` + `Suspense` per route in `App.js` (LandingPage and Dashboard eager; everything else split). Expect main chunk to drop ~50–60%.
2. Add **Lighthouse CI** to `.github/workflows/ci.yml` against the Vercel preview URL with budgets: performance ≥ 85 mobile, dashboard TTI < 2 s, a11y ≥ 90.
3. Preconnect hints for Clerk/Supabase/API origins; verify font loading isn't render-blocking.
4. Add `headers` to `vercel.json`: CSP (script-src self + Clerk + Sentry + Stripe), HSTS, X-Content-Type-Options, Referrer-Policy.

**Acceptance:** budgets pass in CI on two consecutive PRs; WebPageTest run from a mid-tier Android shows dashboard interactive < 2 s on 4G.

### 7 · 🛡 AI cost & safety fortification
**Why:** Mentor routes already have slowapi limits (10–20/min) — good — but per-minute limits don't cap monthly spend, and the "coach, don't cheat" guardrails have never been adversarially reviewed. AI is the #1 variable cost and the #1 reputational risk with student users.

**Implementation:**
1. Per-user **daily token budget** enforced in `ai_mentor.py` (count from `ai_interactions.tokens_used`; free tier ~20 messages/day, subscriber tier higher; 429 with friendly UI copy when exhausted).
2. OpenAI dashboard hard usage cap + alert at 70%.
3. Guardrail eval pass: a 20-prompt red-team checklist (write-my-essay, test answers, self-harm adjacency, jailbreak phrasing) run against the system prompt; log outcomes; tune prompt; rerun. Schedule monthly.
4. Confirm every chat turn lands in `ai_interactions` with tokens + model (cost observability), and add a weekly cost rollup query to the admin runbook.

**Acceptance:** budget 429 path tested in UI; eval checklist ≥ 19/20 safe outcomes; cost dashboard query documented.

### 8 · 🚀 Email layer (Resend)
**Why:** Resend API key has been live in `backend/.env` since May with zero code. Email is the retention lever the scope explicitly wants (weekly reset prompt, onboarding sequence) and the KPI tree (W1 retention ≥ 40%) depends on it.

**Implementation:**
1. `backend/lib/email.py` (Resend SDK, templated send, suppression on `is_read`/unsubscribe).
2. Transactional set: welcome (on resolve), onboarding-incomplete nudge (24 h), **weekly reset email** (Sunday evening user-local, generated from the same data as `weekly_reset` reminders + last week's report snapshot).
3. Scheduler: Supabase Edge Function on cron (or Render cron) calling a `POST /api/reminders/weekly-reset` admin-token endpoint that also writes the in-app `weekly_reset` reminder (type + bell rendering already exist).
4. Unsubscribe link + preference in Settings; suppress for deleted accounts.

**Acceptance:** test cohort receives all three email types correctly localized; unsubscribe honored; bounce/complaint webhook logged.

### 9 · 🚀 Analytics & KPI instrumentation (PostHog)
**Why:** Account enrolled 2026-05-24, zero wiring. Without funnel data the beta (#13) produces anecdotes, not decisions, and the scope's KPIs (onboarding ≥ 70 %, W1 retention ≥ 40 %, WAU/total ≥ 35 %) are unmeasurable.

**Implementation:** `posthog-js` init beside Sentry init with the same PII discipline (no email; Clerk id only); autocapture OFF, explicit events: `signup`, `onboarding_step_n`, `onboarding_complete`, `task_create`, `focus_complete`, `note_create`, `card_review`, `block_create`, `mentor_message`, `checkout_start/success`, `report_view`. Build the activation funnel + retention dashboard; document in `docs/runbooks/analytics.md`. Respect DNT; disclose in privacy policy (#5).

**Acceptance:** funnel renders real data from staging; events visible within 60 s; no PII in any captured payload.

### 10 · 🏗 PWA shell — the bridge to Play
**Why:** The manifest exists but **no service worker is registered**, icons are favicon-grade, and the manifest copy is dishonest (claims offline + "no subscription required"). A real PWA is both the mobile experience and the **hard prerequisite for Play Store via TWA** (#11).

**Implementation:**
1. Workbox service worker (CRA `workbox-webpack-plugin` via CRACO): precache app shell, stale-while-revalidate for static assets, network-first for `/api/*`, **offline fallback page** ("You're offline — focus timer still works").
2. Icon set: 192/512 maskable PNGs + monochrome; splash colors already in manifest.
3. Manifest truth-up: rewrite description (no offline-dictionary claim, no "no subscription required"), correct `start_url=/app`, add `id`, screenshots array (needed for richer install UI and reused in Play listing).
4. Install prompt: lightweight "Add to home screen" affordance in Settings (capture `beforeinstallprompt`).
5. Lighthouse PWA category green in CI (#6's pipeline).

**Acceptance:** installable on Android Chrome with correct icon/name; offline launch shows the fallback, online behavior unchanged; Lighthouse PWA pass.

### 11 · 🚀 Play Store packaging (TWA) + policy strategy
**Why:** Web-first to Play without a rewrite = **Trusted Web Activity**. The build is mechanical; the **policies are the real work** — payments and families rules sink TWAs that ignore them.

**Implementation:**
1. **Package:** Bubblewrap (or PWABuilder) wrapping `https://ysc.growthbychoice.com` → signed `.aab`; host `/.well-known/assetlinks.json` on the domain (Vercel static) with the release-key fingerprint so the TWA opens full-screen without browser chrome.
2. **Play Console:** create app, store listing (title ≤ 30 chars, short/full description from landing copy — *honesty-swept*), screenshots (reuse #10), feature graphic, IARC content-rating questionnaire (manifest already carries an IARC id — redo it properly for Play), **Data Safety form** sourced from the #5 privacy inventory.
3. **Payments policy decision (locked here):** launch the Android app **consumption-only** — all subscription/pack purchasing happens on the website; the app does not link to or mention external purchase flows (Play billing policy). Gate `/app/store` + `/app/subscribe` behind a platform check (TWA detection via `document.referrer`/start-url param) that shows entitlements but hides checkout CTAs on Android. **Phase 2 decision point:** integrate Play Billing or use the User-Choice-Billing program if in-app purchase becomes strategic.
4. **Target audience & families:** declare **13+** (the under-13 middle-school segment makes the app otherwise subject to the Designed-for-Families program — ads, data, and review requirements we are not ready to certify). Pair with the #5 legal memo; revisit for school distribution with counsel.
5. Closed testing track with the beta cohort (#13) for at least one release before production rollout; staged rollout 20% → 100%.

**Acceptance:** `.aab` accepted; assetlinks verified (no browser bar); Data Safety + content rating approved; closed-track install works on 3 physical devices; no Play policy strikes after review.

### 12 · 🛡 E2E test net + staging discipline
**Why:** `tests/` is an empty placeholder; CI gates are unit-only. The five flows that kill a launch when they regress (auth, onboarding, task→dashboard, checkout, mentor) need browser-level coverage, and previews need seeded data to test against.

**Implementation:**
1. Playwright suite in `tests/e2e/`: sign-in (Clerk test token) → onboarding completes → dashboard shows stats → create task → start/complete focus → note + card review → reminders bell badge → subscribe checkout reaches Stripe (test mode, asserted by URL) and returns.
2. Run nightly against the Vercel preview of `main` + on-demand label for PRs (not every PR — keep CI < 5 min).
3. Seed script (`backend/scripts/seed_e2e_user.py`) creating a deterministic test user with fixture tasks/notes/blocks; teardown after run.
4. Promote-to-prod checklist documented: migrations applied → E2E green on staging → manual smoke (storyboard §8 failure frames) → promote.

**Acceptance:** suite green 5 consecutive nights; a deliberately broken checkout URL fails the suite (proves it tests something).

### 13 · 🚀 Beta program → public launch ops
**Why:** Scope §12 defines the launch as controlled-beta-first (20–50 students, 14-day cycle). Everything above makes beta *possible*; this item makes it *productive* and converts it into the public launch.

**Implementation:**
1. **In-app feedback widget** (lightweight dialog → `POST /api/feedback` → table + Slack/email notification) + public **changelog page** (`/changelog`, markdown-driven).
2. **Walkthrough:** 4-step first-run tooltip tour (dashboard → add task → start focus → ask mentor) using the existing UI kit; dismiss state in profile.
3. Recruit 20–50 students (existing audience + 2 partner teachers); onboarding email sequence (#8) carries them through week 1.
4. Run the 14-day cycle against the KPI dashboard (#9): onboarding ≥ 70 %, W1 retention ≥ 40 %, zero P0s, support < 24 h. Triage dailies; 48 h critical-bug SLA (scope §14).
5. **Go/no-go gate** (all must hold): MVP done-criteria from scope §11 ✓, money-path QA ✓ (#4), legal pages live ✓ (#5), Sentry < 1 % error rate, uptime ≥ 99.5 % over the beta window.
6. Public launch: Play production rollout (#11), landing announcement, changelog entry, monitoring rota for week 1.

**Acceptance:** go/no-go review documented in CURRENT_STATE with KPI screenshots; production rollout completed without rollback.

---

## Sequencing — eight weeks

```
Week 1  ████ #1 Backend deploy     ██ #2 Migrations+advisors      ▒ #9 PostHog start
Week 2  ████ #3 Credential cutover ██ #4 Subscription QA          ▒ #6 Code-split
Week 3  ████ #5 Legal pack         ██ #6 Lighthouse CI + headers  ▒ #7 AI budgets
Week 4  ████ #8 Email layer        ██ #12 E2E net + staging
Week 5  ████ #10 PWA shell         ██ #13 feedback widget + walkthrough + changelog
Week 6  ████ #11 TWA + Play Console (closed track)   ── beta cohort recruited
Week 7  ████ #13 Beta cycle (days 1–7)   ── fix list, daily triage
Week 8  ████ #13 Beta cycle (days 8–14) → go/no-go → Play staged rollout + public launch
```

Critical path: **1 → 3 → 4 → (5, 10) → 11 → 13**. Items 6–9 and 12 parallelize off-path.

## Risk deltas this plan introduces

| Risk | Mitigation |
|---|---|
| Play review rejects payments posture | Consumption-only build with checkout CTAs verifiably absent on Android; screenshots of both variants kept for appeal |
| Under-13 users self-report into a 13+ app | Age screen at sign-up (Clerk metadata), families-program legal review queued before any school/district push |
| Live Stripe cutover breaks entitlements | #4's webhook replay tests run against Live webhook destination in $0 mode before products go visible |
| Backend host adds a new failure domain | `/health` + Better Stack from day one (#1), request-id tracing already wired through Sentry |
| Service worker caches a broken deploy | Workbox `skipWaiting` + versioned precache, "refresh to update" toast, kill-switch documented in observability runbook |

---

*Update discipline: when an item closes, append the audit row in CURRENT_STATE.md and tick it here with the closing SHA. This document supersedes nothing — it sequences what next-ten.md and YSC_ROADMAP.md already gesture at into a single market-entry critical path.*
