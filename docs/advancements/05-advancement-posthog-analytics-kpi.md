# Advancement 5 — PostHog Analytics & KPI Instrumentation

- **File Evidence:**
  - `backend/.env` contains `POSTHOG_PROJECT_ID`, `REACT_APP_POSTHOG_PROJECT_TOKEN`, `REACT_APP_POSTHOG_PROJECT_ID` (key names verified 2026-07-13) — **credentials provisioned, zero code**.
  - [CURRENT_STATE.md:33](../../CURRENT_STATE.md) — "PostHog: Account enrolled 2026-05-24. Code wiring … not yet started in any branch." Confirmed: no `posthog` match in [package.json](../../package.json) or `src/`.
  - Scope §14 — KPIs the beta must measure: onboarding completion ≥ 70%, W1 retention ≥ 40%, WAU/total ≥ 35% — **currently unmeasurable**.
  - [src/lib/sentry.js:92](../../src/lib/sentry.js) — the `scrubPII` pattern to mirror (no email, Clerk id only).
- **Current State:** No product analytics of any kind. The 14-day beta cycle (scope §12) would produce anecdotes, not decisions.
- **Proposed Enhancement:** `posthog-js` initialized beside Sentry with identical PII discipline; autocapture OFF; ~12 explicit events; activation funnel + retention dashboard; runbook.
- **Impact / Effort:** 8/10 · 2/10
- **Risk Eliminated:** Launching the beta blind — no way to detect onboarding drop-off, feature deadweight, or churn signals until it's too late to fix inside the cycle.
- **Mission Advancement:** The KPI tree in scope §14 becomes observable; go/no-go gate (market-thirteen #13) gets real numbers.
- **Unlocks:** Data-driven beta triage, retention experiments for Advancement 6's emails (open → return-visit attribution), pricing-page funnel analysis.

---

## Implementation Brief

### Files to Create/Modify/Delete

| Action | Path |
|---|---|
| Modify | `package.json` (add `posthog-js`) |
| Create | `src/lib/analytics.js` |
| Modify | `src/index.js` (init beside Sentry) |
| Modify | `src/components/AppAccessGuard.jsx` (identify on auth), `src/components/Gatekeeper.jsx` (reset on sign-out) |
| Modify | instrumented components: `src/pages/OnboardingFlow.jsx`, `TaskManager.jsx`, `src/components/FocusMode.jsx`, `src/pages/NotesPad.jsx`, `StudyPlanner.jsx`, `src/components/TheMentor.jsx`, `WeeklyReport.jsx`, `src/components/subscribe/SubscriptionPlans.jsx` |
| Modify | `.env.example` (+`REACT_APP_POSTHOG_KEY`, `REACT_APP_POSTHOG_HOST`) |
| Create | `docs/runbooks/analytics.md` |
| Create | `src/__tests__/analytics.test.js` |
| Dashboard | Vercel env vars; PostHog funnel + retention dashboards |

### Step-by-Step Instructions

1. `npm install posthog-js --legacy-peer-deps`
2. **Create `src/lib/analytics.js`** — thin wrapper so every call site survives a missing key:
   ```js
   import posthog from "posthog-js";

   const KEY = process.env.REACT_APP_POSTHOG_KEY;
   const HOST = process.env.REACT_APP_POSTHOG_HOST || "https://us.i.posthog.com";
   let ready = false;

   export function initAnalytics() {
     if (!KEY || ready) return;
     posthog.init(KEY, {
       api_host: HOST,
       autocapture: false,
       capture_pageview: false,
       respect_dnt: true,
       persistence: "localStorage",
     });
     ready = true;
   }

   export function track(event, properties = {}) {
     if (!ready) return;
     posthog.capture(event, properties); // never pass email/name — Clerk id only via identify
   }

   export function identifyUser(clerkUserId) { if (ready && clerkUserId) posthog.identify(clerkUserId); }
   export function resetAnalytics() { if (ready) posthog.reset(); }
   ```
3. **Init in `src/index.js`** right after `initSentry()`. **Identify** in `AppAccessGuard.jsx` where the Sentry user is already stamped; **reset** in `Gatekeeper.jsx` beside the Sentry clear + localStorage cleanup.
4. **Instrument the explicit event set** (names locked in [market-thirteen.md §9](../strategy/market-thirteen.md)): `signup`, `onboarding_step_n` (property `step`), `onboarding_complete`, `task_create`, `focus_complete` (property `minutes`), `note_create`, `card_review` (property `rating`), `block_create`, `mentor_message`, `checkout_start`, `checkout_success`, `report_view`. Each is one `track(...)` line at the existing success paths (e.g. after the API resolve in `TaskManager`'s create handler).
5. **Env plumbing:** harvest the token already sitting in `backend/.env` (`REACT_APP_POSTHOG_PROJECT_TOKEN`) into `.env.local` as `REACT_APP_POSTHOG_KEY`; add both vars to `.env.example` and Vercel (Production + Preview). Add a soft warn to `scripts/check-env.js` (same pattern as the Sentry soft check).
6. **Dashboards:** activation funnel (`signup → onboarding_complete → task_create → focus_complete`), retention (weekly, on any tracked event), checkout funnel. Screenshot-document in `docs/runbooks/analytics.md` with the PII guarantees and the kill switch (delete the Vercel var → wrapper no-ops).
7. **Tests:** wrapper no-ops without key; `track` includes no email-like property values (mirror the `scrubPII` test style in [src/__tests__/sentry.test.js](../../src/__tests__/sentry.test.js)).
8. **Disclosure:** add PostHog to the processors list in the Privacy Policy (Advancement 3).

### Verification Checklist

- [ ] Staging session: complete onboarding → all `onboarding_step_n` + `onboarding_complete` events visible in PostHog within 60 s
- [ ] Inspect three captured events raw: Clerk id only, no email/name/IP-derived person props beyond defaults
- [ ] DNT-enabled browser produces zero events
- [ ] Build without `REACT_APP_POSTHOG_KEY` renders and consoles clean (wrapper no-op)
- [ ] Funnel + retention dashboards render real staging data
- [ ] `npm run test:coverage` green

### Rollback Procedure

Delete `REACT_APP_POSTHOG_KEY` from Vercel and redeploy — the wrapper no-ops everywhere (same emergency-disable model as Sentry). Full removal: revert the commit; no schema or data dependencies.

### Definition of Done

**The activation funnel in PostHog shows at least one complete `signup → onboarding_complete → task_create → focus_complete` pass from staging AND a raw-event inspection shows zero PII properties.**
