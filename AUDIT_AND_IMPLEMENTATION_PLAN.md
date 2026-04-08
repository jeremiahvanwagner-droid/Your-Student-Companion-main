# Your Student Companion — End-to-End Audit & Implementation Plan

**Date:** April 7, 2026  
**Prepared for:** Platform Vision Roadmap  

---

## PART 1: PLATFORM AUDIT — CURRENT STATE

### 1.1 Architecture Overview

| Layer | Technology | Status |
|-------|-----------|--------|
| **Frontend** | React 19 + CRA (Craco) + TailwindCSS + shadcn/ui | Deployed on Vercel |
| **Backend** | Python FastAPI + Uvicorn | Deployed (Cloud Run / Heroku) |
| **Database** | Supabase PostgreSQL (RLS-enforced) | 19 tables, 5 migrations |
| **Auth** | Clerk (JWT) → Supabase user mapping | Fully integrated |
| **Payments** | Stripe (Checkout + Webhooks) | Functional (one-time packs) |
| **AI/Voice** | OpenAI (gpt-4.1-mini) + ElevenLabs | Text chat working; voice partial |
| **Edge Functions** | Supabase Edge (stripe-webhook) | Deployed |

### 1.2 Feature Inventory

| Feature | Backend | Frontend | Status |
|---------|---------|----------|--------|
| **User Auth (Clerk)** | ✅ JWT validation, user resolution | ✅ Sign-in/up, gating, session | **Complete** |
| **Onboarding Flow** | ✅ Profile CRUD, grade/major/timezone | ✅ 5-step wizard, dual persistence | **Complete** |
| **Dashboard** | ✅ Task stats, streak | ✅ Quick actions, stats cards | **Complete** |
| **Dictionary Search** | — (External API: Free Dictionary) | ✅ Search, definitions, audio | **Complete** |
| **Academic Thesaurus** | — (Client-side 100+ word map) | ✅ Synonyms, copy-to-clipboard | **Complete** |
| **Context Shifter** | — (Client-side 890-line engine) | ✅ Text transform, Truth Cards | **Complete** |
| **Pomodoro Focus Timer** | — (localStorage only) | ✅ 25-min timer, stats, streaks | **Complete (no server sync)** |
| **AI Mentor (Text)** | ✅ OpenAI chat, pack context, history | ✅ Chat UI, 50-msg local history | **Complete** |
| **AI Mentor (Voice)** | ⚠️ ElevenLabs stubs | ✅ WebRTC voice session UI | **Partial — voice session works via ElevenLabs SDK directly, backend stubs** |
| **Course Pack Store** | ✅ Catalog CRUD, Stripe checkout | ✅ 3-step browse, checkout, purchase status | **Complete** |
| **Stripe Webhooks** | ✅ Edge function + backend handler | — | **Complete** |
| **Task Manager** | ✅ Full CRUD + stats + streak | ⚠️ Route exists, UI scaffolded | **Backend done, frontend partial** |
| **Study Planner** | ❌ No endpoints | ⚠️ Placeholder UI only | **Scaffolded** |
| **Notes Workspace** | ❌ No endpoints | ⚠️ Search UI shell only | **Scaffolded** |
| **Weekly Progress Report** | ❌ No endpoints | ⚠️ Route only | **Scaffolded** |
| **User Settings** | ✅ Profile update endpoints | ⚠️ Route only | **Backend done, frontend scaffolded** |
| **Subjects** | ✅ Full CRUD | ⚠️ Not wired to UI | **Backend done, frontend missing** |
| **Study Sessions / Focus Logs** | ❌ No endpoints (tables exist) | ❌ Not connected | **DB schema only** |
| **Review Cards (Flashcards)** | ❌ No endpoints (tables exist) | ❌ Not built | **DB schema only** |
| **Reminders** | ❌ No endpoints (tables exist) | ❌ Not built | **DB schema only** |
| **Content Items (Gated)** | ❌ No endpoints (tables exist, RLS done) | ❌ Not built | **DB schema only** |
| **Subscriptions (recurring)** | ✅ Webhook handling | ❌ No subscription checkout flow | **Webhook ready, no subscription UI** |

### 1.3 Database Schema Status

**19 tables defined**, relationships enforced, RLS policies active:

