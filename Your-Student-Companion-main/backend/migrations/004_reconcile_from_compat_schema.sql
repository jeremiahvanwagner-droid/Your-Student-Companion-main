-- 004_reconcile_from_compat_schema.sql
-- Reconciles environments that started from compatibility store schema (003)
-- toward the MVP schema shape used by the app roadmap.
--
-- Design notes:
-- 1) Keeps existing store compatibility tables intact (integer/text identifiers).
-- 2) Adds missing core/app tables, triggers, indexes, and RLS policies.
-- 3) Uses conditional DDL so it can run safely on partially migrated projects.

begin;

-- ============================================================
-- Extensions + helper functions
-- ============================================================
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'admin'
  );
$$;

-- ============================================================
-- Normalize existing compatibility tables
-- ============================================================
alter table if exists public.academic_levels
  add column if not exists created_at timestamptz default now();

alter table if exists public.degree_plans
  add column if not exists created_at timestamptz default now();

alter table if exists public.course_packs
  add column if not exists created_at timestamptz default now(),
  add column if not exists features jsonb default '[]'::jsonb,
  add column if not exists stripe_price_id text,
  add column if not exists stripe_product_id text;

alter table if exists public.user_purchases
  add column if not exists purchased_at timestamptz default now();

alter table if exists public.user_subscriptions
  add column if not exists created_at timestamptz default now();

-- ============================================================
-- Missing tables (MVP)
-- ============================================================
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  clerk_id text unique,
  email text,
  role text default 'student' check (role in ('student', 'admin')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.student_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  display_name text,
  grade_level text,
  school text,
  major text,
  year_level text check (year_level in ('freshman', 'sophomore', 'junior', 'senior', 'other')),
  timezone text default 'America/New_York',
  weekly_goal_hours int default 10,
  study_preferences jsonb default '{}'::jsonb,
  onboarding_completed boolean default false,
  created_at timestamptz default now()
);

-- Uses text course_pack_id to remain compatible with existing store schema IDs.
create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  course_pack_id text,
  content_type text check (content_type in ('flashcard', 'study_guide', 'practice_question', 'concept_map', 'note_template')),
  title text,
  content_json jsonb not null,
  difficulty int check (difficulty between 1 and 5),
  display_order int,
  is_published boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  name text not null,
  color text,
  icon_name text,
  created_at timestamptz default now()
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  title text not null,
  description text,
  due_date timestamptz,
  priority text default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  estimated_minutes int,
  status text default 'not_started' check (status in ('not_started', 'in_progress', 'submitted', 'completed')),
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  intention text,
  duration_planned_minutes int,
  duration_actual_minutes int,
  reflection text,
  session_type text default 'pomodoro',
  started_at timestamptz default now(),
  completed_at timestamptz
);

create table if not exists public.focus_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  study_session_id uuid references public.study_sessions(id) on delete set null,
  focus_minutes int not null,
  break_minutes int,
  distractions_noted int default 0,
  logged_at timestamptz default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  title text,
  content text,
  tags text[],
  is_archived boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.review_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  note_id uuid references public.notes(id) on delete set null,
  front_text text not null,
  back_text text not null,
  difficulty int default 3,
  next_review_at timestamptz,
  review_count int default 0,
  created_at timestamptz default now()
);

create table if not exists public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  week_start date not null,
  tasks_completed int default 0,
  tasks_missed int default 0,
  focus_minutes_total int default 0,
  top_subject text,
  insights_json jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  reminder_type text check (reminder_type in ('due_soon', 'overdue', 'study_block', 'weekly_reset')),
  title text,
  message text,
  trigger_at timestamptz,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- Uses text course_pack_id to remain compatible with existing store schema IDs.
create table if not exists public.ai_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  course_pack_id text,
  prompt text,
  response text,
  context_metadata jsonb default '{}'::jsonb,
  tokens_used int,
  created_at timestamptz default now()
);

