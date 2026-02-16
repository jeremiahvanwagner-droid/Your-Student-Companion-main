-- 0001_init_supabase_schema.sql
-- Phase 0.1: Supabase baseline schema, indexes, triggers, and RLS policies.

begin;

-- ============================================
-- Extensions and helper functions
-- ============================================
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

-- ============================================
-- Tables
-- ============================================
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  clerk_id text unique,
  email text,
  role text default 'student' check (role in ('student', 'admin')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.student_profiles (
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

create table public.academic_levels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  display_order int,
  description text,
  created_at timestamptz default now()
);

create table public.degree_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  category text not null,
  description text,
  icon_name text,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table public.course_packs (
  id uuid primary key default gen_random_uuid(),
  degree_plan_id uuid references public.degree_plans(id) on delete cascade,
  academic_level_id uuid references public.academic_levels(id) on delete restrict,
  name text not null,
  slug text unique,
  description text,
  price decimal(10, 2) not null check (price >= 0),
  stripe_price_id text,
  stripe_product_id text,
  features jsonb default '[]'::jsonb,
  is_active boolean default true,
  created_at timestamptz default now(),
  unique (degree_plan_id, academic_level_id)
);

create table public.user_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  course_pack_id uuid references public.course_packs(id) on delete set null,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  amount_paid decimal(10, 2),
  currency text default 'usd',
  status text default 'pending' check (status in ('pending', 'completed', 'failed', 'refunded')),
  purchased_at timestamptz default now(),
  unique (user_id, course_pack_id)
);

create table public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  plan_type text check (plan_type in ('all_access_monthly', 'all_access_annual')),
  stripe_subscription_id text,
  status text default 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz default now()
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  course_pack_id uuid references public.course_packs(id) on delete cascade,
  content_type text check (content_type in ('flashcard', 'study_guide', 'practice_question', 'concept_map', 'note_template')),
  title text,
  content_json jsonb not null,
  difficulty int check (difficulty between 1 and 5),
  display_order int,
  is_published boolean default true,
  created_at timestamptz default now()
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  name text not null,
  color text,
  icon_name text,
  created_at timestamptz default now()
);

