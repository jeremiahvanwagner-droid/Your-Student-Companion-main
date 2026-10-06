-- 002_seed_course_packs.sql
-- Seeds degree_plan x academic_level course packs.

begin;

with level_pricing as (
  select
    al.id as academic_level_id,
    al.slug as academic_level_slug,
    al.name as academic_level_name,
    case al.slug
      when 'freshman' then 19.99::numeric(10, 2)
      when 'sophomore' then 24.99::numeric(10, 2)
      when 'junior' then 29.99::numeric(10, 2)
      when 'senior' then 34.99::numeric(10, 2)
      else 24.99::numeric(10, 2)
    end as level_price
  from public.academic_levels al
  where al.slug in ('freshman', 'sophomore', 'junior', 'senior')
),
pack_matrix as (
  select
    dp.id as degree_plan_id,
    dp.name as degree_plan_name,
    dp.slug as degree_plan_slug,
    lp.academic_level_id,
    lp.academic_level_slug,
    lp.academic_level_name,
    lp.level_price
  from public.degree_plans dp
  cross join level_pricing lp
  where dp.is_active = true
)
insert into public.course_packs (
  degree_plan_id,
  academic_level_id,
  name,
  slug,
  description,
  price,
  features,
  is_active
)
select
  pm.degree_plan_id,
  pm.academic_level_id,
  pm.degree_plan_name || ' - ' || pm.academic_level_name || ' Pack' as name,
  pm.degree_plan_slug || '-' || pm.academic_level_slug as slug,
  'Structured ' || pm.academic_level_name || ' support for ' || pm.degree_plan_name || ' with mentor guidance, focused study resources, and progressive skill building.' as description,
  pm.level_price,
  jsonb_build_array(
    pm.academic_level_name || ' tier vocabulary and concept set',
    'Guided study guide templates',
    'Practice questions with worked reasoning',
    'AI mentor context for ' || pm.degree_plan_name
  ) as features,
  true
from pack_matrix pm
on conflict (degree_plan_id, academic_level_id) do update
set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  price = excluded.price,
  features = excluded.features,
  is_active = excluded.is_active;

commit;
