# Resto: AI Restaurant & Terrace Finder (Stockholm)

Resto is an AI-powered venue-discovery app for Stockholm. You ask in plain language
("cozy lunch near Södermalm, under 300 SEK") and Claude parses the intent, the backend
filters a database of ~1,400 scraped venues, and Claude ranks the best matches with a
short explanation for each. Results render on a Mapbox map.

Its signature feature is a **real-time sun/shadow visualization**: using the sun's
position (SunCalc) and building footprints/heights from Mapbox, the map shades occluded
ground and marks terraces as in-sun or in-shade *right now* — with a time scrubber to
see how shadows move through the day.

> Status: working MVP, deployed. Some advertised-but-unbuilt pieces are flagged below
> under "Known gaps / not yet implemented." Read that section before relying on a feature.

## Live deployments

- **Frontend (Vercel):** https://resto-sable-omega.vercel.app
- **Backend (Railway):** https://resto-production-9b86.up.railway.app
- **Database:** Supabase Postgres

## Tech stack

- **Frontend:** Next.js 14 (pages router) + React 18 + TypeScript, Mapbox GL, SunCalc,
  @turf/turf (shadow geometry). Styling is mostly inline + a Tailwind config.
- **Backend:** Node.js + Express, pg-promise (Postgres), `@anthropic-ai/sdk`.
- **AI:** Claude (`claude-sonnet-4-6`) for intent parsing and ranking.
- **Data:** Google Places scraper (`backend/scrapers/google-maps.js`).
- **Hosting:** Vercel (frontend) + Railway (backend) + Supabase (Postgres).

## Architecture

```
backend/
  server.js            Express app + route wiring
  api/                 search.js (main flow), browse.js (public map), auth.js
  claude/              intent-parser.js, ranker.js (prompts), sentiment-analyzer.js*
  db/                  index.js (pg-promise), schema.sql
  middleware/          auth.js (JWT), rateLimit.js
  scrapers/            google-maps.js + enrichment scripts
  migrations/          incremental schema changes (see Database below)
frontend/
  pages/               index.tsx (map + search), auth/, api/search.ts (proxy)
  components/          VenueMap.tsx (shadow engine), TimeScrubber, ResultsList, ...
  lib/                 auth.ts, sunScore.ts, theme.ts
```

`*` `sentiment-analyzer.js` is a prompt module that is not wired into any route yet.

## How it works (data flow)

1. **Default map** — on load the frontend calls `GET /api/browse`, which returns
   top-rated venues straight from Postgres (no Claude call, no auth).
2. **Search** — typing a query (requires a logged-in user) POSTs to the Next.js proxy
   `/api/search`, which forwards to the backend `POST /api/search`. The backend:
   a. parses the query into structured intent via Claude (`claude/intent-parser.js`),
   b. filters candidate venues from Postgres (neighborhood bounding box, cuisine hard
      filter, budget → price range),
   c. ranks the top candidates via Claude (`claude/ranker.js`) and returns venues +
      one-line explanations. Falls back to rating-sort if the Claude call fails.
3. **Sun/shadow** — independently, `VenueMap.tsx` computes shadows client-side and marks
   terraces sun/shade; `TimeScrubber` re-runs the calculation for any time of day.

## API endpoints

| Method | Path                | Auth | Notes |
|--------|---------------------|------|-------|
| GET    | `/health`           | no   | Liveness check |
| GET    | `/api/browse`       | no   | Top-rated venues for the default map. `?type=&limit=` |
| POST   | `/api/search`       | JWT  | Full intent→filter→rank flow. Body: `{ query, type?, limit? }` |
| POST   | `/api/auth/signup`  | no   | `{ email, password }` → `{ user, token }` |
| POST   | `/api/auth/login`   | no   | `{ email, password }` → `{ user, token }` |

Auth is email/password with bcrypt hashing and a 7-day JWT (`Authorization: Bearer …`).

## Quick start (local)

Prerequisites: Node.js 20+, a Postgres database (or Supabase connection string).

```bash
# Backend
cd backend && npm install
cp .env.example .env          # fill in real values (see below)
npm run dev                   # http://localhost:3001

# Frontend (separate terminal)
cd frontend && npm install
cp .env.example .env.local    # set NEXT_PUBLIC_API_URL + NEXT_PUBLIC_MAPBOX_TOKEN
npm run dev                   # http://localhost:3000
```

## Database

`backend/db/schema.sql` is the **single source of truth** — it reflects the full
production schema (base tables + the unified-venue boolean flags + terrace columns,
all consolidated). Stand up a fresh database with:

```bash
psql "$DATABASE_URL" -f backend/db/schema.sql      # tables + indexes
psql "$DATABASE_URL" -f backend/rls_policies.sql   # row-level security
```

The files in `backend/migrations/` are historical and partly superseded (003 was an
abandoned `type`-enum redesign; 004 was replaced by 004_fixed). Don't treat them as
the schema of record — `schema.sql` is. `npm run migrate` (`run-migration.js`) remains
for re-applying the 004 venue changes against an older database if needed.

## Environment variables

**Backend (`backend/.env`)** — never commit this file; only `.env.example` is tracked.

```
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://...        # Supabase Postgres
ANTHROPIC_API_KEY=sk-ant-...
MAPBOX_TOKEN=pk....
GOOGLE_MAPS_API_KEY=...              # scraper only
JWT_SECRET=<long random string>      # use a strong secret in production
ALLOWED_ORIGINS=https://resto-sable-omega.vercel.app
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=5
REDIS_ENABLED=false                  # optional response cache
```

**Frontend (`frontend/.env.local`)**

```
NEXT_PUBLIC_API_URL=https://resto-production-9b86.up.railway.app
NEXT_PUBLIC_MAPBOX_TOKEN=pk....
```

## Scripts

Backend: `npm run dev` · `npm start` · `npm run migrate` · `npm run scrape`
Frontend: `npm run dev` · `npm run build` · `npm start` · `npm run lint` · `npm run type-check`

## Known gaps / not yet implemented

These are advertised or scaffolded but **not** currently functional — be aware before
relying on them:

- **Freemium quota / billing.** The `users` table tracks `searches_remaining` and
  `subscription_status`, but quota enforcement and decrement are currently commented out
  in `api/search.js` — searches are effectively unlimited once logged in.
- **Sentiment analysis.** `claude/sentiment-analyzer.js` exists and reviews are scraped,
  but nothing runs the analyzer; the `reviews` sentiment columns are never populated.
- **Analytics.** The `search_queries` table is defined but never written to.
- **Response cache.** Redis caching code exists but is disabled in `api/search.js`.
- **Row-Level Security.** The app's effective access control is the Express backend
  (bcrypt + JWT), which talks to Postgres over a privileged connection that bypasses
  RLS — that backend is the trust boundary, by design. `rls_policies.sql` is now
  **defense-in-depth** for the Supabase API-key surface: RLS is enabled on all tables,
  with public read on venues/reviews and no access to users/search_queries. (The old
  policies targeted Supabase Auth and referenced a non-existent column; they've been
  rewritten — see the header in `rls_policies.sql`.)

## License

MIT — Johan Gustafsson (johan.gustafsson13@gmail.com)
