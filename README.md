# League-It

> Your sports league, your rules.

A mobile-first PWA for managing small sports leagues — create a league, invite players, log match results, and watch live standings update in real time. Supports singles and doubles formats, head-to-head stats, player profiles, and tournament brackets.

## Tech Stack

| Layer | Technology |
|---|---|
| UI | React 19 + Framer Motion |
| Styling | Tailwind CSS |
| Icons | Lucide React |
| Backend / DB | Supabase (Postgres + Auth + Storage) |
| Build | Vite 5 |
| Testing | Vitest |
| Lint / Format | ESLint 9 + Prettier |
| Deploy | Vercel |
| CI | GitHub Actions |

## Features

- **League Management** — Create a league, invite players via join code or QR, upload a league photo, and configure sport-specific settings.
- **Match Logging** — Log match scores with a clean numeric modal; results are persisted to Supabase instantly.
- **Live Standings** — Automatic standings math: wins, losses, win %, clutch wins, comebacks, and mini-games W–L.
- **Stats & H2H** — Per-player stats and head-to-head records across all logged matches.
- **Player Profiles** — User profiles with avatar upload via Supabase Storage.
- **Tournament Mode** — Group stage + knockout bracket with draw reveal and seeding support.
- **Onboarding Wizard** — Guided flow for first-time league creation.
- **PWA Ready** — Installable on mobile via `manifest.json`; theme-colored chrome, standalone display mode.

## Local Setup

```bash
git clone https://github.com/ronstaro/league-it-app.git
cd league-it-app
npm install
cp .env.example .env.local   # fill in your Supabase credentials
npm run dev
```

## Environment Variables

Create `.env.local` in the project root (never committed):

```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

Both values come from your Supabase project dashboard under **Settings → API**.

If either variable is missing at runtime, the app logs an error and the Supabase client will be non-functional. The `supabaseConfigured` flag in `src/lib/supabase.js` is used to detect this and trigger a page reload in certain error paths.

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run test` | Run Vitest in watch mode |
| `npm run test:run` | Run Vitest once (CI mode) |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run format` | Prettier format all files |
| `npm run ci` | Lint + test + build (full local CI check) |

## Testing

Tests live alongside the source they cover in `src/lib/`:

```
src/lib/stats.test.js   — unit tests for all stats utility functions
```

Run once:

```bash
npm run test:run
```

Run in watch mode during development:

```bash
npm run test
```

## CI

GitHub Actions runs on every push and pull request to `main`:

- `.github/workflows/ci.yml`
- Steps: checkout → Node 24 setup → `npm ci` → `npm run test:run` → `npm run build`

`npm run lint` is intentionally excluded from CI until the remaining pre-existing hook violations are resolved.

## Deployment

Push to `main` — Vercel picks it up automatically via the GitHub integration.

Set the following environment variables in your Vercel project settings (**Settings → Environment Variables**):

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key |

The `VITE_` prefix is required by Vite to expose variables to the browser bundle.

## Security

### Supabase Row Level Security (RLS)

All Supabase tables (`leagues`, `players`, `matches`, `profiles`) have RLS enabled. The anon key used in the client is safe to expose in the browser — it cannot bypass RLS policies.

Key policies to be aware of:
- Users can only read leagues they belong to.
- Only league owners and admins can write match results or update settings.
- Player profile rows are scoped to the authenticated user's `user_id`.
- Supabase Storage buckets (`avatars`) enforce per-user path policies.

**Never use the Supabase `service_role` key in client-side code.** It bypasses all RLS policies and must only be used in trusted server-side environments.

## PWA Notes

The app ships a `public/manifest.json` and is installable on Android and desktop Chrome. iOS install is supported via Safari's "Add to Home Screen".

### Missing assets

The following PNG icons are referenced as best practice for full PWA compliance but are not yet present in `public/`:

| File | Size | Purpose |
|---|---|---|
| `public/icon-192.png` | 192×192 | Android home screen icon |
| `public/icon-512.png` | 512×512 | Android splash screen / maskable icon |
| `public/apple-touch-icon.png` | 180×180 | iOS "Add to Home Screen" icon |

Currently the manifest uses `favicon.svg` (SVG, `sizes: "any"`) which works on modern Chrome but may not render correctly on all platforms.
