# Runbook — Database (Supabase, schema-as-code)

**Phase 0R / plan §3** (`Scope v2 + Database Rebuild Plan`, 2026-10-06). Written after the
July 2026 loss of the only Supabase project
([postmortem](incidents/2026-07-supabase-project-deletion.md)). Decisions this runbook
enforces: **D1** one project `ysc-prod` (us-east-2, Pro), **D2** Clerk-only identity with
deny-all RLS, **D3** id types, **D8** `supabase/migrations/` + code are the truth.

## 0. The standing rule

> **No DDL reaches any Supabase project except via a file in `supabase/migrations/`,
> applied by `supabase db push` from a merged PR.**

- **Banned for schema changes:** MCP `apply_migration`, MCP `execute_sql` carrying DDL,
  the dashboard SQL Editor, the Studio table/column editors, `supabase db push` from an
  unmerged branch.
- **Still allowed:** read-only MCP calls (`list_migrations`, `list_tables`,
  `get_advisors`, `execute_sql` with `SELECT`), and the single sanctioned manual DML in
  §4 (first admin grant), always followed by a `CURRENT_STATE.md` row.
- **Why:** every object that existed only through the MCP (subscription tables, the
  webhook ledger, 7 exam tables, the security hardening) died with the project and could
  not be rebuilt from the repo. If it is not in `supabase/migrations/`, it does not exist.

## 1. Layout

| Path | Role |
|---|---|
| `supabase/config.toml` | `project_id` = the `ysc-prod` ref, `[db] major_version = 17`, `[auth] enable_signup = false`. No `[functions.*]` blocks (D5: FastAPI is the only webhook). |
| `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql` | **The only source of schema.** Baseline `20261006000000_baseline.sql` + the four seed migrations (`_seed_catalog`, `_seed_subscription_plans`, `_seed_feature_flags`, `_seed_exams_regents_algebra_i`). Applied in filename order, everywhere. |
| `supabase/seed.sql` | **Local only.** Run by `supabase db reset` / first `supabase start`; never by `db push`. Holds the owner's Clerk test id as `role = 'admin'`. |
| `docs/archive/legacy-migrations/` | The old `backend/migrations/*.sql`. Historical; **never apply**. |
| `backend/scripts/audit_supabase_schema.py` | The verification oracle (columns, seed counts, project ref). Same script for local, CI and prod. |
| `.github/workflows/ci.yml` → job `db-migrate` | CI proof: fresh stack → `db reset` → audit → lint → RLS/grant/table-count assertions. |
| `.github/workflows/db-backup.yml` | Nightly encrypted dump (§6). |

## 2. Migration workflow

### 2.1 Author

```bash
npx supabase migration new <snake_case_name>     # creates supabase/migrations/<ts>_<name>.sql
```

Conventions for every migration file:

- One logical change per file; wrap in `begin; … commit;` unless it needs to be
  non-transactional (concurrent index) — say so in the header comment.
- Idempotent where it is cheap: `create table if not exists`, `create index if not exists`,
  `insert … on conflict (<natural key>) do update` for seeds, `drop … if exists`.
- A header comment that records **design decisions** (constraint lists, defaults, CHECK
  values) — column names are evidenced by code, constraints are choices.
- New table checklist: `alter table … enable row level security;` with **no policies**
  (D2); `set_updated_at` trigger if the table has `updated_at`; an index on every FK
  column (the performance advisor flags missing ones); explicit
  `grant all on table … to service_role;` even though default privileges cover it.
- Finish any migration that touches tables, columns, functions or grants with
  `notify pgrst, 'reload schema';`.
- Changing the number of tables? Update `EXPECTED_TABLE_COUNT` in
  `.github/workflows/ci.yml` and `EXPECTED_TABLE_COLUMNS` in the audit script **in the
  same PR**.

### 2.2 Prove locally (needs Docker)

