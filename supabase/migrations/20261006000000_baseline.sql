-- 20261006000000_baseline.sql
-- Your Student Companion — schema-as-code baseline (Phase 0R, 2026-10-06).
--
-- WHY THIS FILE EXISTS
--   The only Supabase project (uvyvvaxufmylqavewvex, "ysc-staging") was deleted
--   between 2026-07-22 and 2026-07-28. Its live schema had been assembled from the
--   legacy backend/migrations/003 + 004 files (0001 was never applied) plus five
--   migrations applied only through the Supabase MCP and never committed
--   (subscription_v1_schema, stripe_webhook_events_idempotency, exams_schema_v1,
--   exams_state_column, harden_security_advisors). Nothing in git could rebuild it.
--   This file is now the single reproducible source of the schema.
--
--   Standing rule: no DDL reaches any Supabase project except via a file in
--   supabase/migrations/ applied by `supabase db push` from a merged PR.
--
-- PROVENANCE — what is evidenced vs. what is designed here
--   Evidenced (column names and most constraints come from committed code/docs):
--     * users, student_profiles, subjects, assignments, study_sessions, focus_logs,
--       notes, review_cards, weekly_reports, reminders, ai_interactions,
--       feature_flags, audit_logs, academic_levels, degree_plans, course_packs,
--       content_items, user_purchases, user_subscriptions — legacy
--       backend/migrations/0001, 003, 004 (archived under
--       docs/archive/legacy-migrations/).
--     * focus_migrations and subjects.archived — legacy 006.
--     * planner_blocks — legacy 007.
--     * reminders.reference_id + uniq_reminders_user_type_ref,
--       review_cards.ease_factor / interval_days — legacy 009.
--     * subscription_plans, users.stripe_customer_id, user_purchases.lifetime_access
--       and the user_subscriptions extension (tier, degree_plan_id,
--       stripe_customer_id, stripe_price_id, trial_end, cancel_at_period_end,
--       updated_at) — commit 116a6ae body and backend/STORE_WEBHOOK_RUNBOOK.md:136-141
--       record the COLUMN LIST only.
--     * stripe_webhook_events — commit 116a6ae ("event_id PK, admin-only RLS").
--     * Exam tables — docs/phases/step-7-exams.md:118-321 (7 tables; copied verbatim
--       in section 8 below, with course_pack_exams.course_pack_id as bigint to match
--       the bigint catalog ids) and student_profiles.state (:323-330).
--   Designed here (the lost DDL was never committed, so these are decisions, not
--   recovery — do not mistake them for recovered state):
--     * Every CHECK list on subscription_plans, user_purchases and user_subscriptions
--       (tier, plan_type, status), the NOT NULL choices and defaults, and the
--       partial unique index on users.stripe_customer_id.
--     * Every column of stripe_webhook_events except event_id.
--     * ai_interactions.flagged / flag_reason, student_profiles.email_opt_out,
--       student_profiles.updated_at and unique (user_id), the
--       study_sessions.session_type CHECK, the trigram indexes on notes, the FK
--       indexes, and the deny-all RLS + grant model (decision D2).
--   Deliberately NOT carried forward:
--     * public.users.id -> auth.users FK, shadow auth users, is_admin(), the
--       app_private schema and every RLS policy from 0001/004/006/007 (D2: Clerk is
--       the only identity provider; the PostgREST API roles are denied outright).
--     * study_sessions.created_at — it never existed in any migration; the code that
--       selects it (backend/routes/focus.py SESSION_COLUMNS) is fixed code-side
--       (plan §4-9).
--
-- ID TYPES (decision D3)
--   bigint identity: academic_levels, degree_plans, course_packs, subscription_plans,
--                    user_purchases, user_subscriptions.
--   uuid:            users, every student-owned table, the exam tables.
--   text:            stripe_webhook_events.event_id (Stripe `evt_…`);
--                    ai_interactions.course_pack_id (free-form, no FK).
--
-- ACCESS MODEL (decision D2)
--   RLS is enabled on every table and NO policies exist, so `anon` and
--   `authenticated` can neither read nor write anything through PostgREST. Only
--   `service_role` (backend/lib/supabase_client.py) is granted; it bypasses RLS.
--   Authorization is enforced in FastAPI by user_id filters. `service_role`
--   grants are made explicit because Supabase stops auto-granting API roles on
--   new objects for all projects from 2026-10-30 (sequences included).
--
-- Table count: 30. All statements run in one transaction.

