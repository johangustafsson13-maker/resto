# Resto Architecture

## System Overview

Resto is a three-tier AI-powered restaurant discovery system:

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                       │
│  - Search UI (SearchBox)                                     │
│  - Map display (Mapbox GL)                                   │
│  - Venue cards (VenueCard)                                   │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/REST
┌──────────────────────▼──────────────────────────────────────┐
│                   Backend (Express)                          │
│  - Intent Parser (Claude)                                    │
│  - Venue Ranker (Claude)                                     │
│  - Rate Limiter & Auth                                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┬─────────────────┐
        │              │              │                 │
   ┌────▼──┐    ┌─────▼────┐  ┌─────▼────┐    ┌──────▼────┐
   │Claude │    │PostgreSQL│  │  Redis   │    │  Mapbox   │
   │  API  │    │ Database │  │  Cache   │    │    GL     │
   └───────┘    └──────────┘  └──────────┘    └───────────┘
```

## Component Breakdown

### Frontend (Next.js)

**Pages:**
- `/` — Main search interface
- `/venue/[id]` — Detailed venue page (future)

**Components:**
- `SearchBox` — Input form for natural language queries
- `VenueMap` — Mapbox GL integration for displaying results
- `VenueCard` — Individual restaurant card with details

**Key Features:**
- TypeScript for type safety
- Tailwind CSS for styling
- Mapbox GL for interactive maps
- Real-time search with loading states

### Backend (Express)

**Routes:**

**`/api/search` (POST)**
- Accepts natural language query
- Calls Claude to parse intent
- Filters venues from PostgreSQL
- Calls Claude to rank results
- Returns top N venues with explanations

**`/api/parse-intent` (POST)**
- Extracts structured intent from query
- Returns: location, time, ambiance, budget, party size, etc.
- Used internally by `/search` and can be called directly

**`/api/rank` (POST)**
- Takes list of venues and user intent
- Returns venues ranked by relevance with explanations
- Used internally by `/search` and can be called directly

**`/api/auth/signup` (POST)**
- Creates new user account
- Hashes password with bcrypt
- Returns JWT token for session

**`/api/auth/login` (POST)**
- Authenticates user
- Returns JWT token for session

### Database (PostgreSQL)

**Tables:**

**`venues`**
- Core restaurant data
- Indexed on location, cuisine, city
- Includes ratings, amenities, hours

**`reviews`**
- Review text and ratings
- Sentiment analysis scores (Claude-generated)
- Aspect scores (food, service, ambiance, value)

**`search_queries`**
- Analytics: track what users search for
- Track which results get clicked
- Helps improve ranking over time

**`users`**
- User accounts for freemium model
- Tracks remaining searches
- Subscription status

### Claude Integration Points

**Intent Parsing (`/parse-intent`)**
```
User Input: "quiet lunch near Stureplan for business, under 200 SEK"
          ↓
Claude System Prompt: [See backend/claude/intent-parser.js]
          ↓
Output JSON: { location: "Stureplan", time: "lunch", ambiance: ["quiet", "business"], budget: 200 }
```

**Venue Ranking (`/rank`)**
```
Venues List + User Intent
          ↓
Claude System Prompt: [See backend/claude/ranker.js]
          ↓
Output JSON: Ranked venues with scores and explanations
```

**Sentiment Analysis (Background)**
```
Review Text
          ↓
Claude System Prompt: [See backend/claude/sentiment-analyzer.js]
          ↓
Stores: sentiment_score, aspect_scores, highlights in DB
```

## Data Flow

### Search Request Flow

```
1. User enters: "best lunch spot near Stureplan for business meeting under 200 SEK"
2. Frontend → POST /api/search

3. Backend:
   a) Call Claude /parse-intent
      → Extract: location="Stureplan", time="lunch", ambiance=["business"], budget=200
   
   b) Query PostgreSQL
      → Filter venues by: location ~20km from Stureplan, price_range ≤ 3
      → Return 10-15 venues
   
   c) Call Claude /rank
      → Score each venue against user's intent
      → Sort by score (descending)
   
   d) Return top 5 with Claude explanations

4. Frontend displays results on map + cards with explanations
```

### Authentication Flow

```
1. User signs up with email/password
2. Backend hashes password (bcrypt)
3. Creates user record in PostgreSQL
4. Generates JWT token
5. Token stored in client (localStorage or secure cookie)
6. Subsequent requests include token in Authorization header
7. Backend verifies token for premium features (unlimited searches)
```

## Tech Stack Rationale

| Component | Choice | Why |
|-----------|--------|-----|
| Frontend | Next.js | Fast builds, TypeScript, SSR capability, Vercel deployment |
| Styling | Tailwind CSS | Rapid UI development, mobile-responsive utilities |
| Maps | Mapbox GL | Superior to Google Maps for Stockholm data, customizable |
| Backend | Express | Lightweight, minimal boilerplate, ideal for APIs |
| Database | PostgreSQL | Relational data, JSONB for flexible fields, PostGIS for geo queries |
| AI | Claude API | Best intent understanding, reasoning, and explanations |
| Caching | Redis | Session data, rate limiting, search result caching |
| Auth | JWT + bcrypt | Stateless auth, scales well, secure password hashing |

## Scalability Considerations

### For Week 3 MVP:
- Single Express server on DigitalOcean
- PostgreSQL on AWS RDS (managed)
- Redis on cloud provider
- Vercel for frontend (auto-scales)

### For Month 3+ Growth:
- Load balancer in front of Express servers
- Database read replicas
- API rate limiting per user tier
- Caching strategy for frequent queries
- Async jobs for review sentiment analysis

## Security

**Password Handling:**
- Passwords hashed with bcrypt (10 rounds)
- Never stored in logs or responses
- HTTPS only in production

**API Keys:**
- Claude API key: env variable only
- Mapbox token: public (fine, it's rate-limited)
- Database URL: env variable only

**Rate Limiting:**
- 5 requests per minute per IP (default)
- Can be tightened for public deployment
- Freemium users get 3 searches/day free

**CORS:**
- Configured for frontend domain only
- Prevents cross-origin abuse

## Environment Variables

See `backend/.env.example` and `frontend/.env.example` for full list.

Key vars:
- `ANTHROPIC_API_KEY` — Claude API access
- `DATABASE_URL` — PostgreSQL connection
- `JWT_SECRET` — Signing JWT tokens
- `MAPBOX_TOKEN` — Map rendering (public)
- `NODE_ENV` — development/production
