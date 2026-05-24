# YSC — Current State

**Last updated:** 2026-05-24
**HEAD:** `bd330c4` on `main` (this commit will bump it again — see audit log W1-HARDEN-001)
**Owner:** Jeremiah Van Wagner

This file is the single at-a-glance snapshot of where YSC stands plus an append-only audit log of step opens/closes. Update the snapshot section in place; only ever **append** rows to the audit log at the bottom.

---

## 1. Snapshot

| | |
|---|---|
| 90-day launch target | **~2026-08-20** (~13 weeks from today) |
| Active step | **Walkthrough remediation** (✅ all five findings fixed in code; Vercel env-var rename pending on user) |
| Status | 🟢 ON TRACK |
| Blocking issue | Vercel deploy still serving the unguarded bundle until `REACT_APP_CLERK_PUBLISHABLE_KEY` is set in Vercel env vars (Clerk wizard handed out a `VITE_`-prefixed variable). Code now hard-fails with "Sign-in is temporarily unavailable" until the env var is renamed and a redeploy is triggered. |

### Live infrastructure

| Service | Reference |
|---|---|
| GitHub | [jeremiahvanwagner-droid/Your-Student-Companion-main](https://github.com/jeremiahvanwagner-droid/Your-Student-Companion-main) |
| Vercel (frontend) | https://your-student-companion-main.vercel.app |
| Supabase project | `uvyvvaxufmylqavewvex` (ysc-staging) — PG 17.6, ACTIVE_HEALTHY |
| Stripe mode | ✅ **Test** mode (`sk_test_51Ta…`); promotion to Live deferred to post-QA |
| Stripe webhook destination | Created 2026-05-23 → `https://uvyvvaxufmylqavewvex.supabase.co/functions/v1/stripe-webhook`; subscribed to 7 events |
| Clerk | `pk_test_…` (test mode, intentional during build) |

### Right now

- **Done this session (2026-05-24):**
  - **Step 4 committed at last** — `f9e2e04` shipped the subscription checkout UI work that had been sitting uncommitted in the working tree on 2026-05-23 (21 files, +1862).
  - **Loom walkthrough remediation** — five issues recorded by the user mapped to four independent bugs after investigation. All fixed in code across three commits:
    - `2b163fc` (crisis fixes): production `App.js` now refuses to render the shell unguarded if Clerk vars are missing (root cause of "auth entirely broken"); `LandingPage` `SafeSignInButton`/`SafeSignUpButton` no longer recurse to themselves (root cause of "account creation inaccessible"); `/app/legacy` moved under the auth guard; `TruthLine` accepts a `currentWeek` prop with an empty state CTA (kills the hardcoded "Week 6"); `TaskManager` errors surface via toasts so failures are visible.
    - `b31c471` (phase 2 + auth polish): new 6th onboarding step captures `semester_start_date` (stored nested in `study_preferences` for now; Phase 3 promotes to a top-level column); `UserSettings` editor with merge-aware save so the date field doesn't clobber `subjects`/`notes`; new `NotFoundPage` replaces the catch-all redirect; `Gatekeeper` clears `ysc_onboarding_*` localStorage on unauthenticated session resolve (kills cross-user state inheritance); `AppAccessGuard` retry screen instead of localStorage fallback on profile-fetch errors (kills the regression where stale localStorage pinned new users past onboarding).
    - `bd330c4` (CI unblock): one-line `react-hooks/rules-of-hooks` fix in `NotFoundPage`; ESLint caught it under `CI=true` even though jest passed.
  - **Test + build hardening (this commit, see W1-HARDEN-001)**:
    - Extracted `AppAccessGuard` to `src/components/AppAccessGuard.jsx` so it can be unit-tested in isolation.
    - **+15 regression tests:** 9 for `AppAccessGuard` (including the critical "stale localStorage does NOT grant access on fetch failure" test), 4 for `NotFoundPage`, 2 for `Gatekeeper` localStorage cleanup. Frontend suite now 56 passing (was 41).
    - New `scripts/check-env.js` wired as a `prebuild` hook in `package.json`. Vercel will now fail loudly with a listed-out error if `REACT_APP_CLERK_PUBLISHABLE_KEY`/`REACT_APP_SUPABASE_URL`/`REACT_APP_SUPABASE_ANON_KEY`/`REACT_APP_API_BASE_URL` are missing, instead of silently producing an unguarded bundle. CI workflow uses `npx craco build` directly so the prebuild hook intentionally doesn't fire there (we don't want CI to fail just because workflow secrets aren't wired).

- **Next steps (in order):**
  1. **Vercel env-var rename + redeploy** — copy the `pk_test_…` (or `pk_live_…`) value from the Clerk-provided `VITE_CLERK_PUBLISHABLE_KEY` into Vercel under the name `REACT_APP_CLERK_PUBLISHABLE_KEY`. Confirm `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`, `REACT_APP_API_BASE_URL` are also present for Production. Trigger a redeploy. The new prebuild hook will catch any remaining gaps.
  2. **Smoke test the redeployed app** (incognito → "Get Started" → Clerk modal → sign up → onboarding 6 steps → Dashboard shows Week 1 → "New Task" toasts on submit).
  3. **Manual QA pass** of [STORE_WEBHOOK_RUNBOOK.md](backend/STORE_WEBHOOK_RUNBOOK.md) §12 with the 4242 test card. Start with §12.1 (Degree Bundle Nursing monthly).
  4. **Phase 3 schema migration** — promote `study_preferences.semester_start_date` to a top-level `student_profiles.semester_start_date` column. Requires Supabase migration + Pydantic field addition. Deferred from this batch because it touches prod schema; needs explicit user sign-off.
  5. **Step 4.5 — Grandfather email** (recipient SQL in runbook §11). Needs an email provider decision: Resend / Postmark / SES.
  6. **Step 5+** per the 12-step plan table below.

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
| 5 | Notes + manual flashcards (free tier) | ⏳ pending | Independent of 3/4; can run parallel |
| 6 | Team Messaging Board (real-time chat, IAP) | ⏳ pending | Depends on 3 (entitlement gating) |
| 7 | Placement tests + 50-state question model | ⏳ pending | Independent |
| 8 | Content authoring admin + delivery API | ⏳ pending | Depends on 3 (entitlement gating) |
| 9 | SM-2 review + Study Planner + Weekly Report | ⏳ pending | Independent |
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
