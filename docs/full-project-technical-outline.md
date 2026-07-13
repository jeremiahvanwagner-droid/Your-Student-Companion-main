# Your Student Companion (YSC) — Reconciled Technical Outline

> **Document status — READ THIS FIRST**
>
> **Provenance:** The first draft of this outline was AI-generated (Perplexity) by pointing a model at the YSC GitHub repository. As a result ~80% of it described the project *back to itself*, and several sections restated **proposals that had already shipped** or **contradicted decisions that were already locked**. This version was reconciled against the actual codebase on **2026-07-13** by a full-repo audit.
>
> **How to use it:** Treat this as the product/architecture north-star (a PRD-grade reference), **not** as build instructions. Where this doc and the code disagree, the **code and `backend/migrations/` win**. The single live status tracker is [`CURRENT_STATE.md`](../CURRENT_STATE.md); the long-form plan is [`YSC_ROADMAP.md`](../YSC_ROADMAP.md).
>
> **Corrections applied in this version** (things the AI draft got wrong):
> 1. **Pricing** — draft said 3 tiers at $9.99/$19.99. Actual **locked** model is 2 paid tiers: **Degree Bundle $7.99/mo** and **All-Access $14.99/mo**, plus a 14-day trial, one-time packs, and lifetime grandfathering. Live tier constants in code are `degree_bundle` / `all_access`.
> 2. **Billing status** — draft placed Stripe billing as future "Step 11." It **shipped in May 2026** (Step 4) in Stripe Test mode.
> 3. **Frontend version** — React **19**, not 18.
> 4. **Database identity** — draft used the Supabase-Auth pattern (`users.id REFERENCES auth.users`). The live schema is a **Clerk-keyed hybrid** (`clerk_id` is the identity anchor). Adopting the draft's DDL would break the running DB.
> 5. **AI mentor** — draft claimed GPT-4o primary + Claude fallback + LangGraph multi-agent. Actual: **OpenAI `gpt-4.1-mini`** (env-overridable) for text + **ElevenLabs** for voice. No LangGraph, Celery, or Redis are adopted pre-launch (deferred by decision, not oversight).
> 6. **Audience / COPPA** — decision **2026-07-13: launch 13+ with a hard age gate; defer the parental portal / full COPPA build to post-launch.** See §1 and §7.
> 7. **Launch target** — not "September 2026"; the live target is **~2026-08-20**, currently flagged 🟡 timeline-at-risk.

---

## Executive Summary

Your Student Companion (YSC) is a **web-first** (PWA-capable) learning-productivity platform for high-school, undergraduate, and post-graduate students. It unifies studying, task management, spaced-repetition review, a study planner, weekly progress reporting, an AI mentor (text + voice), a course-pack store, and subscriptions in one experience. Internship discovery is a parked future phase.

The core stack is **React 19 (CRA + Craco)** on the frontend, **FastAPI (Python 3.11)** on the backend, **Supabase (PostgreSQL + RLS)** for data, **Clerk** for auth, **Stripe** for subscriptions, **Sentry** for error tracking, **Better Stack** for uptime, and **PostHog** for analytics (enrolled, wiring pending). Frontend is deployed on **Vercel** (live, custom domain); the backend is packaged for **Render** (Dockerfile + `render.yaml` ready; service not yet created).

**What is actually live/built** (not aspirational): auth + onboarding, dashboard, AI mentor, course-pack store with Stripe one-time + subscription checkout, notes, SM-2 review cards, study planner, weekly report, focus timer, in-app reminders, task manager. Backend carries **156 tests at ~78% coverage**; frontend **96 tests**; CI with branch protection is active on `main`.

**Immediate critical path** (from the Seven Advancements plan): backend deploy on Render → Sentry env vars in Vercel → Supabase leaked-password toggle → credential cutover → beta cohort. See [`docs/advancements/00-executive-summary.md`](advancements/00-executive-summary.md).

---

## 1. Vision & User Personas

YSC serves students across three bands. **Launch scope is 13+.**

