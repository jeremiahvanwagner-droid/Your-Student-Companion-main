# Store + Webhook Runbook

This runbook covers operational checks for the YSC store stack.

> **Updated 2026-10-06 (Phase 0R).** The Supabase project this runbook used to
> target was deleted in July 2026 and the schema is now rebuilt as code in
> `supabase/migrations/` (see `CURRENT_STATE.md` S-INCIDENT-DB-001 and
> [docs/runbooks/database.md](../docs/runbooks/database.md)). The Supabase Edge
> function webhook is gone (decision D5): **the only Stripe webhook is the
> FastAPI route `POST /api/webhooks/stripe` on Render.** Sections marked
> *re-run after PR-3* describe behaviour that the webhook rewrite (plan §4-1/§4-2,
> gate G2) makes true; do not expect them to pass before it lands.

## Working Directory

Run commands from the repo root:

```powershell
C:\Users\JeremiahVanWagner\Your-Student-Companion-main
```

## 1) Schema — where it comes from

The whole schema (catalog, store, subscriptions, webhook ledger, student tables,
exams) is `supabase/migrations/20261006000000_baseline.sql` plus the four seed
migrations next to it. It reaches a project **only** through `supabase db push`
from a merged PR — never the SQL Editor, never the MCP `apply_migration` tool.

- Local: `npx supabase start && npx supabase db reset` (needs Docker).
- Remote: `npx supabase link --project-ref <ysc-prod ref>` →
  `npx supabase db push --dry-run` → `npx supabase db push`.
- Full workflow, backup and restore drill: [docs/runbooks/database.md](../docs/runbooks/database.md).

If the audit in §2 reports missing tables, the migrations have not been pushed
to the project you are pointing at (check `SUPABASE_URL` / `SUPABASE_PROJECT_REF`
in `backend/.env`). **Do not** apply anything from `docs/archive/legacy-migrations/`
— those files are history, not a fix.

## 2) Schema + Webhook Readiness Audit

```powershell
python backend/scripts/audit_supabase_schema.py --expect-project-ref $env:SUPABASE_PROJECT_REF
```

What it checks:

- Every expected table and required column (30 tables, incl. `subscription_plans`,
  `stripe_webhook_events`, `planner_blocks`, `focus_migrations`, the 7 exam tables)
- Seed counts: `academic_levels` ≥ 4, `degree_plans` ≥ 14, `course_packs` ≥ 56,
  `subscription_plans` = 2
- Stripe price mapping coverage on `course_packs` and `subscription_plans`
  (populated by `relink_stripe_catalog.py`, see §9)
- Webhook reachability: `GET {API_BASE_URL}/api/webhooks/stripe` returns **405**
  (route exists, only POST allowed)
- The Stripe destination subscribes to all 7 required events (§6)
- `--expect-project-ref`: the `SUPABASE_URL` host contains the expected project
  ref — guards against pointing the audit (or the backend) at the wrong project

## 3) Webhook Write Validation

```powershell
python backend/scripts/validate_stripe_webhook.py
```

Targets the FastAPI route (`{API_BASE_URL}/api/webhooks/stripe`) with locally
signed events using `STRIPE_WEBHOOK_SECRET`. Expected result:

- `Validation result: PASS`
- A signed `checkout.session.completed` writes a temporary row to
  `public.user_purchases` with status `completed` (the script creates a real
  Checkout Session, marks the event body `payment_status: paid`, and never
  charges a card), then cleans it up and expires the session
- A signed `customer.subscription.created` with
  `metadata {user_id, tier:'degree_bundle', cadence:'monthly', degree_plan_id}`
  produces one `user_subscriptions` row with `tier`, `plan_type` and `trial_end`
  set, and one `stripe_webhook_events` row — *re-run after PR-3*
- Posting the same event twice still leaves exactly one row (exactly-once ledger)
  — *re-run after PR-3*

## 4) Webhook Destination (FastAPI on Render)

There is one webhook implementation and one destination.

1. Deploy the backend to Render first ([docs/runbooks/backend-deploy.md](../docs/runbooks/backend-deploy.md)).
2. Stripe Dashboard (Test mode until the Live cutover) → Developers → Webhooks →
   **Add destination** → endpoint URL
   `https://<render-service>/api/webhooks/stripe` → select the 7 events in §6.
