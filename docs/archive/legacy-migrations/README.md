# Legacy migrations (historical — never apply)

These ten files are the former `backend/migrations/` directory, moved here on
2026-10-06 as part of the Phase 0R database rebuild. They are kept for
provenance only.

**Do not run any file in this directory against any database.** They are
superseded in full by the schema-as-code baseline and seeds under
`supabase/migrations/`:

| Supersedes | By |
|---|---|
| `0001_init_supabase_schema.sql`, `003_store_payment_bootstrap.sql`, `004_reconcile_from_compat_schema.sql`, `005_align_purchase_identity_uuid.sql`, `006_focus_migrations.sql`, `007_planner_blocks.sql`, `008_private_is_admin.sql`, `009_reminders_reference_and_sm2.sql` | `supabase/migrations/20261006000000_baseline.sql` |
| `001_seed_academic_data.sql`, `002_seed_course_packs.sql` | `supabase/migrations/20261006000100_seed_catalog.sql` |

## Why they are historical

- The only Supabase project that ever ran them (`uvyvvaxufmylqavewvex`,
  "ysc-staging") was deleted between 2026-07-22 and 2026-07-28 and is
  unrecoverable.
- That database was never built from `0001`. Its live schema was a **hybrid**:
  `003` (compatibility store tables with bigint/text ids) applied first, then
  `004` layered the MVP tables on top. `005` (purchase identity alignment) was
  never applied. Several objects on top of that — `subscription_plans`,
  `stripe_webhook_events`, the seven exam tables, `student_profiles.state`, and
  the security-advisor hardening — were applied **only through the Supabase MCP
  `apply_migration` tool** and never committed, which is why the schema could
  not be rebuilt from this repository after the deletion.
- These files assume Supabase Auth identity (`public.users.id` references
  `auth.users`, `is_admin()` over `auth.uid()`, per-user RLS policies). Decision
  D2 of the 2026-10-06 rebuild plan dropped all of that: Clerk is the only
  identity provider, RLS is enabled on every table with **no** policies, and only
  `service_role` is granted. Running any of these files would reintroduce the
  privilege-escalation path that D2 closed.
- Their id types disagree with the locked decision D3 (bigint identity for the
  catalog and commerce tables, uuid elsewhere) and with the code that ships today.

## Where the current truth lives

- Schema: `supabase/migrations/20261006000000_baseline.sql` (one transaction,
  30 tables, header documents what is evidenced vs. designed).
- Seeds: `supabase/migrations/20261006000100_seed_catalog.sql`,
  `…000200_seed_subscription_plans.sql`, `…000300_seed_feature_flags.sql`,
  `…000400_seed_exams_regents_algebra_i.sql`.
- Local-only developer data: `supabase/seed.sql`.
- Workflow and the standing "no DDL outside `supabase/migrations/`" rule:
  `docs/runbooks/database.md`.

If you find a reference elsewhere in the repo that still tells you to run one of
these files (for example an error message mentioning
`backend/migrations/003_store_payment_bootstrap.sql`), treat it as stale and fix
the reference rather than following it.