| User Type | Age Range | Core Need | Launch status |
|-----------|-----------|-----------|---------------|
| High School Student | 13–18 | Study help, standardized test prep | ✅ In scope at launch |
| Undergraduate | 18–24 | Course tracking, placement prep, practicum support | ✅ In scope at launch |
| Post-Graduate / Professional | 24+ | Licensure prep, continuing ed, career tools | ✅ In scope at launch |
| Middle School (under 13) | 11–12 | Study help | ⏸️ **Deferred** — blocked by age gate until COPPA build lands |
| Parent / Guardian | Any | Oversight, consent, progress visibility | ⏸️ **Deferred** — parental portal is post-launch |

**COPPA decision (2026-07-13):** Rather than build the full COPPA regime (verifiable parental consent, consent logging, deletion pipeline, SDK inventory for child accounts) before launch — which would add a legal-grade blocker to an already at-risk timeline — YSC launches **13+ with a hard age gate** that blocks under-13 signups. The under-13 audience and the parental portal re-open as a **post-launch workstream** with counsel engaged. This keeps the roadmap's stated middle-school ambition intact without gating the whole launch on it.

---

## 2. Frontend Architecture

### 2.1 Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | **React 19** (CRA + Craco) | Component-based UI |
| Routing | React Router **v7** | Page navigation + route code-splitting |
| Styling | Tailwind CSS + shadcn/ui | Design system |
| Auth UI | Clerk React (`@clerk/clerk-react` v5) | Sign-in/up, user profile |
| Error tracking | `@sentry/react` v10 | Boot init, ErrorBoundary, PII scrubbing |
| Charts | Recharts v3 | Weekly report, score history |
| Analytics | PostHog (`posthog-js`) | **Enrolled; wiring pending** (not yet in code) |
| Build config | Craco | CRA override; source-map upload to Sentry on prod builds |

### 2.2 Pages (actual — `src/pages/*.jsx`)

`LandingPage` · `HomePage` · `Dashboard` · `OnboardingFlow` · `StudyPlanner` · `NotesPad` · `WeeklyReport` · `TaskManager` · `FocusPage` · `MentorPage` · `StorePage` · `SubscribePage` · `SearchPage` · `ShifterPage` (context shifter) · `UserSettings` · `NotFoundPage`.

### 2.3 To-build frontend gaps (from the reconciliation)

- **`<AgeGate />`** — age confirmation at sign-up that blocks under-13 (required to enforce the 13+ launch decision). *Not yet in code.*
- **`<PostHogProvider />`** — analytics wiring (enrolled vendor, not yet wired).
- Exam **practice runner** UI — Step 7 test-prep module is paused at Phase 7.2.

---

## 3. Backend Architecture

### 3.1 Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | FastAPI (Python 3.11) | Async REST |
| Auth middleware | Clerk JWT validation (`backend/lib`, `clerk_auth.py`) | User context injection |
| LLM | **OpenAI `gpt-4.1-mini`** (env `OPENAI_MODEL`) | AI mentor text |
| Voice | **ElevenLabs** | AI mentor voice |
| Rate limiting | slowapi | ⚠️ do not combine with `from __future__ import annotations` on limited routes |
| Logging / errors | `python-json-logger` + Sentry SDK + `X-Request-ID` middleware | Structured logs |
| Testing | Pytest + HTTPX | 156 tests, ~78% coverage |
| Deployment | **Render** (Docker) | Dockerfile + `render.yaml` ready; service not yet created |

> **Deliberately NOT adopted pre-launch:** Celery, Redis, and LangGraph multi-agent orchestration. The AI mentor is a direct OpenAI call, which is sufficient at current scale. Add orchestration when usage demands it.

### 3.2 Route Modules (actual — `backend/routes/*.py`)

`users` · `subjects` · `exams` · `tasks` · `focus` · `notes` · `planner` · `reports` · `reminders` · `ai_mentor` · `store` · `webhooks`.

Spaced repetition uses a full **SM-2** implementation in `routes/notes.py` (ease factors, interval progression, lapse re-queue) — more complete than the placeholder confidence-integer the AI draft proposed.

### 3.3 AI Mentor (actual)