begin;

-- ============================================================================
-- 1. Extensions
-- ============================================================================
-- pg_trgm backs the ilike searches in backend/routes/notes.py. Installed into the
-- `extensions` schema (Supabase convention; keeps `public` free of extension
-- objects). Operator classes below are therefore schema-qualified.
create extension if not exists pg_trgm with schema extensions;

-- ============================================================================
-- 2. Helper functions
-- ============================================================================
-- search_path is pinned so the function cannot be hijacked through a
-- caller-controlled search_path (Supabase advisor "function_search_path_mutable").
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 3. Identity
-- ============================================================================
-- Clerk is the identity provider; `clerk_id` is the external key and `id` is the
-- app-internal uuid every other table references. No FK to auth.users (D2).
create table public.users (
  id uuid primary key default gen_random_uuid(),
  clerk_id text not null unique,
  email text,
  role text not null default 'student' check (role in ('student', 'admin')),
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One Stripe customer per app user; NULL until the user first reaches checkout.
create unique index users_stripe_customer_id_uidx
  on public.users (stripe_customer_id)
  where stripe_customer_id is not null;

-- ============================================================================
-- 4. Catalog (bigint identity ids — D3)
-- ============================================================================
create table public.academic_levels (
  id bigint generated by default as identity primary key,
  name text not null,
  slug text not null unique,
  display_order int,
  description text,
  created_at timestamptz not null default now()
);

create table public.degree_plans (
  id bigint generated by default as identity primary key,
  name text not null,
  slug text not null unique,
  category text not null,
  description text,
  icon_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_degree_plans_is_active
  on public.degree_plans (is_active);

create table public.course_packs (
  id bigint generated by default as identity primary key,
  degree_plan_id bigint not null references public.degree_plans (id) on delete cascade,
  academic_level_id bigint not null references public.academic_levels (id) on delete restrict,
  name text not null,
  slug text not null unique,
  description text,
  price numeric(10, 2) not null check (price >= 0),
  stripe_price_id text,
  stripe_product_id text,
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (degree_plan_id, academic_level_id)
);

create index idx_course_packs_degree_level_active
  on public.course_packs (degree_plan_id, academic_level_id, is_active);
create index idx_course_packs_academic_level_id
  on public.course_packs (academic_level_id);

-- Per-pack content. Kept for schema completeness; no route serves it yet, which is
-- why the pack seed copy does not promise any of these content types.
create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  course_pack_id bigint not null references public.course_packs (id) on delete cascade,
  content_type text not null check (content_type in ('flashcard', 'study_guide', 'practice_question', 'concept_map', 'note_template')),
  title text,
  content_json jsonb not null,
  difficulty int check (difficulty between 1 and 5),
  display_order int,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_content_items_pack_type_published
  on public.content_items (course_pack_id, content_type, is_published);

-- ============================================================================
-- 5. Commerce
-- ============================================================================
-- Source of truth for tier pricing: backend/scripts/create_stripe_subscriptions.py
-- reads it and backend/routes/store.py selects by tier. The three Stripe id columns
-- stay NULL until backend/scripts/relink_stripe_catalog.py fills them (D4).
create table public.subscription_plans (
  id bigint generated by default as identity primary key,
  tier text not null unique check (tier in ('degree_bundle', 'all_access')),
  name text not null,
  description text,
  stripe_product_id text,
  stripe_monthly_price_id text,
  stripe_annual_price_id text,
  monthly_amount_cents int not null check (monthly_amount_cents > 0),
  annual_amount_cents int not null check (annual_amount_cents > 0),
  trial_days int not null default 14 check (trial_days >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One-time pack purchases. unique (user_id, course_pack_id) is the upsert target
-- of backend/routes/store.py (pending row) and backend/routes/webhooks.py
-- (`on_conflict="user_id,course_pack_id"`). course_pack_id is RESTRICT: a pack that
-- has been bought is a financial record and must not be deleted out from under it.
create table public.user_purchases (
  id bigint generated by default as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  course_pack_id bigint not null references public.course_packs (id) on delete restrict,
  lifetime_access boolean not null default false,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  amount_paid numeric(10, 2),
  currency text not null default 'usd',
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'refunded')),
  purchased_at timestamptz not null default now(),
  unique (user_id, course_pack_id)
);

create index idx_user_purchases_user_status_purchased_at
  on public.user_purchases (user_id, status, purchased_at desc);
create index idx_user_purchases_course_pack_id
  on public.user_purchases (course_pack_id);

-- Recurring subscriptions (Degree Bundle / All-Access). One row per Stripe
-- subscription; `status` mirrors Stripe's lifecycle values plus `pending`, which
-- only arises from the `incomplete` mapping in webhooks.py once plan §4-1 removes
-- the pre-checkout insert. `trialing` is kept because users.py and tests rely on it.
create table public.user_subscriptions (
  id bigint generated by default as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  tier text not null check (tier in ('degree_bundle', 'all_access')),
  plan_type text check (plan_type in ('degree_bundle_monthly', 'degree_bundle_annual', 'all_access_monthly', 'all_access_annual')),
  degree_plan_id bigint references public.degree_plans (id) on delete set null,
  stripe_subscription_id text not null unique,
  stripe_customer_id text,
  stripe_price_id text,
  status text not null default 'pending' check (status in ('pending', 'trialing', 'active', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_user_subscriptions_user_status_period_end
  on public.user_subscriptions (user_id, status, current_period_end);
create index idx_user_subscriptions_degree_plan_id
  on public.user_subscriptions (degree_plan_id);

-- ============================================================================
-- 6. Stripe webhook ledger (exactly-once processing, plan §4-2)
-- ============================================================================
-- Written only by the FastAPI webhook (D5) through the forthcoming
-- claim_stripe_event() function. Lifecycle: received -> processed | failed. A Stripe
-- retry of a failed event bumps `attempts` and is re-processed; a retry of a
-- processed event is answered as a duplicate without side effects.
create table public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  status text not null default 'received' check (status in ('received', 'processed', 'failed')),
  attempts int not null default 1 check (attempts >= 1),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  payload jsonb
);

create index idx_stripe_webhook_events_unprocessed
  on public.stripe_webhook_events (received_at)
  where status <> 'processed';

-- ============================================================================
-- 7. Student-owned tables (uuid ids)
-- ============================================================================
-- Nullability on columns the app may clear (timezone, weekly_goal_hours,
-- study_preferences, onboarding_completed) follows legacy 0001 because
-- backend/routes/users.py turns blank strings into NULL on update.
create table public.student_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  display_name text,
  grade_level text,
  school text,
  major text,
  year_level text check (year_level in ('freshman', 'sophomore', 'junior', 'senior', 'other')),
  -- US state for "tests for your state" (step-7 §6.8); two upper-case letters.
  state char(2) check (state ~ '^[A-Z]{2}$'),
  timezone text default 'America/New_York',
  weekly_goal_hours int default 10,
  study_preferences jsonb default '{}'::jsonb,
  onboarding_completed boolean default false,
  -- Weekly-email opt-out (plan §4-16); kept outside study_preferences so
  -- onboarding's preference rewrite cannot wipe it.
  email_opt_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index student_profiles_state_idx
  on public.student_profiles (state)
  where state is not null;

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  color text,
  icon_name text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_subjects_user_archived
  on public.subjects (user_id, archived);

-- "Tasks" in the UI; the table keeps its legacy name (backend/routes/tasks.py).
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  title text not null,
  description text,
  due_date timestamptz,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  estimated_minutes int,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'submitted', 'completed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_assignments_user_status_due_date
  on public.assignments (user_id, status, due_date);
create index idx_assignments_subject_id
  on public.assignments (subject_id);

-- Executed focus sessions (backend/routes/focus.py). Intentionally has NO
-- created_at column — see the header; `started_at` is the ordering column.
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  intention text,
  duration_planned_minutes int,
  duration_actual_minutes int,
  reflection text,
  session_type text not null default 'pomodoro' check (session_type in ('pomodoro', 'deep_work', 'review', 'custom')),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_study_sessions_user_started_at
  on public.study_sessions (user_id, started_at desc);
create index idx_study_sessions_subject_id
  on public.study_sessions (subject_id);

create table public.focus_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  study_session_id uuid references public.study_sessions (id) on delete set null,
  focus_minutes int not null,
  break_minutes int,
  distractions_noted int not null default 0,
  logged_at timestamptz not null default now()
);

create index idx_focus_logs_user_logged_at
  on public.focus_logs (user_id, logged_at desc);
create index idx_focus_logs_study_session_id
  on public.focus_logs (study_session_id);

-- One row per user: idempotency guard for the localStorage -> server focus
-- minutes import (legacy 006). unique (user_id) also serves as its index.
create table public.focus_migrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  minutes_imported integer not null default 0,
  imported_at timestamptz not null default now(),
  unique (user_id)
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  title text,
  content text,
  tags text[],
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_notes_user_updated_at
  on public.notes (user_id, updated_at desc);
create index idx_notes_subject_id
  on public.notes (subject_id);
-- notes.py searches with `title.ilike.%term%,content.ilike.%term%`; trigram GIN
-- indexes make those leading-wildcard scans index-assisted (scope v2 Module F:
-- search p95 <= 300 ms at 1,000 notes).
create index idx_notes_title_trgm
  on public.notes using gin (title extensions.gin_trgm_ops);
create index idx_notes_content_trgm
  on public.notes using gin (content extensions.gin_trgm_ops);
-- notes.py filters with `tags @> '{tag}'` (.contains).
create index idx_notes_tags_gin
  on public.notes using gin (tags);

create table public.review_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  note_id uuid references public.notes (id) on delete set null,
  front_text text not null,
  back_text text not null,
  difficulty int default 3,
  next_review_at timestamptz,
  review_count int default 0,
  -- SM-2 state (legacy 009): ease_factor starts at the canonical 2.5 and is
  -- clamped >= 1.3 in code; interval_days is the last computed interval.
  ease_factor numeric not null default 2.5,
  interval_days int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_review_cards_user_next_review_at
  on public.review_cards (user_id, next_review_at);
create index idx_review_cards_note_id
  on public.review_cards (note_id);

-- Weekly snapshot; unique (user_id, week_start) is the upsert target of
-- backend/routes/reports.py (`on_conflict="user_id,week_start"`).
create table public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  week_start date not null,
  tasks_completed int not null default 0,
  tasks_missed int not null default 0,
  focus_minutes_total int not null default 0,
  top_subject text,
  insights_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  reminder_type text not null check (reminder_type in ('due_soon', 'overdue', 'study_block', 'weekly_reset')),
  title text,
  message text,
  trigger_at timestamptz,
  -- Entity that produced the reminder: an assignment / planner-block uuid, or a
  -- deterministic uuid5 for weekly resets (email_ops.weekly_reset_reference).
  -- NULL for manual reminders; NULLs are distinct in the unique index below, so
  -- manual reminders never collide while synced ones conflict-and-skip.
  reference_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_reminders_user_read_trigger_at
  on public.reminders (user_id, is_read, trigger_at);
-- Upsert target of backend/routes/reminders.py and backend/routes/email_ops.py
-- (`on_conflict="user_id,reminder_type,reference_id"`). Name is load-bearing.
create unique index uniq_reminders_user_type_ref
  on public.reminders (user_id, reminder_type, reference_id);

create table public.ai_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  -- Free-form pack reference written by backend/routes/ai_mentor.py. Text with no
  -- FK (D3): it may hold a bigint id, a slug, or a legacy key.
  course_pack_id text,
  prompt text,
  response text,
  context_metadata jsonb not null default '{}'::jsonb,
  tokens_used int,
  -- Report button / review queue (plan §4-10).
  flagged boolean not null default false,
  flag_reason text,
  created_at timestamptz not null default now()
);

create index idx_ai_interactions_user_created_at
  on public.ai_interactions (user_id, created_at desc);
create index idx_ai_interactions_flagged
  on public.ai_interactions (created_at desc)
  where flagged;

-- Module D (Study Planner): intended future study blocks, distinct from
-- study_sessions which records *executed* sessions (legacy 007).
create table public.planner_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  assignment_id uuid references public.assignments (id) on delete set null,
  title text not null,
  goal text,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  completed boolean not null default false,
  source text not null default 'manual' check (source in ('manual', 'auto_suggest')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planner_blocks_end_after_start check (scheduled_end > scheduled_start)
);

create index idx_planner_blocks_user_start
  on public.planner_blocks (user_id, scheduled_start);
create index idx_planner_blocks_subject_id
  on public.planner_blocks (subject_id);
create index idx_planner_blocks_assignment_id
  on public.planner_blocks (assignment_id);

-- Kill switches and staged rollouts (seeded by 20261006000300). Read only by the
-- backend through service_role; toggled by an admin in Studio / SQL.
create table public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  flag_name text not null unique,
  is_enabled boolean not null default false,
  target_roles text[] not null default '{student}',
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Append-only operational trail (backend/lib/audit.py). actor_id is nullable and
-- SET NULL on user delete so account deletion is never blocked by its own log.
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_logs_actor_id
  on public.audit_logs (actor_id);

-- ============================================================================
-- 8. Exams (7 tables)
-- ============================================================================
-- Copied VERBATIM from docs/phases/step-7-exams.md:118-321 (keyword case preserved
-- on purpose so a diff against the design doc is trivial). The only edit is
-- course_pack_exams.course_pack_id, which the doc already specifies as bigint and
-- which now matches public.course_packs.id. The doc's "anon read where published"
-- RLS sketch (§6.9) is intentionally NOT implemented: it leaked the answer key in
-- exam_questions.choices to anyone holding the publishable key.
CREATE TABLE public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,                    -- 'act', 'shsat', 'ny-regents-algebra-i'
  name text NOT NULL,                           -- 'ACT'
  full_name text NOT NULL,                      -- 'American College Test'
  category text NOT NULL CHECK (category IN (
    'national_college_admission',               -- ACT, AP
    'national_private_school',                  -- HSPT, ISEE, SSAT, CLT
    'state_mandated_assessment',                -- CAASPP, STAAR, PSSA, LEAP
    'state_eoc_assessment',                     -- Regents, SOL EOC, FL EOC
    'regional_admissions',                      -- SHSAT, TACHS, CPS HSAT, COOP
    'gifted_screening',                         -- NNAT, OLSAT, CogAT
    'placement_test',                           -- PERT, MAP Growth, Forward
    'workforce_readiness'                       -- WorkKeys
  )),
  region_state char(2) NULL,                    -- 'CA', 'TX', null for national
  region_metro text NULL,                       -- 'NYC', 'Chicago', null for state/national
  grade_band text NOT NULL CHECK (grade_band IN (
    'grades_k_2', 'grades_3_5', 'grades_6_8',
    'high_school', 'college_admission', 'adult'
  )),
  description text NULL,
  total_time_minutes integer NULL,              -- null if variable
  total_questions integer NULL,
  sections_count integer NOT NULL DEFAULT 1,
  scoring_model text NOT NULL CHECK (scoring_model IN (
    'raw',                                      -- correct count
    'scaled',                                   -- e.g. SAT 200-800 per section
    'composite',                                -- e.g. ACT 1-36
    'percentile',                               -- e.g. GATE screeners
    'rubric_1_5',                               -- e.g. AP exams
    'pass_fail'
  )),
  scoring_metadata jsonb NOT NULL DEFAULT '{}', -- {min: 0, max: 36, sections: {...}}
  content_source text NOT NULL CHECK (content_source IN (
    'original',                                 -- we wrote it
    'public_domain',
    'state_released',                           -- DOE-released items
    'licensed',                                 -- we paid for rights
    'mixed'
  )),
  content_provenance jsonb NOT NULL DEFAULT '{}', -- license details, URLs, attributions
  icon_name text NULL,
  is_published boolean NOT NULL DEFAULT false,  -- gate before content is complete
  is_official_partnership boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX exams_region_state_idx ON public.exams(region_state) WHERE region_state IS NOT NULL;
CREATE INDEX exams_grade_band_idx ON public.exams(grade_band);
CREATE INDEX exams_published_idx ON public.exams(is_published) WHERE is_published = true;

CREATE TABLE public.exam_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  slug text NOT NULL,                           -- 'reading', 'math', 'science'
  name text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  time_minutes integer NULL,
  total_questions integer NULL,
  scoring_weight numeric(5,2) NOT NULL DEFAULT 1.0,  -- for composite scoring
  description text NULL,
  UNIQUE (exam_id, slug)
);

CREATE TABLE public.exam_passages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  section_id uuid NULL REFERENCES public.exam_sections(id) ON DELETE SET NULL,
  title text NULL,
  content text NOT NULL,                        -- markdown or plaintext
  content_html text NULL,                       -- rich rendering if needed
  estimated_read_time_seconds integer NULL,
  source_type text NOT NULL CHECK (source_type IN (
    'original', 'public_domain', 'state_released', 'licensed'
  )),
  source_attribution text NULL,
  year_released integer NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.exam_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  section_id uuid NULL REFERENCES public.exam_sections(id) ON DELETE SET NULL,
  passage_id uuid NULL REFERENCES public.exam_passages(id) ON DELETE SET NULL,
  question_type text NOT NULL CHECK (question_type IN (
    'multiple_choice',     -- single correct answer from N choices
    'multiple_select',     -- multiple correct answers
    'grid_in',             -- numeric short answer (SAT/STAAR-style)
    'short_answer',        -- free-text short response
    'essay',               -- long-form (not auto-graded in v1)
    'matching'             -- pair items between two columns
  )),
  stem text NOT NULL,                           -- the prompt
  stem_html text NULL,                          -- rich formatting if needed
  choices jsonb NOT NULL DEFAULT '[]',          -- [{id, text, is_correct, explanation}]
  correct_answer text NULL,                     -- for grid_in / short_answer
  explanation text NULL,                        -- shown after answer
  difficulty integer NOT NULL DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
  topic_tags text[] NOT NULL DEFAULT '{}',      -- fine-grained categorization
  standards_alignment text[] NOT NULL DEFAULT '{}',  -- e.g. CCSS, TEKS codes
  source_type text NOT NULL CHECK (source_type IN (
    'original', 'public_domain', 'state_released', 'licensed'
  )),
  source_attribution text NULL,                 -- citation if not 'original'
  year_released integer NULL,
  display_order integer NULL,                   -- for static-ordered tests
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX exam_questions_exam_idx ON public.exam_questions(exam_id, is_published);
CREATE INDEX exam_questions_section_idx ON public.exam_questions(section_id) WHERE section_id IS NOT NULL;
CREATE INDEX exam_questions_passage_idx ON public.exam_questions(passage_id) WHERE passage_id IS NOT NULL;

CREATE TABLE public.exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE RESTRICT,
  mode text NOT NULL CHECK (mode IN (
    'practice',            -- untimed, can review answers as you go
    'timed',               -- enforced time limit, results at end
    'review'               -- read-only post-mortem of a completed attempt
  )),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN (
    'in_progress', 'submitted', 'abandoned', 'expired'
  )),
  entitlement_source text NOT NULL CHECK (entitlement_source IN (
    'subscription_all_access',
    'subscription_exam_prep',
    'one_time_purchase',
    'free_tier_sample',
    'admin_grant'
  )),
  entitlement_reference_id text NULL,           -- subscription id, purchase id, etc.
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  time_spent_seconds integer NULL,
  -- Scoring (populated on submit)
  score_raw integer NULL,
  score_scaled integer NULL,
  score_composite numeric(6,2) NULL,
  score_percentile numeric(5,2) NULL,
  section_scores jsonb NOT NULL DEFAULT '{}',   -- {reading: {raw: 30, scaled: 640}, ...}
  -- Snapshot the question set chosen for this attempt (for reproducibility)
  question_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX exam_attempts_user_idx ON public.exam_attempts(user_id, created_at DESC);
