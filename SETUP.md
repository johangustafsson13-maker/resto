# Resto Setup Checklist

## ✅ Project Structure Complete

Your full project structure is ready in `/Users/johangustafsson/Documents/Claude/Projects/Resto/`

```
resto/
├── backend/          ← Express API + Claude integration
├── frontend/         ← Next.js search interface
├── docs/            ← API, architecture, data sources
├── docker-compose.yml
├── README.md
└── SETUP.md         ← You are here
```

---

## 🔧 Prerequisites to Install

### 1. **Node.js & npm**
Check you have Node 18+:
```bash
node --version  # Should be v18.x or higher
npm --version
```

If not installed, download from https://nodejs.org/

### 2. **PostgreSQL**
**Option A: Local installation**
```bash
# macOS (Homebrew)
brew install postgresql@15

# Ubuntu/Debian
sudo apt-get install postgresql postgresql-contrib

# Windows: Download installer from https://www.postgresql.org/download/windows/
```

**Option B: Docker (recommended)**
```bash
# Install Docker from https://www.docker.com/products/docker-desktop
# Then run:
docker-compose up -d postgres redis
```

### 3. **Redis** (optional but recommended for caching)
```bash
# macOS
brew install redis

# Ubuntu/Debian
sudo apt-get install redis-server

# Or via Docker (see above)
```

---

## 🔑 Set Up Environment Variables

### Backend

1. Copy template to actual file:
```bash
cp backend/.env.example backend/.env
```

2. Edit `backend/.env` and add:
```
# Get from https://console.anthropic.com
ANTHROPIC_API_KEY=sk-ant-v0-...

# Create a new Mapbox token at https://account.mapbox.com/tokens/
MAPBOX_TOKEN=pk_eyJ...

# If using local PostgreSQL:
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/resto_dev

# If using Docker:
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/resto_dev

# Change this to a random string for production
JWT_SECRET=your_random_secret_key_here

# Optional: If using Redis
REDIS_URL=redis://localhost:6379
REDIS_ENABLED=true
```

### Frontend

1. Copy template:
```bash
cp frontend/.env.example frontend/.env.local
```

2. Edit `frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_MAPBOX_TOKEN=pk_eyJ...  # Same as backend
```

---

## 📦 Install Dependencies

```bash
# Backend
cd backend
npm install
cd ..

# Frontend
cd frontend
npm install
cd ..
```

---

## 🗄️ Set Up Database

### Option A: Docker (Easiest)
```bash
docker-compose up -d postgres redis

# Wait 10 seconds for PostgreSQL to be ready, then:
docker-compose exec postgres psql -U postgres -d resto_dev -f /docker-entrypoint-initdb.d/schema.sql
```

### Option B: Local PostgreSQL
```bash
# Create database
createdb -U postgres resto_dev

# Load schema
psql -U postgres -d resto_dev -f backend/db/schema.sql

# Verify connection
psql -U postgres -d resto_dev -c "SELECT * FROM venues LIMIT 1;"
```

---

## 🚀 Start Development Servers

### Terminal 1: Backend API
```bash
cd backend
npm run dev

# Expected output:
# ✓ PostgreSQL connected
# ✓ Resto backend running on http://localhost:3001
```

### Terminal 2: Frontend
```bash
cd frontend
npm run dev

# Expected output:
# ▲ Next.js running on http://localhost:3000
```

### Terminal 3: Redis (if using Docker)
```bash
# Already running from docker-compose up -d
# Check status:
docker-compose ps
```

---

## ✨ Verify Everything Works

### Test Backend API

```bash
# Health check
curl http://localhost:3001/health

# Parse intent
curl -X POST http://localhost:3001/api/parse-intent \
  -H "Content-Type: application/json" \
  -d '{"query": "best lunch spot near Stureplan under 200 SEK"}'

# Expected: JSON response with intent fields
```

### Test Frontend

1. Open http://localhost:3000 in your browser
2. You should see the Resto search page
3. Try entering a query (won't work yet because database is empty, but UI should be responsive)

---

## 🔍 What's Next: Week 1 Tasks

### Task 1: Google Maps Scraper
File: `backend/scrapers/google-maps.js` (stub needs implementation)

**Goal:** Scrape 100+ restaurants from central Stockholm

**Required npm packages:**
```bash
npm install puppeteer dotenv
```

**Steps:**
1. Research Google Maps scraping approach (Puppeteer or API)
2. Implement scraper to extract:
   - Name, address, lat/lng
   - Cuisine tags, price range
   - Ratings, reviews
3. Test locally:
```bash
node backend/scrapers/google-maps.js
```
4. Verify data in PostgreSQL:
```bash
psql -U postgres -d resto_dev -c "SELECT COUNT(*) FROM venues;"
```

### Task 2: Complete `/search` Endpoint
File: `backend/api/search.js` (currently a stub)

**Goal:** Implement full search flow:
1. Call `/parse-intent` to extract user intent
2. Filter venues from database based on intent
3. Call `/rank` to score and sort venues
4. Return top 5 with explanations

**Implementation Steps:**
1. Write database query helpers
2. Integrate Claude API calls
3. Test with sample queries

### Task 3: Frontend Integration
File: `frontend/pages/index.tsx` (already wired, needs testing)

**Goal:** Connect frontend to backend, test search flow end-to-end

**Steps:**
1. Add sample restaurants to database (via scraper or manual SQL)
2. Test search from UI
3. Verify map displays correctly
4. Debug any CORS or connection issues

---

## 📋 Credentials Checklist

Mark these off as you gather them:

- [ ] Anthropic API Key — Get from https://console.anthropic.com
- [ ] Mapbox Token — Create at https://account.mapbox.com/tokens/
- [ ] PostgreSQL running locally or in Docker
- [ ] Redis running (optional but recommended)

---

## 🐛 Troubleshooting

### "Cannot connect to PostgreSQL"
- Check `DATABASE_URL` in `backend/.env`
- Verify PostgreSQL is running: `psql -U postgres -c "\l"`
- If using Docker: `docker-compose ps` should show `postgres` running

### "Anthropic API key is invalid"
- Go to https://console.anthropic.com
- Create a new API key
- Copy entire key (including `sk-ant-` prefix) to `backend/.env`

### "Mapbox token not working"
- Create new token at https://account.mapbox.com/tokens/
- Use public token (not secret)
- Add to both `backend/.env` and `frontend/.env.local`

### "npm install fails"
- Delete `node_modules` and `package-lock.json`
- Run `npm install` again
- If still failing, check Node version: `node --version` (should be 18+)

### "Frontend won't connect to backend"
- Check `NEXT_PUBLIC_API_URL` in `frontend/.env.local`
- Verify backend is running on port 3001
- Check browser console for CORS errors
- If behind proxy, may need to adjust API URL

---

## 📝 Next Steps

1. **Gather credentials** (Anthropic API key, Mapbox token)
2. **Set up database** (PostgreSQL + load schema)
3. **Start dev servers** (backend + frontend)
4. **Implement Google Maps scraper** (Week 1 priority)
5. **Complete `/search` endpoint** (integrate Claude)
6. **Test end-to-end** (search → parse intent → rank → display results)

---

## 📞 Need Help?

- **API Issues?** See `docs/API.md` for endpoint specs
- **Architecture Questions?** See `docs/ARCHITECTURE.md`
- **Data Strategy?** See `docs/DATA_SOURCES.md`
- **General Questions?** Check `README.md`

Good luck! You've got a solid foundation. Now let's build the MVP! 🚀