create table public.assignments (
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

create table public.study_sessions (
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

create table public.focus_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  study_session_id uuid references public.study_sessions(id) on delete set null,
  focus_minutes int not null,
  break_minutes int,
  distractions_noted int default 0,
  logged_at timestamptz default now()
);

create table public.notes (
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

create table public.review_cards (
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

create table public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  week_start date not null,
  tasks_completed int default 0,
  tasks_missed int default 0,
  focus_minutes_total int default 0,
  top_subject text,
  insights_json jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  unique (user_id, week_start)
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  reminder_type text check (reminder_type in ('due_soon', 'overdue', 'study_block', 'weekly_reset')),
  title text,
  message text,
  trigger_at timestamptz,
  is_read boolean default false,
  created_at timestamptz default now()
);

create table public.ai_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  course_pack_id uuid references public.course_packs(id) on delete set null,
  prompt text,
  response text,
  context_metadata jsonb default '{}'::jsonb,
  tokens_used int,
  created_at timestamptz default now()
);

create table public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  flag_name text unique,
  is_enabled boolean default false,
  target_roles text[] default '{student}',
  metadata jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

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

-- ============================================
-- Indexes
-- ============================================
create index idx_student_profiles_user_id on public.student_profiles (user_id);
create index idx_degree_plans_is_active on public.degree_plans (is_active);
create index idx_course_packs_degree_level_active on public.course_packs (degree_plan_id, academic_level_id, is_active);
create index idx_user_purchases_user_status_purchased_at on public.user_purchases (user_id, status, purchased_at desc);
create index idx_user_subscriptions_user_status_period_end on public.user_subscriptions (user_id, status, current_period_end);
create index idx_content_items_pack_type_published on public.content_items (course_pack_id, content_type, is_published);
create index idx_assignments_user_status_due_date on public.assignments (user_id, status, due_date);
create index idx_study_sessions_user_started_at on public.study_sessions (user_id, started_at desc);
create index idx_focus_logs_user_logged_at on public.focus_logs (user_id, logged_at desc);
create index idx_notes_user_updated_at on public.notes (user_id, updated_at desc);
create index idx_review_cards_user_next_review_at on public.review_cards (user_id, next_review_at);
create index idx_reminders_user_read_trigger_at on public.reminders (user_id, is_read, trigger_at);
create index idx_ai_interactions_user_created_at on public.ai_interactions (user_id, created_at desc);

-- ============================================
-- Updated-at triggers
-- ============================================
create trigger trg_users_set_updated_at
before update on public.users
for each row
execute function public.set_updated_at();

create trigger trg_assignments_set_updated_at
before update on public.assignments
for each row
execute function public.set_updated_at();

create trigger trg_notes_set_updated_at
before update on public.notes
for each row
execute function public.set_updated_at();

-- ============================================
-- Enable Row Level Security
-- ============================================
alter table public.users enable row level security;
alter table public.student_profiles enable row level security;
alter table public.academic_levels enable row level security;
alter table public.degree_plans enable row level security;
alter table public.course_packs enable row level security;
alter table public.user_purchases enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.content_items enable row level security;
alter table public.subjects enable row level security;
alter table public.assignments enable row level security;
alter table public.study_sessions enable row level security;
alter table public.focus_logs enable row level security;
alter table public.notes enable row level security;
alter table public.review_cards enable row level security;
alter table public.weekly_reports enable row level security;
alter table public.reminders enable row level security;
alter table public.ai_interactions enable row level security;
alter table public.feature_flags enable row level security;
alter table public.audit_logs enable row level security;

-- ============================================
-- RLS Policies: users
-- ============================================
create policy users_select_self
on public.users
for select
to authenticated
using (id = auth.uid());

create policy users_insert_self
on public.users
for insert
to authenticated
with check (id = auth.uid());

create policy users_update_self
on public.users
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- ============================================
-- RLS Policies: student-owned tables (owner CRUD)
-- ============================================
create policy student_profiles_owner_all
on public.student_profiles
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy subjects_owner_all
on public.subjects
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy assignments_owner_all
on public.assignments
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy study_sessions_owner_all
on public.study_sessions
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy focus_logs_owner_all
on public.focus_logs
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy notes_owner_all
on public.notes
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy review_cards_owner_all
on public.review_cards
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy weekly_reports_owner_all
on public.weekly_reports
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy reminders_owner_all
on public.reminders
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy ai_interactions_owner_all
on public.ai_interactions
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- ============================================
-- RLS Policies: purchases/subscriptions (fraud-resistant)
-- ============================================
create policy user_purchases_select_own
on public.user_purchases
for select
to authenticated
using (user_id = auth.uid());

create policy user_purchases_admin_all
on public.user_purchases
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy user_subscriptions_select_own
on public.user_subscriptions
for select
to authenticated
using (user_id = auth.uid());

create policy user_subscriptions_admin_all
on public.user_subscriptions
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ============================================
-- RLS Policies: store catalog (public read, admin write)
-- ============================================
create policy academic_levels_public_read
on public.academic_levels
for select
to anon, authenticated
using (true);

create policy academic_levels_admin_all
on public.academic_levels
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy degree_plans_public_read_active
on public.degree_plans
for select
to anon, authenticated
using (is_active = true);

create policy degree_plans_admin_all
on public.degree_plans
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy course_packs_public_read_active
on public.course_packs
for select
to anon, authenticated
using (is_active = true);

create policy course_packs_admin_all
on public.course_packs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ============================================
-- RLS Policies: content gating
-- ============================================
create policy content_items_select_unlocked
on public.content_items
for select
to authenticated
using (
  is_published = true
  and (
    exists (
      select 1
      from public.user_purchases up
      where up.user_id = auth.uid()
        and up.course_pack_id = content_items.course_pack_id
        and up.status = 'completed'
    )
    or exists (
      select 1
      from public.user_subscriptions us
      where us.user_id = auth.uid()
        and us.status = 'active'
        and us.plan_type in ('all_access_monthly', 'all_access_annual')
        and (us.current_period_end is null or us.current_period_end > now())
    )
  )
);

create policy content_items_admin_all
on public.content_items
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ============================================
-- RLS Policies: admin/operations tables
-- ============================================
create policy feature_flags_select_targeted_enabled
on public.feature_flags
for select
to authenticated
using (
  is_enabled = true
  and exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = any (feature_flags.target_roles)
  )
);

create policy feature_flags_admin_all
on public.feature_flags
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy audit_logs_admin_all
on public.audit_logs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

commit;
