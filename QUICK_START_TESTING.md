# Quick Start: Phase 4 Testing

**Goal**: Verify unified venue database works end-to-end  
**Time**: 30-45 minutes  
**Prerequisites**: Supabase access, dev environment running

---

## 1. Start Services (5 min)

### Terminal 1: Backend
```bash
cd /Users/johangustafsson/resto/Projects/Resto/backend
npm run dev
# Wait for: "Backend running on http://localhost:3001"
```

### Terminal 2: Frontend
```bash
cd /Users/johangustafsson/resto/Projects/Resto/frontend
npm run dev
# Wait for: "ready - started server on 0.0.0.0:3000"
```

### Terminal 3: Testing (optional)
```bash
cd /Users/johangustafsson/resto/Projects/Resto
# Ready for curl tests
```

---

## 2. Quick Database Check (5 min)

**In Supabase SQL Editor**:

```sql
-- Check columns exist
SELECT COUNT(*) as venues FROM venues;
SELECT COUNT(*) as terraces FROM venues WHERE is_terrace = true;
SELECT COUNT(*) as restaurants FROM venues WHERE is_restaurant = true;
SELECT COUNT(*) as both FROM venues WHERE is_terrace = true AND is_restaurant = true;

-- Sample result:
-- venues | terraces | restaurants | both
--   850  |   120    |     850      | 20
```

✅ **Success**: Terraces > 0 and Both > 0

---

## 3. Test API Endpoints (10 min)

**In Terminal 3, get a token first**:
```bash
# Sign up / log in and grab token from browser localStorage
# (Navigate to http://localhost:3000, sign in, check DevTools → Application → localStorage)
export TOKEN="your_token_here"
```

### Test 3a: Restaurant search
```bash
curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"pizza", "type":"restaurant", "limit":3, "filters":{}}' | jq '.venues[] | {name, is_restaurant, is_terrace}'
```

**Expected output**:
```json
{
  "name": "Pizzeria XYZ",
  "is_restaurant": true,
  "is_terrace": false
}
```

### Test 3b: Terrace search
```bash
curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"sunny", "type":"terrace", "limit":3, "filters":{}}' | jq '.venues[] | {name, is_terrace, outdoor_seats}'
```

**Expected output**:
```json
{
  "name": "Terrasse ABC",
  "is_terrace": true,
  "outdoor_seats": 25
}
```

### Test 3c: Outdoor seating filter
```bash
curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"food", "type":"both", "limit":5, "filters":{"outdoor_seating":true}}' | jq '.venues[] | {name, outdoor_seating}'
```

**Expected**: All `outdoor_seating: true`

✅ **Success**: All three endpoints return valid data with new fields

---

## 4. Test Frontend (15 min)

### Open http://localhost:3000

#### 4a: Sign In
- [ ] Click "Log In"
- [ ] Enter test credentials
- [ ] Redirected to home page

#### 4b: Check Restaurants Tab
- [ ] Click "🍽️ Restaurants"
- [ ] Wait for venues to load
- [ ] Check venue cards show:
  - [x] Name
  - [x] Type badge (🍽️ Restaurant or Restaurant + Terrace)
  - [x] Address
  - [x] Seating icons (🪑 Outdoor / 🏠 Indoor)
  - [x] Rating and price

#### 4c: Check Terraces Tab
- [ ] Click "☀️ Terraces"
- [ ] Venues load
- [ ] Check venue cards show:
  - [x] Name
  - [x] Type badge (☀️ Terrace or Restaurant + Terrace)
  - [x] Sun status (green = Sunny, gray = In Shadow)
  - [x] Outdoor seats count

#### 4d: Check Both Tab
- [ ] Click "🌍 Both"
- [ ] See mix of restaurants and terraces
- [ ] Verify type badges are correct

#### 4e: Test Sunshine Filter
- [ ] Click "☀️ Sunny"
  - [x] Only sunny venues visible
  - [x] All have green "Sunny" status
- [ ] Click "🌳 Shady"
  - [x] Only shaded venues visible
  - [x] All have gray "In Shadow" status
- [ ] Click "All"
  - [x] All venues visible again

