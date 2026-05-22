# YSC — Current State

**Last updated:** 2026-05-22
**HEAD:** `116a6ae` on `main`
**Owner:** Jeremiah Van Wagner

This file is the single at-a-glance snapshot of where YSC stands plus an append-only audit log of step opens/closes. Update the snapshot section in place; only ever **append** rows to the audit log at the bottom.

---

## 1. Snapshot

| | |
|---|---|
| 90-day launch target | **~2026-08-20** (12 weeks from 2026-05-22) |
| Active step | **Step 3 — Subscription Stack** (paused at 3.3) |
| Status | 🟡 ON TRACK — paused awaiting Stripe Test-mode keys |
| Blocking issue | `backend/.env` has `sk_live_…` keys; Step 3 plan requires Test mode |

### Live infrastructure

| Service | Reference |
|---|---|
| GitHub | [jeremiahvanwagner-droid/Your-Student-Companion-main](https://github.com/jeremiahvanwagner-droid/Your-Student-Companion-main) |
| Vercel (frontend) | https://your-student-companion-main.vercel.app |
| Supabase project | `uvyvvaxufmylqavewvex` (ysc-staging) — PG 17.6, ACTIVE_HEALTHY |
| Stripe mode | ⚠️ keys in `backend/.env` are **Live**; Step 3 needs Test |
| Clerk | `pk_test_…` (test mode, intentional during build) |

### Right now

- **Done this session (2026-05-22):**
  - Step 1 — DB stabilized: 4 academic levels / 14 active degree plans / 56 active course packs seeded; `is_admin()` EXECUTE revoked from anon/public; `set_updated_at*` search_path pinned.
  - Step 2 — Reconciled local to `origin/main` (was 13 commits behind); Phase 0 closeout was already shipped via PRs #4–6.
  - Step 3 partial — `subscription_plans` table seeded with 2 tiers (Degree Bundle $7.99/$79.99, All-Access $14.99/$149.99, 14-day trial each); `stripe_webhook_events` idempotency table created; `user_purchases.lifetime_access` backfilled true for completed rows; `create_stripe_subscriptions.py` written but unrun; runbook updated.

- **Blocked / waiting on you:**
  - Swap `STRIPE_SECRET_KEY` + `STRIPE_PUBLISHABLE_KEY` in `backend/.env` from `sk_live_…` / `pk_live_…` to `sk_test_…` / `pk_test_…` (Stripe Dashboard → toggle "View test data" → API Keys). Then green-light the run of `create_stripe_subscriptions.py`.

- **Deferred to next session (still inside Step 3):**
  - 3.4 — Webhook lifecycle handler for `customer.subscription.created/updated/deleted/trial_will_end`, `invoice.paid`, `invoice.payment_failed`
  - 3.5 — Pytest coverage for the lifecycle handler (mocked Stripe events)
  - Persist this session's Supabase migrations as on-disk SQL files (`backend/migrations/007_…sql` onward) so fresh environments can replay

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
| **3** | **Subscription tiers + Stripe products** | 🟡 in progress | 3.1, 3.2, 3.6 done; 3.3 paused on Stripe Test keys; 3.4, 3.5 deferred |
| 4 | Subscription checkout + portal UI | ⏳ pending | Depends on 3 completing |
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
