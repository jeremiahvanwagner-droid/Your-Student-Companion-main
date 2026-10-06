# Your Student Companion (YSC)

A supportive, calm, and highly intelligent academic tutor app built for students.

**Phase 0 — Foundation Hardening: Closed (2026-05-06)**  
See [docs/phases/foundation-hardening-phase-0.md](docs/phases/foundation-hardening-phase-0.md)

**Live status:** [CURRENT_STATE.md](CURRENT_STATE.md) (single source of truth for where the project stands).

## Tech Stack

| Layer      | Technology                              |
| ---------- | --------------------------------------- |
| Frontend   | React 19 + CRA (Craco) + Tailwind CSS  |
| UI         | shadcn/ui (New York) + Radix UI        |
| Auth       | Clerk (sole identity provider)          |
| Backend    | FastAPI (Python)                        |
| Database   | Supabase Postgres (schema-as-code in `supabase/migrations/`) |
| Payments   | Stripe                                  |
| Hosting    | Vercel (frontend) + Render (API, `render.yaml`) |

## Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/jeremiahvanwagner-droid/Your-Student-Companion-main.git
cd Your-Student-Companion-main

# 2. Install dependencies (--legacy-peer-deps required for React 19)
npm install --legacy-peer-deps

# 3. Copy environment template and fill in your keys
cp .env.example .env.local

# 4. Start the dev server
npm start
```

## Scripts

| Command                | Description                              |
| ---------------------- | ---------------------------------------- |
| `npm start`            | Start dev server (port 3000)             |
| `npm run build`        | Production build → `build/`              |
| `npm test`             | Run tests in watch mode                  |
| `npm run test:coverage`| Run tests + enforce coverage thresholds  |

## Quality gates

CI fails the PR if any gate is violated. **Raise floors, never lower.**

### Frontend (Jest + React Testing Library)

| Metric     | Floor |
| ---------- | ----- |
| Statements | 10%   |
| Branches   | 15%   |
| Functions  | 10%   |
| Lines      | 10%   |

Run locally: `npm run test:coverage`

### Backend (pytest-cov)

| Metric    | Floor |
| --------- | ----- |
| Lines     | 25%   |

Run locally: `python -m pytest backend/tests/ -v --cov=backend --cov-report=term --cov-fail-under=25`

### Database (`db-migrate` CI job)

Every PR also rebuilds the database from scratch on an ephemeral local Supabase
stack (`supabase start` → `supabase db reset`), runs
`backend/scripts/audit_supabase_schema.py --expect-project-ref local`, lints the
migrations and asserts the RLS/grant posture (zero policies in `public`;
`anon` has no table privileges; `service_role` does). See
[docs/runbooks/database.md](docs/runbooks/database.md).

## Database

The schema is **code**: `supabase/migrations/` is the only place DDL lives, and
the only way DDL reaches any Supabase project is `supabase db push` from a merged
PR. Seeds (catalog, subscription plans, feature flags, the NY Regents Algebra I
reference exam) are idempotent migration files in the same folder;
`supabase/seed.sql` is local-only.

- Workflow, local reset, push, backup and restore drill:
  [docs/runbooks/database.md](docs/runbooks/database.md)
- **Rule — no MCP DDL:** the Supabase MCP `apply_migration` tool and the
  dashboard SQL Editor are banned for schema changes. The project that preceded
  this rule was deleted in July 2026 with MCP-applied, never-committed schema in
  it (see `CURRENT_STATE.md` S-INCIDENT-DB-001); nothing in the repo could
  rebuild it.
- Identity is Clerk-only: no `auth.users` FK, Supabase Auth sign-ups disabled,
  RLS enabled on every table with **no policies** (deny-all for `anon` /
  `authenticated`); the backend talks to Postgres with the service-role key and
  enforces ownership by `user_id` filters.
- `backend/migrations/` (the pre-rebuild SQL files) is archived under
  `docs/archive/legacy-migrations/` for history only — never apply those files.

## Project Structure

```
├── src/                # React frontend
│   ├── components/     # UI components (shadcn/ui, layout, features)
│   ├── pages/          # Route pages
│   ├── lib/            # Utilities, API clients, age gate, analytics, onboarding
│   ├── hooks/          # Custom React hooks
│   ├── context/        # React context providers
│   └── utils/          # Pure utility functions
├── backend/            # FastAPI Python backend (routes/, lib/, scripts/, tests/)
├── supabase/           # Supabase CLI config + migrations/ (the schema) + seed.sql
├── docs/               # Runbooks, strategy, phases, scope, archived legacy migrations
├── public/             # Static assets and PWA manifest
├── render.yaml         # Render Blueprint for the API + weekly cron
└── .github/workflows/  # CI (build, backend-test, db-migrate) + nightly db-backup
```

## Environment Variables

See [`.env.example`](.env.example) for the full list of required variables.

## License

Private — all rights reserved.
