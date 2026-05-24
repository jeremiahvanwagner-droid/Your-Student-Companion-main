# YSC — Current State

**Last updated:** 2026-05-23
**HEAD:** `490fd41` on `main` (Step 4 changes still uncommitted in working tree)
**Owner:** Jeremiah Van Wagner

This file is the single at-a-glance snapshot of where YSC stands plus an append-only audit log of step opens/closes. Update the snapshot section in place; only ever **append** rows to the audit log at the bottom.

---

## 1. Snapshot

| | |
|---|---|
| 90-day launch target | **~2026-08-20** (~13 weeks from today) |
| Active step | **Step 4 — Subscription Checkout UI** (✅ shipped end-to-end, awaiting commit + manual QA) |
| Status | 🟢 ON TRACK |
| Blocking issue | None — Step 3 closed, Step 4 closed in code, deploy verified |

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

- **Done this session (2026-05-23):**
  - Step 3 closeout — Created 2 Stripe subscription products + 4 recurring prices in new Test-mode account; refreshed all 56 one-time pack products against the same account; persisted IDs back to `subscription_plans` and `course_packs`; deployed Edge webhook function; signed-payload validator passes end-to-end.
  - Step 4 — Subscription Checkout UI:
    - 3 new backend routes (`POST /api/store/subscriptions/checkout`, `GET /me`, `POST /portal`) with Stripe customer ensure/reuse, trial-only-on-first-sub logic, pending-row insert, audit log.
    - Webhook gap-fill in both [backend/routes/webhooks.py](backend/routes/webhooks.py) and [supabase/functions/stripe-webhook/index.ts](supabase/functions/stripe-webhook/index.ts) for `invoice.paid` (retrieve+upsert) and `customer.subscription.trial_will_end` (acknowledge). Edge function redeployed.
    - Frontend at `/app/subscribe`: tier picker with monthly/annual toggle, Degree Bundle degree selector, success page with polling, lifetime-access notice, billing-portal banner, "Subscribe" side-nav link.
    - Pack access gating: subscription-aware `isPackUnlocked(pack)` unlocks for `all_access` (all packs) or matching `degree_bundle.degree_plan_id`.
    - Tests: 7 backend (`backend/tests/test_subscriptions.py`) + 10 frontend (`SubscriptionPlans` / `SubscribePage`). Full suites green: 57 backend, 41 frontend.
    - Manual QA documented as [STORE_WEBHOOK_RUNBOOK.md](backend/STORE_WEBHOOK_RUNBOOK.md) §12 (7 scenarios).

- **Next steps (in order):**
  1. **Manual QA pass** of [STORE_WEBHOOK_RUNBOOK.md](backend/STORE_WEBHOOK_RUNBOOK.md) §12 with the 4242 test card. Start with §12.1 (Degree Bundle Nursing monthly).
  2. **Commit + PR** for Step 4 (working tree has 10 modified + 7 new files, none committed yet).
  3. **Step 4.5 — Grandfather email** (recipient SQL in runbook §11). Needs an email provider decision: Resend / Postmark / SES.
  4. **Step 5+** per the 12-step plan table below.

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
| **4** | **Subscription checkout + portal UI** | ✅ done | `/app/subscribe`, billing portal, trial-only-on-first-sub, subscription-aware pack gating, 17 new tests, runbook §12. Awaiting commit + manual QA |
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
