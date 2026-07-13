# Success Metrics — Proving Full Implementation

Two layers: **completion metrics** (binary — is each advancement actually done) and **outcome KPIs** (does the launch behave the way the scope demands).

## Layer 1 — Completion metrics (binary, one per advancement)

| # | Advancement | Metric | Measured by |
|---|---|---|---|
| 1 | Backend deploy | `/api/health` 200 in prod AND dashboard renders live task stats for a signed-in user | curl + manual prod session; Better Stack green 24 h |
| 2 | Migrations + advisors | `get_advisors(security)` = 0 warnings AND `POST /api/planner/blocks` = 201 on staging | Supabase MCP + authed API call |
| 3 | Truth & legal | Honesty grep = 0 matches AND `/privacy` + `/terms` = 200 in prod AND staging deletion completes end-to-end | `grep -riE "offline dictionary|no subscription required|50,000" src/ public/`; curl; staged deletion run |
| 4 | Cutover + money-path QA | §12 checklist 100% ticked with evidence AND Live purchase→entitlement→refund cycle with exactly-once ledger rows | GitHub issue artifact + Stripe dashboard + `stripe_webhook_events` query |
| 5 | PostHog | One complete activation-funnel pass visible AND raw-event PII inspection clean | PostHog funnel view + raw event JSON |
| 6 | Resend email | Cron-delivered weekly reset lands in the Sunday-evening local window AND opt-out suppresses the next send | Test inbox timestamps across two Sundays |
| 7 | Performance + PWA | Lighthouse mobile: PWA installable pass AND performance ≥ 85 AND main chunk < 250 KB gzip | Lighthouse CI artifact + build report |

**The Seven are "fully implemented" when all seven rows are true simultaneously on `main`.**

## Layer 2 — Outcome KPIs (from scope §14, measurable once A5 ships)

| KPI | Target | Instrument |
|---|---|---|
| Onboarding completion rate | ≥ 70% | PostHog funnel `signup → onboarding_complete` |
| Week-1 retention | ≥ 40% | PostHog retention table (weekly, any event) |
| WAU / total users | ≥ 35% | PostHog insight |
| Assignment completion uplift (self-reported) | ≥ 20% | Beta feedback form (market-thirteen #13) |
| Weekly focus minutes per active user | trending ↑ | `focus_complete.minutes` events + `/api/reports` data |
| Weekly-reset email → next-day return visit | ≥ 15% (working hypothesis) | PostHog: `$pageview` within 24 h of send window, cohort vs. non-recipients |

## Operational KPIs (scope §14 + go/no-go gate)

| KPI | Target | Instrument |
|---|---|---|
| Sentry error rate (prod, 7-day) | < 1% of sessions | Sentry dashboard |
| Uptime (frontend + `/api/health`) | ≥ 99.5% over the beta window | Better Stack |
| Deployment frequency | weekly+ | GitHub merges to main |
| Critical bug resolution | < 48 h | issue timestamps |
| AI spend per active user per week | < $0.15 (watch item until budgets ship) | `ai_interactions.tokens_used` rollup query |

## Reporting cadence

- Completion metrics: tick in this file's Layer-1 table via PR when each DoD lands (with the closing SHA, same discipline as CURRENT_STATE.md).
- Outcome KPIs: weekly screenshot into the beta issue starting the first Monday after A5 ships; the go/no-go review (market-thirteen #13) cites this file.