3. Copy the new signing secret (`whsec_…`) into the Render service as
   `STRIPE_WEBHOOK_SECRET` (Render → service → Environment). Never commit it.
4. Stripe → the destination → **Send test event** → Render logs show one
   `request_id`-tagged line and, after PR-3, one `stripe_webhook_events` row.
5. Make sure the old destination that pointed at
   `…supabase.co/functions/v1/stripe-webhook` is **disabled or deleted** — that
   project no longer exists.

Stripe retries failed deliveries for up to 72 h, so a Render redeploy mid-event
is safe.

## 5) Secrets

The backend reads `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` from its own
environment (`backend/.env` locally, the Render dashboard in production). There
are no Supabase function secrets any more. Where every secret lives:
[docs/runbooks/secret-inventory.md](../docs/runbooks/secret-inventory.md).

## 6) Required Stripe Events

The destination URL should include these events:

**One-time pack checkout (Phase 0 baseline):**

- `checkout.session.completed`

**Subscription lifecycle (Step 3 — v1 tiers):**

- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `customer.subscription.trial_will_end`
- `invoice.paid`
- `invoice.payment_failed`

If you've already configured the destination with the older event list, add `customer.subscription.trial_will_end` and `invoice.paid` before running the subscription script.

## 7) Real Checkout Validation (Manual)

After a real paid test checkout in Stripe test mode, verify in SQL:

```sql
select
  user_id,
  course_pack_id,
  status,
  amount_paid,
  currency,
  stripe_checkout_session_id,
  stripe_payment_intent_id,
  purchased_at
from public.user_purchases
order by purchased_at desc
limit 20;
```

Expected for paid completion:

- `status = 'completed'`
- `stripe_payment_intent_id` populated

## Troubleshooting Quick Hits

- `Access token not provided`: run `npx supabase login`
- `Invalid webhook signature`: `STRIPE_WEBHOOK_SECRET` on Render does not match the Stripe destination's signing secret (each destination has its own)
- Endpoint returns 404: wrong Render service URL, or the frontend host was used by mistake (Vercel rewrites `/api/*` to `index.html`)
- Endpoint returns 405 on GET: expected — the route only accepts POST
- Audit says a table is missing: migrations not pushed to that project — see §1
- `PGRST205 Could not find the table 'public.<table>' in the schema cache`: PostgREST schema cache hasn't refreshed after `db push`. The baseline ends with `notify pgrst, 'reload schema'`; if it still appears, wait 1–2 minutes or restart the project's API from the dashboard.

---

# Subscription Stack (Step 3)

The sections below cover the v1 recurring subscription tiers (Degree Bundle, All-Access). The one-time pack flow above continues to operate alongside subscriptions. **Beta is free (decision D6):** Stripe stays in Test mode through beta, the cohort gets admin-granted All-Access rows via `backend/scripts/grant_beta_access.py`, and the store/subscribe UI sits behind the `store_enabled` feature flag.

## 8) Subscription Schema

The subscription schema lives in **`supabase/migrations/20261006000000_baseline.sql`**
(it was previously applied through the MCP as two uncommitted migrations and was
lost with the project):

- `public.subscription_plans` — one row per tier (`degree_bundle`, `all_access`),
  `monthly_amount_cents` / `annual_amount_cents`, `trial_days` (14), and the three
  Stripe id columns. Seeded by `20261006000200_seed_subscription_plans.sql` with
  Stripe ids `NULL` until §9 fills them.
- `users.stripe_customer_id` (partial unique index), `user_purchases.lifetime_access`.
- `public.user_subscriptions` — `user_id uuid` FK, `tier`, `plan_type`,
  `degree_plan_id`, `stripe_subscription_id` (unique), `stripe_customer_id`,
  `stripe_price_id`, `status` (`pending|trialing|active|past_due|unpaid|canceled|incomplete|incomplete_expired|paused`),
  period columns, `trial_end`, `cancel_at_period_end`, timestamps.
- `public.stripe_webhook_events` — exactly-once ledger (`event_id` PK, `event_type`,
  `status received|processed|failed`, `attempts`, `received_at`, `processed_at`,
  `error`, `payload`). Written by the webhook from PR-3 onward via the
  `claim_stripe_event` SQL function.

Source of truth for tier pricing is `public.subscription_plans` (NOT hardcoded in the script). Update prices there first — via a new migration file, never ad hoc — then run `create_stripe_subscriptions.py --force` to re-emit Stripe Prices.

