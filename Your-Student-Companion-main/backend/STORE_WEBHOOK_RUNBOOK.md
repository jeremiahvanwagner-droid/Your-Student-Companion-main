# Store + Webhook Runbook

This runbook covers operational checks for the YSC store stack.

## Working Directory

Run commands from:

```powershell
C:\Users\JeremiahVanWagner\Your-Student-Companion-main\Your-Student-Companion-main
```

## 1) Schema + Webhook Readiness Audit

```powershell
python backend/scripts/audit_supabase_schema.py
```

What it checks:

- Expected MVP tables and required columns
- Seed counts for `academic_levels`, `degree_plans`, `course_packs`
- Stripe price mapping coverage on `course_packs`
- Supabase Edge function reachability (`/functions/v1/stripe-webhook`)
- Stripe endpoint events include required event set

## 2) Edge Webhook Write Validation

```powershell
python backend/scripts/validate_supabase_webhook.py
```

Expected result:

- `Validation result: PASS`
- A temporary row is written to `public.user_purchases` and then cleaned up

Note:

- This validator simulates `checkout.session.completed` with an unpaid session and therefore usually writes `status: pending`.

## 3) Deploy Stripe Webhook Edge Function

```powershell
npx supabase functions deploy stripe-webhook --project-ref uvyvvaxufmylqavewvex
```

If deploy fails with `entrypoint path does not exist`, verify you are in the inner project folder above.

## 4) Set Function Secrets

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

## 5) Required Stripe Events

The destination URL should include these events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

## 6) Real Checkout Validation (Manual)

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
