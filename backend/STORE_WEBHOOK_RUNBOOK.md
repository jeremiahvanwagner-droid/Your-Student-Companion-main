# Store + Webhook Runbook

This runbook covers operational checks for the YSC store stack.

## Working Directory

Run commands from:

```powershell
C:\Users\JeremiahVanWagner\Your-Student-Companion-main\Your-Student-Companion-main
```

## 1) Reconcile Compatibility Schema to MVP Baseline

If your audit reports missing tables like `users`, `student_profiles`, `assignments`, etc., run:

- `backend/migrations/004_reconcile_from_compat_schema.sql`

Recommended execution path:

1. Open Supabase SQL Editor.
2. Paste SQL from `backend/migrations/004_reconcile_from_compat_schema.sql`.
3. Run it once.

## 2) Schema + Webhook Readiness Audit

```powershell
python backend/scripts/audit_supabase_schema.py
```

What it checks:

- Expected MVP tables and required columns
- Seed counts for `academic_levels`, `degree_plans`, `course_packs`
- Stripe price mapping coverage on `course_packs`
- Supabase Edge function reachability (`/functions/v1/stripe-webhook`)
- Stripe endpoint events include required event set

## 3) Edge Webhook Write Validation

```powershell
python backend/scripts/validate_supabase_webhook.py
```

Expected result:

- `Validation result: PASS`
- A temporary row is written to `public.user_purchases` and then cleaned up

Note:

- This validator simulates `checkout.session.completed` with an unpaid session and therefore usually writes `status: pending`.

## 4) Deploy Stripe Webhook Edge Function

```powershell
npx supabase functions deploy stripe-webhook --project-ref uvyvvaxufmylqavewvex
```

If deploy fails with `entrypoint path does not exist`, verify you are in the inner project folder above.

## 5) Set Function Secrets

```powershell
Get-Content backend/.env | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $parts = $_.Split('=',2)
  [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), 'Process')
}

npx supabase secrets set \
  "STRIPE_SECRET_KEY=$($env:STRIPE_SECRET_KEY)" \
  "STRIPE_WEBHOOK_SECRET=$($env:STRIPE_WEBHOOK_SECRET)" \
  --project-ref uvyvvaxufmylqavewvex
```

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
- `entrypoint path does not exist`: wrong directory level
- `Invalid webhook signature`: `STRIPE_WEBHOOK_SECRET` mismatch between project secrets and Stripe destination
- Endpoint returns 404: function not deployed or wrong project ref
- `PGRST205 Could not find the table 'public.<table>' in the schema cache`: PostgREST schema cache hasn't refreshed yet after a DDL migration. Issue `notify pgrst, 'reload schema';` from SQL Editor and wait 1–2 minutes, or restart the project's API.

---

# Subscription Stack (Step 3)

The sections below cover the v1 recurring subscription tiers (Degree Bundle, All-Access). The one-time pack flow above continues to operate alongside subscriptions; existing buyers get lifetime access via the grandfathering flag described in §11.

## 8) Subscription Schema Setup

Two migrations applied via the Supabase MCP `apply_migration` tool on 2026-05-22:

- `subscription_v1_schema` — creates `public.subscription_plans`, adds `users.stripe_customer_id`, `user_purchases.lifetime_access`, and extends `user_subscriptions` with `tier`, `degree_plan_id`, `stripe_customer_id`, `stripe_price_id`, `trial_end`, `cancel_at_period_end`, `updated_at`.
- `stripe_webhook_events_idempotency` — creates `public.stripe_webhook_events` with `event_id` PK. The webhook handler should `insert` first and skip on conflict.

Source of truth for tier pricing is `public.subscription_plans` (NOT hardcoded in the script). Update prices there first, then run `create_stripe_subscriptions.py --force` to re-emit Stripe Prices.

Verify in SQL:

```sql
select tier, name, monthly_amount_cents, annual_amount_cents, trial_days,
       stripe_product_id, stripe_monthly_price_id, stripe_annual_price_id
from public.subscription_plans;
```

## 9) Create Stripe Subscription Products (Test Mode)

**Must be Stripe Test mode for the initial rollout.** Verify before running:

```powershell
$env:STRIPE_SECRET_KEY | Select-String -Pattern "^sk_test_" -Quiet
# Should print True. If False, swap to a test key before proceeding.
```

Then:

```powershell
# Preview without hitting Stripe or writing to Supabase:
python backend/scripts/create_stripe_subscriptions.py --dry-run

# Create products + 2 recurring prices (monthly + annual) per active tier:
python backend/scripts/create_stripe_subscriptions.py
```

Expected output for a clean run:

```
[ok] degree_bundle -> product=prod_xxx monthly=price_yyy annual=price_zzz
[ok] all_access    -> product=prod_aaa monthly=price_bbb annual=price_ccc
Summary: processed=2 updated=2 products_created=2 prices_created=4 failures=0
```

The script is idempotent — re-runs skip rows that already have IDs. Pass `--force` to recreate.

After it succeeds, verify the IDs are populated:

```sql
select tier, stripe_product_id, stripe_monthly_price_id, stripe_annual_price_id
from public.subscription_plans;
```

## 10) Promote Subscription Products to Stripe Live

**Defer until Step 4 ships the subscription checkout UI and you've validated the end-to-end flow in Test mode.**

When ready:

1. Toggle Stripe Dashboard to Live mode.
2. Set `$env:STRIPE_SECRET_KEY` to a `sk_live_…` key for the session.
3. Re-run `create_stripe_subscriptions.py`. It will create separate Live products + prices because the DB IDs reference Test mode resources.
4. **Manually update `subscription_plans.stripe_*_id` columns** with the Live IDs — the script overwrites whichever IDs it last wrote, so coordinate carefully if you maintain both modes.

## 11) Grandfathering Existing One-Time Buyers

The `subscription_v1_schema` migration backfilled `lifetime_access = true` on every `user_purchases` row with `status = 'completed'`. These users keep their unlocked packs forever — the subscription rollout does not affect them.

Send a one-time email to those users before Step 4 ships the subscription store UI. **Defer the actual send until UI ship day** so the messaging matches what they'll see.

### Draft email copy (English)

```
Subject: Your YSC packs are yours for life

Hi [first name],

You bought one or more course packs on Your Student Companion earlier
this year. We're writing to let you know we're adding monthly and
annual subscription options to YSC alongside the one-time packs.

The change does not affect you. The packs you purchased — and any
future updates to their content — are yours for life on the
[email address] account you used to buy them.

You'll see new "Degree Bundle" and "All-Access" subscription options
appear in the store soon. They're for students who want broader access
across multiple degree plans. If you'd ever like to switch from your
lifetime packs to a subscription, reply to this email and we'll help.

Thank you for being one of YSC's earliest supporters.

— Jeremiah, founder, Your Student Companion
```

To find recipients:

```sql
select distinct up.user_id, u.email
from public.user_purchases up
left join public.users u on u.clerk_id = up.user_id
where up.lifetime_access = true and u.email is not null;
```

(Filter further if there are sandbox/test rows you want to exclude — the `user_id` patterns `clerk_test_user_%` and `clerk_webhook_test_%` are seeded test rows that shouldn't receive email.)