| Table | Has API Routes | Has UI | Content |
|-------|---------------|--------|---------|
| `users` | ✅ | ✅ | Auth identity |
| `student_profiles` | ✅ | ✅ | Onboarding data |
| `academic_levels` | ✅ (store) | ✅ | 4 rows seeded |
| `degree_plans` | ✅ (store) | ✅ | 14 rows seeded |
| `course_packs` | ✅ (store) | ✅ | 56 rows seeded ($19.99–$34.99) |
| `user_purchases` | ✅ | ✅ | Stripe-synced |
| `user_subscriptions` | ✅ (webhook) | ❌ | Webhook-ready |
| `content_items` | ❌ | ❌ | Empty, schema ready |
| `subjects` | ✅ | ❌ | User subjects |
| `assignments` | ✅ | ⚠️ | Tasks/homework |
| `study_sessions` | ❌ | ❌ | Pomodoro records |
| `focus_logs` | ❌ | ❌ | Focus tracking |
| `notes` | ❌ | ❌ | Student notes |
| `review_cards` | ❌ | ❌ | Flashcards (spaced repetition) |
| `weekly_reports` | ❌ | ❌ | Progress summaries |
| `reminders` | ❌ | ❌ | Notification triggers |
| `ai_interactions` | ✅ (logged) | — | AI usage tracking |
| `feature_flags` | — | — | Admin feature control |
| `audit_logs` | ✅ | — | Change tracking |

### 1.4 Monetization Status

**Current pricing model:**
- 56 one-time course packs: $19.99–$34.99 each
- Stripe Checkout for one-time purchases: ✅ working
- Subscription handling (webhook): ✅ ready
- Subscription checkout UI: ❌ not built

**Vision pricing model:**
- Recurring fee $0.99–$12.99/month for study materials
- In-app purchase upgrades (one-time, annually, monthly)
- Free tier with many features included

**Gap:** Current one-time pack prices ($19.99–$34.99) don't match the vision ($0.99–$12.99/month recurring). Need to restructure pricing, add subscription tiers, and build subscription management UI.

### 1.5 Identified Gaps vs. Vision

| Vision Requirement | Current State | Gap Severity |
|-------------------|---------------|-------------|
| **High school + undergrad + postgrad** | Undergrad only (Freshman–Senior levels) | 🔴 High — need HS & grad levels |
| **Classes, courses** | 14 degree plans × 4 levels = 56 packs | 🟡 Medium — content empty |
| **Placement tests** | Not addressed | 🔴 High — new feature |
| **Programs, clinicals, practicums** | Not addressed | 🔴 High — new content types |
| **Internship assistance** | Not addressed | 🔴 High — new feature |
| **$0.99–$12.99/month recurring** | $19.99–$34.99 one-time | 🔴 High — pricing restructure |
| **In-app upgrades (one-time, annual, monthly)** | One-time only | 🔴 High — billing flexibility |
| **Tutor with voice, moderately interactive** | Text chat ✅, voice session partial | 🟡 Medium — voice needs polish |
| **Free app with many features** | Basic features free, store paid | 🟢 Low — structure exists |
| **Actual study material content** | `content_items` table empty | 🔴 High — no content authored |

---

## PART 2: IMPLEMENTATION PLAN

### Phase 0 — Foundation Hardening (Weeks 1–2)

**Goal:** Stabilize what exists, complete scaffolded features, fix technical debt.

| # | Task | Effort |
|---|------|--------|
| 0.1 | **Complete Task Manager UI** — Wire TaskManager.jsx to existing backend CRUD endpoints. Add create/edit/delete dialogs, filtering by status/priority/subject, and due date display. | 3 days |
| 0.2 | **Complete Subjects UI** — Add subject picker in task creation, subject management in Settings. Wire to existing `/api/subjects` endpoints. | 1 day |
| 0.3 | **Complete User Settings page** — Profile edit form (name, grade, school, major, timezone, weekly goal). Wire to existing `/api/users/me/profile` PUT endpoint. | 1 day |
| 0.4 | **Sync Focus Timer to server** — Create `POST /api/study-sessions` and `POST /api/focus-logs` endpoints. Persist Pomodoro sessions to Supabase instead of localStorage. | 2 days |
| 0.5 | **Add rate limiting** — Add middleware to FastAPI (e.g., slowapi) for `/api/ai/chat` (10 req/min) and other endpoints. | 1 day |
| 0.6 | **Add frontend tests** — Set up React Testing Library. Write tests for critical flows: auth gating, onboarding, store checkout. | 2 days |
| 0.7 | **Voice AI stabilization** — Move ElevenLabs agent ID to env var. Test full voice conversation loop end-to-end. Handle edge cases (mic permission denied, connection drops). | 2 days |

