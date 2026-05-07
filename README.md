# Your Student Companion (YSC)

A supportive, calm, and highly intelligent academic tutor app built for students.

**Phase 0 — Foundation Hardening: Closed (2026-05-06)**  
See [docs/phases/foundation-hardening-phase-0.md](docs/phases/foundation-hardening-phase-0.md)

## Tech Stack

| Layer      | Technology                              |
| ---------- | --------------------------------------- |
| Frontend   | React 19 + CRA (Craco) + Tailwind CSS  |
| UI         | shadcn/ui (New York) + Radix UI        |
| Auth       | Clerk                                   |
| Backend    | FastAPI (Python)                        |
| Database   | Supabase (Postgres + Auth + Storage)    |
| Payments   | Stripe                                  |
| Hosting    | Vercel (frontend) + your choice (API)   |

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

## Project Structure

```
├── src/                # React frontend
│   ├── components/     # UI components (shadcn/ui, layout, features)
│   ├── pages/          # Route pages
│   ├── lib/            # Utilities, API clients, Supabase, onboarding
│   ├── hooks/          # Custom React hooks
│   ├── context/        # React context providers
│   └── utils/          # Pure utility functions
├── backend/            # FastAPI Python backend
├── supabase/           # Supabase config and edge functions
├── public/             # Static assets and PWA manifest
└── clerk-nextjs/       # Experimental Next.js + Clerk prototype
```

## Environment Variables

See [`.env.example`](.env.example) for the full list of required variables.

## License

Private — all rights reserved.