CREATE INDEX exam_attempts_status_idx ON public.exam_attempts(status) WHERE status = 'in_progress';

CREATE TABLE public.exam_attempt_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.exam_questions(id) ON DELETE RESTRICT,
  response_value jsonb NULL,                    -- {choice_id: '...'} or {value: '42'} or {text: '...'}
  is_correct boolean NULL,                      -- null until graded (essays may stay null)
  time_spent_seconds integer NOT NULL DEFAULT 0,
  flagged_for_review boolean NOT NULL DEFAULT false,
  skipped boolean NOT NULL DEFAULT false,
  answered_at timestamptz NULL,
  UNIQUE (attempt_id, question_id)
);

CREATE TABLE public.course_pack_exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_pack_id bigint NOT NULL REFERENCES public.course_packs(id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_pack_id, exam_id)
);

-- End of verbatim block. FK indexes the doc omits (advisor "unindexed_foreign_keys");
-- exam_sections.exam_id, exam_attempts.user_id, exam_attempt_responses.attempt_id
-- and course_pack_exams.course_pack_id are already the leading column of an index.
create index exam_passages_exam_idx
  on public.exam_passages (exam_id);
create index exam_passages_section_idx
  on public.exam_passages (section_id)
  where section_id is not null;
create index exam_attempts_exam_idx
  on public.exam_attempts (exam_id);
