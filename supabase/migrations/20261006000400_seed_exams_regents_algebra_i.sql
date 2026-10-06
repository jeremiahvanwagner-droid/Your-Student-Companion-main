-- 20261006000400_seed_exams_regents_algebra_i.sql
-- First exam catalog entry: NY Regents Algebra I, its four sections, and ONE
-- original sample question. Mirrors the fixture in backend/tests/test_exams.py:75-209
-- (same fixed uuids) so the catalog API behaves identically against a real
-- database and against the test fakes.
--
-- Content policy: every row here is ORIGINAL. No released Regents items, passages
-- or answer keys are reproduced; only the public structure of the exam (four
-- parts, credit weights, 86 raw credits, 0-100 scale, 65 passing) is described.
-- content_source = 'original' therefore differs from the test fixture's
-- 'state_released', which was a placeholder.
--
-- Section credit arithmetic (must equal scoring_metadata.raw_max = 86):
--   Part I   24 questions x 2 credits = 48
--   Part II   8 questions x 2 credits = 16
--   Part III  4 questions x 4 credits = 16
--   Part IV   1 question  x 6 credits =  6
--                                       -- = 86
--
-- Idempotent via fixed uuids: exams upserts on slug, sections on (exam_id, slug),
-- the question on id. The exam is published; exams_enabled=false (feature flag)
-- keeps the UI hidden while the catalog API remains testable.

begin;

-- ----------------------------------------------------------------------------
-- Exam
-- ----------------------------------------------------------------------------
insert into public.exams (
  id,
  slug,
  name,
  full_name,
  category,
  region_state,
  region_metro,
  grade_band,
  description,
  total_time_minutes,
  total_questions,
  sections_count,
  scoring_model,
  scoring_metadata,
  content_source,
  content_provenance,
  icon_name,
  is_published,
  is_official_partnership
)
values (
  '00000000-0000-4000-8000-000000000001',
  'ny-regents-algebra-i',
  'NY Regents Algebra I',
  'New York State Regents Examination in Algebra I',
  'state_eoc_assessment',
  'NY',
  null,
  'high_school',
  'New York State end-of-course exam in Algebra I. Four parts: 24 multiple-choice '
    || 'questions (2 credits each) and 13 constructed-response questions worth 2, 4 or '
    || '6 credits; 86 raw credits convert to a 0-100 scale score, 65 passing.',
  180,
  37,
  4,
  'scaled',
  '{
    "raw_max": 86,
    "scaled_min": 0,
    "scaled_max": 100,
    "passing_scaled": 65,
    "free_sample_question_count": 1
  }'::jsonb,
  'original',
  '{
    "author": "Your Student Companion",
    "license": "original",
    "note": "Structure describes the public exam format only; all questions are original and no released items are reproduced."
  }'::jsonb,
  null,
  true,
  false
)
on conflict (slug) do update
set
  name = excluded.name,
  full_name = excluded.full_name,
  category = excluded.category,
  region_state = excluded.region_state,
  region_metro = excluded.region_metro,
  grade_band = excluded.grade_band,
  description = excluded.description,
  total_time_minutes = excluded.total_time_minutes,
  total_questions = excluded.total_questions,
  sections_count = excluded.sections_count,
  scoring_model = excluded.scoring_model,
  scoring_metadata = excluded.scoring_metadata,
  content_source = excluded.content_source,
  content_provenance = excluded.content_provenance,
  icon_name = excluded.icon_name,
  is_published = excluded.is_published,
  is_official_partnership = excluded.is_official_partnership;

-- ----------------------------------------------------------------------------
-- Sections (Parts I-IV). time_minutes is NULL: the 180 minutes apply to the whole
-- exam, parts are not individually timed.
-- ----------------------------------------------------------------------------
insert into public.exam_sections (
  id,
  exam_id,
  slug,
  name,
  display_order,
  time_minutes,
  total_questions,
  scoring_weight,
  description
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'part-i',
    'Part I — Multiple Choice',
    1,
    null,
    24,
    1.0,
    '24 multiple-choice questions, 2 credits each (48 credits).'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000001',
    'part-ii',
    'Part II — Constructed Response (2-credit)',
    2,
    null,
    8,
    1.0,
    '8 constructed-response questions, 2 credits each (16 credits).'
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000001',
    'part-iii',
    'Part III — Constructed Response (4-credit)',
    3,
    null,
    4,
    1.0,
    '4 constructed-response questions, 4 credits each (16 credits).'
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000001',
    'part-iv',
    'Part IV — Constructed Response (6-credit)',
    4,
    null,
    1,
    1.0,
    '1 extended constructed-response question, 6 credits (6 credits).'
  )
on conflict (exam_id, slug) do update
set
  name = excluded.name,
  display_order = excluded.display_order,
  time_minutes = excluded.time_minutes,
  total_questions = excluded.total_questions,
  scoring_weight = excluded.scoring_weight,
  description = excluded.description;

-- ----------------------------------------------------------------------------
-- The single free-sample question (original; Part I style)
-- ----------------------------------------------------------------------------
insert into public.exam_questions (
  id,
  exam_id,
  section_id,
  passage_id,
  question_type,
  stem,
  stem_html,
  choices,
  correct_answer,
  explanation,
  difficulty,
  topic_tags,
  standards_alignment,
  source_type,
  source_attribution,
  year_released,
  display_order,
  is_published
)
values (
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  null,
  'multiple_choice',
  'A line passes through (2, 5) and (4, 11). What is the slope?',
  null,
  '[
    {"id": "1", "text": "1/2", "is_correct": false},
    {"id": "2", "text": "2",   "is_correct": false},
    {"id": "3", "text": "3",   "is_correct": true},
    {"id": "4", "text": "6",   "is_correct": false}
  ]'::jsonb,
  null,
  'Slope is the change in y over the change in x: (11 - 5) / (4 - 2) = 6 / 2 = 3.',
  2,
  '{slope,linear_functions}',
  '{}',
  'original',
  null,
  null,
  1,
  true
)
on conflict (id) do update
set
  exam_id = excluded.exam_id,
  section_id = excluded.section_id,
  passage_id = excluded.passage_id,
  question_type = excluded.question_type,
  stem = excluded.stem,
  stem_html = excluded.stem_html,
  choices = excluded.choices,
  correct_answer = excluded.correct_answer,
  explanation = excluded.explanation,
  difficulty = excluded.difficulty,
  topic_tags = excluded.topic_tags,
  standards_alignment = excluded.standards_alignment,
  source_type = excluded.source_type,
  source_attribution = excluded.source_attribution,
  year_released = excluded.year_released,
  display_order = excluded.display_order,
  is_published = excluded.is_published;

commit;
