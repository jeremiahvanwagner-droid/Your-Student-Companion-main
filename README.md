# Your Student Companion (YSC)

A supportive, calm, and highly intelligent academic tutor app built for students.

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
git clone https://github.com/your-org/Your-Student-Companion-main.git
cd Your-Student-Companion-main

# 2. Install dependencies (--legacy-peer-deps required for React 19)
npm install --legacy-peer-deps

# 3. Copy environment template and fill in your keys
cp .env.example .env.local

# 4. Start the dev server
npm start
```

## Scripts

| Command           | Description                        |
| ----------------- | ---------------------------------- |
| `npm start`       | Start dev server (port 3000)       |
| `npm run build`   | Production build → `build/`        |
| `npm test`        | Run tests                          |

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
