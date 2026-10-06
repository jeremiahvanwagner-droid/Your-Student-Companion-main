-- 20261006000200_seed_subscription_plans.sql
-- The two locked v1 subscription tiers (pricing decision 2026-05-22, commit 116a6ae):
--   degree_bundle  $7.99 / month   $79.99 / year
--   all_access    $14.99 / month  $149.99 / year
-- both with a 14-day trial. public.subscription_plans is the source of truth for
-- pricing — backend/scripts/create_stripe_subscriptions.py reads amounts from here,
-- never the other way round.
--
-- Stripe id columns are left NULL on purpose: backend/scripts/relink_stripe_catalog.py
-- (D4) matches the existing Stripe Test products by metadata.tier and fills them.
-- Idempotent: upsert on tier; the on-conflict branch NEVER overwrites the Stripe ids.
--
-- Descriptions state only what a subscription unlocks today (pack access by degree
-- plan). The AI mentor is available to every signed-in user; per-tier mentor
-- context and budgets land with plan §4-10.

begin;

insert into public.subscription_plans (
  tier,
  name,
  description,
  monthly_amount_cents,
  annual_amount_cents,
  trial_days,
  is_active
)
values
  (
    'degree_bundle',
    'Degree Bundle',
    'Every course pack for one degree plan of your choice.',
    799,
    7999,
    14,
    true
  ),
  (
    'all_access',
    'All-Access',
    'Every course pack across all degree plans.',
    1499,
    14999,
    14,
    true
  )
on conflict (tier) do update
set
  name = excluded.name,
  description = excluded.description,
  monthly_amount_cents = excluded.monthly_amount_cents,
  annual_amount_cents = excluded.annual_amount_cents,
  trial_days = excluded.trial_days,
  is_active = excluded.is_active;
  -- stripe_product_id / stripe_monthly_price_id / stripe_annual_price_id untouched.

commit;
