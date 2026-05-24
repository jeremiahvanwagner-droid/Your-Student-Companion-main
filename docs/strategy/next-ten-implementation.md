# Next Ten — Implementation Plan

**Status:** Active execution brief
**Authored:** 2026-05-24
**Owner:** Jeremiah Van Wagner (Truth J Blue LLC)
**Companion doc:** [next-ten.md](next-ten.md)

> Detailed execution brief for the ten initiatives in priority order. Each
> section is self-contained — engineer (or AI agent) can pick up an item
> without needing additional context. Items 1-3 must complete before item 4
> launches; items 4-10 have explicit dependency notes.

---

## Cross-cutting conventions

- **Branching:** all work lands on feature branches → PR to `main` → CI
  must pass (frontend + backend after #2 lands) → squash merge.
- **Commits:** `<type>(<scope>): <summary>` matching the existing repo
  pattern. Trailers include `Co-Authored-By:` when AI-assisted.
- **Migrations:** Supabase migrations via `apply_migration` MCP tool;
  named in snake_case; logged in `CURRENT_STATE.md` audit log.
- **Tests:** every new backend endpoint gets at least one happy-path and
  one auth/permission test. Every new React component or page gets a
  rendering test plus one interaction test where applicable.
- **Audit log:** every initiative gets `S{N}-OPEN-001` and `S{N}-CLOSE-001`
  entries in `CURRENT_STATE.md` §3.

---

## #1 — Production Observability

**Position rationale:** Slot 1. You cannot responsibly accept subscription
revenue without knowing when production breaks. Every later item assumes
the existence of a "did this break in prod?" answer.

**Definition of Done:**
- Frontend errors land in Sentry with source maps; PII (Clerk emails) is
  scrubbed in `beforeSend`.
- Backend errors land in Sentry tagged with `clerk_user_id`, `request_id`,
  and route.
- Backend produces JSON structured logs (one event per request).
- Uptime monitor checks `https://your-student-companion-main.vercel.app`
  and `${API_BASE_URL}/api/health` every 60s; alerts on 2 consecutive
  failures.
- Stripe webhook event ids appear as Sentry breadcrumbs on any related
  backend error.
- Runbook entry added to `CURRENT_STATE.md` linking to dashboards.

**Estimated effort:** M (~2 days)
**Dependencies:** None
**Decisions needed:** Sentry plan (recommend Sentry Team $26/mo). Uptime
provider (recommend Better Stack free tier or UptimeRobot free tier).

**Sub-tasks:**
1. Provision Sentry project (one project, two environments: `staging`,
   `production`). Capture `SENTRY_DSN` (backend) and
   `REACT_APP_SENTRY_DSN` (frontend).
2. Frontend wiring:
   - `npm install --legacy-peer-deps @sentry/react`
   - In `src/index.js` before `<App />`: `Sentry.init({ dsn: process.env.REACT_APP_SENTRY_DSN, environment: process.env.REACT_APP_VERCEL_ENV, tracesSampleRate: 0.1, beforeSend: scrubPII })`
   - `scrubPII` removes `request.headers.authorization` and `user.email`.
   - Wrap routes with `Sentry.ErrorBoundary` at the App level.
   - Add to `scripts/check-env.js` required list (or mark optional with
     a warn-only soft check).
3. Vercel source-map upload via `@sentry/webpack-plugin` configured in
   `craco.config.js` build step. Auth via `SENTRY_AUTH_TOKEN` env in CI
   only.
4. Backend wiring:
   - Add `sentry-sdk[fastapi]` to `backend/requirements.txt`.
   - In `backend/server.py` before app creation:
     `sentry_sdk.init(dsn=os.getenv('SENTRY_DSN'), environment=..., integrations=[FastApiIntegration(), StarletteIntegration()], traces_sample_rate=0.1)`.
   - Add middleware that generates `X-Request-ID` (uuid4) per request,
     attaches to `request.state.request_id`, propagates to Sentry scope.
   - Augment Clerk auth dependency to set `sentry_sdk.set_user({"id": auth.app_user_id})` after auth resolves.
5. Structured logging:
   - Add `python-json-logger` to requirements.
   - Configure `logging.basicConfig` with `JsonFormatter` in `backend/server.py` startup.
   - Replace any remaining `print()` calls with `logger.info(...)`.
6. Stripe webhook breadcrumbs: in `backend/routes/webhooks.py`, after
   verifying signature, call `sentry_sdk.add_breadcrumb(category='stripe', message=event.type, data={'event_id': event.id})`.
7. Uptime monitor:
   - Sign up for provider.
   - Add monitor for landing URL (HTTPS, 200, 30s timeout) and backend
     `/api/health` (200 with `status: healthy` body match).
   - Alert channels: your email; later Slack if available.
8. Documentation:
   - Add `docs/runbooks/observability.md` with dashboard links, alert
     channel config, on-call expectations.
   - Append S-OBS-CLOSE-001 audit entry referencing the runbook.

**Acceptance criteria:**
- Throwing in a dev endpoint surfaces in Sentry within 1 minute with
  Clerk user id and request id attached.
- Frontend error boundary captures a synthetic React throw and reports it.
- Uptime monitor fires alert within 5 minutes of forcibly killing the
  Vercel deploy.
- No raw Clerk email or auth token appears in any Sentry event payload
  (verified via Sentry's event JSON view).

**Rollback plan:**
- Sentry can be disabled by removing the `SENTRY_DSN` env var; SDK
  no-ops cleanly. No database or product impact.
- Uptime monitor can be paused in the provider dashboard with one click.

**Files touched:**
- `src/index.js`, `craco.config.js`, `scripts/check-env.js`
- `backend/server.py`, `backend/requirements.txt`
- `backend/lib/request_id.py` (new), `backend/lib/clerk_auth.py` (extend)
- `backend/routes/webhooks.py` (breadcrumbs)
- `docs/runbooks/observability.md` (new)

---

## #2 — Backend CI Gate on PRs

**Position rationale:** Slot 2. Trivial cost, prevents the next regression
class from shipping silently. Should land in week 1 alongside #1.

**Definition of Done:**
- `backend-test` job runs on every PR to `main`.
- `backend-test` is a required status check in GitHub branch protection
  for `main`.
- Coverage stays at or above the current 25% threshold.

**Estimated effort:** S (~30 min)
**Dependencies:** None
**Decisions needed:** None

**Sub-tasks:**
1. Confirm `.github/workflows/ci.yml`'s `backend-test` job triggers on
   `pull_request` (it already does, per current YAML).
2. In GitHub: Settings → Branches → Branch protection rule for `main`
   → require status checks → add `backend-test` to required list.
3. (Optional) Raise `--cov-fail-under` from 25 to 35 once 7.3 ships,
   reflecting the larger backend surface area.

**Acceptance criteria:**
- Open a test PR with a deliberately broken backend test; PR cannot
  merge until the test is fixed.
- Merge of fix produces a green CI badge on the resulting commit.

**Rollback plan:**
- Remove `backend-test` from required checks in branch protection.

**Files touched:**
- `.github/workflows/ci.yml` (only if optional threshold bump)
- GitHub repo settings (not in version control)

---

## #3 — Manual QA Pass of Subscription Flow

**Position rationale:** Slot 3. Step 4 shipped two months ago in code
but the documented 7-scenario manual QA pass in `STORE_WEBHOOK_RUNBOOK §12`
was never executed. Real subscription revenue cannot start until this
walk-through passes. Should happen in week 2 once observability is live
so failures get captured properly.

**Definition of Done:**
- All 7 scenarios in `backend/STORE_WEBHOOK_RUNBOOK.md §12` walked end-to-end
  with the Stripe `4242 4242 4242 4242` test card.
- A test log with date, scenario, pass/fail, notes appended as a new
  `§12.X — QA Pass Results` subsection.
- Any defects opened as GitHub issues with `qa-pre-launch` label and
  linked from the test log.

**Estimated effort:** M (~half day with both Jeremiah and engineer)
**Dependencies:** #1 (observability) — so any backend failures surface in
Sentry rather than being missed.
**Decisions needed:** None

**Sub-tasks:**
1. Spin up local dev or use staging directly.
2. Walk scenarios in this order (matches runbook §12):
   - §12.1 — Degree Bundle Nursing monthly (trial path)
   - §12.2 — All-Access annual (no trial since user previously trialed)
   - §12.3 — Pack gating after subscription
   - §12.4 — Billing portal access + cancel-at-period-end
   - §12.5 — CLI-triggered `customer.subscription.deleted`
   - §12.6 — Trial enforcement on second subscription (no double-trial)
   - §12.7 — Lifetime-access user sees grandfather messaging
3. For each: capture screenshot or terminal log of the success/failure.
4. File issues for any defects; assign to appropriate later item.
5. Update `STORE_WEBHOOK_RUNBOOK.md`:
   - Add §12.X header with date + result table.
   - Mark §12 itself as "QA Passed YYYY-MM-DD" or "QA Failed — see issues".

**Acceptance criteria:**
- All 7 scenarios pass cleanly OR every failure is filed as a tracked
  issue with reproduction steps.
- Runbook documents the verification with a date stamp.

**Rollback plan:** N/A (verification only; no code changes).

**Files touched:**
- `backend/STORE_WEBHOOK_RUNBOOK.md` (QA results appendix)

---

## #4 — Complete Step 7 (Phases 7.3 → 7.8)

**Position rationale:** Slot 4. Schema + catalog API are already live
from Phases 7.1-7.2. Stopping now strands sunk-cost work without the
revenue surface. Six sub-phases finish the loop end-to-end. The spec
already defines them; this is execution.

**Definition of Done:**
- All Step 7 sub-phases per [`docs/phases/step-7-exams.md §10`](../phases/step-7-exams.md) marked closed in `CURRENT_STATE.md`.
- One full exam (NY Regents Algebra I) launched with real seeded content.
- Subscription gating on attempts works end-to-end against the Stripe
  Test mode flow.
- Audit log entries S7.3 → S7.8 appended.

**Estimated effort:** L (~3-4 engineering weeks for 7.3-7.7; 7.8 is
content-team work running in parallel)
**Dependencies:** #1 (observability — for production debugging once
the API gets real traffic). #3 (subscription flow QA — so entitlement
gating doesn't rely on untested code).
**Decisions needed:** None (all locked in spec §11).

**Sub-tasks (sub-phase grouped):**

### 7.3 — Attempt lifecycle + scoring engine
- `backend/routes/exams.py`: add `POST /attempts`, `GET /attempts/{id}`,
  `POST /attempts/{id}/responses`, `POST /attempts/{id}/submit`,
  `POST /attempts/{id}/abandon`.
- `backend/lib/exam_scoring.py` (new): pure functions for `raw` and
  `scaled` scoring. Section weights honored.
- Entitlement check implementing spec §7 logic — extracted to
  `backend/lib/exam_entitlements.py` so future routes reuse it.
- Snapshot `question_ids` array on attempt creation for reproducibility.
- Idempotency on `(attempt_id, question_id)` for responses (upsert).
- Tests: full lifecycle happy path; entitlement deny paths; idempotent
  response submission; scoring correctness against reference inputs.

### 7.4 — Frontend exam list + detail
- New pages: `src/pages/exams/ExamListPage.jsx`,
  `src/pages/exams/ExamDetailPage.jsx`.
- New components: `ExamCard`, `EntitlementBanner`, `StatePromptDialog`.
- Lazy state-capture prompt: if `student_profiles.state` is null, show
  one-time prompt; persist via `PUT /api/users/me/profile`.
- Nav entry in `AppShell.jsx` `MAIN_NAV`: `{ to: "/app/exams", label: "Exams", icon: ClipboardCheck }`.
- React Router routes wired in `src/App.js`.
- Tests: list renders filtered exams; lock state for non-entitled users;
  state prompt shows when state is null and hides after submit.

### 7.5 — AttemptRunner + Review
- New pages: `src/pages/exams/AttemptRunnerPage.jsx`,
  `src/pages/exams/AttemptReviewPage.jsx`.
- Components: `QuestionRenderer` (delegates by `question_type`),
  `TimerBar` (only mounted in `timed` mode), `ScoreSummary`,
  `AnswerExplanation`.
- Autosave on every navigation; resume-from-state on refresh in
  `practice` mode only.
- Tests: navigation between questions; autosave triggers on next/prev;
  submit produces score summary; review shows correct/incorrect markers
  with explanations.

### 7.6 — `course_pack_exams` monetization wiring
- Backend admin endpoint or Studio-managed: link existing `course_packs`
  rows to one or more exams.
- Create new Stripe products for per-exam packs (e.g. "SHSAT Prep Pack
  $29 one-time"). Use existing `backend/scripts/create_stripe_subscriptions.py`
  pattern adapted for one-time prices.
- Update `/app/subscribe` copy: surface "All exams included" badge on
  All-Access tier.
- Update `/app/exams/:slug` to render "Unlock" CTA pointing to either
  the linked pack purchase OR the All-Access subscribe page.
- Tests: entitlement check correctly resolves through course_pack_exams.

### 7.7 — History + composite/rubric scoring
- `GET /api/exams/me/attempts` already drafted in spec — implement.
- `src/pages/exams/AttemptHistoryPage.jsx` — table of past attempts,
  filterable by exam.
- Extend `backend/lib/exam_scoring.py` with `composite` (ACT-style 1-36
  composite from section scaled scores) and `rubric_1_5` (AP-style).
- Tests for both scoring models with reference inputs/outputs.

### 7.8 — Content seed for remaining 7 MVP exams
- Engineering: build a content-team self-service flow (lightweight admin
  pages inside `/app/admin/exams` for `role='admin'`). This bleeds into
  Item #9 — the v1 of admin authoring lands here.
- Content team: source state-released items for STAAR G8 Math, CAASPP
  G8 Math, PERT. License or original-author for ACT, AP Biology, SHSAT,
  HSPT per spec §11.3.
- Engineering: feature flag `exams_enabled = true` on Step 7 launch
  day, gating the nav entry.

**Acceptance criteria:**
- A new user from NY can sign up, navigate to Exams, see NY Regents
  Algebra I prominent, start a practice attempt, submit, see a scored
  review.
- A non-subscribed user sees the exam locked; subscribing or buying
  the linked pack unlocks attempts.
- All scoring models produce correct outputs for at least 3 reference
  inputs per model (unit-tested).

**Rollback plan:**
- Feature flag `exams_enabled = false` hides the nav entry. The schema
  and API can remain; user-facing path disappears.
- Stripe products for exam packs can be deactivated without affecting
  existing subscriptions.

**Files touched (high level):**
- Backend: `routes/exams.py` (extend), `lib/exam_scoring.py` (new),
  `lib/exam_entitlements.py` (new), `tests/test_exams_attempts.py` (new),
  `tests/test_exam_scoring.py` (new), `scripts/create_stripe_exam_packs.py` (new)
- Frontend: 5 new pages in `src/pages/exams/`, ~6 new components in
  `src/components/exams/`, route registration in `src/App.js`, nav
  entry in `src/components/layout/AppShell.jsx`
- Docs: phase audit entries S7.3 → S7.8 in `CURRENT_STATE.md`

---

## #5 — Email Infrastructure + Step 4.5 Grandfather Email

**Position rationale:** Slot 5. Existing pack buyers were silently
flagged `lifetime_access=true` when the new subscription tiers shipped;
they need to be told before they discover the new pricing on their own
and assume a bait-and-switch. The same email infrastructure unlocks
future transactional needs (`trial_will_end`, weekly digest, abandoned
checkout). Should land in week 3 — early enough that Step 7 doesn't
also surface the same goodwill issue.

**Definition of Done:**
- Email provider (Resend) provisioned with SPF/DKIM/DMARC configured.
- `backend/lib/email.py` helper for transactional sends with idempotency.
- React Email template for grandfather notice committed and rendered.
- Send script with `--dry-run` and `--limit` flags.
- Grandfather email sent to every lifetime-access user.
- Send log captured (recipient count, opens if Resend reports them,
  bounces).

**Estimated effort:** M (~3 days)
**Dependencies:** #1 (observability — email send failures must surface).
**Decisions needed:** Email provider (recommend Resend; alternatives
Postmark or SES). Sender domain decision (`hi@yourstudentcompanion.com`
or similar).

**Sub-tasks:**
1. Provision Resend account; verify sender domain; configure SPF/DKIM/DMARC
   DNS records (Hostinger DNS, likely).
2. Add `resend` to `backend/requirements.txt`. Add `RESEND_API_KEY` to
   backend env (and prebuild check in `scripts/check-env.js` if frontend
   ever sends; not needed for grandfather).
3. Build `backend/lib/email.py`:
   - `send_transactional(to, subject, html, text, idempotency_key)`
   - Records sends in new `email_sends` table for dedupe and audit.
4. Migration `email_sends_table`:
   ```sql
   CREATE TABLE public.email_sends (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid REFERENCES public.users(id),
     template_key text NOT NULL,
     to_email text NOT NULL,
     subject text NOT NULL,
     idempotency_key text UNIQUE NOT NULL,
     provider_id text NULL,
     status text CHECK (status IN ('queued','sent','failed','bounced')),
     sent_at timestamptz NULL,
     error text NULL,
     created_at timestamptz DEFAULT now()
   );
   ```
5. Install React Email locally (in a `marketing/` sibling folder or
   inside `backend/` — pick one to keep templates near sends).
6. Build grandfather template (`templates/grandfather_v1.tsx`): explain
   new tiers, confirm their lifetime access, link to FAQ.
7. Build `backend/scripts/send_grandfather_email.py`:
   - Args: `--dry-run`, `--limit N`, `--to-email override@example.com`.
   - Query: `SELECT u.id, u.email FROM users u JOIN user_purchases up ON up.user_id::uuid = u.id WHERE up.lifetime_access = true AND up.status = 'completed'` — dedupe by user.
   - For each: skip if `email_sends` already has matching idempotency
     key (e.g. `grandfather_v1:{user_id}`); else send via Resend.
8. Send sequence:
   - Run with `--dry-run` first; review recipient count.
   - Send to single test email via `--to-email`; verify rendering on
     Gmail web, Gmail mobile, Apple Mail, Outlook web.
   - Run full send with `--limit 10` first as canary; check Resend
     dashboard for bounces.
   - Run full send.
9. Update `STORE_WEBHOOK_RUNBOOK §11` recipient SQL as actually-sent
   reference. Add audit log entry.

**Acceptance criteria:**
- Dry run reports expected count of lifetime-access users.
- Test send to one address renders cleanly on Gmail web + mobile.
- Production send completes with < 5% bounce rate.
- Re-running the script is a no-op (idempotency works).

**Rollback plan:**
- Email sends cannot be unsent. The mitigation is the dry-run gate +
  canary batch. If post-send the template has an error, follow-up
  correction email is the only recovery.

**Files touched:**
- `backend/requirements.txt`, `backend/lib/email.py` (new)
- New migration `email_sends_table` via MCP
- `backend/templates/grandfather_v1.tsx` (new)
- `backend/scripts/send_grandfather_email.py` (new)
- `backend/STORE_WEBHOOK_RUNBOOK.md` (recipient SQL update)
- `CURRENT_STATE.md` (S4.5-CLOSE-001 audit entry)
- DNS: SPF/DKIM/DMARC records at Hostinger

---

## #6 — Step 5: Notes + Manual Flashcards (Free-Tier Hook)

**Position rationale:** Slot 6. The free-tier experience is currently
thin (dictionary, focus timer, rate-limited AI mentor). Notes + manually
created flashcards gives free users something to come back to daily,
builds habits, and creates upgrade pressure when they want SM-2 spaced
repetition (Step 9). Should follow Step 7 completion so the engineer
focus stays serial; runs in weeks 10-11.

**Definition of Done:**
- Full CRUD for notes via `/app/notes` (page exists but is a stub).
- Full CRUD for flashcards (`review_cards` table already exists at 0 rows).
- Frontend nav entry for Flashcards in `AppShell`.
- Free tier has explicit limits (e.g. 50 notes, 100 flashcards) with
  paywall prompt at limit.
- Tests for both API surfaces and the React pages.

**Estimated effort:** L (~1.5 weeks)
**Dependencies:** #1, #7 (analytics — to know if it actually drives
retention).
**Decisions needed:** Free-tier limits (recommend 50 notes / 100 cards
to start; tune from analytics).

**Sub-tasks:**
1. Backend:
   - `backend/routes/notes.py` (new): `GET /api/notes`, `POST`, `PATCH`,
     `DELETE`, `POST /api/notes/{id}/archive`.
   - `backend/routes/flashcards.py` (new): `GET /api/flashcards`,
     `POST`, `PATCH`, `DELETE`, `POST /api/flashcards/{id}/review`
     (records a review event but uses naive interval — SM-2 in Step 9).
   - Tier-limit enforcement in handlers — check user subscription, deny
     create over limit with 402 Payment Required.
   - Tests for happy path + tier-limit deny.
2. Frontend:
   - Replace `src/pages/NotesPad.jsx` stub with full CRUD UI: list,
     create, edit, archive, search by tag.
   - New `src/pages/FlashcardsPage.jsx`: list, create dialog (front/back),
     "Study Now" mode with flip animation, mark known/unknown.
   - Update `src/components/layout/AppShell.jsx` `MAIN_NAV` to add
     Flashcards entry.
   - Onboarding/empty state: empty Tasks board CTA links to "Try
     making a note instead?"
3. Limit-prompt UI:
   - `LimitReachedDialog` component shown on create-attempt past free
     tier limit; links to `/app/subscribe`.
4. Tests:
   - Frontend: render list, create, archive flows; limit dialog appears
     at threshold.
   - Backend: tier-limit returns 402; create succeeds when subscribed.

**Acceptance criteria:**
- New free user can create up to 50 notes and 100 flashcards; 51st note
  triggers paywall dialog.
- All-Access user has no limits.
- Flashcard "Study Now" mode flips cards and tracks reviews.
- All new tests green; frontend suite stays ≥ 56 + new tests.

**Rollback plan:**
- Routes can be removed without affecting other surfaces.
- Schema already exists (no migration to roll back).
- Nav entries can be hidden via feature flag.

**Files touched:**
- Backend: `routes/notes.py` (new), `routes/flashcards.py` (new),
  `tests/test_notes.py` (new), `tests/test_flashcards.py` (new),
  `server.py` (router registration)
- Frontend: `src/pages/NotesPad.jsx` (rewrite), `src/pages/FlashcardsPage.jsx`
  (new), `src/components/layout/AppShell.jsx`, `src/App.js` (route),
  `src/__tests__/NotesPad.test.jsx` (new), `src/__tests__/FlashcardsPage.test.jsx` (new)

---

## #7 — Analytics + Funnel Instrumentation

**Position rationale:** Slot 7. Currently every product decision is a
guess because there's no way to see funnel conversion. PostHog gives
product analytics, session replay, and feature flags from one wire-up.
Runs in week 5 in parallel with Step 7 Phase 7.4 — light engineering
cost, high decision-quality dividend.

**Definition of Done:**
- PostHog SDK initialized in frontend with Clerk user identification.
- Backend events for server-driven moments via PostHog Python SDK or
  Capture API.
- Five funnels defined and dashboarded in PostHog:
  1. Landing → Signup
  2. Signup → Onboarding completed
  3. Onboarding → First dashboard view
  4. Dashboard → First task created
  5. `/app/subscribe` view → Checkout started → Checkout completed
  6. (Step 7) `/app/exams` view → Attempt started → Attempt submitted
- Event naming convention documented in `docs/engineering/analytics.md`.

**Estimated effort:** M (~3 days)
**Dependencies:** None (can run in parallel with Step 7).
**Decisions needed:** PostHog cloud vs self-hosted (recommend cloud for
time-to-value).

**Sub-tasks:**
1. Provision PostHog cloud project. Capture `REACT_APP_POSTHOG_KEY` and
   `REACT_APP_POSTHOG_HOST`.
2. Add to `scripts/check-env.js` as soft-required (warn if missing in
   non-prod; fail in prod).
3. Frontend wiring:
   - `npm install --legacy-peer-deps posthog-js`
   - In `src/index.js` after env-check: `posthog.init(...)`.
   - In `src/components/AppAccessGuard.jsx` post-Clerk-resolve:
     `posthog.identify(user.id, { email: user.email })`.
   - In `src/components/Gatekeeper.jsx` post-signout cleanup:
     `posthog.reset()`.
4. Define event names (all snake_case, `verb_object`):
   - Frontend auto-captured: `$pageview`, `$autocapture` clicks
   - Frontend manual: `task_created`, `note_created`, `flashcard_reviewed`,
     `subscribe_checkout_started`, `subscribe_checkout_completed`,
     `exam_attempt_started`, `exam_attempt_submitted`
   - Backend: `subscription_created`, `subscription_canceled`,
     `purchase_completed`, `attempt_scored`
5. Backend wiring:
   - Add `posthog` to `backend/requirements.txt`.
   - Initialize once in `backend/lib/analytics.py`.
   - Call from relevant route handlers (one line each).
6. Define funnels in PostHog UI; create dashboards.
7. Write `docs/engineering/analytics.md`:
   - Event naming convention.
   - When to use frontend vs backend events.
   - PII handling rules (no raw emails as properties; use distinct_id only).
   - How to add a new event.

**Acceptance criteria:**
- Triggering signup from incognito produces an event in PostHog Live
  view within 10 seconds.
- All five funnels populate with at least synthetic data from
  internal walk-throughs.
- Funnel conversion rates visible on PostHog dashboard.

**Rollback plan:**
- Remove `REACT_APP_POSTHOG_KEY` to disable frontend tracking; SDK
  no-ops.
- Comment out `posthog.capture(...)` calls in backend if needed.

**Files touched:**
- Frontend: `src/index.js`, `src/components/AppAccessGuard.jsx`,
  `src/components/Gatekeeper.jsx`, plus event-firing call sites in
  TaskManager, OnboardingFlow, SubscribePage, ExamRunnerPage
- Backend: `backend/requirements.txt`, `backend/lib/analytics.py` (new),
  call sites in `routes/store.py`, `routes/exams.py`
- `scripts/check-env.js` (add POSTHOG soft-required)
- `docs/engineering/analytics.md` (new)

---

## #8 — PWA Shell + Offline Dictionary (or Marketing Honesty Fix)

**Position rationale:** Slot 8. Landing page promises "Works Offline"
and "Offline Dictionary" — currently false. Two paths: real PWA build
(right) or strike the claims (honest interim). Recommendation: do the
honesty fix in week 1 as a 10-minute change, then schedule the real
PWA for weeks 11-12.

**Definition of Done — Honesty fix (interim, ship week 1):**
- Marketing copy in `src/pages/LandingPage.jsx` no longer claims offline
  capabilities that don't exist.
- "Coming Soon: Offline Mode" badge added in place of removed copy if
  preserving the promise.

**Definition of Done — Real PWA (target by week 12):**
- `public/manifest.json` with proper icons, theme color, display=standalone.
- Service worker registered with Workbox precaching strategies:
  - App shell: cache-first
  - API requests: network-first with cache fallback
  - Dictionary corpus: cache-first with IndexedDB backing for full lookup
- "Add to Home Screen" prompt at appropriate moment.
- Offline indicator in `AppShell.jsx` header.
- Offline dictionary search works for installed users with no network.
- Tested on real iOS Safari and Android Chrome.

**Estimated effort:** S (~10 min honesty fix) + L (~1 week real PWA)
**Dependencies:** None for honesty fix. Real PWA depends on having a
finalized offline strategy (cache size limits, eviction).
**Decisions needed:** Dictionary corpus size for offline — full
(~50MB?) or curated subset (~5MB)?

**Sub-tasks — Honesty fix:**
1. Edit `src/pages/LandingPage.jsx`:
   - Line 374 badge: remove "Offline Dictionary" or change to "Online
     Dictionary".
   - Lines ~165, 167: remove "even without internet connection"
     mentions.
   - Line ~254 FAQ #3: rewrite "Does the dictionary work offline?"
     honestly (e.g. "Offline mode is in development — current version
     requires internet for new lookups; recent searches stay accessible.")
   - Line ~705 final CTA: remove `WifiOff` badge or replace.
2. Add `<Badge>Coming Soon</Badge>` markers where offline is mentioned
   if preserving the promise.

**Sub-tasks — Real PWA:**
1. Add `public/manifest.json` with icons (192x192, 512x512).
2. Add Workbox via CRA's built-in service worker support
   (`src/service-worker.js`, `src/serviceWorkerRegistration.js`).
3. Configure precache for app shell.
4. Configure runtime caching:
   - `/api/*` → NetworkFirst, fallback to cache with 5s timeout
   - Dictionary endpoint → CacheFirst with stale-while-revalidate
5. Build IndexedDB-backed dictionary store (`src/lib/offlineDictionary.js`):
   - On install: download dictionary corpus to IDB
   - On lookup: try network first; if fails, try IDB
6. Add `src/components/OfflineIndicator.jsx` to AppShell — shows banner
   when `navigator.onLine === false`.
7. Add "Install YSC" prompt component triggered on `beforeinstallprompt`
   event after 3 visits.
8. Test on real devices via Vercel preview URL.

**Acceptance criteria:**
- (Honesty) No marketing copy claims offline functionality that doesn't work.
- (PWA) App installs to home screen on iOS Safari and Android Chrome.
- (PWA) Dictionary lookup works for cached words with airplane mode on.
- (PWA) App shell loads instantly on second visit (precache hit).

**Rollback plan:**
- Honesty fix: revert the landing page edit.
- PWA: unregister service worker, remove manifest reference. Cached
  assets self-evict over time.

**Files touched:**
- Honesty: `src/pages/LandingPage.jsx`
- PWA: `public/manifest.json` (new), `src/service-worker.js` (new),
  `src/serviceWorkerRegistration.js` (new), `src/lib/offlineDictionary.js`
  (new), `src/components/OfflineIndicator.jsx` (new),
  `src/components/InstallPrompt.jsx` (new), `src/index.js` (register)

---

## #9 — Admin Authoring UI

**Position rationale:** Slot 9. Currently all content edits go through
Supabase Studio direct table writes. Step 7's locked decisions commit to
original-authored content for SHSAT/HSPT — that requires SMEs paid by
the question, not engineers writing SQL. Admin UI lands week 9, after
the student-facing exam UI exists so we can reuse components like
`QuestionRenderer`.

**Definition of Done:**
- `/app/admin/exams` exam list with edit/publish.
- `/app/admin/exams/:id` editor for sections, passages, questions.
- `/app/admin/packs` for course pack management.
- Image upload via Supabase Storage bucket.
- Markdown editor for explanations.
- Preview mode showing student view.
- Admin-only gated by `users.role = 'admin'`.

**Estimated effort:** L (~2 weeks)
**Dependencies:** #4 Phase 7.5 (so QuestionRenderer is built and reusable).
**Decisions needed:** Whether admin UI lives at `/app/admin/*` (gated
inside main app) or a separate subdomain (`admin.yourstudentcompanion.com`).
Recommend `/app/admin/*` for simpler auth, gated to admins only.

**Sub-tasks:**
1. Backend admin routes (`backend/routes/admin/exams.py`,
   `backend/routes/admin/course_packs.py`):
   - All require `auth.role == 'admin'` (extend `get_app_auth_context`
     to expose role, or add new dependency `get_admin_context`).
   - CRUD for exams, sections, passages, questions, packs.
   - File upload endpoint for question images → Supabase Storage.
2. Backend tests for admin auth gate + happy paths.
3. Frontend admin shell: `src/pages/admin/AdminShell.jsx` with nav for
   Exams, Packs.
4. `src/pages/admin/AdminExamListPage.jsx` — table with publish toggle.
5. `src/pages/admin/AdminExamEditorPage.jsx` — sections accordion,
   questions list, "Add Question" dialog with `QuestionRenderer` preview.
6. `src/pages/admin/AdminPackListPage.jsx` and editor.
7. Markdown editor: pick lightweight one (`@uiw/react-md-editor` works).
8. Image upload: drag-and-drop component → POSTs to admin upload
   endpoint → returns Storage public URL.
9. Route registration in `src/App.js` under guarded `/app` shell:
   `<Route path="admin/*" element={<AdminGuard><AdminShell /></AdminGuard>} />`.
10. `AdminGuard` component: 403s if `useAuth().user.role !== 'admin'`.
11. Tests for editor flows and admin-only access.

**Acceptance criteria:**
- An admin can create a new exam, add sections, add questions with
  images, mark it published — student-facing API reflects it immediately.
- A non-admin cannot access any `/app/admin/*` route (403 page).
- A content writer with admin role can author one full Regents-style
  question in under 5 minutes.

**Rollback plan:**
- Hide admin nav via feature flag; routes remain but unreachable.
- Backend admin endpoints can be disabled by gating on a feature flag.

**Files touched:**
- Backend: `routes/admin/exams.py` (new), `routes/admin/course_packs.py` (new),
  `lib/clerk_auth.py` (extend with role helper), `tests/test_admin_exams.py`
  (new), `tests/test_admin_packs.py` (new), `server.py` (register)
- Frontend: `src/pages/admin/` (new directory), `src/components/admin/`
  (new directory), `src/App.js` (route), tests

---

## #10 — COPPA + State Privacy Review

**Position rationale:** Slot 10. K-12 audience (SHSAT and HSPT are taken
by 8th graders age 13-14; STAAR Grade 8 by 13-year-olds) means under-13
users may sign up. COPPA federal + state-specific student data laws
(NY, CA, IL, CO, CT) create real exposure. Engineering work is small
post-counsel; the counsel engagement should start week 1 in parallel
with everything else so it's not blocking by week 11.

**Definition of Done:**
- Privacy counsel engaged and scope-defined.
- Engineering implements counsel-specified requirements.
- Age gate at signup (always — answers down-stream COPPA path choice).
- Privacy policy + ToS pages live with counsel-approved language.
- Data export endpoint (`GET /api/users/me/export`) returns full user
  data as JSON.
- Account deletion endpoint with grace-period soft-delete.
- Audit logging for any admin access to student data.

**Estimated effort:** S engineering pre-counsel (~half day for age gate
+ stubs) + L post-counsel (depends on requirements; typical 1-2 weeks)
**Dependencies:** Legal counsel engagement (your action, week 1).
**Decisions needed (you + counsel):** Do we allow under-13 signups
(requires verified parental consent flow) or block them? Are we storing
PII that needs HIPAA-adjacent handling? Are we offering services in
EU/CA needing GDPR/CCPA compliance?

**Sub-tasks (engineering pre-counsel — can ship week 1-2 alongside #1):**
1. Add `date_of_birth date NULL` column to `student_profiles` via
   migration.
2. Add age gate step to onboarding (before Step 1 "Grade Level"):
   - "What's your date of birth?" with date picker.
   - If under 13 (US) — for now just store and flag; full handling
     waits for counsel.
3. Privacy policy + ToS pages: `src/pages/legal/PrivacyPolicyPage.jsx`,
   `src/pages/legal/TermsOfServicePage.jsx` with placeholder template
   text marked `[COUNSEL TO REVIEW]`.
4. Footer links in `LandingPage.jsx` and `AppShell.jsx`.

**Sub-tasks (engineering post-counsel):**
5. Implement counsel-specified requirements — likely some subset of:
   - Parental consent flow for under-13 (verifiable consent — email
     confirmation, credit card check, or paper form).
   - Block under-13 signup if not implementing parental consent.
   - Data retention policy enforcement (auto-delete after N years
     of inactivity).
   - Data export endpoint.
   - Soft-delete + hard-delete-after-grace endpoint.
   - Audit logging for all admin access to under-18 user data.
   - State-specific disclosures (NY, CA, IL, CO, CT student data
     privacy notices).
   - Cookie consent banner if serving EU traffic.
6. Tests for export, delete, age gate enforcement.

**Acceptance criteria (pre-counsel):**
- Every new signup captures DOB.
- Privacy and ToS pages exist and are linked from public footer.

**Acceptance criteria (post-counsel):** Defined by counsel output.

**Rollback plan:**
- Age gate can be skipped via DB backfill if reversed.
- Privacy/ToS pages can be updated in place.

**Files touched:**
- Pre-counsel: migration `add_date_of_birth_column`, `OnboardingFlow.jsx`
  (new first step), `src/pages/legal/` (new), `LandingPage.jsx` (footer
  link), `AppShell.jsx` (footer)
- Post-counsel: TBD by counsel scope. Likely new backend routes
  `routes/privacy.py` and frontend `src/pages/legal/DataRequestPage.jsx`

---

## Cross-item dependency graph

```
#1 (observability) ──┬─→ #3 (subscription QA)
                     ├─→ #4 (Step 7 — needs prod debugging)
                     └─→ #5 (email failures surface)

#2 (CI gate) ──────── independent, ship anytime in week 1

#3 (QA) ─────────────→ #4 (don't extend untested entitlement code)

#4 Phase 7.5 ────────→ #9 (admin UI reuses QuestionRenderer)

#7 (analytics) ──────→ #6 (need to measure free-tier retention impact)

#10 counsel engagement (week 1) ──→ #10 engineering post-counsel (week 5+)

#8 honesty fix ────── independent, ship week 1
#8 real PWA ───────── independent, ship weeks 11-12 if capacity
```

---

## Open questions

These need decisions before relevant items start. Defaults shown bold.

1. **Sentry plan tier** — **Team ($26/mo)** vs Free vs Self-hosted GlitchTip.
2. **Email provider** — **Resend** vs Postmark vs SES.
3. **Analytics provider** — **PostHog cloud** vs Mixpanel vs GA4-only.
4. **Free-tier limits** — **50 notes / 100 flashcards** to start; tunable.
5. **Dictionary corpus size for offline** — full (~50MB) vs **curated (~5MB)**.
6. **Admin UI location** — **`/app/admin/*` gated** vs `admin.<domain>` subdomain.
7. **Under-13 signups** — **block** until counsel-defined parental
   consent flow lands, or **allow with parental consent flow built day one**.

---

## Tracking + audit log

Each item gets:
- An OPEN audit entry in `CURRENT_STATE.md` §3 when work starts.
- A CLOSE audit entry when DoD is met.
- A note in §1.Right-now during the item's active week.

Entry ID naming:
- `S-OBS-OPEN-001` / `S-OBS-CLOSE-001` for #1
- `S-CI-OPEN-001` for #2
- `S-QA-OPEN-001` for #3
- `S7.3-OPEN-001` through `S7.8-CLOSE-001` for #4 sub-phases
- `S4.5-OPEN-001` / `S4.5-CLOSE-001` for #5
- `S5-OPEN-001` / `S5-CLOSE-001` for #6
- `S-ANALYTICS-OPEN-001` for #7
- `S-PWA-OPEN-001` for #8
- `S8-OPEN-001` for #9 (admin UI — matches 12-step plan numbering)
- `S-COPPA-OPEN-001` for #10
