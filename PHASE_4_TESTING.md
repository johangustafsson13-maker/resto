# Phase 4: Testing & Validation — Unified Venue Database

**Date**: May 28, 2026  
**Status**: Ready for testing

---

## Test Execution Order

### 1. Database Verification
- [ ] Connect to Supabase and verify new columns exist
  ```sql
  SELECT column_name, data_type FROM information_schema.columns 
  WHERE table_name='venues' 
  AND column_name IN ('is_terrace', 'is_restaurant', 'indoor_seating', 'description');
  ```
- [ ] Verify indexes created
  ```sql
  SELECT indexname FROM pg_indexes 
  WHERE tablename = 'venues' AND indexname LIKE 'idx_venues%';
  ```
- [ ] Check backfill success
  ```sql
  SELECT COUNT(*) as total FROM venues;
  SELECT COUNT(*) as terraces FROM venues WHERE is_terrace = true;
  SELECT COUNT(*) as restaurants FROM venues WHERE is_restaurant = true;
  SELECT COUNT(*) as both FROM venues WHERE is_terrace = true AND is_restaurant = true;
  ```

### 2. Backend API Testing

#### Start dev server
```bash
cd /Users/johangustafsson/resto/Projects/Resto/backend
npm run dev
```

#### Test endpoints with curl

**Test 1: Search for restaurants only**
```bash
curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "query": "good food",
    "type": "restaurant",
    "limit": 5,
    "filters": {}
  }'
```
✓ Expected: Response includes `is_restaurant: true` venues  
✓ Expected: All venues have `is_restaurant` and `is_terrace` fields

**Test 2: Search for terraces only**
```bash
curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "query": "sunny terrace",
    "type": "terrace",
    "limit": 5,
    "filters": {}
  }'
```
✓ Expected: Response includes `is_terrace: true` venues

**Test 3: Search all types with outdoor seating filter**
```bash
curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "query": "food",
    "type": "both",
    "limit": 10,
    "filters": { "outdoor_seating": true }
  }'
```
✓ Expected: All results have `outdoor_seating: true`

**Test 4: Search with cuisine filter**
```bash
curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "query": "pizza",
    "type": "both",
    "limit": 10,
    "filters": { "cuisine": ["pizza", "italian"] }
  }'
```
✓ Expected: Results include venues with Pizza/Italian cuisine tags

**Test 5: Verify response format**
```bash
curl -X POST http://localhost:3001/api/search ... | jq '.'
```
✓ Response includes: `query`, `type`, `intent`, `venues`, `total`  
✓ Each venue includes: `id`, `name`, `address`, `lat`, `lng`, `is_terrace`, `is_restaurant`, `outdoor_seating`, `indoor_seating`

### 3. Frontend Testing

#### Start frontend dev server
```bash
cd /Users/johangustafsson/resto/Projects/Resto/frontend
npm run dev
```

#### Manual browser testing

**Test 1: Page loads and shows location prompt**
- [ ] Navigate to http://localhost:3000
- [ ] Sign in with test account
- [ ] Map loads and shows "Your Location" marker (blue dot)
- [ ] No console errors

**Test 2: Type selector works for all venues**
- [ ] Click "🍽️ Restaurants" tab
  - ✓ Loads venues with `is_restaurant: true`
  - ✓ Map shows orange markers for indoor restaurants, colored markers for terraces
  - ✓ Sunshine filter buttons visible (All, ☀️ Sunny, 🌳 Shady)
  
- [ ] Click "☀️ Terraces" tab
  - ✓ Loads venues with `is_terrace: true`
  - ✓ Shows sun status on each venue card (Sunny/In Shadow/Unknown)
  - ✓ Sunshine filter buttons work (All, ☀️ Sunny, 🌳 Shady)
  
- [ ] Click "🌍 Both" tab
  - ✓ Loads mixed results (both terraces and restaurants)
  - ✓ Venue cards show type badge (Restaurant, Terrace, or both)
  - ✓ Sunshine filter visible and works
  - ✓ Map shows appropriate colors for each venue type

**Test 3: Venue card displays correctly**
- [ ] Venue card shows:
  - ✓ Name
  - ✓ Type badge (🍽️ Restaurant, ☀️ Terrace, or both)
  - ✓ Address
  - ✓ Seating info (🪑 Outdoor, 🏠 Indoor, or both)
  - ✓ Sun status (for terraces/outdoor venues)
  - ✓ Rating and price range
  - ✓ Cuisine tags
  - ✓ Contact info

