# Future Resolve

An AI-assisted support-ticket triage app: agent dashboard, transparent AI
classification (Gemini 2.5 Flash with an offline mock fallback), an SLA
engine with live countdowns and breach escalation, auto-routing by agent
workload, and an analytics dashboard.

The app is fully functional and demo-ready **without any live AI calls** —
demo data ships pre-classified by the same mock classifier the app uses at
runtime. A single "Try live classification" button on the New Ticket page is
the only path that calls the real Gemini API.

## Stack

- **Frontend**: React + TypeScript + Vite (`client/`)
- **Backend**: Node + Express + TypeScript (`server/`)
- **Database**: PostgreSQL (Supabase-compatible), via `pg`
- **AI**: Google Gemini 2.5 Flash (`@google/generative-ai`), with a
  deterministic keyword-based mock classifier as fallback
- **Auth**: JWT, two roles (`admin`, `agent`), RBAC middleware

## Prerequisites

- Node.js 20+ and npm 10+
- A PostgreSQL database — the easiest option is a free [Supabase](https://supabase.com) project
- (Optional, for live AI) A [Gemini API key](https://aistudio.google.com/apikey)

## Setup

1. **Install dependencies** (installs both `client` and `server` workspaces from the root):
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` and fill in:
   - `DATABASE_URL` — your Postgres/Supabase connection string *(you need to provide this)*
   - `GEMINI_API_KEY` — your Gemini API key *(you need to provide this; optional — app works without it)*
   - `JWT_SECRET` — any long random string, e.g. `openssl rand -base64 48` *(you need to provide this)*

   The server auto-loads the single root `.env` regardless of which directory it's started from.

3. **Run the database migration** (applies `schema.sql`):
   ```bash
   npm run migrate
   ```

4. **Seed demo data** (~60 classified tickets, 5 agents + 1 admin, SLA policies, 8 KB articles):
   ```bash
   npm run seed
   ```
   This prints demo login credentials to the console when done.

5. **Start both dev servers**:
   ```bash
   npm run dev
   ```
   - API: http://localhost:4000
   - Frontend: http://localhost:5173 (proxies `/api/*` to the backend)

6. **Log in** with a seeded demo account (password for all accounts is `password123`):
   - Admin: `admin@futureresolve.demo` (only admins see the Analytics page)
   - Agent: `priya@futureresolve.demo` (or marcus/sofia/jin/alex, same domain)

## Scripts

| Command | What it does |
|---|---|
| `npm install` | Installs dependencies for both workspaces |
| `npm run migrate` | Applies `schema.sql` to `DATABASE_URL` |
| `npm run seed` | Wipes and repopulates demo data |
| `npm run dev` | Runs API + frontend concurrently, with hot reload |
| `npm run dev:server` / `npm run dev:client` | Run just one side |
| `npm run build` | Production builds for both workspaces |

## Project structure

```
future-resolve/
  schema.sql              Postgres schema (run via npm run migrate)
  .env.example             Every env var, with placeholders
  server/
    src/
      index.ts             Express app entrypoint
      routes/               tickets, agents, kb, analytics, auth, sla-policies
      services/
        classifier.ts       Mock classifier + THE real Gemini call
        sla.ts               SLA deadline calc + background breach sweep
        routing.ts           Least-loaded-agent auto-assignment
      seed/                 Demo data + seed script
  client/
    src/
      pages/                Dashboard, TicketDetail, NewTicket, Analytics, Login
      components/           Badges, filters, timeline, charts, layout
      api/client.ts         Fetch wrapper, attaches JWT
```

## Deployment

### Frontend → Vercel

1. Import the repo into Vercel, set the project root to `client/`.
2. Build command: `npm run build` (or let Vercel auto-detect Vite).
3. Output directory: `dist`.
4. Set an environment variable `VITE_API_URL` pointing at your deployed backend
   origin (e.g. `https://future-resolve-api.up.railway.app`), with no trailing slash.

### Backend → Railway

1. Create a new Railway project, add a service pointing at the repo with root `server/`.
2. Build command: `npm install && npm run build`. Start command: `npm start`.
3. Set environment variables in Railway's dashboard: `DATABASE_URL`,
   `GEMINI_API_KEY`, `JWT_SECRET`, `PORT` (Railway sets `PORT` automatically —
   the app reads `process.env.PORT`, so you usually don't need to set it).
4. If your Postgres is also on Railway, you can use its internal connection
   string; if using Supabase, use the Supabase connection string here too.
5. After the first deploy, run the migration and seed once, e.g. via Railway's
   shell: `npm run migrate` then `npm run seed` (or run them locally against
   the same `DATABASE_URL`).
6. Update the frontend's `VITE_API_URL` to the Railway service URL and redeploy.

## Notes

- No secrets are hardcoded anywhere — every credential is read from
  `process.env` (see `server/src/env.ts`), with clearly-marked placeholders
  in `.env.example`.
- If `GEMINI_API_KEY` is left as a placeholder or unset, classification
  silently and transparently falls back to the mock classifier — the app
  never breaks because of a missing AI key.
- See `ARCHITECTURE.md` for how the SLA engine, routing, and AI
  classification actually work.