Single-call design: request → Clerk auth → OpenAI chat completion (`gpt-4.1-mini`) → response (voice via ElevenLabs when requested). **Gap to add:** an age-safety system prompt injected when the user's grade band indicates a minor. Cheap, high-value, adopt regardless of the COPPA timeline.

---

## 4. Database Architecture (Supabase / PostgreSQL)

**Source of truth is [`backend/migrations/`](../backend/migrations/)** — this section is illustrative, not literal DDL.

### 4.1 Identity & multi-tenancy

Single shared Postgres with **Row-Level Security** on every user-scoped table. **Identity is Clerk-based**: the `users` row is anchored to `clerk_id` (a hybrid baseline established by migrations 003 "compat" + 004 "reconcile"), **not** the Supabase-Auth `auth.users` FK the AI draft assumed. RLS policies scope rows to the authenticated user; an `is_admin()` helper lives in the private `app_private` schema (migration 008) so it is not callable via PostgREST.

### 4.2 Migration ledger (applied to `ysc-staging`)

`0001` init schema · `001`/`002` academic + course-pack seeds · `003` store/payment bootstrap · `004` reconcile-from-compat · `005` purchase identity UUID align · `006` focus · `007` planner_blocks · `008` private `is_admin()` · `009` reminders `reference_id` + SM-2 columns. **007/008/009 applied 2026-07-13** — the long-standing migration blocker is cleared.

### 4.3 Core tables (illustrative)

`users`, `subscriptions`, `user_purchases` (with `lifetime_access` grandfathering flag), `exams`, `questions`, `practice_sessions`, `flashcard_decks`/`review_cards`, `notes`, `tasks`, `planner_blocks`, `reminders`, `mentor_conversations`/`mentor_messages`, `focus_sessions`. A `parental_consent_log` table is **future** (COPPA workstream), not part of the 13+ launch.

---

## 5. Authentication & Authorization

**Clerk** (test mode during build) handles identity: email/password + OAuth, JWT validated on every FastAPI endpoint. Roles: `student` (default), `admin` (internal via `is_admin()`); `parent` role is deferred with the parental portal. **Subscription gating** is enforced backend-side against the user's tier before serving premium content; the store/webhook path maps Stripe events to `degree_bundle` / `all_access` entitlements.

---

## 6. Integrations

