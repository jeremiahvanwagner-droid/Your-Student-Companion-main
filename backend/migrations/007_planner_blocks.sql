-- 007_planner_blocks.sql
-- Module D (Study Planner): weekly study blocks scheduled by the student.
-- Distinct from study_sessions, which records *executed* focus sessions —
-- planner_blocks records *intended* future time commitments.

begin;

create table public.planner_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  assignment_id uuid references public.assignments(id) on delete set null,
  title text not null,
  goal text,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  completed boolean default false,
  source text default 'manual' check (source in ('manual', 'auto_suggest')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint planner_blocks_end_after_start check (scheduled_end > scheduled_start)
);

create index idx_planner_blocks_user_start
  on public.planner_blocks (user_id, scheduled_start);

create trigger trg_planner_blocks_set_updated_at
before update on public.planner_blocks
for each row
execute function public.set_updated_at();

alter table public.planner_blocks enable row level security;

create policy planner_blocks_owner_all
on public.planner_blocks
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

commit;
