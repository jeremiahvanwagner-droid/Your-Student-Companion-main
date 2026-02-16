-- 001_seed_academic_data.sql
-- Seeds canonical academic levels and degree plans.

begin;

insert into public.academic_levels (name, slug, display_order, description)
values
  ('Freshman', 'freshman', 1, 'Foundational vocabulary, intro concepts, and core study habits.'),
  ('Sophomore', 'sophomore', 2, 'Intermediate theory, applied methods, and research basics.'),
  ('Junior', 'junior', 3, 'Advanced specialization with applied analysis and case-based learning.'),
  ('Senior', 'senior', 4, 'Capstone synthesis, professional preparation, and licensure readiness.')
on conflict (slug) do update
set
  name = excluded.name,
  display_order = excluded.display_order,
  description = excluded.description;

insert into public.degree_plans (name, slug, category, description, icon_name, is_active)
values
  ('Nursing', 'nursing', 'healthcare', 'Patient care, pharmacology, and evidence-based nursing practice.', 'stethoscope', true),
  ('Respiratory Therapy', 'respiratory-therapy', 'healthcare', 'Airway management, ventilator support, and cardiopulmonary care.', 'lungs', true),
  ('Radiology / X-Ray', 'radiology', 'healthcare', 'Diagnostic imaging principles, safety, and interpretation workflows.', 'scan-line', true),
  ('Psychology', 'psychology', 'social_sciences', 'Behavior, cognition, research methods, and applied psychological science.', 'brain', true),
  ('Criminal Justice', 'criminal-justice', 'social_sciences', 'Law enforcement systems, legal process, and community justice.', 'shield', true),
  ('Sociology', 'sociology', 'social_sciences', 'Social structures, institutions, and research-based social analysis.', 'users', true),
  ('Biochemistry', 'biochemistry', 'stem', 'Molecular biology, metabolism, and lab-driven scientific reasoning.', 'flask-conical', true),
  ('Computer Science', 'computer-science', 'stem', 'Programming, data structures, algorithms, and software engineering foundations.', 'cpu', true),
  ('Engineering', 'engineering', 'stem', 'Applied mathematics, design systems, and technical problem solving.', 'wrench', true),
  ('Business Administration', 'business-admin', 'business', 'Management, operations, and strategic business decision-making.', 'briefcase', true),
  ('Accounting', 'accounting', 'business', 'Financial statements, managerial accounting, and compliance principles.', 'calculator', true),
  ('Marketing', 'marketing', 'business', 'Brand strategy, market research, and campaign analytics.', 'megaphone', true),
  ('Early Childhood Education', 'early-childhood', 'education', 'Child development, classroom practice, and family-centered learning.', 'book-open', true),
  ('Special Education', 'special-education', 'education', 'Individualized support planning, inclusive instruction, and intervention methods.', 'sparkles', true)
on conflict (slug) do update
set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  icon_name = excluded.icon_name,
  is_active = excluded.is_active;

commit;