```bash
npx supabase start -x studio,mailpit,edge-runtime,logflare,vector,imgproxy
npx supabase db reset                      # drops + re-applies every migration + seed.sql
eval "$(npx supabase status -o env)"       # exports API_URL, DB_URL, ANON_KEY, SERVICE_ROLE_KEY, …
SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  python backend/scripts/audit_supabase_schema.py --expect-project-ref local
npx supabase db lint --level warning --fail-on error
psql "$DB_URL" -c "select count(*) from pg_policies where schemaname = 'public'"   # must be 0
npx supabase stop --no-backup
```

The Windows dev machine has **no Docker** (2026-10-06). When that is the case, skip this
block and let CI be the proof — but read the SQL twice; CI is slower than a local reset.

### 2.3 Prove in CI

Open the PR. The `db-migrate` job must be green; it is a required status check on `main`
alongside `build` and `backend-test` (GitHub → Settings → Branches → `main`). Do not
merge on a red `db-migrate`, and do not "fix" it by loosening the assertions.

### 2.4 Apply to `ysc-prod` (after merge, from `main`)

```bash
git switch main && git pull
npx supabase login                                   # once per machine; personal access token
npx supabase link --project-ref "$SUPABASE_PROJECT_REF"   # prompts for the DB password (password manager)
npx supabase db push --dry-run                       # must list exactly the new file(s) and nothing else
npx supabase db push
```

If `--dry-run` lists a file you did not expect, or complains that remote versions are
missing locally, **stop**: someone applied DDL outside the repo. See §10.

### 2.5 Verify

1. MCP `list_migrations` → count equals `ls supabase/migrations | wc -l`.
2. MCP `list_tables` → expected count (30 after the baseline; see `EXPECTED_TABLE_COUNT`).
3. MCP `get_advisors` for `security` and `performance` → every finding is fixed **by a
   follow-up migration**, never in the dashboard.
4. Audit against prod from a shell whose env points at `ysc-prod`
   (`backend/.env`; check §5 first on Windows):
   ```bash
   python backend/scripts/audit_supabase_schema.py --expect-project-ref "$SUPABASE_PROJECT_REF"
   ```
5. Append a `CURRENT_STATE.md` row (§9).

### 2.6 Rolling back

Forward-only. A bad migration is reversed by a **new** migration. `supabase migration
repair` is reserved for a migration that failed half-way and was cleaned up by hand;
if you must use it, capture what was actually run into a migration file first and record
the repair in `CURRENT_STATE.md`.

## 3. Seeds

| Data | Mechanism | Reaches prod? |
|---|---|---|
| Catalog (`academic_levels`, `degree_plans`, `course_packs`), `subscription_plans`, `feature_flags`, published exams | **Seed migrations** (`*_seed_*.sql`) written as idempotent upserts on the natural key (`slug`, `(degree_plan_id, academic_level_id)`, `tier`, `flag_name`) | Yes — through the same `db push` path as DDL |
| Owner's Clerk test id as admin, any throwaway rows | `supabase/seed.sql` | **No** — local `db reset` only |

Rules: a catalog change is a *new* seed migration (never edit a pushed one); Stripe ids
in seed migrations stay `NULL` and are filled by `backend/scripts/relink_stripe_catalog.py`
(D4); nothing real (emails, keys, customer data) ever goes in `seed.sql`.

## 4. Granting the first admin

The user must have signed in once so `/api/users/resolve` has created the `public.users`
row. Then, in the SQL Editor or via MCP `execute_sql` (this is DML, the one sanctioned
manual write):

```sql
update public.users set role = 'admin' where clerk_id = 'user_xxxxxxxxxxxxxxxxxxxxxxxx';
select clerk_id, email, role from public.users where role = 'admin';   -- expect exactly the owner
```

Record it as a `CURRENT_STATE.md` row. Locally this is what `supabase/seed.sql` does.

## 5. Windows env-collision check (before any prod-facing script)