create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  flag_name text unique,
  is_enabled boolean default false,
  target_roles text[] default '{student}',
  metadata jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- ============================================================
-- Constraints/indexes
-- ============================================================
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'weekly_reports_user_id_week_start_key'
      and conrelid = 'public.weekly_reports'::regclass
  ) then
    alter table public.weekly_reports
      add constraint weekly_reports_user_id_week_start_key unique (user_id, week_start);
  end if;
end
$$;

create index if not exists idx_student_profiles_user_id
  on public.student_profiles (user_id);

create index if not exists idx_degree_plans_is_active
  on public.degree_plans (is_active);

create index if not exists idx_course_packs_degree_level_active
  on public.course_packs (degree_plan_id, academic_level_id, is_active);

create index if not exists idx_user_purchases_user_status_purchased_at
  on public.user_purchases (user_id, status, purchased_at desc);

create index if not exists idx_user_subscriptions_user_status_period_end
  on public.user_subscriptions (user_id, status, current_period_end);

create index if not exists idx_content_items_pack_type_published
  on public.content_items (course_pack_id, content_type, is_published);

create index if not exists idx_assignments_user_status_due_date
  on public.assignments (user_id, status, due_date);

create index if not exists idx_study_sessions_user_started_at
  on public.study_sessions (user_id, started_at desc);

create index if not exists idx_focus_logs_user_logged_at
  on public.focus_logs (user_id, logged_at desc);

create index if not exists idx_notes_user_updated_at
  on public.notes (user_id, updated_at desc);

create index if not exists idx_review_cards_user_next_review_at
  on public.review_cards (user_id, next_review_at);

create index if not exists idx_reminders_user_read_trigger_at
  on public.reminders (user_id, is_read, trigger_at);

create index if not exists idx_ai_interactions_user_created_at
  on public.ai_interactions (user_id, created_at desc);

-- ============================================================
-- Updated-at triggers
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_users_set_updated_at') then
    create trigger trg_users_set_updated_at
    before update on public.users
    for each row
    execute function public.set_updated_at();
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_assignments_set_updated_at') then
    create trigger trg_assignments_set_updated_at
    before update on public.assignments
    for each row
    execute function public.set_updated_at();
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_notes_set_updated_at') then
    create trigger trg_notes_set_updated_at
    before update on public.notes
    for each row
    execute function public.set_updated_at();
  end if;
end
$$;

-- ============================================================
-- Enable RLS
-- ============================================================
alter table if exists public.users enable row level security;
alter table if exists public.student_profiles enable row level security;
alter table if exists public.academic_levels enable row level security;
alter table if exists public.degree_plans enable row level security;
alter table if exists public.course_packs enable row level security;
alter table if exists public.user_purchases enable row level security;
alter table if exists public.user_subscriptions enable row level security;
alter table if exists public.content_items enable row level security;
alter table if exists public.subjects enable row level security;
alter table if exists public.assignments enable row level security;
alter table if exists public.study_sessions enable row level security;
alter table if exists public.focus_logs enable row level security;
alter table if exists public.notes enable row level security;
alter table if exists public.review_cards enable row level security;
alter table if exists public.weekly_reports enable row level security;
alter table if exists public.reminders enable row level security;
alter table if exists public.ai_interactions enable row level security;
alter table if exists public.feature_flags enable row level security;
alter table if exists public.audit_logs enable row level security;