**Milestone:** All existing features are production-grade and fully wired.

---

### Phase 1 — Subscription & Pricing Restructure (Weeks 3–5)

**Goal:** Transform from one-time purchases to the vision's recurring model ($0.99–$12.99/month).

| # | Task | Effort |
|---|------|--------|
| 1.1 | **Design subscription tiers** — Define plans: Individual Pack ($0.99–$4.99/mo), Degree Bundle ($6.99–$9.99/mo), All-Access ($12.99/mo). Add annual discount options (e.g., 2 months free). | 2 days (design) |
| 1.2 | **Create Stripe subscription products** — Update `create_stripe_products.py` to generate recurring price objects. Map each course pack to a monthly Stripe Price + an annual Stripe Price. | 2 days |
| 1.3 | **Build subscription checkout flow** — New UI in StoreBrowser: "Subscribe" button → Stripe Checkout in subscription mode. Handle trial periods. | 3 days |
| 1.4 | **Subscription management UI** — "My Subscriptions" page: view active subs, cancel, switch plans. Stripe Customer Portal integration for billing self-service. | 3 days |
| 1.5 | **In-app one-time upgrades** — Create an "Upgrades" section: premium AI mentor features, extended focus analytics, priority support. Stripe Checkout for one-time payments. | 2 days |
| 1.6 | **Update webhook handling** — Ensure subscription lifecycle events (upgrade, downgrade, cancel, pause, resume, trial end) are all handled and reflected in UI in real-time. | 2 days |
| 1.7 | **Migrate existing pack prices** — Adjust the 56 course packs from $19.99–$34.99 one-time to $0.99–$4.99/month recurring. Grandfather existing purchasers. | 1 day |

**Milestone:** Full recurring billing with monthly/annual/one-time options working end-to-end.

---

### Phase 2 — Content System & Academic Expansion (Weeks 6–10)

**Goal:** Populate actual study materials and expand academic coverage from undergrad-only to HS through postgrad.

| # | Task | Effort |
|---|------|--------|
| 2.1 | **Add academic level tiers** — Extend `academic_levels` table: High School (Freshman/Sophomore/Junior/Senior), Undergraduate (existing 4), Graduate/Postgrad (Masters, Doctoral). Seed new rows. | 1 day |
| 2.2 | **Expand degree plans** — Add high school tracks (AP classes, general studies), postgrad programs (MBA, MSN, MPH, MEd, MS). Update catalog seed data. | 2 days |
| 2.3 | **Content authoring admin panel** — Build admin-only routes + UI for creating/editing `content_items`: flashcards, study guides, practice questions, concept maps. WYSIWYG editor for content_json. | 5 days |
| 2.4 | **Content delivery API** — Create `/api/content/packs/{pack_id}/items` endpoints. Enforce purchase/subscription gating (RLS already in place). Support pagination, filtering by content_type, difficulty. | 2 days |
| 2.5 | **Content viewer UI** — Build student-facing content viewer: flashcard deck mode, study guide reader, practice question interface with answer reveal. | 5 days |
| 2.6 | **Placement test content type** — New content_type: `placement_test`. Create test-taking UI with scoring, time limits, question banks. Track results in new `test_attempts` table. | 5 days |
| 2.7 | **Clinical/practicum content type** — New content types: `clinical_scenario`, `practicum_checklist`. Build scenario-based learning UI with step-by-step walkthroughs. | 3 days |
| 2.8 | **AI content generation pipeline** — Use OpenAI to batch-generate initial content for each pack (flashcards, practice questions, study guides). Human review workflow. | 5 days |

**Milestone:** Content pipeline operational. At least 5 degree plans have full study material for all levels. Placement test feature live.

---

### Phase 3 — Notes, Flashcards, & Study Tools (Weeks 11–14)

**Goal:** Build out the remaining study productivity features.

