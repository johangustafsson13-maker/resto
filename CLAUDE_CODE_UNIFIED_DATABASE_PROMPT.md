# Claude Code: Unify Venue Database Architecture

**Objective**: Consolidate terraces and restaurants into a single unified venue database with intelligent search and filtering.

**Directory**: `/Users/johangustafsson/resto/Projects/Resto`

**Estimated Time**: 4-6 hours

---

## Overview

Currently, venues are split between:
- **Terraces**: Pre-loaded in Supabase, filtered by sunshine
- **Restaurants**: Semantic search, not persisted, no sunshine status

This project unifies them into ONE database that powers both experiences.

---

## Phase 1: Database Schema Enhancement (SQL)

### Objective
Add type flags, searchable content, and new columns to the venues table.

### Tasks

1. **Create migration file** `backend/migrations/004_unify_venues_schema.sql`
   - Add columns:
     - `is_terrace BOOLEAN DEFAULT false` - Marks terraces/outdoor venues
     - `is_restaurant BOOLEAN DEFAULT true` - Marks restaurants
     - `indoor_seating BOOLEAN DEFAULT true` - New column for indoor availability
     - `description TEXT` - Venue description for search
     - `searchable_content TEXT GENERATED ALWAYS AS (name || ' ' || address || ' ' || array_to_string(cuisine_tags, ', ') || ' ' || COALESCE(description, '')) STORED` - Full-text search content
   
   - Create indexes:
     ```sql
     CREATE INDEX idx_venues_search ON venues USING GIN(to_tsvector('swedish', searchable_content));
     CREATE INDEX idx_venues_type_seating ON venues(is_terrace, is_restaurant, outdoor_seating, indoor_seating);
     ```

2. **Backfill existing data**:
   ```sql
   -- Existing venues with outdoor_seating=true are terraces
   UPDATE venues SET is_terrace = true WHERE outdoor_seating = true AND is_terrace = false;
   
   -- All venues are restaurants by default (already set)
   
   -- Cafés are both
   UPDATE venues SET is_terrace = true WHERE cuisine_tags @> ARRAY['Café'];
   ```

3. **Update RLS policies** (in `backend/rls_policies.sql`):
   - Ensure new columns are accessible
   - No security changes needed (public read, auth write)

### Verification
- Query should return venues with new columns
- Indexes should exist
- Backfill should mark ~100+ venues as terraces

---

## Phase 2: Backend API - Unified Search Endpoint

### Objective
Update `/api/search` to handle unified queries across all venue types with filtering.

### Tasks

1. **Update `backend/api/search.js`**:
   
   a. **New request body schema**:
   ```javascript
   {
     query: string,           // "sunny pizza with outdoor seating"
     type: "terrace" | "restaurant" | "all",  // Venue type filter
     filters: {
       outdoor_seating?: boolean,
       price_max?: 1-5,
       sunshine?: boolean,
       cuisine?: string[],
       radius?: number        // in kilometers from user location
     },
     lat?: number,           // User location (optional)
     lng?: number,
     limit?: number          // default 10
   }
   ```

   b. **Update search logic**:
   - Use Claude to parse intent (existing)
   - Build SQL query based on type + filters
   - Add venue type filtering:
     ```sql
     WHERE (
       ($1::text = 'terrace' AND is_terrace = true) OR
       ($1::text = 'restaurant' AND is_restaurant = true) OR
       ($1::text = 'all')
     )
     ```
   - Add filter conditions:
     - `outdoor_seating`: `AND outdoor_seating = $2`
     - `price_max`: `AND price_range <= $3`
     - `cuisine`: `AND cuisine_tags && $4` (array overlap)
   - Add location filtering (if lat/lng provided):
     ```sql
     ORDER BY 
       (ST_Distance(ST_Point(lng, lat), ST_Point($5, $6)) / 1000) ASC
     LIMIT $7
     ```

   c. **Calculate sunshine status**:
   - For each result, calculate real-time shadow status
   - Return `sunshine_status: { shadowed: boolean, score: 0-100 }`
   - Use existing `isInShadow()` logic from frontend

   d. **Response format**:
   ```javascript
   {
     venues: [
       {
         id, name, address, lat, lng,
         cuisine_tags, price_range, rating, review_count,
         outdoor_seating, indoor_seating,
         is_terrace, is_restaurant,
         sunshine_status: { shadowed: false, score: 95 }
       }
     ],
     total: number,
     query_time_ms: number
   }
   ```

