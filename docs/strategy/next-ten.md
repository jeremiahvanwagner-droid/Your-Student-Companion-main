# Next Ten — Executive Strategy

**Status:** Active
**Authored:** 2026-05-24
**Owner:** Jeremiah Van Wagner (Truth J Blue LLC)
**Companion doc:** [next-ten-implementation.md](next-ten-implementation.md)

> Ten prioritized initiatives covering production-readiness gates, active
> expansion, retention/acquisition layers, and scale enablers. Ordered by
> what to do first; implementation detail lives in the companion doc.

---

## Framing

YSC is mid-Step-7 (exams architecture done; catalog API live) on top of a
working subscription stack (Step 4 shipped, walkthrough remediation closed).
The next ten initiatives shift focus from "build features" to "build a
business" — closing production gaps, finishing the active revenue expansion,
adding retention surfaces, and putting operational and compliance scaffolding
in place before any user growth push.

---

## The Ten, by Tier

### Tier 1 — Production readiness gates (do before user growth)

| # | Initiative | Effort | KPI it moves |
|---|---|---|---|
| 1 | Production observability (Sentry + uptime + structured logs) | M | MTTR; silent-failure rate |
| 2 | Backend CI gate on PRs to `main` | S | Regression incidence |
| 3 | Manual QA pass of subscription flow (`STORE_WEBHOOK_RUNBOOK §12`) | M | Pre-launch defect catch rate |

### Tier 2 — Active expansion (already in motion)

| # | Initiative | Effort | KPI it moves |
|---|---|---|---|
| 4 | Complete Step 7 (Phases 7.3 → 7.8) — exams end-to-end | L (~3-4 wks) | Test-prep revenue (new product line) |
| 5 | Email infrastructure + Step 4.5 grandfather email | M | Existing-buyer churn / NPS |

### Tier 3 — Retention & acquisition

| # | Initiative | Effort | KPI it moves |
|---|---|---|---|
| 6 | Step 5 — Notes + manual flashcards (free-tier hook) | L (~1.5 wks) | DAU; trial conversion |
| 7 | Analytics + funnel instrumentation (PostHog recommended) | M | Decision quality on every later item |
| 8 | PWA shell + offline dictionary (or honesty fix on marketing claims) | L or S | 1★ review rate; bounce on slow networks |

### Tier 4 — Scale enablers

| # | Initiative | Effort | KPI it moves |
|---|---|---|---|
| 9 | Admin authoring UI for exams + course packs (Step 8 pulled forward) | L (~2 wks) | Content production throughput |
| 10 | COPPA + state privacy review for K-12 audience | S eng + counsel | Legal defensibility |

---

## Why this order

### Why Tier 1 first

