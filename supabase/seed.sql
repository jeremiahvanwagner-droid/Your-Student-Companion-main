-- supabase/seed.sql — LOCAL ONLY.
--
-- Run automatically by `supabase db reset` (and `supabase start` on first boot)
-- after every file in supabase/migrations/. It is NEVER applied by
-- `supabase db push`, so nothing here reaches a hosted project.
--
-- Catalog, subscription plans, feature flags and the sample exam are real
-- migrations (20261006000100..000400), not seed data, because production needs
-- them too. This file only adds what a developer needs to exercise admin paths
-- locally.
--
-- Production admins are NOT created here. They are granted with the documented
-- SQL in docs/runbooks/database.md ("Grant the first admin"), run once against
-- ysc-prod after the owner has signed in through Clerk at least once.

-- Placeholder admin. Replace the clerk_id with your own Clerk *test-instance*
-- user id (user_…) to have the local backend resolve you as an admin, or leave
-- it as-is and sign in normally as a student.
insert into public.users (clerk_id, email, role)
values ('user_LOCAL_ADMIN_REPLACE_ME', null, 'admin')
on conflict (clerk_id) do update
set role = 'admin';
