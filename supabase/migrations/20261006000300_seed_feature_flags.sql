-- 20261006000300_seed_feature_flags.sql
-- Kill switches for the free beta (decisions D6 / D7). Columns follow
-- public.feature_flags from the baseline (flag_name unique, is_enabled,
-- target_roles, metadata).
--
--   store_enabled   false  Store / subscribe UI hidden during the free beta (D6).
--   exams_enabled   false  Exam UI deferred; tables + catalog API stay (D7).
--   voice_enabled   false  Voice mentor deferred until a server-minted session
--                          endpoint with tier + minute metering exists (D7, §4-23).
--   mentor_enabled  true   Text AI mentor is the core beta loop.
--   email_enabled   true   Weekly email + welcome (RESEND_API_KEY still gates sends).
--
-- Idempotent: insert-or-refresh on flag_name. The on-conflict branch refreshes only
-- metadata and target_roles and deliberately leaves is_enabled alone, so re-running
-- this file in an environment where an admin has already flipped a switch does not
-- silently flip it back. A fresh database gets exactly the values above.

begin;

insert into public.feature_flags (flag_name, is_enabled, target_roles, metadata)
values
  (
    'store_enabled',
    false,
    '{student,admin}',
    '{"description": "Show the store and subscribe UI and allow checkout. Off during the free beta (D6).", "owner": "plan D6"}'::jsonb
  ),
  (
    'exams_enabled',
    false,
    '{student,admin}',
    '{"description": "Expose the placement-exam UI. Catalog API and tables exist; UI is deferred (D7).", "owner": "plan D7"}'::jsonb
  ),
  (
    'voice_enabled',
    false,
    '{student,admin}',
    '{"description": "Voice mentor. Stays off until a server-minted session with tier and minute metering exists (plan section 4-23).", "owner": "plan D7"}'::jsonb
  ),
  (
    'mentor_enabled',
    true,
    '{student,admin}',
    '{"description": "Text AI mentor (POST /api/ai/chat). Core beta loop.", "owner": "plan D7"}'::jsonb
  ),
  (
    'email_enabled',
    true,
    '{student,admin}',
    '{"description": "Transactional + weekly email via Resend. Sends additionally require RESEND_API_KEY to be set.", "owner": "plan D7"}'::jsonb
  )
on conflict (flag_name) do update
set
  target_roles = excluded.target_roles,
  metadata = excluded.metadata;
  -- is_enabled intentionally not overwritten (see header).

commit;