Verify in SQL:

```sql
select tier, name, monthly_amount_cents, annual_amount_cents, trial_days,
       stripe_product_id, stripe_monthly_price_id, stripe_annual_price_id
from public.subscription_plans;
```

## 9) Link the Stripe Catalog (Test Mode)

**Must be Stripe Test mode until the Live cutover.** Verify before running:

```powershell
$env:STRIPE_SECRET_KEY | Select-String -Pattern "^sk_test_" -Quiet
# Should print True. If False, swap to a test key before proceeding.
```

The Test account already holds 56 one-time products, 2 subscription products and
4 recurring prices from May 2026. **Relink them instead of recreating them**
(decision D4):

```powershell
# Preview: match products by metadata.course_pack_slug / metadata.tier, newest active wins
python backend/scripts/relink_stripe_catalog.py --dry-run --report-unmatched

# Write the ids into course_packs / subscription_plans and refresh product metadata
python backend/scripts/relink_stripe_catalog.py
```

Then the create scripts must report **nothing to create**:

```powershell
python backend/scripts/create_stripe_products.py --dry-run
python backend/scripts/create_stripe_subscriptions.py --dry-run
```

Only on a brand-new Stripe account (or at the Live cutover) run them for real:

```powershell
python backend/scripts/create_stripe_subscriptions.py
```

Expected output for a clean create run:

```
[ok] degree_bundle -> product=prod_xxx monthly=price_yyy annual=price_zzz
[ok] all_access    -> product=prod_aaa monthly=price_bbb annual=price_ccc
Summary: processed=2 updated=2 products_created=2 prices_created=4 failures=0
```

The scripts are idempotent — re-runs skip rows that already have IDs. Pass `--force` to recreate. Every Stripe script refuses an `sk_live_` key unless `--live` is passed.

After it succeeds, verify the IDs are populated:

```sql
select tier, stripe_product_id, stripe_monthly_price_id, stripe_annual_price_id
from public.subscription_plans;
```

## 10) Promote Subscription Products to Stripe Live

**Deferred to the public-launch cutover (Jan 2027, gate G5).** Beta runs entirely on Test mode (D6).

When ready:

1. Toggle Stripe Dashboard to Live mode.
2. Set `$env:STRIPE_SECRET_KEY` to a `sk_live_…` key for the session and pass `--live` to each script.
3. Run `create_stripe_products.py` and `create_stripe_subscriptions.py`. They create separate Live products + prices because the DB IDs reference Test mode resources.
4. **Manually update the `stripe_*_id` columns** with the Live IDs (via a data migration, so the change is reviewable) — the scripts overwrite whichever IDs they last wrote, so coordinate carefully if you maintain both modes.
5. Create the Live webhook destination (§4) with its own `whsec_` and run `validate_stripe_webhook.py` against it; then the $0.50 canary purchase + refund.

## 11) Grandfathering — `lifetime_access`

`user_purchases.lifetime_access` (default `false`) marks one-time buyers whose packs stay unlocked regardless of subscription changes; `routes/store.py` sets it on paid checkouts and the subscribe page shows the "yours forever" notice when any row has it.

**No real buyers have ever existed** — the store only ever ran in Stripe Test mode and the backend was never deployed, so every historical `user_purchases` row was test data and was lost with the July 2026 project. There is nobody to notify: the planned grandfather email is **dropped** (decision D7) and no backfill is needed. The column stays because the pack flow is kept for launch.

---

# Step 4 — Subscription Checkout UI

## 12) Manual QA — Subscription Flow (Test Mode)

> **Re-run after PR-3 (webhook rewrite, gate G2).** Today's webhook infers
> `all_access_*` for every subscription, never writes `tier` / `degree_plan_id` /
> `trial_end` / `cancel_at_period_end`, and the checkout pre-inserts a `pending`
> row that shadows the real one (plan §4-1). The expected values below are what
> PR-3 makes true; the full pass with evidence is gate G3. Prerequisites: backend
> on Render, destination from §4, `store_enabled=true` for the test users, Stripe
> test card `4242 4242 4242 4242`.

### 12.1 Degree Bundle (Nursing, monthly) — *re-run after PR-3*

