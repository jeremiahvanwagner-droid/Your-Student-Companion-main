# Stripe Webhook Edge Function

This Edge Function handles Stripe webhook events and writes purchase/subscription state to YSC tables:

- `public.user_purchases`
- `public.user_subscriptions`

## Required Supabase secrets

Set these in your Supabase project before deploy:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

## Deploy

```bash
npx supabase functions deploy stripe-webhook --project-ref uvyvvaxufmylqavewvex
```

## Configure Stripe destination

Set Stripe webhook destination URL to:

```text
https://uvyvvaxufmylqavewvex.supabase.co/functions/v1/stripe-webhook
```

Enable events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

## Notes

- `verify_jwt = false` is required for Stripe webhook calls.
- This function expects `user_id` and `course_pack_id` in Checkout Session metadata.
