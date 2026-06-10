# YSC — Current State

**Last updated:** 2026-06-10 (session 3)
**HEAD:** branch `claude/eloquent-edison-zji106` (Notes + Planner + Weekly Report modules) targeting `main`. `main` at `2b2af17` (PR #8 merge — Sentry observability + SEO truth-up are both in). DB: migrations 007/008 authored but **not yet applied** (see Blocking issue).
**Owner:** Jeremiah Van Wagner

This file is the single at-a-glance snapshot of where YSC stands plus an append-only audit log of step opens/closes. Update the snapshot section in place; only ever **append** rows to the audit log at the bottom.

---

## 1. Snapshot

| | |
|---|---|
| 90-day launch target | **~2026-08-20** (~10 weeks from today) |
| Active plan | **Next-Ten Initiatives** ([docs/strategy/next-ten.md](docs/strategy/next-ten.md), [docs/strategy/next-ten-implementation.md](docs/strategy/next-ten-implementation.md)). Tier 1 in progress. |
| Active step | **Step 5 (Notes + flashcards) closed** and **Step 9 (Planner + Weekly Report) majority shipped** in session 3 — see audit log S5-CLOSE-001 / S9-IMPL-001/002. Remaining in step 9: full SM-2 engine upgrade (lightweight spaced repetition shipped now). **Step 7** still paused at Phase 7.2. |
| Status | 🟢 ON TRACK |
| Blocking issue | Migrations `backend/migrations/007_planner_blocks.sql` (planner table) and `008_private_is_admin.sql` (security-advisor fix) must be applied to `ysc-staging` before the planner endpoints work in any deployed env — session 3 tooling was permission-gated from applying them. Also still pending: leaked-password protection toggle in Supabase Auth dashboard (advisor warning, dashboard-only setting). |

### Live infrastructure

| Service | Reference |
|---|---|
| GitHub | [jeremiahvanwagner-droid/Your-Student-Companion-main](https://github.com/jeremiahvanwagner-droid/Your-Student-Companion-main) (public — flipped 2026-05-24 to enable branch protection on Free plan) |
| Vercel (frontend) | https://ysc.growthbychoice.com (production, custom domain) + https://your-student-companion-main.vercel.app (Vercel default). Latest prod deploy `dpl_HRfUbMx83bJCzfST7RZGbULBUMis` on `ae0908b`; new deploy queued 2026-05-24 after PostHog/BetterStack setup. |
| Supabase project | `uvyvvaxufmylqavewvex` (ysc-staging) — PG 17.6, ACTIVE_HEALTHY |
| Stripe mode | ✅ **Test** mode (`sk_test_51Ta…`); promotion to Live deferred to post-QA |
| Stripe webhook destination | Created 2026-05-23 → `https://uvyvvaxufmylqavewvex.supabase.co/functions/v1/stripe-webhook`; subscribed to 7 events |
| Clerk | `pk_test_…` (test mode, intentional during build) |
| Sentry | Project `javascript-react` (enrolled 2026-05-24). DSN in `.env.local` + `backend/.env`. NOT yet activated in prod — depends on [PR #7](https://github.com/jeremiahvanwagner-droid/Your-Student-Companion-main/pull/7) merge + Vercel env var population. |
| Better Stack | Uptime monitoring active (account: `support@truthjblue.com`). Monitoring `https://your-student-companion-main.vercel.app` every 3 min. Backend `/api/health` monitor deferred until FastAPI is deployed. |
| PostHog | Account enrolled 2026-05-24. Code wiring is plan #7 (week 5); not yet started in any branch. |
| Resend | API key live in `backend/.env`. Code wiring is plan #5 (Step 4.5 grandfather email + future transactional sends); not yet started. |

### Right now

- **Done this session (2026-06-10, session 3):**
  - **Full-stack audit** — frontend↔backend API contract sweep found zero mismatches; nav links all valid; `aggregateRating` confirmed gone from `public/index.html`; baseline suites green before any change (backend 93, frontend 75, prod build OK). Cleanups applied: removed stray `console.log` voice-event handlers from `TheMentor.jsx`.
  - **Step 5 closed — Notes + review cards (Module F):** new `backend/routes/notes.py` (`/api/notes` CRUD with ilike search/tag/subject/archived filters; `/api/notes/cards` with lightweight spaced-repetition review — again/hard/good/easy ratings drive `next_review_at`/`difficulty`/`review_count`). `NotesPad.jsx` rebuilt from stub: tabs for Notes (debounced search, tag chips, archive, subject picker) and Review Cards (due queue, flip-and-rate session, make-card-from-note).
  - **Step 9 majority — Study Planner (Module D) + Weekly Report (Module H):** new `planner_blocks` table (migration 007) + `backend/routes/planner.py` (block CRUD, bulk insert, `/api/planner/suggest` auto-suggestions from due-soon assignments in the student's profile timezone) + `backend/routes/reports.py` (`/api/reports/weekly/current` computed live, `/generate` idempotent snapshot upsert on `(user_id, week_start)`, `/history`). `StudyPlanner.jsx` rebuilt: Mon–Sun week grid, week nav, create/complete/delete blocks, accept-suggestions dialog. `WeeklyReport.jsx` rebuilt: summary cards, Recharts daily composed chart, week-over-week trend, Next Week Plan card. Dashboard "Due Soon + Study Blocks" stub now renders real upcoming blocks (next 48h).
  - **Security advisor fix authored (migration 008):** moves `is_admin()` out of the PostgREST-exposed `public` schema into `app_private` (policies keep working — OID references), resolving the "SECURITY DEFINER callable via /rest/v1/rpc" lint. **Not yet applied** (permission-gated this session) — apply 007+008 via Supabase MCP/CLI before deploy.
  - **Shared frontend API helper** `src/lib/apiClient.js` (auth headers + response handling) now backs `notesApi.js`, `plannerApi.js`, `reportsApi.js`.
  - **Tests:** backend 93 → 138 (test_notes 19, test_planner 18, test_reports 8); frontend 75 → 91 (NotesPad 6, StudyPlanner 5, WeeklyReport 5). Prod build green with CI lint.

- **Done session 2 (2026-05-24):**
  - **Next-Ten plan #2 (Backend CI gate) closed** — `.github/workflows/ci.yml` already triggered `backend-test` on PRs; the missing piece was branch protection on GitHub. Repo flipped from private → public after pre-flip safety scan (no secrets in git history, `.gitignore` excludes `.env*`). Classic branch protection rule now active on `main`: required status checks (`backend-test` + `build`), required PR (0 approvals — solo), conversation resolution required, force pushes + deletions blocked. Audit: S-CI-OPEN-001, S-CI-REPO-VIS-001, S-CI-CLOSE-001.
  - **Next-Ten plan #1 (Production Observability) — code/docs landed in PR #7** (commit `3416994`, 23 files, +1679):
    - **Frontend Sentry** — `@sentry/react` init at app boot, `Sentry.ErrorBoundary` with retry fallback, scrubPII strips emails/auth/cookies, Clerk user id stamped in AppAccessGuard + cleared in Gatekeeper, soft env-check warning in prebuild. Tests 56 → 75.
    - **Backend Sentry** — `sentry-sdk[fastapi]` + `python-json-logger`, new `backend/lib/sentry_init.py` + `backend/lib/request_id.py` (X-Request-ID middleware with Sentry tag propagation), `server.py` JSON structured logging, `clerk_auth.py` user identification, `routes/webhooks.py` Stripe event breadcrumbs/tags. Tests 70 → 93.
    - **Source maps** — `@sentry/webpack-plugin` in `craco.config.js`, uploads + deletes `.map` files on prod builds.
    - **Runbook** — new [docs/runbooks/observability.md](docs/runbooks/observability.md) with dashboard refs, debugging via request_id, PII guarantees, smoke test, emergency disable.
    - **Worktree fix** — `craco.config.js` Jest testMatch now uses posix-normalized cwd; previously the `.claude/` segment in Claude Code worktree paths broke glob matching on Windows.
  - **Uptime monitor live** — Better Stack free tier configured (auto-created during onboarding). Monitors `https://your-student-companion-main.vercel.app` every 3 min. Backend `/api/health` monitor deferred until backend hosting decided.
  - **Three Tier-1 vendor decisions resolved** — Sentry (project `javascript-react`), Better Stack (uptime), Resend (API key live in `backend/.env`). PostHog enrolled but key wiring deferred to plan #7 (week 5).

- **Pending to fully close #1 Observability (S-OBS-CLOSE-001), in order:**
  1. **Add Sentry env vars to Vercel** ([Project Settings → Environment Variables](https://vercel.com/truth-j-blues-projects/your-student-companion-main/settings/environment-variables)). Four vars for Production scope:
     - `REACT_APP_SENTRY_DSN` (same value as `backend/.env`'s `SENTRY_DSN`)
     - `SENTRY_AUTH_TOKEN` (from `.env.local`; never expose publicly)
     - `SENTRY_ORG_SLUG`
     - `SENTRY_PROJECT_SLUG`
     Plus ensure outstanding `REACT_APP_CLERK_PUBLISHABLE_KEY` rename is done (carryover from previous session).
  2. ~~**Merge [PR #7](https://github.com/jeremiahvanwagner-droid/Your-Student-Companion-main/pull/7)**~~ ✅ Done — landed on `main` via PR #8 merge (`2b2af17`). Sentry activates in production once Vercel rebuilds with the env vars from step 1.
  3. **Sentry end-to-end smoke test** — `npm start` locally (or use the deployed prod build), sign in, throw an error in devtools console, confirm event lands in Sentry within 1 min with Clerk user id + request_id tag + **no email in JSON**. Per [docs/runbooks/observability.md §8](docs/runbooks/observability.md).
  4. **Better Stack alert verification** — confirm "alert after 2 failures" set + test email arrives at `support@truthjblue.com`.
  5. Append **S-OBS-CLOSE-001** once steps 1-4 confirmed.

- **Known issues from 2026-05-24 Perplexity diagnostic (audit S-DIAG-001):**
  - 🔴 **Fabricated Schema.org `aggregateRating`** in [public/index.html](public/index.html) showing `4.9 stars` over `50000 reviews`. Violates Google Search Quality Guidelines; risk of manual penalty or rich-result suppression. **Must remove or replace before any SEO/public push.** Fix is one HTML edit, ~5 minutes.
  - 🟠 **PWA "offline dictionary" claim** not yet true — already known (R4 in next-ten risk register, addressed by plan #8 honesty fix or real PWA).
  - 🟡 **Supabase pre-existing advisors**: `is_admin()` RPC publicly executable + leaked-password protection OFF. Pre-date Step 7. Fix before public launch.

- **After #1 closes (in order per the plan):**
  1. **Next-Ten #3 — Manual subscription QA pass** of [STORE_WEBHOOK_RUNBOOK.md §12](backend/STORE_WEBHOOK_RUNBOOK.md) with Stripe `4242` test card. Now backed by Sentry capture if any flow breaks.
  2. **Next-Ten #8 honesty fix** (≤10 min) — strip "offline dictionary" claims from `src/pages/LandingPage.jsx` and the matching FAQPage Schema.org block. Same edit pass can fix the fabricated `aggregateRating`.
  3. **Next-Ten #4 — Step 7 Phase 7.3** (attempt lifecycle + scoring engine) per [docs/phases/step-7-exams.md](docs/phases/step-7-exams.md).
  4. **Next-Ten #5 — Email infra + Step 4.5 grandfather email** (Resend already enrolled).
  5. **Next-Ten #7 — PostHog analytics wire-up** (key still needs harvest).
  6. Etc per [docs/strategy/next-ten.md §12-Week Sequencing](docs/strategy/next-ten.md).

- **Recovery refs (local-only tags):**
  - `step1-completed` → ai_mentor 422 fix attempt (redundant with origin; recover if ever needed)
  - `step2-attempt-1` → truth-up attempt (redundant with origin; recover if ever needed)

---

## 2. 12-Step Plan Progress

Targeting a beta launch by ~2026-08-20. See `YSC_ROADMAP.md` for full phase detail; this table is the live status.

| # | Step | Status | Notes |
|---|---|---|---|
| 1 | Stabilize database (seed + advisors) | ✅ done | Supabase migrations 20260522205653 / 205708 / 205832 |
| 2 | Truth-up Phase 0 (tests, gates, legacy cleanup) | ✅ done | Already shipped via origin PRs #4–6; reconciled by reset to c21f45b. Store.jsx cleanup deferred to its own PR |
| 3 | Subscription tiers + Stripe products | ✅ done | 56 one-time + 2 subscription products in Test mode; webhook destination live with 7 events; idempotency table + grandfather flag in place |
| **4** | **Subscription checkout + portal UI** | ✅ done | Committed `f9e2e04` on 2026-05-24. `/app/subscribe`, billing portal, trial-only-on-first-sub, subscription-aware pack gating, 17 new tests, runbook §12. Manual QA still pending. |
| **5** | **Notes + manual flashcards (free tier)** | ✅ done | Session 3 (2026-06-10): `/api/notes` + `/api/notes/cards` + NotesPad UI + 19 backend / 6 frontend tests. Lightweight spaced repetition shipped; SM-2 upgrade tracked under step 9. |
| 6 | Team Messaging Board (real-time chat, IAP) | ⏳ pending | Depends on 3 (entitlement gating) |
| **7** | **Placement tests + 50-state question model** | 🔄 in progress | Phase 7.1 closed 2026-05-24 (schema + RLS + NY Regents Algebra I seed). 7.2–7.8 ahead. Spec: [docs/phases/step-7-exams.md](docs/phases/step-7-exams.md) |
| 8 | Content authoring admin + delivery API | ⏳ pending | Depends on 3 (entitlement gating) |
| **9** | **SM-2 review + Study Planner + Weekly Report** | 🔄 in progress | Session 3: Study Planner (planner_blocks + auto-suggest + UI) and Weekly Report (live compute + snapshots + Recharts UI) shipped. Remaining: full SM-2 scheduling engine to replace the lightweight interval model. |
| 10 | AI content generation + reminders/notifications | ⏳ pending | Depends on 8 |
| 11 | Voice polish + analytics + Sentry + PWA shell | ⏳ pending | Independent |
| 12 | Beta cohort (50–100 students) + launch | ⏳ pending | Depends on everything |

**Pricing locked:** Free / Degree Bundle ($7.99/mo, $79.99/yr) / All-Access ($14.99/mo, $149.99/yr). 14-day free trial on first sub. Existing one-time pack buyers grandfathered with `lifetime_access=true`. Full detail in `backend/STORE_WEBHOOK_RUNBOOK.md` §§8–11.

---

## 3. Audit Log (append-only)

Add new rows; never edit or remove existing rows. Use the next sequential entry ID per step (`S3-OPEN-002`, `S3-CLOSE-001`, etc.).

| Entry ID | Date | Type | Subject | Status | Reference |
|---|---|---|---|---|---|
| S1-OPEN-001 | 2026-05-22 | STEP_OPEN | step-1-db-stabilization | OPEN | session start |
| S1-CLOSE-001 | 2026-05-22 | STEP_CLOSE | step-1-db-stabilization | CLOSED | Supabase migrations 20260522205653 / 205708 / 205832 |
| S2-OPEN-001 | 2026-05-22 | STEP_OPEN | step-2-truth-up | OPEN | session start |
| S2-CLOSE-001 | 2026-05-22 | STEP_RECONCILED | step-2-truth-up | RECONCILED | origin/main already had Phase 0 closeout via PRs #4–6; local reset to c21f45b |
| S3-OPEN-001 | 2026-05-22 | STEP_OPEN | step-3-subscriptions | OPEN | session start |
| S3-PAUSE-001 | 2026-05-22 | STEP_PAUSE | step-3-subscriptions | PAUSED | commit 116a6ae; awaiting Stripe Test-mode keys before running 3.3, 3.4, 3.5 |
| S3-RESUME-001 | 2026-05-23 | STEP_RESUME | step-3-subscriptions | OPEN | Test keys swapped; resumed at 3.3 |
| S3-CLOSE-001 | 2026-05-23 | STEP_CLOSE | step-3-subscriptions | CLOSED | 56 one-time + 2 sub products + 4 recurring prices created in new Test-mode Stripe account; webhook destination configured with 7 events; STRIPE_WEBHOOK_SECRET + STRIPE_SECRET_KEY synced to Edge function; validate_supabase_webhook.py PASS |
| S4-OPEN-001 | 2026-05-23 | STEP_OPEN | step-4-subscription-ui | OPEN | plan approved at `.claude/plans/glistening-baking-snowglobe.md` |
| S4-CLOSE-001 | 2026-05-23 | STEP_CLOSE | step-4-subscription-ui | CLOSED | 3 new backend routes; webhook gap-fill for invoice.paid/trial_will_end (both Python + Edge function, deployed); `/app/subscribe` UI; subscription-aware pack gating; 17 new tests pass; runbook §12. 10 modified + 7 new files in working tree — not yet committed |
| S4-COMMIT-001 | 2026-05-24 | STEP_COMMIT | step-4-subscription-ui | CLOSED | Step 4 working-tree changes finally committed and pushed as `f9e2e04` on `main` (21 files, +1862/-32). Memory entry `project_step4_subscriptions.md` updated to reference the SHA. |
| W1-OPEN-001 | 2026-05-24 | WALKTHROUGH_OPEN | loom-walkthrough-remediation | OPEN | Loom video walkthrough flagged 5 issues: (1) auth entirely broken, (2) account creation inaccessible, (3) onboarding bypassed → Week 6, (4) "New Test" non-functional, (5) navigation inconsistencies. Comprehensive remediation plan delivered before code changes. |
| W1-FIX-001 | 2026-05-24 | WALKTHROUGH_FIX | loom-walkthrough-remediation | IN_PROGRESS | Crisis fixes commit `2b163fc` — App.js auth bypass hardened; LandingPage Safe* recursion fixed; /app/legacy guarded; TruthLine data-driven (no more hardcoded Week 6); TaskManager errors via toast. 5 files, +153/-31. 41/41 tests still pass. |
| W1-FIX-002 | 2026-05-24 | WALKTHROUGH_FIX | loom-walkthrough-remediation | IN_PROGRESS | Phase 2 + auth polish commit `b31c471` — 6th onboarding step captures semester_start_date; UserSettings editor with merge-aware save; NotFoundPage replaces catch-all redirect; Gatekeeper clears localStorage on sign-out; AppAccessGuard retry screen instead of localStorage fallback. 7 files, +263/-15. 41/41 tests still pass. |
| W1-FIX-003 | 2026-05-24 | WALKTHROUGH_FIX | loom-walkthrough-remediation | IN_PROGRESS | CI unblock commit `bd330c4` — NotFoundPage called useAuth conditionally inside a try/catch, violating react-hooks/rules-of-hooks. ESLint caught it under CI=true; jest didn't. Defensive try/catch was unnecessary (NotFoundPage only mounts inside ClerkProvider). 1 file, +3/-10. |
| W1-HARDEN-001 | 2026-05-24 | WALKTHROUGH_HARDEN | loom-walkthrough-remediation | CLOSED | This commit. Extracted AppAccessGuard to its own file. Added 15 regression tests (9 AppAccessGuard, 4 NotFoundPage, 2 Gatekeeper localStorage cleanup) — frontend suite 41 → 56. Added scripts/check-env.js as a prebuild hook so Vercel fails loudly with a listed-out error when REACT_APP_* env vars are missing (would have prevented the original walkthrough disaster). Updated CURRENT_STATE.md and memory. |
| S7-OPEN-001 | 2026-05-24 | STEP_OPEN | step-7-exams | OPEN | Architecture spec committed as `055986b`: [docs/phases/step-7-exams.md](docs/phases/step-7-exams.md). 8 new tables proposed + student_profiles.state column. Decisions locked: pricing = All-Access bundles + per-exam packs (no new tier); MVP scope = 8 exams (Regents Alg I, STAAR G8 Math, CAASPP G8 Math, PERT, SHSAT, HSPT, ACT, AP Biology); content strategy per §11.3. |
| S7.1-CLOSE-001 | 2026-05-24 | STEP_CLOSE | step-7.1-schema | CLOSED | Phase 7.1 migrations applied to `ysc-staging`: `exams_schema_v1` (7 tables + indexes + RLS-enable + updated_at triggers), `exams_state_column` (student_profiles.state char(2)), `exams_rls_policies_v1` (catalog tables: anon+authenticated read where published / is_admin() writes; owner tables: user_id=auth.uid() with admin override). Seeded NY Regents Algebra I + 4 sections + 1 original sample question for end-to-end model validation. get_advisors(security) clean of new findings (2 pre-existing warnings: is_admin() RPC executable, leaked-password protection off — both predate Step 7). No code changes. |
| S7.2-CLOSE-001 | 2026-05-24 | STEP_CLOSE | step-7.2-catalog-api | CLOSED | Catalog API endpoints shipped: `GET /api/exams` (list, filters: state/grade_band/category; defaults state to student_profiles.state when not provided; nationals always pass state filter), `GET /api/exams/{slug}` (detail + sections + available_question_count), `GET /api/exams/{slug}/preview` (free sample driven by scoring_metadata.free_sample_question_count; defaults to 0; strips is_correct from choices so the answer key is never leaked). New `backend/routes/exams.py` + 1-line `server.py` registration. New `backend/tests/test_exams.py` with 13 tests including the answer-key-leak regression. Backend suite 57 → 70. No frontend or schema changes. |
| S-CI-OPEN-001 | 2026-05-24 | INIT_OPEN | next-ten-#2-ci-gate | OPEN | Per [docs/strategy/next-ten-implementation.md](docs/strategy/next-ten-implementation.md) §#2. `.github/workflows/ci.yml` already triggers `backend-test` on `pull_request: branches: [main]` — no YAML changes required. Remaining work: user-action to add `backend-test` to required status checks under GitHub Settings → Branches → Branch protection rule for `main`. Optional --cov-fail-under bump 25→35 deferred until Phase 7.3 ships. |
| S-CI-REPO-VIS-001 | 2026-05-24 | INFRA_CHANGE | repo-visibility | DONE | GitHub repo flipped from private to public to unlock classic branch protection on the Free plan ("Your GitHub Free plan can only enforce rules on public repositories"). Pre-flip safety scan confirmed: no `.env*` file ever committed to git history; no hardcoded Stripe/Supabase/Clerk/webhook secrets in tracked files; `.gitignore` properly excludes `.env` and `.env.*` except `.env.example`. No Play Store / App Store implication — store binaries are built artifacts, repo visibility is unrelated. |
| S-CI-CLOSE-001 | 2026-05-24 | INIT_CLOSE | next-ten-#2-ci-gate | CLOSED | Classic branch protection rule active on `main` with: required status checks (`backend-test` + `build`), require branches up to date, require PR before merging (0 approvals — solo contributor), dismiss stale approvals, require conversation resolution. Force pushes + deletions blocked. Configured via GitHub UI; not in version control. Acceptance criterion (merge button greyed out until checks pass) verifiable on next PR. |
| S-OBS-OPEN-001 | 2026-05-24 | INIT_OPEN | next-ten-#1-observability | OPEN | Per [docs/strategy/next-ten-implementation.md](docs/strategy/next-ten-implementation.md) §#1. Three decisions resolved: Sentry (enrolled, project `javascript-react`), PostHog (enrolled, key TBD), Resend (enrolled, API key already in `backend/.env`). Frontend + backend wiring in flight under this entry. |
| S-OBS-FRONTEND-001 | 2026-05-24 | IMPL | next-ten-#1-observability | DONE | Frontend Sentry wiring: `@sentry/react` installed, `src/lib/sentry.js` (init + scrubPII strips emails/auth/cookies + identify/clear user), `Sentry.ErrorBoundary` at App level with `GlobalErrorFallback`, Clerk user id stamped on scope via AppAccessGuard + cleared via Gatekeeper, soft env check in `scripts/check-env.js` (warn-only). 19 new tests (11 scrubPII + 4 init + 2 AppAccessGuard sentry + 2 Gatekeeper sentry); frontend suite 56 → 75. Also patched `craco.config.js` testMatch to handle Claude Code worktree paths (`.claude/` segment was breaking Jest's glob on Windows). |
| S-OBS-BACKEND-001 | 2026-05-24 | IMPL | next-ten-#1-observability | DONE | Backend Sentry wiring: `sentry-sdk[fastapi]>=2.18.0` + `python-json-logger>=2.0.7` pinned. New `backend/lib/sentry_init.py` (init + scrub_pii_event + identify_sentry_user, FastApiIntegration + StarletteIntegration). New `backend/lib/request_id.py` middleware (echo or generate per-request X-Request-ID, stamp Sentry scope, expose via CORS). `server.py` switched to JSON structured logging; init_sentry called at module import before FastAPI() construction; RequestIdMiddleware registered before CORS with X-Request-ID added to `expose_headers`. `clerk_auth.py` calls `identify_sentry_user` after JWT verify (clerk_user_id) and after app-user lookup (adds app_user_id). `routes/webhooks.py` adds Sentry breadcrumb with stripe event id+type before handling. 23 new backend tests (12 scrub + 6 init + 7 request_id); backend suite 70 → 93. |
| S-OBS-SOURCEMAPS-001 | 2026-05-24 | IMPL | next-ten-#1-observability | DONE | `@sentry/webpack-plugin@^5.3.0` wired into `craco.config.js` for production builds. Reads `SENTRY_AUTH_TOKEN` + `SENTRY_ORG_SLUG` + `SENTRY_PROJECT_SLUG` at build time. Uploads source maps, then deletes `.map` files from `./build/**` so they aren't world-readable on the CDN. No-ops with console warning when env vars missing (build still succeeds). `craco.config.js` also now loads `.env.local` (CRA convention) before `.env` so local prod builds can test source-map upload. `.env.example` updated with the new Sentry variables. |
| S-OBS-RUNBOOK-001 | 2026-05-24 | DOCS | next-ten-#1-observability | DONE | New [docs/runbooks/observability.md](docs/runbooks/observability.md): dashboard locations, wiring composition (frontend + backend + logging + source maps), cross-system debugging via request_id, environment tagging table, PII guarantees + leak-response procedure, cost/sampling knobs, two-minute end-to-end smoke test, emergency disable instructions. |
| S-OBS-COMMIT-001 | 2026-05-24 | STEP_COMMIT | next-ten-#1-observability | DONE | Sentry observability committed and pushed as `3416994` on `claude/romantic-gould-974395`. [PR #7](https://github.com/jeremiahvanwagner-droid/Your-Student-Companion-main/pull/7) opened against `main`. 23 files +1679. CI gates (`backend-test` + `build`) will run on PR per the branch-protection rule landed in S-CI-CLOSE-001. |
| S-OBS-UPTIME-001 | 2026-05-24 | INFRA_CHANGE | next-ten-#1-observability | DONE | Better Stack free tier signed up (account: `support@truthjblue.com`). Uptime monitor auto-created during onboarding for `https://your-student-companion-main.vercel.app`, status green (Up), 3-min check interval. Backend `/api/health` monitor deferred until FastAPI backend has a public deploy URL. User to verify "alert after 2 consecutive failures" setting + send test email before final close. |
| S-VENDOR-POSTHOG-001 | 2026-05-24 | INFRA_CHANGE | next-ten-#7-analytics | OPEN | PostHog account enrolled. Code wiring (plan #7) scheduled for week 5 per [docs/strategy/next-ten.md](docs/strategy/next-ten.md). No code references in any branch yet — confirmed by Perplexity diagnostic report. When code wiring starts: keys go in `.env.local` as `REACT_APP_POSTHOG_KEY` + `REACT_APP_POSTHOG_HOST` plus matching Vercel env vars. |
| S-DIAG-001 | 2026-05-24 | DIAGNOSTIC | full-stack-audit | INFORMATIONAL | Perplexity third-party diagnostic ran 4:47 PM CDT. Confirms: live site `https://ysc.growthbychoice.com` 200 OK on `dpl_HRfUbMx83bJCzfST7RZGbULBUMis`; PR #7 (Sentry observability) mergeable with all CI green (`build` SUCCESS, `backend-test` SUCCESS, Vercel preview SUCCESS) but **NOT yet merged so Sentry is NOT in production**; zero runtime errors logged in past 24h (low traffic, no signal); subscription flow never QA'd (per `STORE_WEBHOOK_RUNBOOK §12`). Flags two pre-existing risks newly relevant: (1) **fabricated Schema.org `aggregateRating` in `public/index.html`** showing `4.9 stars` over `50000 reviews` — Google Search Quality Guidelines violation; (2) PWA "offline dictionary" claim in marketing copy not yet true (already R4 in risk register). Plus Supabase advisor warnings predating Step 7: `is_admin()` RPC publicly executable + leaked-password protection OFF. None blocking current work. See [docs/audits/2026-05-24-perplexity-full-stack.md](docs/audits/2026-05-24-perplexity-full-stack.md) when filed. |
| S-DIAG-002 | 2026-06-10 | DIAGNOSTIC | full-stack-audit | INFORMATIONAL | Session 3 in-repo audit (Claude). Frontend↔backend contract sweep across all 6 API client modules: zero method/path/payload mismatches. All AppShell/BottomNav routes resolve. `aggregateRating` confirmed removed from `public/index.html` (fixed by `885e076`). Baseline suites green pre-change: backend 93, frontend 75, prod build OK. Minor findings fixed in-session: stray `console.log` voice handlers in `TheMentor.jsx` removed (hook's dev-gated logger already covers it). Known-stub finding: NotesPad/StudyPlanner/WeeklyReport pages + Dashboard study-blocks card were placeholders → addressed under S5/S9 below. Supabase advisors re-confirmed: `is_admin()` RPC exposure (fix authored as migration 008) + leaked-password protection OFF (dashboard toggle, user action). |
| S5-OPEN-001 | 2026-06-10 | STEP_OPEN | step-5-notes-flashcards | OPEN | session 3 start; DB tables `notes` + `review_cards` already existed with RLS from migration 0001 — gap was API + UI |
| S5-CLOSE-001 | 2026-06-10 | STEP_CLOSE | step-5-notes-flashcards | CLOSED | New `backend/routes/notes.py`: notes CRUD (ilike search across title/content with PostgREST `or=` injection guard, tag contains-filter, subject filter, archive flag) + `/api/notes/cards` (create incl. note-ownership check, due-only listing, again/hard/good/easy review ratings driving difficulty 1–5 + review_count + next_review_at with count-scaled intervals, delete). `NotesPad.jsx` rebuilt from stub: Notes/Review Cards tabs, 300ms debounced search, tag chips, archive/restore, make-card-from-note, flip-and-rate review queue. 19 backend + 6 frontend tests. |
| S9-OPEN-001 | 2026-06-10 | STEP_OPEN | step-9-planner-report | OPEN | Study Planner + Weekly Report portions; SM-2 engine deferred to a later sub-phase |
| S9-IMPL-001 | 2026-06-10 | IMPL | step-9-planner-report | DONE | **Planner**: migration `007_planner_blocks.sql` (new table, end>start check, owner RLS, updated_at trigger, user+start index — intent-side counterpart to execution-side `study_sessions`). New `backend/routes/planner.py`: block CRUD + `/blocks/bulk` (≤20) + `PATCH /blocks/{id}/complete` + `GET /suggest` — pure `build_suggestions()` proposes one block per due-soon (7d) assignment lacking a future block, 5pm in profile timezone, staggered same-day, est-minutes capped 15–120, never in the past. `StudyPlanner.jsx` rebuilt: Mon–Sun grid, week nav, per-day add, complete/delete, accept-suggestions dialog with checkboxes. 18 backend + 5 frontend tests. |
| S9-IMPL-002 | 2026-06-10 | IMPL | step-9-planner-report | DONE | **Weekly Report**: new `backend/routes/reports.py` — `GET /api/reports/weekly/current` computes Mon–Sun aggregates live (tasks completed/missed, focus minutes, top subject by session minutes falling back to task counts, per-day breakdown, planner follow-through, next-week preview with top-3 priorities), `POST /generate` upserts snapshot on `(user_id,week_start)` (unique key already in schema), `GET /history`. `WeeklyReport.jsx` rebuilt: 4 summary cards, Recharts composed daily chart, week-over-week trend from snapshots, Next Week Plan card with planner/mentor CTAs, Save Snapshot. Dashboard stub card now lists real upcoming blocks (48h window, best-effort fetch). 8 backend + 5 frontend tests. |
| S-ADVISOR-001 | 2026-06-10 | SECURITY | supabase-advisor-is_admin | AUTHORED | Migration `008_private_is_admin.sql` written: `ALTER FUNCTION public.is_admin() SET SCHEMA app_private` + schema-usage/execute grants for `authenticated` (verified: all 23 dependent policies are authenticated-role and reference the function by OID, no code calls the RPC). Resolves lint 0029 by removing the function from PostgREST's exposed schema. **Apply blocked in session 3** (tooling permission) — run 007 + 008 against `ysc-staging` before next deploy. Leaked-password protection remains a dashboard toggle (user action). |