**Test 4: Search works across types**
- [ ] In Restaurants tab: Search "pizza"
  - ✓ Returns pizza restaurants
  - ✓ Shows sunshine status for outdoor-seating venues
  
- [ ] In Terraces tab: Search "central"
  - ✓ Returns central terraces
  - ✓ Shows sunshine status
  
- [ ] In Both tab: Search "coffee"
  - ✓ Returns both cafés and coffee shops
  - ✓ Shows appropriate badges

**Test 5: Sunshine filter works**
- [ ] Click "☀️ Sunny"
  - ✓ Only shows sunny venues (green markers, "Sunny" status)
  - ✓ No gray ("In Shadow") markers visible
  
- [ ] Click "🌳 Shady"
  - ✓ Only shows shaded venues (gray markers, "In Shadow" status)
  - ✓ No green markers visible
  
- [ ] Click "All"
  - ✓ Shows all venues regardless of shadow status

**Test 6: Map interactions**
- [ ] Zoom in/out buttons work
- [ ] 3D toggle works (switches between 2D and 3D views)
- [ ] Tilt controls appear in 3D mode
- [ ] Clicking marker shows popup with venue name/address
- [ ] Clicking venue card highlights marker on map
- [ ] Markers update color based on sun position when zoomed to 3D

**Test 7: Responsive design**
- [ ] On mobile (resize to 375x667):
  - ✓ Layout stacks vertically (map above, results below)
  - ✓ Buttons fit on screen
  - ✓ Text is readable
  
- [ ] On tablet (resize to 768x1024):
  - ✓ Two-column layout still visible
  - ✓ No horizontal scroll

---

## Specific Venue Type Scenarios

### Scenario A: Restaurant with outdoor seating
Expected behavior:
- ✓ Shows 🍽️ Restaurant badge in both Restaurants and Both tabs
- ✓ Has Outdoor seating icon (🪑)
- ✓ Shows sunshine status on all tabs
- ✓ Appears in outdoor_seating filter results

### Scenario B: Dedicated terrace
Expected behavior:
- ✓ Shows ☀️ Terrace badge in Terraces and Both tabs
- ✓ Only appears in Restaurants tab if it's also marked `is_restaurant=true`
- ✓ Always shows sunshine status
- ✓ Shows outdoor_seats instead of price_range

### Scenario C: Café (both restaurant and terrace)
Expected behavior:
- ✓ Shows 🌍 Restaurant + Terrace badge
- ✓ Appears in all three tabs (Restaurants, Terraces, Both)
- ✓ Shows sunshine status
- ✓ Merges information from both types

---

## Known Issues & Workarounds

### Sunshine calculation on backend
**Status**: Deferred (handled client-side only)
- Backend accepts `filters.sunshine` parameter but doesn't enforce it
- Frontend calculates shadow status from map buildings
- Frontend filters results based on sunshine preference after receiving data

### SQL parameter binding
- Cuisine filter uses PostgreSQL array overlap operator (`&&`)
- Verify correct parameter binding: `cuisine_tags && $6::text[]`

---

## Rollback Plan

If critical issues arise:

1. **Database rollback** (if migration broken):
   ```bash
   node backend/run-migration.js  # Re-run migration with fixed SQL
   ```

2. **Backend rollback** (if search.js broken):
   ```bash
   git checkout HEAD~1 backend/api/search.js
   ```

3. **Frontend rollback** (if components broken):
   ```bash
   git checkout HEAD~1 frontend/pages/index.tsx frontend/components/
   ```

4. **Full revert** (if unified database concept failing):
   ```bash
   git revert HEAD  # Revert all Phase 1-3 commits
   ```

---

## Success Criteria for Phase 4

- ✅ All database columns exist and are populated
- ✅ Backend `/api/search` accepts new filters and returns unified results
- ✅ Frontend displays venues with correct type badges
- ✅ Sunshine filtering works across all tabs
- ✅ Map shows appropriate colors for all venue types
- ✅ No console errors during testing
- ✅ Performance acceptable: <500ms per search

---

## Next Steps After Passing Phase 4

1. **Deploy to staging**: Push unified database to test environment
2. **User acceptance testing**: Have actual users test the experience
3. **Performance monitoring**: Monitor API response times and database queries
4. **Analytics**: Track which tabs/filters users prefer
5. **Phase 5 (Optional)**: Add more filters (price, kid-friendly, wheelchair, wifi)