2. **Update `backend/api/rank.js`**:
   - Rank results by:
     - Claude relevance score (existing)
     - Sunshine score (if sunshine=true in filters)
     - Distance (if location provided)
   - Combine scores: `final_score = (relevance * 0.6) + (sunshine * 0.3) + (distance * 0.1)`

3. **Update `backend/api/auth.js`** (if needed):
   - Verify auth still works with new queries
   - No changes needed likely

### Verification
- Test with filters: `{ type: "terrace", filters: { sunshine: true } }`
- Test mixed: `{ type: "all", filters: { price_max: 3 } }`
- Verify sunshine calculations are included
- Check response includes new fields

---

## Phase 3: Frontend - Unified Search UI

### Objective
Update frontend to support unified search and filtering across all types.

### Tasks

1. **Update `frontend/types.ts`**:
   ```typescript
   interface Venue {
     // ... existing fields ...
     is_terrace: boolean;
     is_restaurant: boolean;
     indoor_seating: boolean;
     description?: string;
     sunshine_status?: {
       shadowed: boolean;
       score: number; // 0-100
     };
   }

   type VenueType = 'restaurant' | 'terrace' | 'both';
   // Add 'all' as alias for 'both'

   interface SearchFilters {
     outdoor_seating?: boolean;
     price_max?: number;
     sunshine?: boolean;
     cuisine?: string[];
   }
   ```

2. **Update `frontend/pages/index.tsx`**:
   
   a. **Update search state**:
   ```typescript
   const [filters, setFilters] = useState<SearchFilters>({
     sunshine: false,
   });
   ```

   b. **Update `handleSearch` function**:
   ```javascript
   const handleSearch = async (query: string) => {
     const response = await fetch('/api/search', {
       method: 'POST',
       body: JSON.stringify({
         query,
         type: venueType,
         filters: {
           sunshine: sunFilter === 'sunny' ? true : sunFilter === 'shady' ? false : undefined,
           outdoor_seating: venueType === 'terrace',
           // Add other filter params
         },
         lat: userLocation?.lat,
         lng: userLocation?.lng,
         limit: 10,
       }),
     });
     // ... handle response
   };
   ```

3. **Update `frontend/components/VenueCard.tsx`**:
   - Display seating type: "🪑 Indoor" | "🌳 Outdoor" | "Both"
   - Show venue type badge if needed
   - Display `sunshine_status.score` visually
   - Use existing `SunStatus` component

4. **Enhance filter UI** (in `frontend/pages/index.tsx`):
   - Add more filter buttons:
     ```typescript
     // Existing: All, Sunny, Shady
     
     // Add (optional, expandable):
     <button onClick={() => setFilters({...filters, outdoor_seating: true})}>
       🌳 Outdoor Only
     </button>
     <button onClick={() => setFilters({...filters, price_max: 2})}>
       💰 Budget-Friendly
     </button>
     ```

5. **Update `frontend/components/TypeSelector.tsx`**:
   - Change "Both" label if needed
   - Ensure 'terrace' type loads all outdoor venues
   - Ensure 'restaurant' type shows sunshine status

### Verification
- Search works with type: "all"
- Sunshine status displays correctly
- Filters apply to search results
- Can switch between tabs and filters persist

---

## Phase 4: Testing & Validation

### Objective
Verify all functionality works correctly across tabs.

### Tasks

