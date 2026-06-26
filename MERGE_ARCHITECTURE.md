# Stockholm Explorer: Merge Architecture Plan
**Timeline: 3 weeks to production**
**MVP Scope: Restaurants + Terraces (v1)**

---

## Executive Summary

Consolidate Resto (restaurant AI search) and stockholm-sun-finder (sunny terraces) into a unified "Stockholm Explorer" platform. Keep Resto's Next.js stack as primary, migrate sun-finder React components into it, and unify the Supabase database.

**Why this approach:**
- Resto already deployed and working (auth, search, quota system, backend)
- Both projects use Supabase (single database consolidation)
- Next.js better for SEO + production stability than Vite
- Minimal backend changes needed (mostly schema updates)
- Allows phased rollout: launch unified app within 3 weeks

---

## 1. Tech Stack Decision

### Primary Frontend: Keep Resto's Next.js
- **Why:** Already deployed to Vercel, authentication working, search flow established
- **Framework:** Next.js 14 (SSR, API routes, built-in routing)
- **UI Components:** shadcn/ui (both projects already use this)
- **Styling:** Tailwind CSS

### Migrate sun-finder Components to Next.js
- **VenueMap** → `/frontend/components/Map.tsx` (enhanced with sun calculations)
- **TerraceCard** → `/frontend/components/TerraceCard.tsx` (reusable card component)
- **HeroSection** → Use Resto's existing header pattern or adapt as landing section
- **MapContext** → Create `/frontend/contexts/MapContext.tsx` for shared map state

### Backend: Keep Express/Node.js
- Existing search endpoint works; extend it for terraces
- Database consolidation in PostgreSQL/Supabase

