# League-It

> Your sports league, your rules.

A mobile-first PWA for managing small sports leagues — track players, log match results, and watch the standings update in real time.

## Tech Stack

| Layer | Technology |
|---|---|
| UI | React 19 + Framer Motion |
| Styling | Tailwind CSS |
| Icons | Lucide React |
| Backend / DB | Supabase (Postgres + Auth + Storage) |
| Build | Vite |
| Deploy | Vercel |

## Features

- **League Management** — Create a league, invite players, upload a league photo, and configure sport-specific settings.
- **Match Logging** — Log match scores with a clean numeric modal; results are persisted to Supabase instantly.
- **Live Standings** — Automatic standings math: points, wins, losses, draws, goal difference, and a MINI-GAMES W–L column.
- **Stats & H2H** — Per-player stats and head-to-head records across all logged matches.
- **Player Profiles** — User profiles with avatar upload via Supabase Storage.
- **Onboarding Wizard** — 5-step guided flow for first-time league creation.
- **PWA Ready** — Installable on mobile via `manifest.json`; theme-colored chrome, standalone display mode.

## Local Development

```bash
npm install
# create .env.local with your Supabase credentials (see below)
npm run dev
```

`.env.local` (never committed):

```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

## Deploy

Push to `main` — Vercel picks it up automatically. Set the two env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in your Vercel project settings.