| # | Task | Effort |
|---|------|--------|
| 3.1 | **Notes workspace** — Full CRUD for `notes` table. Rich text editor (e.g., TipTap or Lexical). Tags, search, archive. Subject linking. | 5 days |
| 3.2 | **Review cards (flashcards)** — Generate flashcards from notes. Spaced repetition algorithm (SM-2). Review session UI with flip animation, difficulty rating, next-review scheduling. | 5 days |
| 3.3 | **Study planner** — Calendar view with drag-and-drop study blocks. Auto-suggest study blocks based on due dates, priorities, weekly goal. Integrate with `study_sessions` table. | 5 days |
| 3.4 | **Weekly progress report** — Auto-generated weekly summary: tasks completed vs. missed, focus minutes, top subjects, streaks. Charts via Recharts (already installed). Persist to `weekly_reports`. | 3 days |
| 3.5 | **Reminders & notifications** — Backend: reminder creation based on due dates and study blocks. Frontend: toast notifications, optional email/push via Supabase Edge Functions or a notification service. | 3 days |
| 3.6 | **Enhanced AI mentor context** — Feed user's notes, flashcards, assignments, and progress into AI mentor context. Enable "quiz me on my notes" and "explain my flashcard" interactions. | 3 days |

**Milestone:** Full study suite operational — notes, flashcards with spaced repetition, smart planner, weekly reports, reminders.

---

### Phase 4 — Internship & Career Features (Weeks 15–18)

**Goal:** Add career/internship assistance as a differentiator.

| # | Task | Effort |
|---|------|--------|
| 4.1 | **Internship board data model** — New tables: `internship_listings` (title, company, description, location, deadline, field, level), `internship_applications` (user tracking). | 2 days |
| 4.2 | **Internship discovery UI** — Searchable/filterable listing page. Save favorites. Track application status (interested → applied → interviewing → offered → accepted/declined). | 4 days |
| 4.3 | **Resume & cover letter AI assistant** — Extend AI mentor with resume review mode. Upload/paste resume text, get field-specific feedback. Cover letter generation from job description. | 4 days |
| 4.4 | **Interview prep mode** — AI mock interview feature. Behavioral + technical questions for the user's field. Voice-enabled practice with feedback scoring. | 4 days |
| 4.5 | **Career path visualization** — Show progression: current courses → potential internships → career outcomes. Map degree plans to career paths. | 3 days |
| 4.6 | **Practicum/clinical log** — For healthcare & education students: log clinical hours, patient encounters, teaching observations. Supervisor sign-off workflow (stretch). | 3 days |

**Milestone:** Career features differentiate the app from pure study tools.

---

### Phase 5 — Polish, Scale, & Launch Prep (Weeks 19–22)

**Goal:** Production hardening, performance, and go-to-market readiness.

| # | Task | Effort |
|---|------|--------|
| 5.1 | **Performance optimization** — Lazy-load routes, code-split heavy components. Image optimization. API response caching (Redis or in-memory). | 3 days |
| 5.2 | **Mobile responsiveness audit** — Test all pages on iOS Safari, Android Chrome. Fix any layout issues. Ensure bottom nav works perfectly. | 2 days |
| 5.3 | **Accessibility (WCAG 2.1 AA)** — Keyboard nav, screen reader labels, focus management, color contrast. | 3 days |
| 5.4 | **Analytics & tracking** — Integrate Mixpanel/Amplitude or PostHog for user behavior, funnel analysis, feature usage, churn indicators. | 2 days |
| 5.5 | **Error monitoring** — Integrate Sentry for frontend + backend. Alert on 5xx spikes, AI failures, payment errors. | 1 day |
| 5.6 | **SEO & ASO** — Structured data, Open Graph tags, sitemap. App store metadata prep if wrapping in Capacitor/PWA. | 2 days |
| 5.7 | **PWA / mobile wrapper** — Add service worker, manifest, offline support. Evaluate Capacitor for iOS/Android app store listing. | 3 days |
| 5.8 | **Load testing** — Simulate 1,000+ concurrent users on API. Identify bottlenecks. Scale Supabase plan and backend instances as needed. | 2 days |
| 5.9 | **Documentation** — User guide, API docs (FastAPI auto-docs are already there), admin guide for content management. | 2 days |
| 5.10 | **Beta launch** — Invite 50–100 students for beta testing. Collect feedback via in-app survey. Iterate on top issues. | 5 days |

**Milestone:** Platform is production-ready, monitored, and validated by real students.