create index exam_attempt_responses_question_idx
  on public.exam_attempt_responses (question_id);
create index course_pack_exams_exam_idx
  on public.course_pack_exams (exam_id);

-- ============================================================================
-- 9. updated_at triggers (every table that has an updated_at column)
-- ============================================================================
create trigger trg_users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create trigger trg_subscription_plans_set_updated_at
  before update on public.subscription_plans
  for each row execute function public.set_updated_at();

create trigger trg_user_subscriptions_set_updated_at
  before update on public.user_subscriptions
  for each row execute function public.set_updated_at();

create trigger trg_student_profiles_set_updated_at
  before update on public.student_profiles
  for each row execute function public.set_updated_at();

create trigger trg_assignments_set_updated_at
  before update on public.assignments
  for each row execute function public.set_updated_at();

create trigger trg_notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

create trigger trg_planner_blocks_set_updated_at
  before update on public.planner_blocks
  for each row execute function public.set_updated_at();

create trigger trg_feature_flags_set_updated_at
  before update on public.feature_flags
  for each row execute function public.set_updated_at();

create trigger trg_exams_set_updated_at
  before update on public.exams
  for each row execute function public.set_updated_at();

create trigger trg_exam_questions_set_updated_at
  before update on public.exam_questions
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 10. Row Level Security — enabled everywhere, NO policies (decision D2)
-- ============================================================================
-- With RLS on and no policies, `anon` / `authenticated` are denied every row.
-- `service_role` bypasses RLS. Do NOT use FORCE ROW LEVEL SECURITY: migrations
-- and seeds run as the table owner (postgres) and must keep working.
alter table public.users enable row level security;
alter table public.academic_levels enable row level security;
alter table public.degree_plans enable row level security;
alter table public.course_packs enable row level security;
alter table public.content_items enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.user_purchases enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.student_profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.assignments enable row level security;
alter table public.study_sessions enable row level security;
alter table public.focus_logs enable row level security;
alter table public.focus_migrations enable row level security;
alter table public.notes enable row level security;
alter table public.review_cards enable row level security;
alter table public.weekly_reports enable row level security;
alter table public.reminders enable row level security;
alter table public.ai_interactions enable row level security;
alter table public.planner_blocks enable row level security;
alter table public.feature_flags enable row level security;
alter table public.audit_logs enable row level security;
alter table public.exams enable row level security;
alter table public.exam_sections enable row level security;
alter table public.exam_passages enable row level security;
alter table public.exam_questions enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.exam_attempt_responses enable row level security;
alter table public.course_pack_exams enable row level security;

