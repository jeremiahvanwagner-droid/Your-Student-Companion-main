# Postmortem — Supabase project `uvyvvaxufmylqavewvex` ("ysc-staging") deleted, July 2026

| | |
|---|---|
| **Status** | Open — root cause unknown; corrective actions in flight (Phase 0R) |
| **Severity** | Sev-2 by impact (no production users; dev/test data only) · **Sev-1 by process** (the only database, unrecoverable, undetected for 70 days) |
| **Detected** | 2026-10-06, during the scope-v2 / database research session |
| **Window** | deleted between 2026-07-22 (last seen `ACTIVE_HEALTHY`) and 2026-07-28 (first listing without it) |
| **Author** | Claude (plan §3.7); owner review required |
| **CURRENT_STATE** | `S-INCIDENT-DB-001` |
| **Related** | [`docs/runbooks/database.md`](../database.md) · [`docs/runbooks/secret-inventory.md`](../secret-inventory.md) · plan *Scope v2 + Database Rebuild* §1, §3 |

## 1. Summary

The project's only Supabase project — `uvyvvaxufmylqavewvex`, named **ysc-staging** but
serving as the de-facto production database, region us-east-1 — was deleted outright some
time between 2026-07-22 and 2026-07-28. The org is on the Pro plan, so this was not a
free-tier auto-pause; Supabase deleted projects cannot be restored. Nothing noticed: the
backend had never been deployed, every health check was static, no backup job existed,
and no monitor touched the database. The loss was discovered 70 days later on 2026-10-06
when an MCP `list_projects` call returned no project at all.

The data was dev/test only. The **schema was not recoverable from the repository**: the
subscription tables, the Stripe webhook idempotency ledger, the seven exam tables and the
security-advisor hardening had been applied exclusively through the Supabase MCP
(`apply_migration`) and never committed to `supabase/migrations/`.

## 2. Timeline (all dates 2026, from saved transcripts, git history, `CURRENT_STATE.md`, and Claude memory)

| Date | Event | Source |
|---|---|---|
| 02-16 | `src/lib/supabase.js` last touched; frontend never gains a Supabase importer | `git log` |
| 05-22 | Project seeded via MCP `apply_migration`: 4 academic levels, 14 degree plans, 56 packs; three migrations registered (`seed_academic_levels_and_degree_plans`, `seed_course_packs_matrix`, `harden_security_advisors`). The pre-existing schema DDL (`backend/migrations/003`, `004`) was **never registered** as a migration. Memory note already warned: *"Future Step 2/3 should write a single baseline migration capturing current shape for fresh environments."* | memory `project_db_baseline.md` |
| 05-24 | Step 4 subscriptions shipped (commit `116a6ae`): `subscription_v1_schema` and the `stripe_webhook_events` ledger applied **via MCP only**; the commit body is now the only record of the column list | `git show 116a6ae`, memory `project_step4_subscriptions.md` |
| 05-24 | CI gate closed with required checks `build` + `backend-test`; **no job ever touched a database** | `CURRENT_STATE.md` `S-CI-CLOSE-001` |
| 06-10 → 07-13 | Exams schema (7 tables, per `docs/phases/step-7-exams.md`), planner/reminders/SM-2 migrations `007`–`009` applied to the project by hand (`S-MIGRATE-001`, 07-13) | `docs/runbooks/backend-deploy.md` §0 |
| 07-13 | Project paused at a "clean stopping point" (`S-PAUSE-001`); critical path declared "dashboard-only" | `CURRENT_STATE.md` |
| 07-21 | PR #16 merged (Play Store packaging) — last code activity before the window | `git log` |
| **07-22** | **Project last listed `ACTIVE_HEALTHY`** in a Supabase project listing | saved transcript |
| **07-28** | **Project absent** from the first listing after 07-22, and from every listing since | saved transcript |
| 09-15 | Two branches merged to `main`; nobody ran anything against the database | `git log` |
| **10-06** | Discovery: `list_projects` empty; org confirmed Pro (no auto-pause); deletion confirmed unrecoverable. Decisions D1/D2/D5/D6 taken the same day; Phase 0R opened; this document written | plan §1–§3 |

Detection gap: **70 days** (07-28 → 10-06); 76 days from the last confirmed-healthy listing.

## 3. Impact

| Area | Impact |
|---|---|
| Data | All rows lost. Only dev/test data existed: the backend was never deployed and production still pointed at `localhost:8000`. **No user data, no payments, no PII** were lost. |
| Schema | Partially unrecoverable from the repo. Column *names* are evidenced by code and docs; the constraints, defaults, CHECK lists, and the ledger's full column set were design decisions that lived only in the MCP transcripts. They are being **re-decided** and recorded as such in the baseline migration header (plan §3.2). |
| Stripe | The Test-mode webhook destination pointed at `https://uvyvvaxufmylqavewvex.supabase.co/functions/v1/stripe-webhook` — now a dead host. Stripe has been retrying into the void since the deletion. The Edge function's secrets died with the project. 56 Test products/prices and the subscription prices still exist in Stripe but their `metadata.course_pack_id` values reference ids that no longer exist. |
| Credentials | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `STRIPE_WEBHOOK_SECRET` in `backend/.env` are dead. A service-role key under `REACT_APP_SUPABASE_SERVICE_ROLE_KEY` in `.env.local` was found **inlined into a local `build/`** from 07-13 — a separate defect (plan §4-8) surfaced by this investigation. |
| Schedule | Phase 0R (two weeks) inserted ahead of every other workstream; the July "dashboard-only critical path" was wrong — the database has to be rebuilt first. |

## 4. Root cause

**Unknown.** What is established:

- The project was **deleted**, not paused (Pro org; deleted projects disappear from the
  listing, paused ones remain with status `INACTIVE`).
- **No MCP call** that could delete a project (`pause_project`, `delete_*`, or any
  management mutation) appears in any saved Claude transcript for the window or before it.
- The deletion therefore most likely happened in the **Supabase dashboard** (Project
  Settings → General → Delete project, which requires typing the project name), by someone
  holding the owner's account — the owner themself, a shared session, or a compromised
  credential. The owner does not recall deleting it.
- The name **"ysc-staging"** made the project look disposable; "staging" is exactly the
  kind of project one deletes during cleanup.

Until the org audit log or Supabase support answers §7 Q1, this stays "unknown, dashboard
deletion most likely".

## 5. Contributing factors

1. **MCP-only DDL, never committed.** From 05-22 on, schema changes were applied with
   `apply_migration` and considered "done" when the MCP returned success. The repo's
   `supabase/migrations/` directory did not exist. The memory note from 05-22 flagged the
   need for a baseline migration; it was never actioned.
2. **No backup job.** Supabase Pro's daily backups are deleted with the project; nothing
   copied data or schema anywhere else.
3. **Health checks never touched the database.** `GET /health` returned a static
   `{"status":"healthy"}`; Better Stack watched only the Vercel URL; CI had no DB job.
   A dead database was indistinguishable from a live one.
4. **One project used as both staging and production**, named as if it were neither.
5. **Long idle window.** The project was "paused" (process-wise) on 07-13 with no
   scheduled check-in; nobody looked at the database for 85 days.
6. **No key/secret inventory.** It was not written down which secrets would die with the
   project, so the blast radius (Stripe destination, Edge secrets) had to be rediscovered.
7. **Unregistered legacy DDL.** `backend/migrations/0001…009` existed in the repo but
   were never the thing actually applied (the live schema was a hybrid of 003 + 004 + MCP
   work), so even the files that did exist could not have rebuilt the project.

## 6. Corrective actions (= Phase 0R, plan §3)

| # | Action | Owner | Status |
|---|---|---|---|
| 1 | **Schema-as-code:** `supabase/migrations/20261006000000_baseline.sql` + four seed migrations; `backend/migrations/` archived under `docs/archive/legacy-migrations/` as "never apply" | Claude (PR-1) | in flight |
| 2 | **Standing rule — no DDL outside `supabase/migrations/`;** MCP `apply_migration` and the SQL Editor banned for schema (`database.md` §0, `CLAUDE.md`) | Claude | written |
| 3 | **CI proof:** `db-migrate` job on the real Supabase stack — `db reset` from scratch, audit through PostgREST, `db lint`, deny-all RLS + grant + table-count assertions; required status check | Claude (this PR) | written |
| 4 | **Nightly encrypted dumps:** `db-backup.yml` (roles/schema/data, `age`-encrypted, 90-day artifacts, Session-pooler URI) | Claude (this PR) · owner adds secrets | written / secrets pending |
| 5 | **Restore drill** now and quarterly, with RPO 24 h / RTO 4 h targets and a CURRENT_STATE row per drill (`database.md` §7–§8) | Owner + Claude | pending first backup |
| 6 | **DB-touching readiness probe** `GET /api/health/ready` (real `feature_flags` query, 2 s timeout) + Better Stack monitor with keyword `"db":"ok"` (plan §3.10) | Claude (PR-2) · owner for monitor | pending |
| 7 | **One project, honestly named:** `ysc-prod`, us-east-2, Pro; staging only as a persistent branch at Live cutover (D1); sign-ups disabled; MFA on the Supabase account | Owner | pending |
| 8 | **Secret inventory** (`secret-inventory.md`) with every credential's home and status; dead values retired; `REACT_APP_*` secret names hard-failed in `check-env.js` and grepped in CI | Claude (this PR) · owner retires values | written |
| 9 | **Kill the dead Stripe destination** and recreate it against Render with a fresh `whsec_`; relink Stripe objects by metadata (D4/D5) | Owner · Claude (`relink_stripe_catalog.py`) | pending |
| 10 | **Audit script hardening:** `--expect-project-ref` so a script can never be pointed at the wrong project silently; Windows env-collision check documented | Claude | in flight |

## 7. Open questions for the owner

1. **Who deleted the project, and why?** Check Supabase Dashboard → Organization →
   *Audit logs* (if the plan exposes them) for a `project.delete` event between 07-22 and
   07-28; failing that, open a Supabase support ticket quoting the ref
   `uvyvvaxufmylqavewvex` and ask for the deletion timestamp and actor.
2. Did Supabase send a **"project deleted"** e-mail to the account address in that window?
   Search the inbox for the ref and for "ysc-staging".
3. Was the account **shared or signed in on another device** at the time (browser
   sessions, a shared password-manager entry)? If there is any doubt: rotate the Supabase
   password, enable MFA, and revoke + re-create every personal access token and the MCP
   connector grant.
4. Was any **billing or organization change** made in late July (plan change, org rename,
   member removal) that could have cascaded?
5. Confirm the Supabase **Pro plan's 7-day backups** of the old project are indeed gone
   (they are deleted with the project) — so that nobody later spends time hunting for them.

Answers go in the `S-INCIDENT-DB-001` row's Reference column; if Q1 is answered, update §4
of this document and change **Status** to *Closed*.

## 8. What went well

- Nothing of value was lost: no users, no payments, no PII.
- The code, docs, commit bodies, test fixtures and Claude memory together preserved
  enough evidence to re-derive every column name; only constraints had to be re-decided.
- The discovery session converted the incident into a full rebuild plan with locked
  decisions on the same day.