You cannot responsibly take real subscription dollars at the live URL
without observability (#1) and a verified subscription flow (#3). The
backend CI gate (#2) is a 30-minute fix that prevents the next regression
from shipping silently — there's no reason to defer it.

### Why complete Step 7 before pivoting to new work

Step 7's schema + catalog API are already live in `ysc-staging`. Stopping
at Phase 7.2 strands sunk-cost work without the revenue surface that
justifies it. Phases 7.3 → 7.8 close the loop. The Step 7 finish line
is also the natural moment to pull the grandfather email forward (#5)
so existing buyers hear about new positioning from us before they discover
it on their own.

### Why retention before more acquisition

The current free-tier experience is thin (dictionary + focus timer +
rate-limited AI). Driving traffic to a thin free tier wastes the
acquisition. Notes + flashcards (#6) gives free users a daily-use surface;
analytics (#7) lets us see whether they actually engage with it; PWA (#8)
removes the credibility wound from the "Works Offline" marketing claim
that isn't currently true.

### Why scale enablers last

Admin authoring (#9) doesn't matter until there's enough content production
demand that engineers writing SQL becomes the bottleneck — that's after
Step 7's content team work in Phase 7.8 starts. COPPA review (#10) needs
to happen before a public K-12 launch but can run in parallel with the
engineering work above; its scope is largely determined by legal counsel
output, not engineering bandwidth.

---

## 12-Week Sequencing

Some items run in parallel. Sequencing assumes one focused engineering
thread (me, or me + you) plus your own time for QA, content, and
legal/decisions.

| Week | Engineering thread | Your thread |
|---|---|---|
| 1 | #2 backend CI (½ day) → #1 Sentry/observability | Engage privacy counsel (#10 prep); verify all Vercel envs |
| 2 | #1 finish (logs, uptime, runbook); start #5 email provider | #3 manual QA of subscriptions with me |
| 3 | #5 grandfather email send-ready; start #4 Phase 7.3 (attempts) | Send the grandfather email |
| 4 | #4 Phase 7.3 attempts + scoring engine | Review #10 counsel output |
| 5 | #4 Phase 7.4 ExamList/Detail UI + #7 PostHog wire-up (parallel) | Make COPPA scope call |
| 6 | #4 Phase 7.5 AttemptRunner + Review | Content team starts on SHSAT/HSPT items |
| 7 | #4 Phase 7.6 monetization wiring | — |
| 8 | #4 Phase 7.7 history + composite scoring | — |
| 9 | #9 admin authoring UI for exams | Smoke test admin UI with one writer |
| 10 | #6 Step 5 notes/flashcards UI + API | — |
| 11 | #6 finish; #8 PWA shell OR marketing-copy honesty pass | Beta-cohort recruiting |
| 12 | Polish, beta launch readiness review (Step 12) | Step 12 beta cohort onboarded |

---

## Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Grandfather email delay causes existing buyers to perceive bait-and-switch | High | Medium | Item #5 in week 3 — non-negotiable. |
| R2 | Production breaks silently between users finding it and us | High | Very high | Item #1 in weeks 1-2 — non-negotiable. |
| R3 | COPPA exposure if K-12 launch ships before privacy review | Medium | Very high | Item #10 starts week 1 (counsel engagement); scope decided week 5. |
| R4 | Marketing claims (offline, 50k+ students, 1.2M+ searches) drive 1★ reviews | Medium | Medium | Item #8 (honesty fix path is 10 min) ships earlier if PWA delays. |
| R5 | Content sourcing for Step 7.8 stalls and launch misses | Medium | High | Public-domain exams (Regents, STAAR, CAASPP, PERT) ship first; originals later. |
| R6 | PostHog or chosen analytics provider lock-in | Low | Low | Event-naming convention is provider-agnostic; data exportable. |
| R7 | Sentry/observability adds latency under high load | Low | Low | Async transport, sample rate < 1.0 in prod; can disable per-endpoint. |

---

## Out of scope for this cycle

- **Native mobile apps (iOS/Android)** — PWA in #8 gets you ~60% of the
  value at ~10% of the cost. Revisit native after beta cohort feedback.
- **Step 6 (Team Messaging Board)** — listed in the 12-step plan but its
  product purpose is unclear given the test-prep + dictionary positioning.
  Worth an explicit "do we actually need this?" decision before scoping.
- **SEO / content marketing strategy** — separate from product engineering;
  needs a marketing decision before any engineering wiring.
- **Customer support tooling (Intercom, Zendesk)** — early users can be
  supported via email; tooling decision at >100 paying users.

---

## Decisions needed before week 1

These three decisions gate the start of execution. Defaults shown in bold
are my recommendations.

1. **Sentry plan:** **Sentry Team ($26/mo)** vs Self-hosted vs Open-source
   alternative (GlitchTip). Recommend hosted Team for time-to-value;
   migrate to self-hosted only if cost becomes material at scale.
2. **Email provider:** **Resend** vs Postmark vs SES. Recommend Resend
   for React Email integration, simple onboarding, and good free tier.
3. **Analytics provider:** **PostHog (cloud)** vs Mixpanel vs GA4-only.
   Recommend PostHog cloud — bundles product analytics, session replay,
   feature flags. Open-source upgrade path if cost matters later.

---

## Companion doc

Detailed execution brief — sub-tasks per item, file-level scope,
acceptance criteria, rollback plans — lives in
[next-ten-implementation.md](next-ten-implementation.md).
