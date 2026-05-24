# Step 7 — Standardized Test Prep (Exams) Architecture

**Status:** Decisions locked — ready for Phase 7.1
**Opened:** 2026-05-24
**Decisions locked:** 2026-05-24
**Owner:** Jeremiah Van Wagner

> This is the architecture spec for Step 7. Section §11 was the decision-gate
> when this doc was drafted; those decisions are now locked (see §11) and the
> doc is the spec of record for Phase 7.1 onward.

## Decisions at a glance

| Area | Decision |
|---|---|
| Pricing (§11.1) | All-Access bundles every exam + per-exam one-time packs via `course_pack_exams`. No new tier. |
| MVP scope (§11.2) | **8 exams**: SHSAT, NY Regents Algebra I, STAAR Grade 8 Math, ACT, AP Biology, CAASPP Grade 8 Math, HSPT, PERT |
| Content strategy (§11.3) | Per-exam, per §11.3 recommendations: state-released for Regents/STAAR/CAASPP/PERT; original-authored for SHSAT/HSPT; license-or-author for ACT/AP Biology |
| State capture (§11.4) | Lazy prompt on first Exams page visit (recommended default) |
| Attempt resumption (§11.5) | Practice mode resumable; timed mode one-shot (recommended default) |
| Admin authoring (§11.6) | Supabase Studio for v1; lightweight admin pages in 7.8; full admin UI in Step 8 (recommended default) |

---

## 1. Goals

1. Let students take, review, and track standardized tests inside YSC — both
   national tests (ACT, AP, SSAT, etc.) and state-mandated tests (CAASPP, STAAR,
   Regents, SHSAT, etc.).
2. Surface region-appropriate tests automatically (a Texas user sees STAAR
   prominently; a NYC user sees SHSAT).
3. Sell exam access through the existing Stripe/Clerk/Supabase plumbing, not a
   parallel system.
4. Keep content sourcing legally defensible: every question must carry a
   provenance flag (`original` / `public_domain` / `licensed` / `state_released`).

## 2. Non-goals (for Step 7)

- Actual test content authoring — that's a content-team workstream, not an
  architecture one. The schema accommodates content; producing it is separate.
- AI question generation — possible as a Step 10 extension, not in this phase.
- Live proctoring / anti-cheat — not relevant for prep-mode use.
- Score reporting to schools / official agencies — these are prep tests, not
  the real thing.
- Migrating `content_items.content_type='practice_question'` into the new exam
  model. The two stay separate: `content_items` is "study practice inside a
  pack"; `exam_questions` is "standardized test question linked to a specific
  exam." A future unification can be considered after both have shipped.

---

## 3. Entry Criteria

- [x] Step 3 (subscription tiers + Stripe products) closed — `f9e2e04`.
- [x] Step 4 (subscription checkout UI) closed and pushed.
- [x] Pricing decision made (see §11.1 — All-Access bundles every exam +
      per-exam one-time packs via `course_pack_exams`).
- [x] Initial test scope decided (see §11.2 — 8 exams listed in *Decisions
      at a glance*).
- [x] Content strategy decided per test (see §11.3 — per-exam mix of
      state-released, original-authored, license-or-author).

---

## 4. Scope

### In

- New schema for exams, sections, questions, passages, attempts, responses.
- Region/state field on `student_profiles` for test targeting.
- Backend routes for listing exams, starting attempts, recording responses,
  submitting, reviewing.
- Frontend pages: exam list, exam detail, attempt-taking UI, review screen,
  attempt history.
- Entitlement integration: gate exam access via subscription tier or via
  one-time `course_packs` linked to exams.
- Admin authoring via Supabase Studio for v1 (no admin UI yet).

### Out

- Admin authoring UI — deferred to Step 8 (Content authoring admin).
- AI-generated questions / explanations — deferred to Step 10.
- Spaced-repetition integration with `review_cards` — deferred to Step 9
  (SM-2). Schema is compatible; the wiring is later.
- Multi-attempt analytics dashboards — v2 nice-to-have.
- Mobile-specific UI — handled by responsive design in v1.

---

## 5. Existing schema we'll integrate with

