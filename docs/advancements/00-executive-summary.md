# The Seven Advancements — Executive Summary

**Date:** 2026-07-13 · **Owner:** Jeremiah Van Wagner
**Derived from:** full-repo reconnaissance on 2026-07-13 (main @ `ee49139`), [CURRENT_STATE.md](../../CURRENT_STATE.md), [docs/strategy/market-thirteen.md](../strategy/market-thirteen.md), and the original full-scope outline (Modules A–J, KPI tree §14, legal requirements §8).

## The one-sentence diagnosis

The product is feature-complete for MVP (tasks, planner, focus, notes/SM-2, mentor, reminders, store, subscriptions — 156 backend + 96 frontend tests green), but **the production frontend at ysc.growthbychoice.com points at a backend that does not exist anywhere**, three authored migrations are unapplied, and the public marketing copy makes claims the product doesn't honor.

## The Seven, ranked

| # | Advancement | Impact | Effort | Gates launch? | Brief |
|---|---|---|---|---|---|
| 1 | Deploy the FastAPI backend to production (+ dependency slim-down) | 10/10 | 4/10 | **YES** | [01](01-advancement-backend-production-deploy.md) |
| 2 | Apply migrations 007–009 + close Supabase security advisors | 9/10 | 1/10 | **YES** | [02](02-advancement-apply-migrations-security-advisors.md) |
| 3 | Truth & legal pack: honesty sweep + /privacy + /terms + account deletion | 9/10 | 3/10 | **YES** (also gates Play Store) | [03](03-advancement-truth-and-legal-pack.md) |
| 4 | Production credential cutover + money-path QA (Clerk/Stripe/Sentry) | 9/10 | 4/10 | **YES** | [04](04-advancement-credential-cutover-money-path-qa.md) |
| 5 | PostHog analytics & KPI instrumentation | 8/10 | 2/10 | Should | [05](05-advancement-posthog-analytics-kpi.md) |
| 6 | Email layer via Resend: weekly reset + onboarding sequence | 7/10 | 4/10 | Should | [06](06-advancement-resend-email-layer.md) |
| 7 | Frontend performance + honest PWA shell (code-split, service worker) | 7/10 | 5/10 | YES for Play Store | [07](07-advancement-frontend-performance-pwa-shell.md) |

**Honorable mention (#8, do during week 3):** per-user daily AI token budgets in `backend/routes/ai_mentor.py` — today the only spend control is a 10/min rate limit ([ai_mentor.py:369](../../backend/routes/ai_mentor.py)); `ai_interactions.tokens_used` is already persisted, so the budget query is cheap. Tracked in the risk register.

## Why this order

1. **#1 is structural**: every API client in `src/lib/*.js` resolves to `http://localhost:8000` in production ([apiClient.js:1](../../src/lib/apiClient.js)). Nothing downstream (QA, email scheduler, uptime monitor) can proceed without it.
2. **#2 is a half-day** that unblocks planner/reminders/SM-2 against the live DB and closes a standing security advisor — highest ratio on the board.
3. **#3 removes legal/reputational exposure** that compounds every day the site is public: fabricated "50,000+ students", false "offline dictionary" and "no subscription required" claims, and no privacy policy while collecting minors' study data.
4. **#4 turns test-mode scaffolding into a business** — the subscription flow has never been manually QA'd.
5. **#5–#7 are the growth loop**: measure (PostHog), retain (email), distribute (PWA → Play Store TWA).

## Dependency spine

```
#2 ─┐
    ├─→ #1 ─→ #4 ─→ beta launch (scope §12)
#3 ─┘         ↑
#5 ──────────┘ (parallel)     #6 needs #1      #7 needs #3's manifest truth-up
```

Full sequencing in [08-master-timeline.md](08-master-timeline.md); risks in [09-risk-register.md](09-risk-register.md); KPIs in [10-success-metrics.md](10-success-metrics.md).