`python-dotenv` does **not** override variables already present in the process, so a
User-scope `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` silently beats `backend/.env`
(memory: *env var collision footgun*). Check both scopes:

```powershell
'SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','SUPABASE_PROJECT_REF','SUPABASE_DB_URL' | ForEach-Object { [pscustomobject]@{ Name = $_; User = [bool][Environment]::GetEnvironmentVariable($_,'User'); Machine = [bool][Environment]::GetEnvironmentVariable($_,'Machine') } }
```

Every cell must be `False`. Clear a stray one with
`[Environment]::SetEnvironmentVariable('SUPABASE_URL', $null, 'User')` (same for the
others), then **open a new shell** — the running one keeps the old value.

## 6. Backups

- **What:** `.github/workflows/db-backup.yml` runs daily at 07:17 UTC and on
  `workflow_dispatch`. It dumps `roles.sql`, `schema.sql`, `data.sql`
  (`supabase db dump --role-only` / default / `--data-only --use-copy`), tars them, encrypts
  with `age -r $BACKUP_AGE_PUBLIC_KEY`, and uploads `ysc-db-<stamp>.tar.gz.age` as an
  artifact with 90-day retention. Plaintext is shredded inside the job.
- **Secrets (GitHub → Settings → Secrets and variables → Actions):**
  - `SUPABASE_DB_URL` — **the Session-pooler URI** (`…pooler.supabase.com:5432`). GitHub
    runners are IPv4-only; the direct `db.<ref>.supabase.co` host is IPv6-only. Percent-encode
    the password.
  - `BACKUP_AGE_PUBLIC_KEY` — the `age1…` recipient.
- **Key pair:** `age-keygen -o ysc-backup.agekey` (Windows: `winget install
  FiloSottile.age`). Copy the `# public key: age1…` line into the GitHub secret; paste the
  whole file (the `AGE-SECRET-KEY-1…` line) into the password manager entry
  *YSC backup age key*; then delete the file. **The private key is never a GitHub secret
  and never in the repo.** Losing it makes every artifact unreadable — treat it like the
  Play keystore.
- **Run by hand / fetch:** `gh workflow run db-backup.yml`, `gh run list --workflow
  db-backup.yml`, `gh run download <run-id> -D restore/`.
- **Monthly owner task:** download the newest artifact and copy it to
  OneDrive `YSC/backups/` (artifacts expire at 90 days). Also confirm the last 30 runs are
  green — a silently failing backup is the failure mode that bit us.
- **Second copy:** Supabase Pro daily backups (7-day window) under Dashboard → Database →
  Backups. PITR is deferred until real student data exists (D1).

## 7. Restore drill

Run it **now (first backup), quarterly (Jan / Apr / Jul / Oct), after any change to
`db-backup.yml`, and before the Live cutover.** It proves the dump alone rebuilds the
database, so the target must be an **empty** Supabase stack — not the repo's, whose
`supabase start` would apply the migrations first. Needs Docker and `psql`.

```bash
# 0. scratch project with no migrations (run from an empty directory, e.g. /tmp/ysc-restore)
npx supabase init
sed -i 's/^major_version = .*/major_version = 17/' supabase/config.toml
npx supabase start -x studio,mailpit,edge-runtime,logflare,vector,imgproxy
eval "$(npx supabase status -o env)"

# 1. fetch + decrypt (private key from the password manager into a temp file)
gh run download <run-id> -R jeremiahvanwagner-droid/Your-Student-Companion-main -D restore/
age -d -i ysc-backup.agekey -o restore/backup.tar.gz restore/*/ysc-db-*.tar.gz.age
tar -C restore -xzf restore/backup.tar.gz          # restore/roles.sql schema.sql data.sql

# 2. load — exactly as plan §3.9
psql "$DB_URL" --single-transaction -v ON_ERROR_STOP=1 \
  -f restore/roles.sql -f restore/schema.sql \
  -c 'set session_replication_role = replica' -f restore/data.sql
psql "$DB_URL" -c "notify pgrst, 'reload schema'"

# 3. prove it with the same oracle used for prod (run from the repo checkout, same shell)
SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  python /path/to/Your-Student-Companion-main/backend/scripts/audit_supabase_schema.py --expect-project-ref local

# 4. clean up every plaintext byte and the key file, then stop the scratch stack
rm -f ysc-backup.agekey restore/*.sql restore/backup.tar.gz
npx supabase stop --no-backup
```