-- ============================================================
-- RLS policies (idempotent)
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='users' and policyname='users_select_self') then
    create policy users_select_self on public.users
      for select to authenticated
      using (id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='users' and policyname='users_insert_self') then
    create policy users_insert_self on public.users
      for insert to authenticated
      with check (id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='users' and policyname='users_update_self') then
    create policy users_update_self on public.users
      for update to authenticated
      using (id = auth.uid())
      with check (id = auth.uid());
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='student_profiles' and policyname='student_profiles_owner_all') then
    create policy student_profiles_owner_all on public.student_profiles
      for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='subjects' and policyname='subjects_owner_all') then
    create policy subjects_owner_all on public.subjects
      for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='assignments' and policyname='assignments_owner_all') then
    create policy assignments_owner_all on public.assignments
      for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='study_sessions' and policyname='study_sessions_owner_all') then
    create policy study_sessions_owner_all on public.study_sessions
      for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='focus_logs' and policyname='focus_logs_owner_all') then
    create policy focus_logs_owner_all on public.focus_logs
      for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='notes' and policyname='notes_owner_all') then
    create policy notes_owner_all on public.notes
      for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='review_cards' and policyname='review_cards_owner_all') then
    create policy review_cards_owner_all on public.review_cards
      for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='weekly_reports' and policyname='weekly_reports_owner_all') then
    create policy weekly_reports_owner_all on public.weekly_reports
      for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='reminders' and policyname='reminders_owner_all') then
    create policy reminders_owner_all on public.reminders
      for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ai_interactions' and policyname='ai_interactions_owner_all') then
    create policy ai_interactions_owner_all on public.ai_interactions
      for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_purchases' and policyname='user_purchases_select_own') then
    create policy user_purchases_select_own on public.user_purchases
      for select to authenticated
      using (user_id = auth.uid()::text);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_purchases' and policyname='user_purchases_admin_all') then
    create policy user_purchases_admin_all on public.user_purchases
      for all to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_subscriptions' and policyname='user_subscriptions_select_own') then
    create policy user_subscriptions_select_own on public.user_subscriptions
      for select to authenticated
      using (user_id = auth.uid()::text);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_subscriptions' and policyname='user_subscriptions_admin_all') then
    create policy user_subscriptions_admin_all on public.user_subscriptions
      for all to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='academic_levels' and policyname='academic_levels_public_read') then
    create policy academic_levels_public_read on public.academic_levels
      for select to anon, authenticated
      using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='academic_levels' and policyname='academic_levels_admin_all') then
    create policy academic_levels_admin_all on public.academic_levels
      for all to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='degree_plans' and policyname='degree_plans_public_read_active') then
    create policy degree_plans_public_read_active on public.degree_plans
      for select to anon, authenticated
      using (is_active = true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='degree_plans' and policyname='degree_plans_admin_all') then
    create policy degree_plans_admin_all on public.degree_plans
      for all to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='course_packs' and policyname='course_packs_public_read_active') then
    create policy course_packs_public_read_active on public.course_packs
      for select to anon, authenticated
      using (is_active = true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='course_packs' and policyname='course_packs_admin_all') then
    create policy course_packs_admin_all on public.course_packs
      for all to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='content_items' and policyname='content_items_select_unlocked') then
    create policy content_items_select_unlocked on public.content_items
      for select to authenticated
      using (
        is_published = true
        and (
          exists (
            select 1
            from public.user_purchases up
            where up.user_id = auth.uid()::text
              and up.course_pack_id = content_items.course_pack_id
              and up.status = 'completed'
          )
          or exists (
            select 1
            from public.user_subscriptions us
            where us.user_id = auth.uid()::text
              and us.status = 'active'
              and us.plan_type in ('all_access_monthly', 'all_access_annual')
              and (us.current_period_end is null or us.current_period_end > now())
          )
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='content_items' and policyname='content_items_admin_all') then
    create policy content_items_admin_all on public.content_items
      for all to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='feature_flags' and policyname='feature_flags_select_targeted_enabled') then
    create policy feature_flags_select_targeted_enabled on public.feature_flags
      for select to authenticated
      using (
        is_enabled = true
        and exists (
          select 1
          from public.users u
          where u.id = auth.uid()
            and u.role = any(feature_flags.target_roles)
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='feature_flags' and policyname='feature_flags_admin_all') then
    create policy feature_flags_admin_all on public.feature_flags
      for all to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='audit_logs' and policyname='audit_logs_admin_all') then
    create policy audit_logs_admin_all on public.audit_logs
      for all to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end
$$;

commit;