-- ============================================================================
-- 11. Grants — API roles revoked, service_role granted (plan §3.2 item 12)
-- ============================================================================
-- Shape-independent: Supabase's "no automatic grants" default applies to new
-- projects and, from 2026-10-30, to every existing project, and covers sequences.
-- Making both directions explicit means the schema behaves identically before and
-- after that date, locally and hosted.

-- enable RLS on every public table; create NO policies (anon/authenticated denied; service_role bypasses RLS)
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges for role postgres in schema public grant all on tables to service_role;
alter default privileges for role postgres in schema public grant usage, select on sequences to service_role;

-- Additional hardening beyond the plan block.
-- (a) Sequences created later must not be auto-granted to the API roles either.
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

-- (b) Functions in `public` are exposed by PostgREST under /rest/v1/rpc. Postgres
-- grants EXECUTE on every new function to PUBLIC by default, and revoking from a
-- named role never removes a PUBLIC grant, so `revoke ... from anon, authenticated`
-- alone would leave every function callable by the API roles. The PUBLIC grant is
-- therefore withdrawn (existing + future) and EXECUTE is granted to service_role
-- explicitly (existing + future). The owner (postgres) keeps EXECUTE implicitly, so
-- migrations, seeds and `supabase db lint` are unaffected; this also covers the
-- forthcoming claim_stripe_event() RPC (plan §4-2) without a per-function grant.
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
alter default privileges for role postgres in schema public grant execute on functions to service_role;

-- ============================================================================
-- 12. Ask PostgREST to reload its schema cache (delivered on commit)
-- ============================================================================
notify pgrst, 'reload schema';

commit;
