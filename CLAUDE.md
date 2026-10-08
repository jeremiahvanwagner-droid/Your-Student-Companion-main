# Repo rules for Claude sessions

## Database — standing rule (Phase 0R, 2026-10-06)

**No DDL reaches any Supabase project except via a file in `supabase/migrations/`
applied by `supabase db push` from a merged PR.** MCP `apply_migration`, MCP
`execute_sql` carrying DDL, the dashboard SQL Editor and the Studio table editors are
banned for schema changes. The one sanctioned manual write is the first-admin grant
(DML) documented in `docs/runbooks/database.md` §4. Read `docs/runbooks/database.md`
§0–§2 before touching the schema; the July 2026 project deletion
(`docs/runbooks/incidents/2026-07-supabase-project-deletion.md`) is why.

- Schema truth: `supabase/migrations/20261006000000_baseline.sql` + the seed migrations.
  `docs/archive/legacy-migrations/` is history — never apply it.
- Identity: Clerk only (decision D2). RLS is enabled on every table with **no policies**;
  only `service_role` is granted. Never add an `anon`/`authenticated` policy or grant.
- A migration that adds or drops a table must also update `EXPECTED_TABLE_COUNT` in
  `.github/workflows/ci.yml` and `EXPECTED_TABLE_COLUMNS` in
  `backend/scripts/audit_supabase_schema.py` in the same PR.

## Secrets

- Never print the value of anything in `.env`, `.env.local` or `backend/.env`; names only.
- No secret may carry the `REACT_APP_` prefix (`scripts/check-env.js` hard-fails on it).
- Every secret has a row in `docs/runbooks/secret-inventory.md`; add the row first.

## Status of record

`CURRENT_STATE.md` (append-only audit table) + code + `supabase/migrations/` win over any
other document (decision D8). `REGGIE-STATE.md` belongs to another project; never edit it.