1. Sign in as a fresh test user with no existing subscription.
2. Navigate to `/app/subscribe`. Both tier cards render. Monthly is selected by default.
3. In the Degree Bundle card, pick **Nursing** from the dropdown.
4. Click **Start 14-day free trial** → redirected to Stripe Checkout.
5. Complete with the `4242` test card. Stripe redirects back to `/app/subscribe?checkout=success`.
6. `<SubscriptionSuccess>` polls and lands on "You're in!" with the trial end date shown (~14 days out).
7. Verify in Supabase:

```sql
select tier, plan_type, degree_plan_id, status, trial_end, stripe_subscription_id, stripe_customer_id
from public.user_subscriptions
order by id desc limit 5;
```

Expected: **exactly one row** for the user with `tier='degree_bundle'`, `plan_type='degree_bundle_monthly'`, `degree_plan_id` = Nursing, `status='trialing'`, `trial_end` ~14 days out, `stripe_subscription_id` (`sub_…`) and `stripe_customer_id` (`cus_…`) populated. No leftover `pending` row.

8. Confirm the user got a Stripe customer:

```sql
select id, email, stripe_customer_id from public.users where id = '<test_user_uuid>';
```

`stripe_customer_id` should be `cus_*`.

### 12.2 Subscription-aware pack access — *re-run after PR-3*

After 12.1 completes:

1. Visit `/app/store/nursing` and click into any Nursing pack.
2. The pack should appear **Unlocked** without a separate purchase (subscription gating in `useUserPurchases`).
3. Visit `/app/store/computer-science` — packs should remain **Locked** (Degree Bundle is per-degree).

### 12.3 All-Access (annual) — *re-run after PR-3*

1. Sign in as a different fresh test user.
2. Navigate to `/app/subscribe` → switch toggle to **Annual** → click **Start 14-day free trial** on the All-Access card.
3. Complete checkout.
4. Verify `tier='all_access'`, `plan_type='all_access_annual'`, `status='trialing'`.
5. Visit any pack in any degree — it should be unlocked.

### 12.4 Billing Portal + replay — *re-run after PR-3*

1. Return to `/app/subscribe` while subscribed.
2. The `<CurrentSubscriptionBanner>` should show "You're on the …" with **Manage subscription** button.
3. Click it → redirected to the Stripe Billing Portal.
4. Click **Cancel subscription** in the portal. Stripe fires `customer.subscription.updated` with `cancel_at_period_end=true`.
5. Return to `/app/subscribe` (Stripe redirects via `return_url`). Banner now shows "(set to cancel)" beside the renewal date.
6. Verify in Supabase that `user_subscriptions.cancel_at_period_end = true`.
7. In Stripe → the destination → **Resend** the `customer.subscription.created` event from 12.1. Still exactly one `user_subscriptions` row; `stripe_webhook_events` shows that `event_id` with `attempts=2`, `status='processed'`.

### 12.5 Webhook events via Stripe CLI / test clocks — *re-run after PR-3*

Trigger each event against test mode and confirm the destination accepts it (200) and the DB state changes.

```bash
stripe trigger invoice.paid
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.trial_will_end
```

Expected DB state changes:

- Test clock advanced 15 days past 12.1 → `status='trialing'` becomes `status='active'` (via `customer.subscription.updated` / `invoice.paid`), `current_period_*` refreshed.
- `invoice.payment_failed` → `status='past_due'`.
- `customer.subscription.trial_will_end` → no DB change, webhook returns 200 with `{updated: false, reason: "noted, trial ending"}` (notification path is deferred).

### 12.6 Trial enforcement — *re-run after PR-3*

1. Cancel the subscription in 12.1 fully (let the trial end after cancel, or `stripe trigger customer.subscription.deleted` against that specific sub).
2. Re-subscribe the SAME user. The backend should **not** include `trial_period_days` in the new Stripe Checkout Session — verify the `subscription_data` payload in the Stripe Dashboard event log. (After PR-3 the prior-subscription check counts only rows with a real status, so an abandoned checkout no longer forfeits the trial.)

### 12.7 Lifetime-access user — *re-run after PR-3*

1. Sign in as a user with `lifetime_access=true` on at least one `user_purchases` row (set it by SQL on a test purchase — there are no real buyers).
2. Visit `/app/subscribe`. The "Your existing packs are yours forever" notice renders above the tier cards (`lifetime_access` is returned by `/api/store/purchases` after PR-3).
3. The user can still subscribe (adds new degrees); flow doesn't block.