#### 4f: Test Search
- [ ] In Restaurants tab, type "coffee" and press enter
  - [x] Returns cafés and coffee shops
  - [x] Shows sunshine status
- [ ] In Terraces tab, type "center" and press enter
  - [x] Returns central terraces
  - [x] Shows sunshine status

#### 4g: Test Map
- [ ] Map should show:
  - [x] Blue marker for "Your Location"
  - [x] Colored markers for venues
  - [x] Orange for indoor restaurants
  - [x] Green/Yellow/Gray for sunny/moderate/shaded
- [ ] Click venue marker
  - [x] Popup shows venue name and address
- [ ] Click venue card in list
  - [x] Marker highlights on map
- [ ] Zoom in/out
  - [x] Shadows appear at zoom 12+

#### 4h: Check No Errors
- [ ] Open DevTools (F12)
- [ ] Check Console tab
  - [x] No red error messages
  - [x] No "Cannot read property 'type'" errors
  - [x] Geolocation request visible

✅ **Success**: All features work without errors

---

## 5. Spot Checks

### Check 5a: Mixed venue type
Find a venue that's both restaurant and terrace (e.g., café):
- [ ] Shows "Restaurant + Terrace" badge (in purple)
- [ ] Appears in all three tabs
- [ ] Shows sunshine status
- [ ] Shows both "🪑 Outdoor" and "🏠 Indoor"

### Check 5b: Indoor-only restaurant
Find a venue with `is_terrace: false, is_restaurant: true`:
- [ ] Shows "🍽️ Restaurant" badge (in blue)
- [ ] Only appears in Restaurants and Both tabs
- [ ] Orange marker on map
- [ ] NO sun status shown
- [ ] Shows "🏠 Indoor" only

### Check 5c: Outdoor-seating restaurant
Find a venue with `outdoor_seating: true, is_restaurant: true`:
- [ ] Shows seating icon "🪑 Outdoor"
- [ ] Sunshine filter shows it
- [ ] Green/yellow marker if sunny, gray if shaded
- [ ] Shows sun status

---

## 6. Performance Check

### API Response Time
```bash
time curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"restaurant", "type":"both", "limit":10, "filters":{}}'
```

✅ **Success**: < 500ms total time

### Frontend Load Time
- [ ] Open DevTools → Network tab
- [ ] Reload page
- [ ] Check "Finish" time
  - ✅ **Success**: < 3 seconds

---

## 7. Sign-Off Checklist

After completing all tests:

- [ ] Database has new columns (is_terrace, is_restaurant, indoor_seating)
- [ ] All API endpoints return data with type flags
- [ ] Frontend renders venue type badges correctly
- [ ] All three tabs (Restaurants, Terraces, Both) work
- [ ] Sunshine filter works on all tabs
- [ ] Map shows correct marker colors
- [ ] No console errors
- [ ] Performance acceptable
- [ ] Found at least one "both" type venue (café)

**If all ✅**: Phase 4 testing PASSED ✨

---

## Troubleshooting

### "Cannot GET /"
**Solution**: Frontend dev server not running. Run `npm run dev` in frontend directory.

### API returns "type not found"
**Solution**: Old migration ran. Run the fixed migration:
```bash
node backend/run-migration.js
```

### "Authorization required"
**Solution**: Token expired or invalid. Sign in again and copy fresh token.

### Venues showing "Unknown" sun status
**Solution**: Map needs to load buildings. Zoom in to level 12+ and wait 5 seconds.

### Type badge says "Restaurant" but should say "Terrace"
**Solution**: Data backfill issue. Check database:
```sql
SELECT id, name, is_terrace, is_restaurant FROM venues WHERE id = XXX;
```

### Map won't load
**Solution**: Mapbox token missing. Set in `.env.local`:
```bash
NEXT_PUBLIC_MAPBOX_TOKEN=your_token_here
```

---

## Next Steps

✅ **All tests passed?**
→ Move to deployment or Phase 5 enhancements

❌ **Issues found?**
→ Fix using IMPLEMENTATION_SUMMARY.md as reference
→ Re-run failing test

---

**Estimated time**: 30-45 minutes  
**Questions?** Check PHASE_4_TESTING.md for detailed breakdown
