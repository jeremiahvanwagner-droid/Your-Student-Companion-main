# Master Timeline — The Seven Advancements

**Baseline:** main @ `ee49139`, 2026-07-13. Launch target ~2026-08-20 per [CURRENT_STATE.md:15](../../CURRENT_STATE.md) (≈5½ weeks out).
This sequences the Seven into that window; it is the execution slice of [market-thirteen.md](../strategy/market-thirteen.md) (mapping noted per row).

## Dependency order

| Advancement | Depends on | Blocks | Market-13 # |
|---|---|---|---|
| A2 Migrations + advisors | — (do first, ½ day) | A1's schema correctness, A6's migration 010 process | #2 |
| A1 Backend deploy | A2 (apply schema before pointing prod at it) | A4 stages 2–3, A6 scheduler | #1 |
| A3 Truth & legal pack | — (fully parallel) | A7 (manifest must be honest first), Play listing | #5 + honesty sweep |
| A4 Credential cutover + money-path QA | Stage 1: none · Stages 2–3: A1 | Beta go/no-go | #3 + #4 |
| A5 PostHog | — (fully parallel) | Beta measurement | #9 |
| A6 Resend email | A1 (scheduler endpoint), A2 (migration 010) | Beta onboarding sequence | #8 |
| A7 Performance + PWA | A3 (manifest truth) | Play Store TWA packaging | #6 + #10 |

**Critical path:** A2 → A1 → A4 → beta. Everything else parallelizes off it.

## Week-by-week

```
Week 1 (Jul 14–18)   █ A2 migrations (½ d)  ████ A1 backend deploy      ▒ A4-Stage1 Sentry vars (15 min, day 1)
                     ▒ A3 Part A honesty sweep (1 h — ship day 1, it's a liability)
Week 2 (Jul 21–25)   ████ A4 Stage 2 money-path QA (Test)   ██ A5 PostHog wire-up (parallel)
Week 3 (Jul 28–Aug 1) ████ A4 Stage 3 live cutover           ██ A3 Parts B+C legal pages + deletion
                     ▒ AI token budgets (honorable mention #8 — 1 d, slots here)
Week 4 (Aug 4–8)     ████ A6 email layer                     ██ A7 code-split + headers
Week 5 (Aug 11–15)   ████ A7 service worker + icons + Lighthouse CI     ▒ beta cohort recruiting (uses A6 emails)
Week 6 (Aug 18→)     Beta cycle begins on the market-thirteen #13 plan — go/no-go gates below
```

## Parallelization map (if two work streams are available)

- **Stream 1 (infrastructure):** A2 → A1 → A4(2,3) → A6
- **Stream 2 (product surface):** A3-A → A3-B/C → A5 → A7
- Single-operator fallback: interleave as ordered in the week-by-week; nothing in Stream 2 blocks Stream 1.

## Do-immediately list (this week, independent of everything)

1. A3 Part A honesty sweep — 1 hour, removes live legal exposure.
2. A4 Stage 1 Sentry Vercel vars — 15 minutes, closes S-OBS-CLOSE-001 blockers.
3. A2 migrations — half a day.

## Gate into beta (all must hold — from market-thirteen #13 + scope §12)

- [ ] A1 DoD: prod health check + live dashboard stats
- [ ] A2 DoD: advisors clean + planner 201
- [ ] A3 DoD: honesty grep zero + legal pages live + deletion verified
- [ ] A4 DoD: §12 QA ticked + Live purchase/refund cycle clean
- [ ] A5 funnel rendering real data (beta measurement ready)
- [ ] Sentry error rate < 1% over 7 days; Better Stack uptime ≥ 99.5%

A6/A7 are strongly-wanted but not gating: beta can start with in-app-only reminders and the unsplit bundle if weeks 4–5 slip; Play Store packaging (market-thirteen #11) waits on A7 regardless.
