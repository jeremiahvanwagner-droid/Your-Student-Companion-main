# Risk Register — The Seven Advancements

Top risk per advancement, plus two cross-cutting risks. Severity = impact × likelihood, High/Med/Low.

| # | Advancement | Top risk | Severity | Mitigation |
|---|---|---|---|---|
| 1 | Backend deploy | **Dependency prune breaks a hidden import path** (e.g. a transitive use of `email-validator` via pydantic config) and prod 500s where tests don't reach | Med | Full pytest run against the pruned venv **before** the Docker build; `docker run` local smoke of `/api/` root + one authed route; Render rollback button restores the prior image in ~1 min |
| 2 | Migrations | **008 breaks an RLS policy reference** — a policy resolving `is_admin()` by name instead of OID starts failing closed, locking users out of their own rows | Med | S-ADVISOR-001 already verified all 23 policies reference by OID ([CURRENT_STATE.md:155](../../CURRENT_STATE.md)); still: apply on staging first, then run one authed CRUD per module before calling it done; reverse-SQL rollback documented in the brief |
| 3 | Truth & legal | **Rewriting SEO copy tanks the keyword rankings the site currently holds** ("offline dictionary" queries) | Low | Accept it — rankings earned on false claims are a liability, not an asset; keep truthful keyword-adjacent copy ("instant dictionary", "study planner"); watch Search Console for 4 weeks |
| 4 | Credential cutover | **Live Stripe webhook misconfiguration double-grants or fails to grant entitlements** for the first real customers | High | Stage 2 QA in Test first including the replay test; validate with `validate_supabase_webhook.py` against Live; $0.50 canary purchase before any marketing; `stripe_webhook_events` ledger gives exactly-once evidence |
| 5 | PostHog | **PII leaks into event properties** (an object spread pulling user email into `track()`), violating our own privacy policy | Med | Wrapper API takes explicit properties only (no spreads at call sites — enforce in review); raw-event inspection is in the DoD; same scrub discipline as Sentry, tested |
| 6 | Resend email | **Spam-foldering / domain-reputation damage from sending before SPF/DKIM/DMARC verify**, or a cron bug double-sending | Med | DNS verification is a hard precondition in the brief; idempotency stamps (`welcome_email_sent_at`, `last_weekly_email_at`) + upsert conflict-skip; hourly cron windowed per-timezone; kill switch = pause cron job |
| 7 | Performance + PWA | **Service worker caches a broken deploy** and users are stuck on it (the classic PWA trap) | High | `skipWaiting` + versioned precache + "refresh to update" toast; **kill-switch unregister deploy documented before first SW ships**; `NetworkFirst` on `/api/*` so data is never stale |
| 8* | AI token budgets (honorable mention) | **OpenAI spend spikes during beta** — only control today is 10 req/min per user ([ai_mentor.py:369](../../backend/routes/ai_mentor.py)); 50 students × heavy use is uncapped dollars | Med | 1-day fix in week 3: daily per-user budget from `ai_interactions.tokens_used` + OpenAI dashboard hard cap + 70% alert (market-thirteen #7) |

## Cross-cutting risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Solo-operator bus factor / context loss** — every credential and dashboard lives in one person's head; a lost laptop stalls the launch | High | Advancement 4's `docs/runbooks/secret-inventory.md` is the mitigation vehicle; keep CURRENT_STATE.md discipline (it saved this audit); password-manager vault for all dashboard logins |
| **Windows env-var collision** — User-scope `SUPABASE_*` vars silently override `backend/.env` in local Python runs (documented footgun), so "works locally" can mean "worked against the wrong project" | Med | Before any migration or Stripe script run: `python -c "import os; print(os.environ.get('SUPABASE_URL'))"` and confirm it matches the intended project; long-term: remove the User-scope vars |
| **Timeline compression** — 5½ weeks to the launch target with QA (A4) historically deferred | Med | The week-by-week in [08-master-timeline.md](08-master-timeline.md) front-loads the three do-immediately items; A6/A7 are explicitly declared non-gating so slippage doesn't cascade into the beta date |
