# Your Student Companion (YSC) — Comprehensive Roadmap

**Document version:** 1.0
**Last updated:** May 6, 2026
**Owner:** Jeremiah Van Wagner
**Repository:** [github.com/jeremiahvanwagner-droid/Your-Student-Companion-main](https://github.com/jeremiahvanwagner-droid/Your-Student-Companion-main)
**Source documents:** `your-student-companion-full-scope.md`, `AUDIT_AND_IMPLEMENTATION_PLAN.md`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Mission, Vision, Outcomes](#2-mission-vision-outcomes)
3. [Current State Snapshot](#3-current-state-snapshot)
4. [Roadmap at a Glance](#4-roadmap-at-a-glance)
5. [Phase 0 — Foundation Hardening](#phase-0--foundation-hardening-weeks-12)
6. [Phase 1 — Subscription and Pricing Restructure](#phase-1--subscription-and-pricing-restructure-weeks-35)
7. [Phase 2 — Content System and Academic Expansion](#phase-2--content-system-and-academic-expansion-weeks-610)
8. [Phase 3 — Notes, Flashcards, and Study Tools](#phase-3--notes-flashcards-and-study-tools-weeks-1114)
9. [Phase 4 — Internship and Career Features](#phase-4--internship-and-career-features-weeks-1518)
10. [Phase 5 — Polish, Scale, and Launch Prep](#phase-5--polish-scale-and-launch-prep-weeks-1922)
11. [KPIs and Success Metrics](#11-kpis-and-success-metrics)
12. [Risk Register](#12-risk-register)
13. [Technology Decisions](#13-technology-decisions)
14. [Out of Scope](#14-out-of-scope)
15. [Phase Gate Ritual](#15-phase-gate-ritual)

---

## 1. Executive Summary

Your Student Companion (YSC) is a web-first learning productivity platform that helps students plan, study, track progress, and stay accountable through one unified companion experience. The MVP targets middle school, high school, and college students, with light adaptation for parents, tutors, and school partners as a Phase 2 audience.

The platform is already partially built: authentication, onboarding, the dashboard, AI mentor (text), course pack store, and Stripe one-time checkout are functioning in production. The 22-week roadmap below carries YSC from the current state through six structured phases to a public launch backed by recurring subscription revenue, original study content, full study-suite tooling, and career features that differentiate it from generic study apps.

**Total duration:** ~22 weeks (5.5 months)
**Tech stack:** React 19 + Craco + Tailwind + shadcn/ui (Vercel) · FastAPI Python · Supabase Postgres + RLS · Clerk auth · Stripe · OpenAI gpt-4.1-mini · ElevenLabs voice
**Pricing target:** Free tier + recurring tiers $0.99–$12.99/mo + one-time upgrades
**Launch target:** Beta cohort of 20–50 students at week 8, public v1 launch by week 22

---

## 2. Mission, Vision, Outcomes

### 2.1 Mission

Help students stay organized, focused, and academically consistent through one unified companion experience — plan, study, track progress, receive support, improve performance.

### 2.2 Vision

A free-to-start, AI-powered student companion that scales from middle school through postgraduate study, supports placement tests, clinicals, practicums, and internships, and runs on a lean recurring-revenue model affordable to any student.

### 2.3 Primary Outcomes

1. Reduce student overwhelm with clear daily priorities.
2. Increase assignment completion and time-on-task.
3. Improve retention and confidence with guided study tools.
4. Create a reusable app framework for future companion apps.
5. Launch cost-efficiently using the GitHub + Supabase + Vercel stack.

### 2.4 Core Problems We Solve

- "I don't know what to do first."
- "I miss deadlines."
- "I can't stay focused."
- "I study but don't retain."
- "I fall behind and then avoid everything."

### 2.5 Audiences

| Tier | Audience | Phase |
|------|----------|-------|
| Primary | Middle school (6–8), High school (9–12), College | MVP |
| Secondary | Parents/guardians, tutors/coaches, school partners | Phase 2 |

---

## 3. Current State Snapshot

### 3.1 Architecture Status

| Layer | Technology | Status |
|-------|-----------|--------|
| Frontend | React 19 + CRA (Craco) + Tailwind + shadcn/ui | Deployed on Vercel |
| Backend | Python FastAPI + Uvicorn | Deployed |
| Database | Supabase Postgres (RLS-enforced) | 19 tables, 5 migrations |
| Auth | Clerk (JWT) → Supabase user mapping | Fully integrated |
| Payments | Stripe (Checkout + Webhooks) | One-time packs working |
| AI / Voice | OpenAI gpt-4.1-mini + ElevenLabs | Text complete, voice partial |
| Edge Functions | Supabase Edge (stripe-webhook) | Deployed |

### 3.2 Feature Inventory

| Feature | Backend | Frontend | Status |
|---------|---------|----------|--------|
| Clerk Auth | ✅ | ✅ | Complete |
| Onboarding (5 steps) | ✅ | ✅ | Complete |
| Dashboard | ✅ | ✅ | Complete |
| Dictionary search | n/a | ✅ | Complete |
| Academic thesaurus | n/a | ✅ | Complete |
| Context Shifter | n/a | ✅ | Complete |
| Pomodoro Focus Timer | ❌ (localStorage) | ✅ | Complete (no server sync) |
| AI Mentor (text) | ✅ | ✅ | Complete |
| AI Mentor (voice) | ⚠️ | ✅ | Partial |
| Course Pack Store | ✅ | ✅ | Complete |
| Stripe Webhooks | ✅ | n/a | Complete |
| Task Manager | ✅ | ⚠️ | Backend done, UI partial |
| Study Planner | ❌ | ⚠️ | Scaffolded |
| Notes Workspace | ❌ | ⚠️ | Scaffolded |
| Weekly Progress Report | ❌ | ⚠️ | Scaffolded |
| User Settings | ✅ | ⚠️ | Backend done, UI partial |
| Subjects | ✅ | ❌ | Backend done, no UI |
| Study Sessions / Focus Logs | ❌ | ❌ | DB schema only |
| Review Cards (flashcards) | ❌ | ❌ | DB schema only |
| Reminders | ❌ | ❌ | DB schema only |
| Content Items (gated) | ❌ | ❌ | DB schema only |
| Subscriptions UI | ✅ webhook | ❌ | Webhook ready, no UI |

### 3.3 Database Schema Status

19 tables defined with RLS policies active: `users`, `student_profiles`, `academic_levels`, `degree_plans`, `course_packs`, `user_purchases`, `user_subscriptions`, `content_items`, `subjects`, `assignments`, `study_sessions`, `focus_logs`, `notes`, `review_cards`, `weekly_reports`, `reminders`, `ai_interactions`, `feature_flags`, `audit_logs`.

### 3.4 Vision-vs-Current Gaps

| Vision Requirement | Current State | Gap Severity |
|-------------------|---------------|--------------|
| HS + undergrad + postgrad coverage | Undergrad only | 🔴 High |
| Classes, courses with real material | 14 plans × 4 levels = 56 packs, content empty | 🟡 Medium |
| Placement tests | Not addressed | 🔴 High |
| Programs, clinicals, practicums | Not addressed | 🔴 High |
| Internship assistance | Not addressed | 🔴 High |
| $0.99–$12.99/mo recurring | $19.99–$34.99 one-time | 🔴 High |
| In-app upgrades (one-time / annual / monthly) | One-time only | 🔴 High |
| Tutor with voice | Text complete, voice partial | 🟡 Medium |
| Free tier with many features | Basic features free, store paid | 🟢 Low |
| Actual study material content | `content_items` table empty | 🔴 High |

---

## 4. Roadmap at a Glance

```
PHASE 0 ─ Foundation Hardening          ████░░░░░░░░░░░░░░░░░░░░  Weeks 1–2
PHASE 1 ─ Subscription & Pricing        ░░░░██████░░░░░░░░░░░░░░  Weeks 3–5
PHASE 2 ─ Content & Academic Expansion  ░░░░░░░░░░██████████░░░░  Weeks 6–10
PHASE 3 ─ Notes, Cards, Study Tools     ░░░░░░░░░░░░░░░░████████  Weeks 11–14
PHASE 4 ─ Internship & Career           ░░░░░░░░░░░░░░░░░░░░██████ Weeks 15–18
PHASE 5 ─ Polish, Scale, Launch         ░░░░░░░░░░░░░░░░░░░░░░░░██ Weeks 19–22
```

| Week | Milestone | Key Deliverables |
|------|-----------|------------------|
| 2 | M0 — Feature Complete MVP | Tasks, Subjects, Settings, Focus sync, voice stable |
| 5 | M1 — Monetization Ready | Recurring subs $0.99–$12.99/mo, annual, one-time upgrades, Stripe portal |
| 10 | M2 — Content Pipeline Live | HS + undergrad + postgrad levels, authoring tool, placement tests, 5+ populated degrees |
| 14 | M3 — Full Study Suite | Notes, flashcards w/ SM-2, smart planner, weekly reports, reminders |
| 18 | M4 — Career Features | Internship board, AI resume review, mock interviews, clinical logs |
| 22 | M5 — Launch Ready | PWA / mobile, analytics, error monitoring, accessibility, beta with 50+ students |

---

## Phase 0 — Foundation Hardening (Weeks 1–2)

**Goal:** Stabilize what already exists. Complete every scaffolded feature so the MVP is production-grade end-to-end before adding new surface area.

**Entry criteria**
- All current features behave as specified in `your-student-companion-full-scope.md` Modules A–G.
- CI passes on `main`.
- Dev, staging, production environments are distinct.

**Deliverables**
- Task Manager fully wired to backend
- Subjects management UI live
- User Settings form fully editable
- Focus Timer persists to Supabase
- Rate limiting enforced on AI endpoints
- Frontend test suite scaffolded with at least 3 critical-path tests
- ElevenLabs agent ID moved to environment variable
- Voice mentor edge cases handled

### 0.1 Complete Task Manager UI

| Field | Detail |
|-------|--------|
| Effort | 3 days |
| Owner | Frontend |
| Files | `src/pages/TaskManager.jsx`, `src/components/tasks/*` (new), `src/hooks/useTasks.js` (new) |
| API | Existing `/api/tasks` CRUD endpoints |

**Subtasks**
1. Build `<TaskList>` with status pipeline columns: Not Started → In Progress → Submitted → Completed.
2. Create `<TaskDialog>` for add/edit using `react-hook-form` + `zod` schema. Fields: title, subject, due_date, priority (low/med/high), estimated_minutes, status, notes.
3. Add filter bar: subject, priority, status, due-date range.
4. Visually flag overdue items (red border + countdown text).
5. Wire delete with confirmation (`<AlertDialog>`).
6. Integrate optimistic updates with React Query / SWR.
7. Live-update completion percentage on the dashboard.

**Acceptance criteria**
- Create assignment in ≤20 seconds.
- Overdue items visually distinct.
- Completion updates reflected on dashboard within 2 seconds.

### 0.2 Complete Subjects UI

| Field | Detail |
|-------|--------|
| Effort | 1 day |
| Files | `src/pages/UserSettings.jsx`, `src/components/SubjectPicker.jsx` (new) |

**Subtasks**
1. Build `<SubjectPicker>` (select + create-on-the-fly with color swatch).
2. Add Subjects management section in Settings (list, edit name, color, archive).
3. Plug `<SubjectPicker>` into Task creation dialog.
4. Wire to existing `/api/subjects` CRUD.

### 0.3 Complete User Settings Page

| Field | Detail |
|-------|--------|
| Effort | 1 day |
| Files | `src/pages/UserSettings.jsx` |
| API | `PUT /api/users/me/profile` |

**Subtasks**
1. Profile form: name, grade level, school, major, timezone, weekly goal (hours).
2. Reminder preferences: in-app, email opt-in, quiet hours.
3. Account section: change email (Clerk), delete account flow.
4. Subject management section (from 0.2).
5. Toast on save success / error using `sonner`.

### 0.4 Sync Focus Timer to Server

| Field | Detail |
|-------|--------|
| Effort | 2 days |
| Files | `backend/routes/focus.py`, `src/components/FocusMode.jsx`, `src/hooks/useFocusSession.js` (new) |

**Subtasks**
1. `POST /api/study-sessions` — create, fields: subject_id, intention, planned_minutes.
2. `PATCH /api/study-sessions/{id}/complete` — mark complete with reflection.
3. `POST /api/focus-logs` — append log row per session.
4. `GET /api/focus-logs?range=week` — for dashboard stats.
5. Replace localStorage in `FocusMode.jsx`. Add fallback queue if offline.
6. Migrate any existing localStorage data on first sign-in.

**Acceptance criteria**
- Sessions persist across devices.
- Weekly focus minutes match between dashboard and Focus page.

### 0.5 Add Rate Limiting

| Field | Detail |
|-------|--------|
| Effort | 1 day |
| Files | `backend/server.py`, `backend/lib/limits.py` (new) |
| Library | [`slowapi`](https://github.com/laurents/slowapi) |

**Limits to enforce**
- `/api/ai/chat` — 10 req/min/user
- `/api/ai/voice/start` — 3 req/min/user
- `/api/tasks` (POST) — 60 req/min/user
- Global IP — 200 req/min

### 0.6 Add Frontend Tests

| Field | Detail |
|-------|--------|
| Effort | 2 days |
| Library | React Testing Library + Vitest (or Jest already in CRA) |

**Critical flows to cover**
1. Sign-in / sign-up gating (`Gatekeeper.jsx`).
2. Onboarding wizard happy path.
3. Task create → list → complete.
4. Store browse → checkout (mock Stripe).

CI gate added: PRs cannot merge if tests fail or coverage drops.

### 0.7 Voice AI Stabilization

| Field | Detail |
|-------|--------|
| Effort | 2 days |
| Files | `backend/routes/ai_mentor.py`, `src/pages/MentorPage.jsx` |

**Subtasks**
1. Move `ELEVENLABS_AGENT_ID` to env var.
2. Test full conversation loop: connect → speak → response → disconnect.
3. Handle: mic permission denied, network drop, agent timeout, quota exceeded.
4. Add transcript persistence to `ai_interactions` table.
5. Mute / unmute toggle, push-to-talk option.

### Exit criteria for Phase 0
- All Phase 0 tasks merged to `main` with passing CI.
- No P0/P1 bugs in core flows.
- Demo recorded showing tasks → focus session → AI mentor end-to-end.
- `M0 — Feature Complete MVP` milestone closed.

---

## Phase 1 — Subscription and Pricing Restructure (Weeks 3–5)

**Goal:** Transform the monetization model from one-time purchases ($19.99–$34.99) to recurring subscriptions ($0.99–$12.99/mo) plus optional one-time upgrades. Open Stripe Customer Portal for self-service billing.

**Entry criteria**
- Phase 0 closed.
- Stripe webhook handler proven on `user_subscriptions` events in staging.

**Deliverables**
- Defined subscription tiers and price IDs in Stripe.
- Recurring checkout flow live.
- "My Subscriptions" page.
- Stripe Customer Portal embedded.
- One-time upgrades section.
- 56 existing course packs migrated to monthly recurring with grandfathering.

### 1.1 Design Subscription Tiers

| Tier | Monthly | Annual (save 16%) | Includes |
|------|---------|-------------------|----------|
| **Free** | $0 | — | Tasks, Focus, Notes (unlimited), Dictionary, Thesaurus, Context Shifter, AI Mentor (10 msgs/day) |
| **Single Pack** | $0.99–$4.99 | $9.99–$49.99 | One degree pack content + AI mentor unlimited within pack |
| **Degree Bundle** | $6.99–$9.99 | $69.99–$99.99 | All packs in one degree plan + voice mentor (60 min/mo) |
| **All-Access** | $12.99 | $129.99 | All content all degrees, voice unlimited, placement tests, internship board |

**One-time upgrades**
- Premium AI Mentor pack: $9.99 — extended context window, priority responses
- Extended Focus Analytics: $4.99 — heat maps, deep stats, export
- Priority Support: $19.99/year — 24h SLA

### 1.2 Create Stripe Subscription Products

| Field | Detail |
|-------|--------|
| Effort | 2 days |
| Files | `backend/scripts/create_stripe_products.py`, `backend/scripts/migrate_pack_prices.py` (new) |

**Subtasks**
1. Refactor product creation script to emit recurring `Price` objects (monthly + annual) for each pack and tier.
2. Persist price IDs in `course_packs.stripe_monthly_price_id`, `stripe_annual_price_id` columns (migration).
3. Idempotent re-runs (look up by metadata.pack_id before creating).
4. Webhook event allowlist updated: `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.trial_will_end`.

### 1.3 Build Subscription Checkout Flow

| Field | Detail |
|-------|--------|
| Effort | 3 days |
| Files | `src/components/store/SubscribeButton.jsx`, `src/components/store/PlanComparison.jsx` |

**Subtasks**
1. Add `<PlanComparison>` table on Store landing.
2. `<SubscribeButton>` invokes `POST /api/checkout/subscription` returning Stripe Checkout URL in `mode=subscription`.
3. 7-day free trial on first subscription per user.
4. Success and cancel return URLs render appropriate states.
5. Edge function updates `user_subscriptions` row from webhook.

### 1.4 Subscription Management UI

| Field | Detail |
|-------|--------|
| Effort | 3 days |
| Files | `src/pages/MySubscriptions.jsx` (new), `backend/routes/subscriptions.py` (new) |

**Subtasks**
1. List active subscriptions with renewal date, plan, price.
2. "Manage billing" → Stripe Customer Portal link.
3. Cancel / pause / change-plan flows via Portal.
4. Grace period handling: show "payment failed, update method" banner.
5. Email notifications via Supabase Edge Function on key events.

### 1.5 In-App One-Time Upgrades

| Field | Detail |
|-------|--------|
| Effort | 2 days |
| Files | `src/pages/Upgrades.jsx` (new) |

**Subtasks**
1. Upgrades catalog (premium AI, focus analytics, priority support).
2. One-click Stripe Checkout in `mode=payment`.
3. Entitlement check helper: `useEntitlement('premium_ai')`.

### 1.6 Update Webhook Handling

| Field | Detail |
|-------|--------|
| Effort | 2 days |
| Files | `backend/routes/webhooks.py`, `supabase/functions/stripe-webhook/index.ts` |

**Lifecycle events to handle**
- `customer.subscription.created` → grant entitlements.
- `customer.subscription.updated` → upgrade/downgrade.
- `customer.subscription.deleted` → revoke at period end.
- `customer.subscription.trial_will_end` → email warning 3 days out.
- `invoice.payment_failed` → set state=`past_due`, in-app banner.
- `invoice.paid` → reactivate if previously past_due.

Idempotency: dedupe on `event.id` table.

### 1.7 Migrate Existing Pack Prices

| Field | Detail |
|-------|--------|
| Effort | 1 day |

**Subtasks**
1. Adjust 56 packs from $19.99–$34.99 one-time to $0.99–$4.99/mo.
2. Grandfather existing one-time purchasers (lifetime access flag in `user_purchases`).
3. Email all existing purchasers explaining the change and confirming lifetime access.
4. Archive old Stripe one-time `Price` IDs.

### Exit criteria for Phase 1
- Subscription E2E tested in staging with real Stripe Test cards across all states.
- Customer Portal accessible from app.
- All 56 packs converted with grandfathered access verified.
- `M1 — Monetization Ready` milestone closed.

---

## Phase 2 — Content System and Academic Expansion (Weeks 6–10)

**Goal:** Populate real study material and expand academic coverage from undergrad-only to high school through postgraduate.

**Entry criteria**
- Phase 1 closed.
- Content authoring tooling design approved.

**Deliverables**
- Academic levels expanded (HS + Grad/Postgrad).
- Degree plans expanded (HS tracks, MBA, MSN, MPH, MEd, MS).
- Admin authoring panel.
- Content delivery API with subscription/pack gating.
- Student-facing content viewer.
- Placement tests engine.
- Clinical scenario / practicum checklist content types.
- AI content generation pipeline with human review.

### 2.1 Add Academic Level Tiers

| Field | Detail |
|-------|--------|
| Effort | 1 day |
| Migration | `backend/migrations/006_extend_academic_levels.sql` |

**New levels seeded**
- High School: Freshman, Sophomore, Junior, Senior
- Undergraduate (existing): Freshman, Sophomore, Junior, Senior
- Graduate: Master's Year 1, Master's Year 2
- Postgraduate: Doctoral, Postdoctoral

### 2.2 Expand Degree Plans

| Field | Detail |
|-------|--------|
| Effort | 2 days |

**HS tracks added:** General Studies, AP Sciences, AP Humanities, AP Math, Career Tech.
**Postgrad programs:** MBA, MSN (Nursing), MPH (Public Health), MEd (Education), MS (Computer Science, Data Science, Engineering).

### 2.3 Content Authoring Admin Panel

| Field | Detail |
|-------|--------|
| Effort | 5 days |
| Files | `src/pages/admin/ContentEditor.jsx` (new), `backend/routes/admin_content.py` (new) |

**Capabilities**
1. List, search, filter `content_items` by pack, type, status.
2. Create / edit `content_item` with WYSIWYG (TipTap recommended) for `content_json`.
3. Content types: `flashcard`, `study_guide`, `practice_question`, `concept_map`, `placement_test`, `clinical_scenario`, `practicum_checklist`.
4. Difficulty: 1–5.
5. Draft / Review / Published states with reviewer sign-off.
6. Bulk import from JSON / CSV.
7. Admin role gate via Clerk org or `role` claim.

### 2.4 Content Delivery API

| Field | Detail |
|-------|--------|
| Effort | 2 days |
| Files | `backend/routes/content.py` (new) |

**Endpoints**
- `GET /api/content/packs/{pack_id}/items` with pagination, filter by type / difficulty.
- `GET /api/content/items/{id}` returns `content_json` only if user has active entitlement.
- Entitlement check in middleware (RLS already enforces, but app layer adds clearer 403s).

### 2.5 Content Viewer UI

| Field | Detail |
|-------|--------|
| Effort | 5 days |
| Files | `src/pages/ContentViewer.jsx` (new), `src/components/content/*` (new) |

**Modes**
- **Flashcard deck:** flip animation, "got it" / "review again" buttons feeding 3.2 SM-2 algorithm.
- **Study guide:** chaptered reader with bookmarks and highlight-to-note.
- **Practice question:** multiple-choice / short-answer with reveal + explanation.
- **Concept map:** zoomable graph (e.g., react-flow).

### 2.6 Placement Test Content Type

| Field | Detail |
|-------|--------|
| Effort | 5 days |
| New table | `test_attempts` (user_id, pack_id, content_item_id, score, started_at, finished_at, answers_json) |

**Capabilities**
1. Test-taking UI with progress, timer (configurable).
2. Question bank randomization.
3. Auto-scoring with rubric per question.
4. Result page with weakness recommendations and suggested follow-up content.
5. Retake policy (cooldown configurable per pack).

### 2.7 Clinical / Practicum Content Types

| Field | Detail |
|-------|--------|
| Effort | 3 days |

**Clinical scenarios:** branching narrative ("patient presents with X — choose next step"). Step-by-step walkthrough with explanations and references.
**Practicum checklists:** competency checklist with date completed, supervisor name, notes.

### 2.8 AI Content Generation Pipeline

| Field | Detail |
|-------|--------|
| Effort | 5 days |

**Pipeline**
1. Admin selects pack and content types to generate.
2. Backend job (Supabase Edge Function or background worker) calls OpenAI with structured prompt per type.
3. Outputs land in `content_items` as `status='review'`.
4. Reviewer queue UI surfaces drafts for QA edits.
5. Publish flow flips to `status='published'`.

**Cost guardrails**
- Per-pack token cap.
- Caching of identical prompts.
- Daily generation budget enforced.

### Exit criteria for Phase 2
- HS, undergrad, postgrad levels seeded.
- ≥5 degree plans fully populated with content for at least one academic level each.
- Placement tests live for at least 2 packs.
- Authoring + reviewer workflow used by at least one non-developer reviewer.
- `M2 — Content Pipeline Live` milestone closed.

---

## Phase 3 — Notes, Flashcards, and Study Tools (Weeks 11–14)

**Goal:** Build out the remaining core study productivity surface — notes, spaced repetition, planner, weekly reports, reminders.

**Entry criteria**
- Phase 2 closed.
- TipTap and SM-2 implementation proven in spike.

**Deliverables**
- Notes workspace with rich text, tags, search, archive.
- Flashcards with SM-2 spaced repetition.
- Study planner with calendar and auto-suggest.
- Weekly progress report with charts.
- Reminders & notifications stack.
- AI mentor enriched with user context.

### 3.1 Notes Workspace

| Field | Detail |
|-------|--------|
| Effort | 5 days |
| Library | [TipTap](https://tiptap.dev/) |
| Files | `src/pages/NotesPad.jsx`, `src/components/notes/*` (new), `backend/routes/notes.py` (new) |

**Capabilities**
- Full CRUD on `notes` (already in schema).
- Subject linking, tag chips, archive.
- Full-text search via Postgres `tsvector` or Supabase pgsearch.
- Highlight-to-note integration from content viewer (Phase 2.5).
- Soft delete with 30-day recovery.

### 3.2 Review Cards (Flashcards) with SM-2

| Field | Detail |
|-------|--------|
| Effort | 5 days |
| Algorithm | SM-2 ([SuperMemo 2](https://en.wikipedia.org/wiki/SuperMemo#Description_of_SM-2_algorithm)) |
| Files | `backend/routes/review_cards.py` (new), `backend/lib/sm2.py` (new), `src/pages/ReviewCards.jsx` (new) |

**Capabilities**
- Generate flashcards from notes (AI-assisted).
- Generate flashcards from `content_items` of type `flashcard`.
- Review session with flip animation and 0–5 difficulty rating.
- Next-review scheduling stored in `review_cards.next_review_at`.
- Daily review queue surfaced on Dashboard.

### 3.3 Study Planner

| Field | Detail |
|-------|--------|
| Effort | 5 days |
| Library | `react-big-calendar` or `FullCalendar` |
| Files | `src/pages/StudyPlanner.jsx`, `backend/routes/study_planner.py` (new) |

**Capabilities**
- Weekly calendar view with drag-and-drop study blocks.
- Block fields: subject, duration, goal, recurring rule.
- Auto-suggest study blocks based on due-date proximity, priority, weekly goal.
- Optional Google Calendar two-way sync (already a connector → user opt-in).
- Live integration with `study_sessions` table.

### 3.4 Weekly Progress Report

| Field | Detail |
|-------|--------|
| Effort | 3 days |
| Library | Recharts (already installed) |
| Files | `src/pages/WeeklyReport.jsx`, `backend/routes/weekly_reports.py` (new) |

**Report contents**
- Tasks completed vs missed.
- Focus minutes total + by subject.
- Top subject by effort.
- Streak status.
- Identified improvement actions (1–2 prompts).
- "Plan next week" CTA → seeds Study Planner.

Auto-generation cron via Supabase Edge Function every Sunday 6pm in user timezone.

### 3.5 Reminders & Notifications

| Field | Detail |
|-------|--------|
| Effort | 3 days |
| Stack | Supabase Edge Functions + OneSignal (push) + Resend (email) |
| Files | `backend/routes/reminders.py` (new), `supabase/functions/reminders-tick/index.ts` (new) |

**Reminder types**
- Due-soon (24h before).
- Overdue.
- Scheduled study block (10 min before).
- Weekly reset / planning prompt (Sunday 6pm).

**Channels**
- In-app toast (always).
- Email (opt-in).
- Push (PWA, Phase 5).

Honor timezone, quiet hours, and frequency caps to avoid spam.

### 3.6 Enhanced AI Mentor Context

| Field | Detail |
|-------|--------|
| Effort | 3 days |

**Context injection**
- Active assignments, recent notes, due-soon items, current pack content.
- New skills: "quiz me on my notes", "explain flashcard #X", "what's my biggest risk this week".
- Token budget guardrails per request.

### Exit criteria for Phase 3
- Notes, flashcards, planner, weekly reports, reminders all functional and tested.
- Daily review queue working for at least one beta user with ≥20 cards.
- `M3 — Full Study Suite` milestone closed.

---

## Phase 4 — Internship and Career Features (Weeks 15–18)

**Goal:** Add career and internship assistance as a differentiator beyond pure study tools.

**Entry criteria**
- Phase 3 closed.
- At least 50 active beta users (data signal validated).

**Deliverables**
- Internship board.
- AI resume + cover letter assistant.
- Mock interview voice mode.
- Career path visualization.
- Practicum / clinical hours log.

### 4.1 Internship Board Data Model

| Field | Detail |
|-------|--------|
| Effort | 2 days |
| New tables | `internship_listings`, `internship_applications` |

**`internship_listings` columns:** id, title, company, description, location, remote_ok, deadline, field, level, source_url, created_at.
**`internship_applications` columns:** id, user_id, listing_id, status (interested→applied→interviewing→offered→accepted/declined), applied_at, notes.

### 4.2 Internship Discovery UI

| Field | Detail |
|-------|--------|
| Effort | 4 days |
| Files | `src/pages/Internships.jsx` (new) |

**Capabilities**
- Searchable + filterable list (field, level, location, deadline).
- Save favorites.
- Track application status with kanban or list view.
- Reminders on deadline approach (reuses Phase 3.5).

### 4.3 Resume & Cover Letter AI Assistant

| Field | Detail |
|-------|--------|
| Effort | 4 days |
| Files | `src/pages/ResumeCoach.jsx` (new), `backend/routes/career.py` (new) |

**Capabilities**
- Upload (PDF / DOCX) or paste resume text.
- Field-specific feedback (extract role from internship listing).
- Cover letter generation from listing + resume.
- ATS-readability score with concrete fixes.

### 4.4 Mock Interview Mode

| Field | Detail |
|-------|--------|
| Effort | 4 days |

**Capabilities**
- Voice-enabled (reuses ElevenLabs) practice with behavioral + technical question sets per field.
- Real-time feedback scoring (clarity, structure, specificity).
- Session transcript saved to `ai_interactions`.

### 4.5 Career Path Visualization

| Field | Detail |
|-------|--------|
| Effort | 3 days |

**Capabilities**
- Map current courses → potential internships → career outcomes.
- Visualize on `react-flow` or D3 graph.
- Recommend next pack / skill based on career target.

### 4.6 Practicum / Clinical Log

| Field | Detail |
|-------|--------|
| Effort | 3 days |
| New table | `practicum_logs` |

**For healthcare and education students**
- Log clinical hours, patient encounters, teaching observations.
- Supervisor sign-off workflow (stretch — email link signature).
- Export PDF for accreditation.

### Exit criteria for Phase 4
- Internship board has ≥100 listings (manual + partner sourced).
- Resume coach used by ≥10 beta users.
- Mock interview tested across 3+ fields.
- `M4 — Career Features` milestone closed.

---

## Phase 5 — Polish, Scale, and Launch Prep (Weeks 19–22)

**Goal:** Production hardening, performance, accessibility, monitoring, and go-to-market readiness.

**Entry criteria**
- Phase 4 closed.
- All P0/P1 bugs from beta closed out.

**Deliverables**
- Performance budget met.
- Mobile responsiveness audited.
- WCAG 2.1 AA compliance.
- Analytics + error monitoring in production.
- PWA + Capacitor mobile wrapper.
- Load testing passed.
- Public docs.
- Beta cohort completed.

### 5.1 Performance Optimization (3 days)

- Lazy-load routes via `React.lazy`.
- Code-split heavy components (TipTap, Recharts, react-flow).
- Image optimization (`next/image` substitute or Vercel image optimization).
- API response caching (Redis or Supabase materialized views) for hot reads.
- Lighthouse target: ≥90 on all categories for Dashboard, Tasks, Focus.

### 5.2 Mobile Responsiveness Audit (2 days)

- Test all pages on iOS Safari, Android Chrome, iPad.
- Bottom nav verified on all primary routes.
- Touch targets ≥44px.
- Fix any layout regressions found.

### 5.3 Accessibility — WCAG 2.1 AA (3 days)

- Keyboard navigation across every flow.
- Screen reader labels (`aria-label`, semantic landmarks).
- Focus management (modals, drawers).
- Color contrast audit (4.5:1 for body text).
- Skip links and reduced-motion preference honored.

### 5.4 Analytics & Tracking (2 days)

- PostHog (recommended): user behavior, funnel analysis, feature flags, churn indicators.
- Events: signup, onboarding_step, task_create, focus_start, ai_message, store_view, subscribe_click, subscribe_success, weekly_report_open.
- Dashboards for retention, DAU/WAU/MAU, conversion funnel.

### 5.5 Error Monitoring (1 day)

- Sentry on frontend + backend.
- Alerts: 5xx rate, AI provider failure, payment errors.
- Session replay on errored sessions (privacy-redacted).

### 5.6 SEO & ASO (2 days)

- Structured data (JSON-LD: SoftwareApplication, FAQ, BreadcrumbList).
- Open Graph + Twitter Card tags.
- Sitemap + robots.txt.
- App store metadata if Capacitor wrap pursued.

### 5.7 PWA / Mobile Wrapper (3 days)

- Service worker, web app manifest, offline shell for core pages.
- Add-to-home-screen prompt.
- Capacitor build for iOS + Android (TestFlight + Play internal testing).

### 5.8 Load Testing (2 days)

- k6 or Locust simulating 1,000 concurrent users on hot endpoints.
- Identify and fix bottlenecks.
- Scale Supabase plan and FastAPI instance count if needed.

### 5.9 Documentation (2 days)

- User guide (in-app help center + public docs site).
- API docs (FastAPI auto-docs already exist — polish + publish).
- Admin guide for content management.
- Changelog page.

### 5.10 Beta Launch (5 days)

- Invite 50–100 students via existing networks + universities.
- 14-day feedback cycle with in-app survey (NPS + open question).
- Daily triage during beta.
- Iterate on top 3 issues, then hold for v1.

### Exit criteria for Phase 5
- Lighthouse + axe + Sentry baselines green.
- Analytics dashboards live with at least 14 days of data.
- Beta cohort completed with NPS ≥30.
- Public v1 launch announcement shipped.
- `M5 — Launch Ready` milestone closed.

---

## 11. KPIs and Success Metrics

### 11.1 Product KPIs (first 60 days post-public-launch)

| Metric | Target |
|--------|--------|
| Onboarding completion rate | ≥70% |
| Week-1 retention | ≥40% |
| WAU / total users | ≥35% |
| Self-reported assignment completion uplift | ≥20% |
| Average weekly focus minutes per active user | Trending upward week over week |
| Free → paid conversion | ≥5% by day 30 |

### 11.2 Operational KPIs

| Metric | Target |
|--------|--------|
| Deployment frequency | Weekly |
| Critical bug resolution | ≤48 hours |
| Support response SLA | ≤24 hours |
| API p95 latency | <400ms |
| Frontend Lighthouse Performance | ≥90 |
| Test coverage | ≥60% statements |

### 11.3 Financial KPIs

| Metric | Target |
|--------|--------|
| Monthly ARPU | $4–$6 |
| Free → All-Access conversion | ≥1% |
| Gross margin | ≥75% |
| ElevenLabs cost / paying user | <$1.50/mo |

---

## 12. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Content creation bottleneck | Delays Phase 2 | High | AI-generated drafts + human review. Prioritize top 5 degrees. |
| ElevenLabs cost at scale | Burns budget | Medium | Per-tier usage caps. Cache common responses. Evaluate OpenAI TTS as fallback. |
| Stripe subscription complexity | Payment bugs | Medium | Thorough Test Mode coverage. Lean on Stripe Customer Portal. Webhook idempotency. |
| Scope creep on internships | Delays launch | Medium | Phase 4 modular — board can ship without interview prep. |
| Single developer velocity | Timeline slip | High | Prioritize Phases 0–2. Defer Phases 3–5 if signal weak. Recruit contractor by Week 8 if behind. |
| Frontend regression bugs | Quality erosion | High | Phase 0 sets up RTL tests + CI gate on coverage. |
| Cost overrun on AI calls | Margin compression | Medium | Token budgets per tier, caching, model routing (cheaper models for simple tasks). |
| Compliance issues with minors (FERPA / COPPA) | Blocks school rollout | Medium | Formal legal review before any K-12 district deal. Minimal PII collection from day one. |
| Clerk vendor lock | Hard migration if needed | Low | Keep Supabase Auth migration path documented. |
| Content quality variance | Brand damage | Medium | Reviewer queue + at least one non-author signoff per published item. |

---

## 13. Technology Decisions

| Decision | Options | Choice | Reason |
|----------|---------|--------|--------|
| Rich text editor | TipTap, Lexical, Slate | **TipTap** | Best React integration, extensible, active community |
| Spaced repetition | SM-2, FSRS, Anki-style | **SM-2** | Documented, simple, proven |
| Mobile distribution | PWA, Capacitor, RN rewrite | **PWA + Capacitor** | Reuse existing React, native store listing |
| Notification service | Supabase Edge, FCM, OneSignal | **OneSignal + Supabase** | Free tier push + in-app via Supabase |
| Analytics | Mixpanel, PostHog, Amplitude | **PostHog** | Open source, generous free tier, self-hostable |
| Error monitoring | Sentry, Datadog, Bugsnag | **Sentry** | Best React + FastAPI integration |
| Internship data source | Manual, LinkedIn API, Indeed, Handshake | **Manual + university partners** | Data control, partnership leverage |
| Content generation | Manual, AI, hybrid | **Hybrid** | AI drafts + human QA for fastest catalog ramp |
| Calendar UI | react-big-calendar, FullCalendar | **react-big-calendar** | Lighter, better React idioms |
| Voice TTS fallback | ElevenLabs, OpenAI TTS, AWS Polly | **OpenAI TTS as fallback** | Cost ceiling control |

---

## 14. Out of Scope

The following are explicitly out of scope for the 22-week roadmap and require a formal change request to add:

- Native iOS / Android apps beyond the PWA + Capacitor wrapper.
- District-level Student Information System (SIS) integrations.
- Live tutor marketplace.
- Advanced multi-institution payment / subscription architecture.
- Full Learning Management System (LMS) replacement.
- Live video tutoring.
- Gamification economy / storefront (badges only, no economy).
- Complex parental billing ecosystem.
- Real-time messaging between students.
- Open content marketplace (third-party authors).

---

## 15. Phase Gate Ritual

Each phase opens and closes through a phase-gate document at `docs/phases/{slug}-phase-{N}.md` with the following sections:

1. **Entry Criteria** — what must be true to start.
2. **Scope (in / out)** — explicit list of what ships and what does not.
3. **Deliverables** — files, endpoints, screens, migrations, scripts.
4. **Validation Steps** — manual + automated tests.
5. **Rollback Procedure** — how to safely revert.
6. **Exit Criteria** — what must be true to close.
7. **Mission Alignment Test** — explicit confirmation that scope serves the YSC mission.
8. **Audit Entry** — open and close rows in `REGGIE-STATE.md`.

No initiative advances to the next phase until the previous gate is satisfied.

---

## Appendix A — Quick Wins (start immediately)

1. Complete Task Manager UI — backend already done.
2. Complete User Settings form — backend already done.
3. Move ElevenLabs agent ID to env var — single line change.
4. Sync Focus Timer to Supabase — tables exist, needs API + hook.
5. Add `slowapi` rate limiting — one file change.
6. Restructure course pack prices — DB update + Stripe script.

---

## Appendix B — Glossary

- **Pack** — a bundle of `content_items` for one course or topic.
- **Degree Plan** — a curated set of packs aligned to a field of study.
- **Entitlement** — a user's access right to a pack or feature derived from a purchase or active subscription.
- **Tier** — a subscription level (Free, Single Pack, Degree Bundle, All-Access).
- **Companion** — the AI mentor available across text and voice.
- **Phase Gate** — the structured open/close ritual described in §15.

---

## Appendix C — References

- [YSC Full Scope (uploaded)](pplx://file/your-student-companion-full-scope.md)
- [`AUDIT_AND_IMPLEMENTATION_PLAN.md`](https://github.com/jeremiahvanwagner-droid/Your-Student-Companion-main/blob/main/AUDIT_AND_IMPLEMENTATION_PLAN.md)
- [SuperMemo SM-2 algorithm](https://en.wikipedia.org/wiki/SuperMemo#Description_of_SM-2_algorithm)
- [TipTap editor](https://tiptap.dev/)
- [Stripe Customer Portal](https://stripe.com/docs/billing/subscriptions/customer-portal)
- [PostHog](https://posthog.com/)
- [slowapi](https://github.com/laurents/slowapi)
- [react-big-calendar](https://github.com/jquense/react-big-calendar)

---

*End of YSC Roadmap v1.0*
