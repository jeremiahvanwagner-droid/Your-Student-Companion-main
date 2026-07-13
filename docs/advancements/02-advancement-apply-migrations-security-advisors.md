# Advancement 2 — Apply Migrations 007–009 + Close Supabase Security Advisors

- **File Evidence:**
  - [CURRENT_STATE.md:19](../../CURRENT_STATE.md) — "Blocking issue: Migrations `backend/migrations/007_planner_blocks.sql`, `008_private_is_admin.sql`, and `009_reminders_reference_and_sm2.sql` must be applied to `ysc-staging` before the planner/reminders endpoints and SM-2 reviews work in any deployed env."
  - [backend/migrations/007_planner_blocks.sql](../../backend/migrations/007_planner_blocks.sql) — creates the `planner_blocks` table every `/api/planner/*` endpoint queries.
  - [backend/migrations/008_private_is_admin.sql](../../backend/migrations/008_private_is_admin.sql) — moves `is_admin()` out of the PostgREST-exposed `public` schema (Supabase lint 0029, flagged since 2026-05-24, [CURRENT_STATE.md:155](../../CURRENT_STATE.md) row S-ADVISOR-001).
  - [backend/migrations/009_reminders_reference_and_sm2.sql](../../backend/migrations/009_reminders_reference_and_sm2.sql) — adds `reminders.reference_id` + unique index (idempotent reminder sync) and `review_cards.ease_factor`/`interval_days` (SM-2).
  - [CURRENT_STATE.md:73](../../CURRENT_STATE.md) — leaked-password protection still OFF (dashboard toggle).
- **Current State:** Three shipped feature sets (Study Planner, in-app reminders, SM-2 review) are green in tests but **500 against the live database** because their tables/columns don't exist there. One security advisor warning has had an authored fix sitting unapplied since June.
- **Proposed Enhancement:** Apply 007 → 008 → 009 in order against `ysc-staging` (project `uvyvvaxufmylqavewvex`), flip leaked-password protection ON, re-run security advisors to zero warnings, and record the audit row in CURRENT_STATE.md.
- **Impact / Effort:** 9/10 · 1/10 — half a day, highest ratio on the board.
- **Risk Eliminated:** Deploying Advancement 1 onto a schema that 500s three modules; `is_admin()` publicly callable via `/rest/v1/rpc`; credential-stuffing signups with breached passwords.
- **Mission Advancement:** Modules D (planner), F (SM-2 review), I (reminders) become real for users the moment the backend deploys.
- **Unlocks:** Advancement 1 ships against a correct schema; advisor-clean posture required before beta (scope §11 "Permission/RLS tests").

---

## Implementation Brief

### Files to Create/Modify/Delete

| Action | Path |
|---|---|
| Apply (no edit) | `backend/migrations/007_planner_blocks.sql` → `ysc-staging` |
| Apply (no edit) | `backend/migrations/008_private_is_admin.sql` → `ysc-staging` |
| Apply (no edit) | `backend/migrations/009_reminders_reference_and_sm2.sql` → `ysc-staging` |
| Modify | `CURRENT_STATE.md` (clear blocking issue, append audit rows) |
| Dashboard | Supabase Auth → enable leaked-password protection |

### Step-by-Step Instructions

1. **Snapshot first.** Supabase dashboard → Database → Backups → confirm a recent backup exists (or trigger one) before applying anything.
2. **Apply in order via Supabase MCP or CLI.** MCP: `apply_migration` with the file contents, names `planner_blocks_v1`, `private_is_admin_v1`, `reminders_reference_and_sm2_v1`. CLI equivalent:
   ```bash
   npx supabase db push   # if migrations are registered
   # or apply each file directly:
   npx supabase db execute --project-ref uvyvvaxufmylqavewvex -f backend/migrations/007_planner_blocks.sql
   npx supabase db execute --project-ref uvyvvaxufmylqavewvex -f backend/migrations/008_private_is_admin.sql
   npx supabase db execute --project-ref uvyvvaxufmylqavewvex -f backend/migrations/009_reminders_reference_and_sm2.sql
   ```
   Note: previous sessions were **permission-gated** here twice ([CURRENT_STATE.md:19](../../CURRENT_STATE.md)) — if MCP apply fails on permissions again, run the SQL in the Supabase dashboard SQL editor instead; it executes as the owning role.
3. **Order matters:** 008 references policies that must still resolve `is_admin()` by OID — apply exactly 007 → 008 → 009; never interleave.
4. **Flip the dashboard toggle:** Supabase → Authentication → Providers → Passwords → enable "Leaked password protection".
5. **Re-run advisors:** MCP `get_advisors` (type: security) → expect zero WARN rows (the two pre-existing warnings were `is_admin()` exposure and leaked-password protection — both now closed).
6. **Live verification with a real user (staging):** create a planner block, run `POST /api/reminders/sync`, review a flashcard with rating "good" and confirm `ease_factor` persists.
7. **Bookkeeping:** update [CURRENT_STATE.md](../../CURRENT_STATE.md) — remove the blocking-issue line, append audit rows (e.g. `S-MIGRATE-001 … APPLIED 007/008/009 to ysc-staging`, `S-ADVISOR-002 … advisors clean`).

### Verification Checklist

- [ ] `select * from information_schema.tables where table_name = 'planner_blocks'` → 1 row
- [ ] `select proname, pronamespace::regnamespace from pg_proc where proname = 'is_admin'` → `app_private`
- [ ] `select column_name from information_schema.columns where table_name = 'review_cards' and column_name in ('ease_factor','interval_days')` → 2 rows
- [ ] `get_advisors(security)` → zero warnings
- [ ] `POST /api/planner/blocks` (staging user) → 201; `POST /api/reminders/sync` → 200 with created payloads; card review rating persists SM-2 fields
- [ ] Backend test suite still green (`python -m pytest backend/tests/ -v`)

### Rollback Procedure

Run in reverse order (dashboard SQL editor):

```sql
-- undo 009
DROP INDEX IF EXISTS reminders_user_type_reference_uidx;
ALTER TABLE reminders DROP COLUMN IF EXISTS reference_id;
ALTER TABLE review_cards DROP COLUMN IF EXISTS ease_factor, DROP COLUMN IF EXISTS interval_days;

-- undo 008
ALTER FUNCTION app_private.is_admin() SET SCHEMA public;

-- undo 007
DROP TABLE IF EXISTS planner_blocks CASCADE;
```

(Adjust the 009 index name to the exact name used in the migration file before running.) Leaked-password protection: toggle back OFF in the dashboard. No app code changes are part of this advancement, so no code rollback exists.

### Definition of Done

**`get_advisors(security)` on `ysc-staging` returns zero warnings AND `POST /api/planner/blocks` returns 201 for an authenticated staging user.**