### Maps & Sun Calculations
- Keep **Mapbox GL** (already integrated in both)
- Keep **suncalc** library (migrate to Resto's dependencies)
- Unified map component that renders both restaurants and terraces

---

## 2. Database Schema Unification

### Current State
- **Resto:** Supabase instance `fbukjbbdlsfywjszuoqo` with `venues` table (restaurants, SERIAL id)
  - Columns: id (INT), name, description, address, city, lat, lng, cuisine_tags, price_range, google_rating, review_count, outdoor_seating, kid_friendly, wheelchair_accessible, wifi, phone, website, open_hours, source, external_id, created_at, updated_at
- **sun-finder:** Separate Supabase instance `guucodkurwwqgylbreag` with `venues` table (terraces, UUID id)
  - Columns: id (UUID), address, created_at, google_place_id, is_active, lat, lng, name, neighbourhood, orientation, outdoor_seats

**CRITICAL:** Both projects use DIFFERENT Supabase instances. Migration strategy: consolidate all data into Resto's Supabase instance (already in production with auth/users/quota infrastructure).

### New Unified Schema
**Table: `venues`**

```sql
CREATE TABLE venues (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL, -- 'restaurant' | 'terrace'
  
  -- Common fields
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  lat DECIMAL(9,6) NOT NULL,
  lng DECIMAL(9,6) NOT NULL,
  neighbourhood TEXT,
  
  -- Restaurant-specific
  cuisine_tags TEXT[] DEFAULT NULL,
  price_range INT (1-5) DEFAULT NULL,
  phone TEXT DEFAULT NULL,
  website TEXT DEFAULT NULL,
  open_hours JSONB DEFAULT NULL,
  kid_friendly BOOLEAN DEFAULT NULL,
  wheelchair_accessible BOOLEAN DEFAULT NULL,
  wifi BOOLEAN DEFAULT NULL,
  
  -- Terrace-specific
  outdoor_seats INT DEFAULT NULL,
  orientation TEXT DEFAULT NULL, -- 'north', 'south', 'east', 'west', etc.
  sun_score_current INT DEFAULT NULL, -- 0-100, calculated at request time
  
  -- Common metadata
  google_rating DECIMAL(3,1) DEFAULT NULL,
  review_count INT DEFAULT NULL,
  outdoor_seating BOOLEAN DEFAULT NULL,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_venues_type ON venues(type);
CREATE INDEX idx_venues_location ON venues(lat, lng);
```

### Data Migration Plan
1. **Restaurants:** `INSERT INTO venues (type, ...) SELECT 'restaurant', ... FROM old_restaurants;`
2. **Terraces:** `INSERT INTO venues (type, ...) SELECT 'terrace', ... FROM old_terraces;`
3. Keep old tables as backup during testing, drop after verification

---

## 3. Frontend Architecture

### Route Structure
```
/
  ├── /index.tsx                 (Main search/discovery page)
  ├── /auth
  │   ├── /login.tsx
  │   ├── /signup.tsx
  └── /api/
      └── /search.ts             (Next.js API route)
```

### Page Layout: `/pages/index.tsx`

```
Header (Resto branding + auth)
  ↓
Hero Section / Intro Text
  ↓
Type Selector Tabs: "Restaurants" | "Terraces" | "Both"
  ↓
Search Box (unified for both types)
  ↓
Results Grid:
  ├─ Unified Map (restaurants + terraces)
  └─ Card list (filtered by type + search)
```

### Key Components

| Component | Source | Purpose |
|-----------|--------|---------|
| `SearchBox.tsx` | Resto (existing) | Query input, handles both types |
| `Map.tsx` | New (migrate VenueMap) | Unified map, renders both types with color coding |
| `VenueCard.tsx` | Resto (adapt) | Restaurant card component |
| `TerraceCard.tsx` | sun-finder (adapt) | Terrace card component with sun info |
| `MapContext.tsx` | New | Shared map state (selected venue, filters) |
| `TypeSelector.tsx` | New | "Restaurants" / "Terraces" / "Both" tabs |

### Color Coding
- **Restaurants:** Orange pins (existing)
- **Terraces:** Green pins (high sun), Yellow (medium), Gray (shaded)
- **Both selected:** Show all pins

---

## 4. Backend API Changes

### Unified Search Endpoint: `POST /api/search`

**Request:**
```json
{
  "query": "best coffee in vasastan",
  "type": "restaurant",  // or "terrace", "both"
  "limit": 5
}
```

**Response:**
```json
{
  "query": "best coffee in vasastan",
  "type": "restaurant",
  "intent": {
    "location": "vasastan",
    "cuisine": "coffee",
    ...
  },
  "venues": [
    {
      "id": 1,
      "type": "restaurant",
      "name": "Café X",
      "address": "...",
      "lat": 59.3337,
      "lng": 18.0736,
      "cuisine_tags": ["coffee"],
      "price_range": 2,
      "google_rating": 4.5,
      ...
    },
    {
      "id": 200,
      "type": "terrace",
      "name": "Terrace Y",
      "address": "...",
      "outdoor_seats": 40,
      "orientation": "south",
      "sun_score_current": 85,
      ...
    }
  ]
}
```

### Search Logic Updates

**File: `backend/api/search.js`**

```javascript
// Modified fetchCandidates to handle both types
async function fetchCandidates(intent, query, type = 'both') {
  const locationCoords = resolveNeighborhood(intent.location);
  const center = locationCoords || STOCKHOLM_CENTER;
  const radiusKm = locationCoords ? 3.0 : 6.0;
  
  // Build WHERE clause based on type filter
  let typeFilter = type === 'both' ? '' : `AND type = $6`;
  
  const sql = `
    SELECT ... FROM venues
    WHERE lat::float BETWEEN $1 AND $2
      AND lng::float BETWEEN $3 AND $4
      AND ($5::int IS NULL OR price_range IS NULL OR price_range <= $5)
      ${typeFilter}
    ORDER BY google_rating::float DESC NULLS LAST
    LIMIT 80
  `;
  
  return await db.any(sql, [lat1, lat2, lng1, lng2, maxPrice, type].filter(Boolean));
}

// For terraces, calculate sun_score in response
function addSunScore(venue) {
  if (venue.type === 'terrace') {
    const sunPos = SunCalc.getPosition(new Date(), venue.lat, venue.lng);
    venue.sun_score_current = calculateSunScore(sunPos, venue.orientation);
  }
  return venue;
}
```

### No Changes Required
- Authentication (JWT tokens work as-is)
- Quota system (applies to both types)
- Caching (key includes type filter)

---

## 5. Implementation Phases

### Phase 1: Database & Backend (Days 1-2)
- [ ] Create new unified `venues` table
- [ ] Migrate restaurant data (add type='restaurant')
- [ ] Migrate terrace data (add type='terrace')
- [ ] Add `type` parameter to search endpoint
- [ ] Deploy updated backend to Render

### Phase 2: Frontend Component Migration (Days 3-5)
- [ ] Install suncalc in Resto's dependencies
- [ ] Migrate `VenueMap` component (enhance with sun calculations)
- [ ] Migrate `TerraceCard` component
- [ ] Create `MapContext` for shared state
- [ ] Create `TypeSelector` tabs component
- [ ] Adapt `SearchBox` to support type filtering

### Phase 3: Page Layout & Integration (Days 6-8)
- [ ] Update `/pages/index.tsx` with tabs + unified search
- [ ] Implement type filtering in search flow
- [ ] Update `VenueCard` to show restaurant-specific info
- [ ] Ensure map renders both types with proper colors
- [ ] Test search for restaurants, terraces, and both

### Phase 4: Testing & Polish (Days 9-10)
- [ ] E2E test: search restaurants + terraces together
- [ ] Test sun calculations in map
- [ ] Test mobile responsiveness
- [ ] Performance: verify map load time with 200+ venues
- [ ] Verify auth + quota still working

### Phase 5: Deployment (Days 11-14)
- [ ] Deploy updated frontend to Vercel
- [ ] Smoke tests in production
- [ ] Monitor API performance
- [ ] Collect user feedback
- [ ] Prepare for Product Hunt launch

---

## 6. Risk Mitigation

### Database Safety
- Keep old `restaurants` and `terraces` tables as backups during testing
- Test migration with small subset first (10 restaurants + 10 terraces)
- Verify ID conflicts don't occur between old and new data
- Roll back plan: restore from Supabase backup

### Search Quality
- Restaurants: Reuse existing cuisine filtering (already working)
- Terraces: Filter by orientation + sun score (new, needs testing)
- Monitor search logs for edge cases (e.g., very cloudy days affecting sun score)

### Frontend Compatibility
- Both projects use shadcn/ui → minimal porting friction
- Both use Mapbox GL → single map component works for both
- Responsive design: ensure cards/map work on mobile

---

## 7. Success Criteria (Week 3)

✅ **Must Have**
- Unified search returns restaurants + terraces
- Type selector (tabs) working
- Map shows both types with color coding
- Authentication still working
- Deployed to Vercel + Render

✅ **Nice to Have**
- Sun score accuracy for terraces
- Advanced filters (cuisine + orientation)
- User can save favorites (future feature)

---

## 8. Known Unknowns & TODOs

- **Sun calculations:** Need to verify SunCalc accuracy at different times/seasons
- **Venue data quality:** Some terraces may not have orientation data; how to handle?
- **Search indexing:** Should we index both types together or separately?
- **User analytics:** How to track restaurant vs. terrace search patterns?

---

## 9. Post-Launch Roadmap (After MVP)

**v1.1 (Week 4)**
- User saved favorites (restaurants + terraces)
- Advanced filters: "Only sunny terraces" + "Vegetarian restaurants"
- Improved terrace data (verify orientation, add photos)

**v1.2 (Week 5)**
- Weather integration (don't recommend shaded terraces if raining)
- User reviews + ratings for both types
- Event listings (concerts at restaurants, etc.)

**v2.0**
- Add 3rd category: "Activities" (hiking trails, museums)
- Mobile app (React Native?)
- Booking integrations (OpenTable for restaurants, direct booking for terraces)