| Table | Role | Step 7 impact |
|---|---|---|
| `users` | Clerk-linked user identity | Read-only |
| `student_profiles` | Profile + onboarding state | **Add `state` column** for region targeting |
| `subscription_plans` | Tier catalog (2 rows: degree_bundle, all_access) | Possibly add an `exam_prep` tier (see §11.1) |
| `user_subscriptions` | Active subscription state per user | Read-only; we just check `tier` |
| `course_packs` | 56 one-time-purchasable bundles | **Join via new `course_pack_exams`** to sell exam bundles |
| `user_purchases` | One-time purchase history | Read-only; existing flow grants exam access if the purchased pack links to exams |
| `content_items` | Per-pack content (flashcards, study guides, practice qs) | Read-only; remains as-is |
| `subjects` | Per-user subject list | Optional auto-populate when a user starts an exam attempt |
| `assignments` | Tasks/assignments | Optional: scheduled attempts could appear as tasks |
| `weekly_reports` | Aggregate weekly stats | Time-spent and attempt counts feed in |
| `audit_logs` | Cross-table audit trail | Used by all new endpoints |
| `feature_flags` | Gradual rollout | Use `exams_enabled` flag for staged launch |

## 6. Proposed schema additions

Eight new tables plus one column add. All names are illustrative — open to
revision before any migration runs.

### 6.1 `exams` — the test catalog