Pass criteria: psql exits 0, the audit prints `All critical checks passed`, and
`select count(*) from public.course_packs` matches prod. Time the whole thing with a
stopwatch — that number is the measured RTO and goes in the CURRENT_STATE row.

## 8. Objectives and cadence

| Objective | Target | How it is met |
|---|---|---|
| **RPO** (max data loss) | **24 h** | nightly dump + Supabase Pro daily backup |
| **RTO** (time to a working DB on a new project) | **4 h** | create `ysc-prod-2` → §7 steps 1–3 against its pooler URI → repoint `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_PROJECT_REF` on Render → audit green → Stripe relink |
| Drill cadence | quarterly + after pipeline changes + pre-Live | `S-BACKUP-DRILL-00n` row each time, with measured duration |
| Backup freshness | ≤ 36 h old | monthly owner check of the Actions run list |

These numbers are the ones scope v2 §17 cites; change them there and here together.

## 9. `CURRENT_STATE.md` row convention

Append-only table `| Entry ID | Date | Type | Subject | Status | Reference |`; never edit
or delete a row. IDs used by this runbook:

| Entry ID | When |
|---|---|
| `S-INCIDENT-DB-001` | the July deletion (postmortem link) |
| `S-DECISION-DB-REBUILD-001` | D1–D8 locked |
| `S-MIGRATE-BASELINE-001` | baseline + seed migrations merged with `db-migrate` green |
| `S-SUPABASE-PROJECT-001` | `ysc-prod` created (ref, region, PG version, sign-ups disabled) |
| `S-MIGRATE-PUSH-00n` | one per `db push` — list the file names and the `list_migrations` count |
| `S-ADVISOR-00n` | each advisor pass and the follow-up migration that cleared it |
| `S-BACKUP-001` | first successful `db-backup.yml` run (run id + artifact name) |
| `S-BACKUP-DRILL-00n` | each restore drill — artifact used, duration vs RTO, pass/fail |
| `S-ADMIN-GRANT-001` | the §4 statement, with the `clerk_id` |

The Reference column carries the evidence (file names, counts, run ids, durations), not
prose.

## 10. Troubleshooting

- **`db push`: "Remote migration versions not found in local migrations directory"** —
  DDL was applied outside the repo. Do not `--include-all` past it. Dump the remote
  (`supabase db dump --db-url … -f /tmp/remote.sql`), diff against local, capture the
  delta as a migration, then `supabase migration repair --status applied <version>` only
  for the orphan version, and write a CURRENT_STATE row naming who/when.
- **`db dump`: "server version mismatch"** — `[db] major_version` in `config.toml` does
  not match the project. Fix `config.toml`.
- **Backup job: "network is unreachable" / timeout** — `SUPABASE_DB_URL` is a direct
  (IPv6-only) host. Use the Session pooler URI (§6).
- **`db-migrate` fails on "BASE TABLEs in schema public"** — a migration added/dropped a
  table; update `EXPECTED_TABLE_COUNT` in `ci.yml` and the audit script's table map.
- **`db-migrate` fails on "public tables WITHOUT row security" or a privilege check** —
  the new table skipped the §2.1 checklist. Never fix by adding a policy; enable RLS and
  re-run the grants.
- **`supabase start` port collision locally** — `npx supabase stop --no-backup`, then
  check nothing else holds 54321/54322.
- **Audit script refuses the project ref** — the shell's `SUPABASE_URL` is not the
  project you think; run §5.
