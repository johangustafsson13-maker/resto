# Resto: AI Restaurant Finder

An AI-powered restaurant discovery app that uses Claude to understand natural language queries, rank venues intelligently, and analyze sentiment from reviews.

**Target:** Launch MVP in Stockholm in 3 weeks. $5-50k/month by month 3.

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 12+
- npm or yarn

### Setup

1. **Clone and install:**
```bash
cd backend && npm install
cd ../frontend && npm install
cd ..
```

2. **Configure environment variables:**
   - Copy `backend/.env.example` to `backend/.env`
   - Copy `frontend/.env.example` to `frontend/.env`
   - Add your API keys (see below)

3. **Set up database:**
```bash
# Create PostgreSQL database
createdb resto_dev

# Load schema
psql -U postgres -d resto_dev -f backend/db/schema.sql
```

4. **Start development servers:**
```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm run dev
```

Backend runs on `http://localhost:3001`
Frontend runs on `http://localhost:3000`

## Architecture

### Tech Stack
- **Backend:** Node.js + Express
- **Frontend:** Next.js + React + Tailwind CSS
- **Database:** PostgreSQL
- **Maps:** Mapbox GL
- **AI:** Claude API (Sonnet)
- **Hosting:** Vercel (frontend) + DigitalOcean (backend)

### Core Components

**Backend:**
- `/scrapers` — Data collection (Google Maps, OpenTable, etc.)
- `/api` — Express endpoints (/search, /parse-intent, /rank)
- `/db` — PostgreSQL schema and migrations
- `/claude` — Claude API integration (intent parsing, ranking, sentiment analysis)

**Frontend:**
- `/pages` — Next.js routes (search, venue details)
- `/components` — React components (SearchBox, VenueMap, VenueCard)
- `/hooks` — Custom React hooks
- `/styles` — Tailwind CSS

### Data Flow

1. User types natural language query ("best lunch near Stureplan for business meeting under 200 SEK")
2. Frontend sends to `/parse-intent` endpoint
3. Backend uses Claude to extract: location, time, cuisine, budget, party size, ambiance
4. Backend filters venues from PostgreSQL using intent
5. Backend uses Claude to rank results by relevance to user's criteria
6. Backend sends top 5 venues + Claude explanations to frontend
7. Frontend displays results on Mapbox with venue details

## API Endpoints

### `/search` (POST)
Search for restaurants by query.

**Request:**
```json
{
  "query": "cozy lunch near Södermalm, under 300 SEK",
  "userId": "user123",
  "limit": 5
}
```

**Response:**
```json
{
  "venues": [
    {
      "id": 1,
      "name": "Restaurant Name",
      "address": "Street 123, Södermalm",
      "lat": 59.32,
      "lng": 18.07,
      "cuisine_tags": ["Swedish", "Modern"],
      "price_range": 2,
      "rating": 4.5,
      "explanation": "Claude's explanation of why this matches your query"
    }
  ]
}
```

### `/parse-intent` (POST)
Parse natural language query into structured intent.

**Request:**
```json
{
  "query": "best lunch spot near Stureplan for business meeting under 200 SEK"
}
```

**Response:**
```json
{
  "location": "Stureplan",
  "time": "lunch",
  "ambiance": "business-friendly",
  "budget": 200,
  "party_size": null,
  "dietary_restrictions": [],
  "outdoor": false
}
```

### `/rank` (POST)
Rank venues by relevance to intent.

**Request:**
```json
{
  "venues": [...],
  "intent": {...}
}
```

**Response:**
```json
{
  "ranked": [
    {
      "id": 1,
      "score": 0.95,
      "explanation": "Matches all your criteria: business-friendly ambiance, near Stureplan, excellent for lunch..."
    }
  ]
}
```

## Environment Variables

### Backend (`backend/.env`)
```
NODE_ENV=development
PORT=3001

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/resto_dev

# Claude API
ANTHROPIC_API_KEY=sk-ant-...

# Mapbox
MAPBOX_TOKEN=pk_test_...

# Redis (optional, for caching)
REDIS_URL=redis://localhost:6379

# External APIs
GOOGLE_MAPS_API_KEY=...
OPENAPI_KEY=...
```

### Frontend (`frontend/.env.local`)
```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_MAPBOX_TOKEN=pk_test_...
```

## Development Workflow

### Week 1: Backend + Data
- [ ] Google Maps scraper for 500 Stockholm restaurants
- [ ] PostgreSQL schema (venues, reviews, queries)
- [ ] Express API: /search, /parse-intent, /rank
- [ ] Claude integration: intent parsing + ranking
- [ ] Local testing via CLI

### Week 2: Frontend
- [ ] Next.js search app with Mapbox integration
- [ ] Display top 5 results with Claude explanations
- [ ] Venue detail pages (hours, reviews, booking links)
- [ ] Mobile responsive design

### Week 3: Launch
- [ ] Redis caching + rate limiting
- [ ] Freemium auth (email signup, JWT)
- [ ] Analytics tracking
- [ ] Deploy to Vercel + DigitalOcean
- [ ] Product Hunt submission

## Documentation

- **[API.md](docs/API.md)** — Detailed API documentation
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** — System architecture & design decisions
- **[DATA_SOURCES.md](docs/DATA_SOURCES.md)** — Data collection strategy

## Scripts

### Backend
```bash
npm run dev          # Start development server with nodemon
npm run build        # Build for production
npm start            # Run production build
npm run migrate      # Run database migrations
npm run seed         # Load test data
npm run scrape       # Run Google Maps scraper
```

### Frontend
```bash
npm run dev          # Start Next.js dev server
npm run build        # Build for production
npm start            # Run production build
npm run lint         # Lint code
```

## Success Metrics

- **Week 1-2:** 100 beta testers, 1000+ searches
- **Week 3:** Product Hunt top 50, 500+ newsletter signups, 5k MAU
- **Month 2:** 50 paid subscribers, $150/month MRR
- **Month 3:** 500 paid subscribers, $1,500/month MRR

## Cost Estimate (MVP)

- Claude API: $20-50/month
- PostgreSQL (AWS RDS): $15/month
- Redis: $5/month
- Mapbox: Free tier
- DigitalOcean: $5/month
- Vercel: Free
- **Total:** ~$50-75/month

## License

MIT

## Contact

Johan Gustafsson (johan.gustafsson13@gmail.com)