---

## PART 3: TIMELINE SUMMARY

```
PHASE 0 ─ Foundation Hardening          ████░░░░░░░░░░░░░░░░░░  Weeks 1–2
PHASE 1 ─ Subscription & Pricing        ░░░░████████░░░░░░░░░░  Weeks 3–5
PHASE 2 ─ Content & Academic Expansion   ░░░░░░░░░░██████████░░  Weeks 6–10
PHASE 3 ─ Notes, Cards, Study Tools     ░░░░░░░░░░░░░░░░████████  Weeks 11–14
PHASE 4 ─ Internship & Career           ░░░░░░░░░░░░░░░░░░░░████████  Weeks 15–18
PHASE 5 ─ Polish, Scale, Launch          ░░░░░░░░░░░░░░░░░░░░░░░░████████  Weeks 19–22
```

**Total estimated duration: ~22 weeks (5.5 months)**

---

## PART 4: MILESTONE CHECKLIST

| Week | Milestone | Key Deliverables |
|------|-----------|-----------------|
| **2** | **M0: Feature Complete MVP** | All existing features fully wired (tasks, subjects, settings, focus sync, voice stable) |
| **5** | **M1: Monetization Ready** | Recurring subscriptions ($0.99–$12.99/mo), annual plans, one-time upgrades, Stripe portal |
| **10** | **M2: Content Pipeline Live** | HS + undergrad + postgrad levels, content authoring, placement tests, 5+ populated degrees |
| **14** | **M3: Full Study Suite** | Notes, flashcards w/ spaced repetition, smart planner, weekly reports, reminders |
| **18** | **M4: Career Features** | Internship board, AI resume review, mock interviews, clinical logs |
| **22** | **M5: Launch Ready** | PWA/mobile, analytics, error monitoring, accessibility, beta tested with 50+ students |

---

## PART 5: RISK REGISTER

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Content creation bottleneck** | Delays Phase 2 | High | AI-generated first drafts + human review. Prioritize top 5 degrees. |
| **ElevenLabs cost at scale** | Burns budget | Medium | Implement usage caps per user tier. Cache common responses. Evaluate alternatives (OpenAI TTS). |
| **Stripe subscription complexity** | Payment bugs | Medium | Thorough webhook testing. Use Stripe Test Mode extensively. Stripe Customer Portal reduces custom UI. |
| **Scope creep (internship features)** | Delays launch | Medium | Phase 4 is modular — internship board can launch without interview prep. |
| **Single developer velocity** | Timeline slips | High | Prioritize Phases 0–2 (core value). Phases 3–5 can be parallel-tracked or deferred. |
| **No frontend tests** | Regression bugs | High | Phase 0 adds test foundation. CI/CD gate on test pass. |

---

## PART 6: QUICK WINS (Can Start Immediately)

1. **Complete Task Manager UI** — Backend is done, just needs frontend integration
2. **Complete User Settings** — Backend is done, just needs a form
3. **Move ElevenLabs agent ID to env var** — Single line change
4. **Sync Focus Timer to Supabase** — Tables exist, just needs API routes + frontend hook
5. **Add rate limiting** — `slowapi` middleware, one file change
6. **Restructure course pack prices** — Database update + Stripe product update script

---

## PART 7: TECHNOLOGY DECISIONS NEEDED

| Decision | Options | Recommendation |
|----------|---------|----------------|
| **Rich text editor (Notes)** | TipTap, Lexical, Slate | TipTap — best React integration, extensible, active community |
| **Spaced repetition algorithm** | SM-2, FSRS, Anki-style | SM-2 — well-documented, simple, proven |
| **Mobile distribution** | PWA only, Capacitor (iOS/Android), React Native rewrite | PWA + Capacitor — reuse existing React code, native store listing |
| **Notification service** | Supabase Edge Functions, Firebase Cloud Messaging, OneSignal | OneSignal (free tier) for push + Supabase for in-app |
| **Analytics** | Mixpanel, PostHog, Amplitude | PostHog — open source, self-hostable, generous free tier |
| **Internship data source** | Manual curation, API integration (LinkedIn, Indeed, Handshake) | Start manual + partner with university career services |
| **Content generation** | Manual authoring, AI-generated, hybrid | Hybrid — AI drafts + human QA (fastest to populate catalog) |
