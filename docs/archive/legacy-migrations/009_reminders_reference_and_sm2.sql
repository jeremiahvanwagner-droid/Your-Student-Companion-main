-- 009_reminders_reference_and_sm2.sql
-- Module I (in-app reminders) + step-9 SM-2 review engine columns.

begin;

-- Reminders: reference the entity that produced the reminder so the sync
-- pass can be idempotent. Postgres treats NULLs as distinct in unique
-- indexes, so manually created reminders (reference_id null) never collide
-- while synced reminders (assignment/block uuid) conflict-and-skip.
alter table public.reminders
  add column reference_id uuid;

create unique index uniq_reminders_user_type_ref
  on public.reminders (user_id, reminder_type, reference_id);

-- Review cards: SM-2 state. ease_factor starts at the canonical 2.5 and
-- never drops below 1.3; interval_days is the last computed interval that
-- the next review multiplies by ease_factor.
alter table public.review_cards
  add column ease_factor numeric default 2.5,
  add column interval_days integer default 0;

commit;