- **Stripe** — 2 paid tiers (Degree Bundle **$7.99/mo**, All-Access **$14.99/mo**), annual cadences, 14-day trial, one-time packs, lifetime grandfathering. **Live in Test mode**; webhook destination configured; promotion to Live deferred to post-QA.
- **Sentry** — frontend + backend wired (PR #7 landed); activates in prod once four env vars are set in Vercel.
- **Better Stack** — uptime monitor live on the Vercel URL; backend `/api/health` monitor pending the Render deploy.
- **PostHog** — vendor enrolled; **code wiring not started.** COPPA note applies only once under-13 users exist.
- **Resend** — API key live; transactional/grandfather email wiring pending.
- **OpenAI + ElevenLabs** — AI mentor text + voice (see §3.3).
- **Internships** — parked future phase (manual + university-partner sourcing per roadmap §13).

---

## 7. Observability & Compliance

**Monitoring:** Sentry (errors, both tiers) · Better Stack (uptime) · PostHog (product analytics, pending) · Supabase dashboard (DB/RLS).

**COPPA — deferred by the 13+ launch decision.** At launch, compliance posture is: **age gate blocks under-13**, minimal PII collection, no behavioral profiling. The full COPPA architecture (verifiable parental consent, `parental_consent_log`, parent-initiated deletion pipeline, per-child SDK identifier suppression, children's-privacy policy section) is a **post-launch workstream** that re-opens the under-13 audience with legal counsel engaged. FERPA/COPPA legal review remains a hard gate before any K-12 district deal (roadmap risk register).

---

## 8. Deployment Architecture

```
[Browser] → HTTPS → [Vercel CDN → React static build]   (LIVE, custom domain)
                          ↓ API calls (Clerk JWT)
                     [Render → FastAPI]                   (Dockerfile ready; service TBD)
                          ↓
                     [Supabase Postgres + RLS + Storage]  (LIVE staging)
                          ↓
                     [OpenAI / ElevenLabs]
```

Frontend auto-deploys on `main` push. Backend deploy runbook: [`docs/runbooks/backend-deploy.md`](runbooks/backend-deploy.md). Secrets live in Vercel/Render/Supabase — never in Git.

---

## 9. Subscription Tiers & Feature Gating (LOCKED)

| Feature | Free ($0) | Degree Bundle ($7.99/mo · $79.99/yr) | All-Access ($14.99/mo · $149.99/yr) |
|---------|-----------|--------------------------------------|-------------------------------------|
| Tasks / Focus / Notes | ✅ unlimited | ✅ | ✅ |
| Dictionary / Thesaurus / Context Shifter | ✅ | ✅ | ✅ |
| AI Mentor (text) | Capped (10 msgs/day) | ✅ | ✅ |
| AI Mentor voice | ❌ | 60 min/mo | Unlimited |
| Course packs | ❌ | All packs in one degree plan | Every degree |
| Placement tests | ❌ | ❌ | ✅ |
| Internship board (when shipped) | ❌ | ❌ | ✅ |

Plus **one-time packs** ($19.99–$34.99) as a lifetime alternative, and **lifetime grandfathering** (`lifetime_access=true`) for pre-subscription pack buyers. 14-day trial on first subscription (card required).

---

## 10. Roadmap (reconciled)

The authoritative sequencing lives in [`CURRENT_STATE.md`](../CURRENT_STATE.md) and [`docs/advancements/`](advancements/00-executive-summary.md). Corrected status of the AI draft's "12-step" framing:

| Area | AI draft said | Actual |
|------|---------------|--------|
| Core infra / auth / study tools | ✅ | ✅ |
| Subscriptions + gating | 🔜 "Step 11" | ✅ **Shipped (Step 4, May 2026)** |
| Spaced repetition | 🔜 | ✅ **Shipped (SM-2)** |
| Study planner + weekly report | — | ✅ **Shipped (Step 9)** |
| In-app reminders | — | ✅ **Shipped (Step 10 partial)** |
| Standardized test prep | 🔄 | ⏸️ Paused at Phase 7.2 |
| Email reminders + AI content gen | — | 🔜 remaining in Step 10 |
| Backend production deploy | — | 🔜 **critical path** (Render) |
| PostHog wiring / email infra | 🔄 | 🔜 pending |
| COPPA / parental portal | 🔜 "Step 10" | ⏸️ **Deferred post-launch (13+ decision)** |
| Public beta | 🎯 Sept 2026 | 🎯 **~2026-08-20 (at risk)** |

---

## 11. Known Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Timeline slip (solo dev, at-risk date) | 🔴 High | Seven Advancements re-sequencing; defer non-critical scope |
| Backend not yet deployed | 🔴 High | Render Dockerfile ready; deploy is critical-path item #1 |
| Content licensing (ACT/AP) stalls test prep | 🟡 Med | Original SHSAT/HSPT authoring as fallback; test-prep is paused, not blocking |
| Supabase RLS misconfig leaks data | 🟡 Med | 23 policies + `is_admin()` moved to `app_private`; leaked-password toggle is the last open advisor |
| AI mentor safety for minors | 🟡 Med | Age-safety system prompt (to add); 13+ gate limits exposure |
| COPPA exposure if under-13 slips through | 🟡 Med | Hard age gate at signup; parental portal deferred with counsel |
| PostHog/analytics PII for minors | 🟢 Low | Not wired yet; gate before any under-13 audience opens |

---

## Appendix — Reconciliation provenance

This document was corrected on 2026-07-13 against: repo root, `backend/routes/`, `backend/migrations/`, `src/pages/`, `package.json`, `CURRENT_STATE.md`, `YSC_ROADMAP.md`, and the locked pricing decision. The pre-correction draft (Perplexity-generated) is preserved only in git history. Where future readers find drift, trust the code and migrations over this outline.