1. **Manual testing checklist**:
   - [ ] Terraces tab: Load venues, show sunshine
   - [ ] Terraces tab: Filter by sunny/shady
   - [ ] Restaurants tab: Search returns sunshine status
   - [ ] Restaurants tab: Sunshine filter available
   - [ ] Both tab: Mixed results with sunshine
   - [ ] Search: Returns venues with `is_terrace` and `is_restaurant` flags
   - [ ] Map: Shows all venues with correct shadows
   - [ ] Filters: Apply correctly across all types

2. **Database validation**:
   - [ ] All columns added successfully
   - [ ] Indexes created
   - [ ] Backfill complete (~100+ venues marked as terraces)
   - [ ] RLS policies still work
   - [ ] Sunshine calculations accurate

3. **API testing**:
   - [ ] POST /api/search with type: "all" returns results
   - [ ] Filters applied correctly to results
   - [ ] Sunshine status calculated for all results
   - [ ] Response includes new fields
   - [ ] Performance acceptable (<500ms for typical search)

4. **Frontend testing**:
   - [ ] Type selector works for all options
   - [ ] Sunshine filter visible on all tabs
   - [ ] Results display seating type
   - [ ] Can search within filtered results
   - [ ] Map shows correct sunshine status

---

## Implementation Order

**Execute in this sequence:**

1. **Phase 1 (Database)**: 30-45 min
   - Create migration
   - Run migration
   - Backfill data
   - Verify with SQL query

2. **Phase 2 (Backend)**: 90-120 min
   - Update search.js
   - Update rank.js
   - Test API endpoints
   - Verify sunshine calculations

3. **Phase 3 (Frontend)**: 90-120 min
   - Update types
   - Update pages/index.tsx
   - Update components
   - Update UI filters

4. **Phase 4 (Testing)**: 30-60 min
   - Run full test suite
   - Manual testing
   - Bug fixes

---

## Files to Modify

**Database**:
- [ ] `backend/migrations/004_unify_venues_schema.sql` (new)
- [ ] `backend/rls_policies.sql` (update)

**Backend**:
- [ ] `backend/api/search.js`
- [ ] `backend/api/rank.js`

**Frontend**:
- [ ] `frontend/types.ts`
- [ ] `frontend/pages/index.tsx`
- [ ] `frontend/components/VenueCard.tsx`
- [ ] `frontend/components/TypeSelector.tsx`

**Documentation**:
- [ ] Update `UNIFIED_VENUE_DATABASE_PLAN.md` with implementation notes
- [ ] Create `IMPLEMENTATION_LOG.md` documenting changes

---

## Success Criteria

- ✅ All venues in single unified database
- ✅ Terraces tab shows sunshine status + filters
- ✅ Restaurants tab shows sunshine status from search
- ✅ "Both" tab shows mix of results with sunshine
- ✅ Can filter restaurants by outdoor seating
- ✅ Can search terraces by cuisine/name
- ✅ Map shows accurate sunshine for all venues
- ✅ Performance: <500ms typical query time
- ✅ All RLS policies still enforced
- ✅ No data loss during migration

---

## Rollback Plan

If something breaks:

1. **Database**: Keep old migration, create rollback migration to drop new columns
2. **Backend**: Old API still accepts old request format (backwards compatible)
3. **Frontend**: Switch back to old TypeSelector if needed

---

## Notes

- Use existing `isInShadow()` logic from frontend/lib/sunScore.ts for sunshine calculations
- Reuse existing Claude intent parser (don't rewrite)
- Keep existing RLS policies working
- Maintain backwards compatibility in API if possible
- Run migrations through Supabase dashboard SQL editor

---

## Claude Code Execution

Run this prompt with Claude Code:

```bash
claude code ~/resto/Projects/Resto
```

Then provide this entire document as context, or copy-paste the individual phase prompts as needed.

Suggested Claude Code execution:
1. Start with Phase 1 (SQL only)
2. Then Phase 2 (Backend changes)
3. Then Phase 3 (Frontend changes)
4. Finally Phase 4 (Testing)

Can split across multiple Claude Code sessions if needed.