One row per distinct test (e.g. "ACT", "NY Regents Algebra I", "STAAR Grade 5
Reading"). State-specific variants get their own rows.

```sql
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
```

### 6.2 `exam_sections` — multi-section tests

```sql
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
```

### 6.3 `exam_passages` — shared stimuli (reading comprehension, lab scenarios)

```sql
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
```

### 6.4 `exam_questions` — the question bank

```sql
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
```

### 6.5 `exam_attempts` — a user taking a test

```sql
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
```

### 6.6 `exam_attempt_responses` — per-question answers within an attempt

```sql
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
```

### 6.7 `course_pack_exams` — link table for selling exam access via existing packs

This is the entitlement bridge. If a user buys a `course_pack` whose id appears
here, they get access to the linked exams. Lets us sell "SHSAT Prep Pack" as a
one-time purchase using the existing checkout flow.

```sql
CREATE TABLE public.course_pack_exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_pack_id bigint NOT NULL REFERENCES public.course_packs(id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_pack_id, exam_id)
);
```

### 6.8 `student_profiles.state` — region column add

```sql
ALTER TABLE public.student_profiles
  ADD COLUMN state char(2) NULL;

CREATE INDEX student_profiles_state_idx ON public.student_profiles(state) WHERE state IS NOT NULL;
```

This drives the "tests for your state" surfacing on the Exams page. Captured
in onboarding (new step) and editable in Settings.

### 6.9 RLS policies (sketch)

- `exams`, `exam_sections`, `exam_passages`, `exam_questions` — readable by any
  authenticated user when `is_published = true`. Insert/update/delete restricted
  to `users.role = 'admin'`.
- `exam_attempts`, `exam_attempt_responses` — readable/writable by the owning
  user only (`user_id = auth.uid()`). Admin can read all for support.
- `course_pack_exams` — readable by any authenticated user. Admin-only writes.

---

## 7. Entitlement logic

The check that decides "can this user start an attempt of exam X" runs at
attempt-start time and at every response submission. Logic in order:

```
function user_can_access_exam(user, exam):
  # 1. Admins always.
  if user.role == 'admin':
    return { allowed: true, source: 'admin_grant' }

  # 2. Active all-access subscription.
  sub = user_subscriptions.active(user)
  if sub and sub.tier == 'all_access':
    return { allowed: true, source: 'subscription_all_access' }

  # 3. (Future) Active exam-prep tier subscription.
  if sub and sub.tier == 'exam_prep':
    return { allowed: true, source: 'subscription_exam_prep' }

  # 4. One-time purchase of a course_pack linked to this exam.
  linked_pack_ids = SELECT course_pack_id FROM course_pack_exams WHERE exam_id = exam.id
  owned = user_purchases.completed_for(user, linked_pack_ids).any()
  if owned:
    return { allowed: true, source: 'one_time_purchase', reference_id: owned.id }

  # 5. Free-tier sample (configurable per exam).
  if exam.scoring_metadata->>'free_sample_question_count' > 0:
    # Free-tier users get N sample questions only — handled at question-fetch time
    return { allowed: true, source: 'free_tier_sample', sample_limit: N }

  return { allowed: false, source: null }
```

The decision and source get stored on `exam_attempts.entitlement_source` so we
have an audit trail.

---

## 8. Backend API surface

New file: `backend/routes/exams.py`. All routes require Clerk-authenticated
user via `get_app_auth_context`.

### Exam catalog

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/exams` | List published exams. Query params: `state`, `grade_band`, `category`, `accessible_only=true`. Defaults: filter by user's `student_profiles.state` if set. |
| `GET` | `/api/exams/{slug}` | Exam detail with sections, sample question, entitlement status for current user. |
| `GET` | `/api/exams/{slug}/preview` | Free sample questions (up to `free_sample_question_count`). |

### Attempts

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/exams/{slug}/attempts` | Start a new attempt. Body: `{mode: 'practice'\|'timed'}`. Server runs entitlement check, snapshots question set, returns attempt id and initial question. |
| `GET` | `/api/exams/attempts/{attempt_id}` | Get attempt state + next unanswered question, or full submitted attempt if completed. |
| `POST` | `/api/exams/attempts/{attempt_id}/responses` | Record/update a response. Body: `{question_id, response_value, time_spent_seconds, flagged, skipped}`. Idempotent on `(attempt_id, question_id)`. |
| `POST` | `/api/exams/attempts/{attempt_id}/submit` | Finalize attempt. Compute scoring (raw, scaled, composite, section breakdown). Returns scored summary. |
| `POST` | `/api/exams/attempts/{attempt_id}/abandon` | Mark abandoned (preserves responses for resume? — see §11.5). |

### History / review

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/exams/me/attempts` | User's attempt history. Query: `status`, `exam_slug`, `limit`, `offset`. |
| `GET` | `/api/exams/attempts/{attempt_id}/review` | Full review of submitted attempt — each question, user's answer, correct answer, explanation. Owner-only. |

### Admin (v1: Supabase Studio; future: dedicated UI)

Admin reads/writes go through Supabase Studio directly in v1 — same as how
`course_packs` content is currently managed. Step 8 will build a proper admin
UI.

---

## 9. Frontend surface

New routes added to `App.js` under the guarded `/app` shell:

```
/app/exams                                  -> ExamListPage
/app/exams/:slug                            -> ExamDetailPage
/app/exams/:slug/attempt/new                -> AttemptStartPage (mode picker)
/app/exams/attempts/:attemptId              -> AttemptRunnerPage
/app/exams/attempts/:attemptId/review       -> AttemptReviewPage
/app/exams/history                          -> AttemptHistoryPage
```

New nav entry in `AppShell.jsx` `MAIN_NAV`: `{ to: "/app/exams", label: "Exams", icon: ClipboardCheck }`.

Component breakdown:

- **`ExamListPage`** — filter chips (My State, National, By Grade Band), grouped
  cards. Locked exams show a subtle padlock with the entitlement option (start
  trial / view bundle).
- **`ExamDetailPage`** — overview, sections breakdown, sample question
  preview, "Start Practice" / "Start Timed" CTAs (or "Subscribe to Unlock"
  fallback).
- **`AttemptRunnerPage`** — question-at-a-time UI. Sticky timer when `timed`.
  Bottom bar: Previous / Flag / Skip / Next / Submit. Section divider when
  crossing sections. Autosaves response on every navigation. Resume-from-state
  on refresh.
- **`AttemptReviewPage`** — vertical list of all questions with user's answer,
  correctness indicator, official answer, explanation, source attribution.
  Filter chips: All / Incorrect / Flagged.
- **`AttemptHistoryPage`** — table of past attempts with score, date, mode,
  exam.

Reusable components: `ExamCard`, `QuestionRenderer` (delegates by
`question_type`), `TimerBar`, `ScoreSummary`, `EntitlementBanner`.

---

## 10. Phased rollout

Eight delivery phases, each shippable independently. Phase 7.0 is the spec
itself (this doc).

| Phase | Scope | Effort | Output |
|---|---|---|---|
| **7.1** | Schema migration + RLS + `student_profiles.state` column + seed 1 published exam end-to-end via Supabase Studio (NY Regents Algebra I — public domain). | M | DB ready; can manually verify data flows. |
| **7.2** | Backend routes for catalog (`/api/exams`, `/api/exams/{slug}`, preview). No entitlement enforcement yet — read-only public catalog. | M | `GET` endpoints live; sample integration test. |
| **7.3** | Attempt lifecycle: start, response, submit, scoring engine for `raw` and `scaled` models first. Entitlement enforcement turned on. | L | Full attempt flow works via API. |
| **7.4** | `ExamListPage` + `ExamDetailPage` + region filter using `student_profiles.state`. Add the onboarding step + Settings field for state. | M | User can browse and discover exams. |
| **7.5** | `AttemptRunnerPage` + `AttemptReviewPage`. Timer, autosave, resume-on-refresh. | L | Full prep loop end-to-end. |
| **7.6** | `course_pack_exams` linkage + ability to sell exam access via existing Stripe checkout flow. Update Subscribe UI copy to surface "All exams included" for All-Access. | M | Monetization wired. |
| **7.7** | `AttemptHistoryPage` + scoring for `composite` and `rubric_1_5` models. | M | Returning-user flow polished. |
| **7.8** | Test bank for the **7 additional MVP exams** (STAAR G8 Math, SHSAT, ACT, AP Biology, CAASPP G8 Math, HSPT, PERT — Regents Algebra I ships with 7.1). Feature flag `exams_enabled` flipped on for all users. | L | Public launch. |

Estimated engineering total: ~3–4 focused weeks across 7.1–7.7. Content team
time for 7.8 is the long pole and is largely orthogonal to engineering — note
that 4 of the 8 exams (Regents, STAAR, CAASPP, PERT) use state-released items
so most of that content is sourcing-and-formatting rather than original authoring.

---

## 11. Decisions log

All six decisions made on 2026-05-24. Original analysis retained below each
decision for future reference.

### 11.1 Pricing model — where do exams live in the tier lineup?

**Decided:** **A + C combined.** All-Access ($14.99/mo) bundles every
exam. Per-exam one-time packs sell access à la carte via the existing
`course_packs` flow, linked through `course_pack_exams`. No new
subscription tier. Skip `exam_prep` until there's evidence of user demand
— adding a tier later is cheaper than killing one.

<details>
<summary>Original analysis</summary>

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A. Bundled into `all_access`** | All-Access ($14.99/mo) includes every exam. Degree-Bundle gets none. | Simplest. No new tier. Pushes upgrades. | Eats the headline price for users who only want test prep. |
| **B. New `exam_prep` tier** | Third tier (e.g. $9.99/mo or $19.99/yr) covering only exams. All-Access continues to include everything. | Cleaner story for test-prep-only users. | More SKUs, more support burden, more decisions per user. |
| **C. One-time per-exam packs** | Each exam (or bundle of related exams) sold as a one-time `course_pack` via `course_pack_exams`. No subscription change. | Most flexible. Matches existing pack purchase model. | Recurring revenue weaker. Discoverability harder. |

</details>

### 11.2 Initial test scope — which exams ship at MVP?

**Decided:** **8 exams.** Five from the original architecture-coverage
recommendation, plus three additions that broaden geographic and market
reach (California, Florida, multi-state Catholic schools):

| # | Exam | Category | Region | Content source bucket |
|---|---|---|---|---|
| 1 | NY Regents Algebra I | state_eoc_assessment | NY | state_released |
| 2 | STAAR Grade 8 Math | state_mandated_assessment | TX | state_released |
| 3 | CAASPP Grade 8 Math | state_mandated_assessment | CA | state_released |
| 4 | PERT | placement_test | FL | state_released |
| 5 | SHSAT | regional_admissions | NYC | original |
| 6 | HSPT | national_private_school | multi-state | original |
| 7 | ACT | national_college_admission | national | licensed or original |
| 8 | AP Biology | national_college_admission | national | licensed or original |

Four state-released exams give us low-cost wins to prove the pipeline.
Two original-authored exams (SHSAT, HSPT) exercise the original-content
workflow. Two license-or-author nationals (ACT, AP Biology) prove the
biggest brand-name path. Regents Algebra I is the seed exam for Phase 7.1.

<details>
<summary>Original analysis</summary>

The 30 tests in the full request span ~12 months of content work if done
in-house. The original recommendation was 5 exams covering every content
bucket; the final scope adds three more (CAASPP, HSPT, PERT) to broaden
geographic and market coverage without changing the architecture.

</details>

### 11.3 Content strategy per test

**Decided:** Per-exam, per the path-of-least-resistance table below.
AI-assisted authoring deferred to Step 10.

| Exam | Strategy |
|---|---|
| NY Regents Algebra I | State-released items (NY DOE publishes past exams) |
| STAAR Grade 8 Math | State-released items (TEA released items) |
| CAASPP Grade 8 Math | State-released items (Smarter Balanced practice tests) |
| PERT | State-released items (Florida DOE materials) |
| SHSAT | Original-authored to format (no public items available; aggressive copyright protection) |
| HSPT | Original-authored to format (one investment, serves Catholic-school admissions across MD/NJ/PA/IL) |
| ACT | License from ACT Inc OR original-authored (decision deferred to 7.8 content scoping) |
| AP Biology | License from College Board OR original-authored (College Board has released-items program; evaluate during 7.8) |

<details>
<summary>Original analysis</summary>

| Path | When to use | Risk |
|---|---|---|
| **License from official provider** | National brands with formal partnership programs (ACT, AP, NWEA) | Cost; legal review needed |
| **Original-authored by SMEs** | Aggressively protected tests (SHSAT, TACHS, COOP, HSPT, GATE) | Time + author quality |
| **Use state-released items** | State assessments (Regents, STAAR, PSSA, CAASPP, etc.) | Free but limited quantity |
| **AI-assisted authoring** | Bulk practice questions for any test, reviewed by humans | Quality control; risk of plausible-but-wrong answers |

</details>

### 11.4 State/region capture

**Decided:** **C — Lazy prompt on first Exams page visit.** Onboarding
is already 6 steps after the Phase 2 work; adding a 7th for a feature
users may not engage with on day one adds friction. The Exams page asks
"What state are you in?" the first time it loads and persists to
`student_profiles.state`. Settings page also exposes the field for later
edits.

### 11.5 Attempt resumption

**Decided:** **C — Practice mode resumable; timed mode one-shot.** Real
test conditions don't allow pausing. Saves implementing server-side
timer tracking and pause logic for v1.

### 11.6 Admin authoring

**Decided:** **A for v1**, **B as part of Phase 7.8** once the schema is
proven, **full admin UI in Step 8**. v1 content management goes through
Supabase Studio direct table edits — same workflow as today's
`course_packs`. Phase 7.8 adds lightweight `/app/admin/exams` pages for
`role='admin'` users to reduce the operational burden before Step 8's
full admin build.

---

## 12. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Content sourcing slips and we ship 0 exams | High | High | Start with public-domain Regents in 7.1 to prove the pipeline before committing to other exams. |
| Question-bank size insufficient for "feels like a real test" | Medium | High | Each MVP exam should have at least 3× a single test's question count to allow variation across attempts. |
| Licensing negotiations stall the launch | Medium | Medium | Plan the MVP around tests where licensing isn't required (state + original). Licensed tests slot in post-launch. |
| Scoring model bugs produce wrong scores | Medium | Very high (trust killer) | Per-exam scoring is unit-tested with reference inputs/outputs before its exam goes `is_published=true`. |
| RLS misconfiguration leaks question bank to non-paying users | Low | Medium | RLS policies tested in CI alongside backend tests. |
| Performance: large question sets render slowly | Low | Low | One-question-at-a-time UI sidesteps; only catalog needs pagination. |

---

## 13. Deferred / explicitly out of scope

- Mobile app or PWA-specific exam UX (responsive web is enough for v1).
- Calculator integration (some tests permit; UI tooling deferred).
- Accommodations (extended time, screen reader optimization) — needs a
  separate accessibility pass.
- Score reporting integrations with college applications, school admin
  systems.
- AI-graded essay responses.
- Collaborative / classroom features (teacher dashboards).
- Real-money proctoring / cheating prevention.

---

## 14. Phase 7.1 readiness

All §11 decisions are locked. Phase 7.1 is ready to start. Its scope is
self-contained:

1. Apply the schema migration in §6 (8 new tables + 1 column add) to
   `ysc-staging` via `apply_migration`.
2. Apply the RLS policies sketched in §6.9.
3. Seed NY Regents Algebra I as the reference exam with at least one
   section, one passage (if applicable), and a small sample question
   set — all marked `is_published=true` so it's visible to authenticated
   readers once the catalog API is built in 7.2.
4. Verify with a manual `execute_sql` query that the seeded data round-trips
   correctly under RLS for both a student-role and admin-role user.

No backend or frontend code changes in 7.1 — the migration alone
unblocks 7.2.
