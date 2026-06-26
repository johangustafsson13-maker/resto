# Unified Venue Database Architecture

**Problem**: Currently managing terraces and restaurants as separate systems, causing duplicate logic and inconsistency.

**Solution**: Single unified Supabase database + intelligent search/filtering.

---

## Current Architecture (❌ Problematic)

```
┌─────────────────────────┐
│   Supabase Database     │
│   (venues table)        │
│   - Terraces only       │
│   - Limited filtering   │
└─────────────────────────┘
         ↓
    ┌────┴──────────┐
    │               │
┌───▼──────┐  ┌───▼──────┐
│ Terraces │  │Restaurants│
│   Tab    │  │    Tab    │
│(filtered)│  │ (searched)│
└──────────┘  └───────────┘

Issues:
- Two different UIs for same data
- Sunshine logic only on terraces
- Search results don't show sunshine
- Can't filter search results
- Maintenance nightmare
```

---

## Proposed Architecture (✅ Unified)

```
┌──────────────────────────────────────┐
│    Unified Venue Database            │
│    (Supabase: venues table)          │
│                                      │
│  - name, address, lat, lng           │
│  - cuisine_tags, price_range, rating │
│  - outdoor_seating (BOOLEAN)         │
│  - indoor_seating (BOOLEAN)          │
│  - type_flags (terrace/restaurant)   │
│  - description (searchable)          │
│  - created_at, updated_at            │
│  - sunshine_status (computed)        │
│  - searchable_content (for Claude)   │
└──────────────────────────────────────┘
              ↓
    ┌─────────┴─────────┐
    │                   │
┌───▼─────────┐  ┌─────▼──────┐
│  Terraces   │  │ Restaurants│
│  Tab        │  │  Tab       │
│ (Filtered)  │  │(Searched)  │
└─────────────┘  └────────────┘

Both use:
- Same database
- Same sunshine logic
- Same venue records
- Consistent experience
```

---

## Database Schema Changes

### Current `venues` Table Structure
```sql
CREATE TABLE venues (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  address VARCHAR(255),
  city VARCHAR(100),
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  cuisine_tags TEXT[],
  price_range INT,
  google_rating DECIMAL(2, 1),
  review_count INT,
  outdoor_seating BOOLEAN,
  kid_friendly BOOLEAN,
  wheelchair_accessible BOOLEAN,
  wifi BOOLEAN,
  phone VARCHAR(20),
  website VARCHAR(255),
  open_hours JSONB,
  external_id VARCHAR(255),
  source VARCHAR(100),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Enhanced Schema (Proposed)
```sql
-- Add these columns to venues table
ALTER TABLE venues ADD COLUMN description TEXT;
ALTER TABLE venues ADD COLUMN is_terrace BOOLEAN DEFAULT false;
ALTER TABLE venues ADD COLUMN is_restaurant BOOLEAN DEFAULT true;
ALTER TABLE venues ADD COLUMN indoor_seating BOOLEAN DEFAULT true;
ALTER TABLE venues ADD COLUMN searchable_content TEXT GENERATED ALWAYS AS (
  name || ' ' || address || ' ' || array_to_string(cuisine_tags, ', ') || ' ' || COALESCE(description, '')
) STORED;

-- Create index for full-text search
CREATE INDEX idx_venues_search ON venues USING GIN(
  to_tsvector('swedish', searchable_content)
);

-- Create composite index for filtering
CREATE INDEX idx_venues_type_seating ON venues(is_terrace, is_restaurant, outdoor_seating, indoor_seating);
```

### New Type Combinations
```sql
-- Terrace: outdoor_seating=true, outdoor focus
UPDATE venues SET is_terrace = true WHERE outdoor_seating = true;

-- Restaurant: indoor focus (default)
UPDATE venues SET is_restaurant = true, indoor_seating = true;

-- Café: usually both
UPDATE venues SET is_terrace = true, is_restaurant = true WHERE cuisine_tags @> ARRAY['Café'];

-- Bar/Pub: both indoors and outdoors
UPDATE venues SET is_terrace = true, is_restaurant = true WHERE cuisine_tags @> ARRAY['Bar'];
```

---

## API Changes

### Current Search Endpoint
```javascript
POST /api/search
{
  "query": "sunny terrace with pizza",
  "type": "terrace",  // Only terrace or restaurant
  "limit": 5
}
```

### Enhanced Search Endpoint
```javascript
POST /api/search
{
  "query": "sunny pizza place with outdoor seating",
  "type": "all",  // "terrace" | "restaurant" | "all"
  "filters": {
    "outdoor_seating": true,    // Optional
    "price_max": 3,             // Optional
    "cuisine": ["Italian"],     // Optional
    "has_sunshine": true        // Optional - from real-time calculation
  },
  "limit": 10
}
```

---

## Frontend Changes

### Single Unified Search Component
```typescript
interface VenueQuery {
  query?: string;           // "pizza place with sun"
  type: "terrace" | "restaurant" | "all";
  filters: {
    sunny?: boolean;
    price?: 1-5;
    cuisine?: string[];
    outdoor?: boolean;
  };
}
```

### Results Display (Same for Both Tabs)
```
Result Card:
├── Name & Address
├── Rating & Reviews
├── Sunshine Status: ☀️ 100% Sunny
├── Seating: 🪑 Indoor | 🌳 Outdoor
├── Cuisine Tags
└── Distance to User
```

---

## Benefits

| Aspect | Current | Unified |
|--------|---------|---------|
| **Database** | Terraces only | All venues |
| **Search** | Not in DB | Fully searchable |
| **Filtering** | Basic (terrace) | Advanced (all) |
| **Sunshine** | Terrace only | All results |
| **Consistency** | Two systems | One system |
| **Maintenance** | 2 code paths | 1 code path |
| **User Experience** | Two UIs | Unified UI |

---

## Implementation Steps

### Phase 1: Database (1-2 hours)
- [ ] Add new columns to venues table
- [ ] Migrate existing data (mark terraces with outdoor_seating=true as is_terrace)
- [ ] Create indexes for search performance
- [ ] Update RLS policies for new columns

### Phase 2: Backend Search (2-3 hours)
- [ ] Update `/api/search` endpoint to handle unified queries
- [ ] Implement filter logic in Claude intent parser
- [ ] Add ranking logic that works for both terraces and restaurants
- [ ] Cache sunshine calculations for performance

### Phase 3: Frontend (2-3 hours)
- [ ] Update TypeSelector to work with unified data
- [ ] Modify search filters to work across all venue types
- [ ] Display sunshine status in all results
- [ ] Make venue cards show seating type

### Phase 4: Testing (1 hour)
- [ ] Test terraces filtering
- [ ] Test restaurant search
- [ ] Test "both" tab with mixed results
- [ ] Verify sunshine status accurate everywhere

---

## Example Workflow After Unification

**User searches: "sunny pizza place with outdoor seating"**

1. **Frontend** sends:
   ```json
   {
     "query": "sunny pizza with outdoor seating",
     "type": "all",
     "filters": { "sunshine": true }
   }
   ```

2. **Claude intent parser** understands:
   - Cuisine: Pizza
   - Sunshine: Important (sunny = yes)
   - Seating: Outdoor preferred
   - Venue type: All

3. **Backend queries**:
   ```sql
   SELECT * FROM venues 
   WHERE 'Pizza' = ANY(cuisine_tags)
   AND outdoor_seating = true
   AND (is_terrace OR is_restaurant)
   ORDER BY google_rating DESC
   LIMIT 10;
   ```

4. **Real-time sunshine calculation**:
   - Calculate shadow for each venue's coordinates
   - Add sunshine status to results
   - Rank by both relevance AND sunshine

5. **Frontend displays**:
   - "Sunny Pizza Place" 
   - ☀️ 100% Sunny
   - 🌳 Outdoor Seating
   - ⭐ 4.8 rating
   - Click to see on map

---

## Why This Is Better

✅ **No Duplicate Logic** - Sunshine calculation happens once
✅ **Consistent Experience** - Same data everywhere
✅ **Better Search** - Can search restaurants AND see sunshine
✅ **Future-Proof** - Easy to add new venue types (cafés, bars, etc.)
✅ **Performance** - Single database, optimized queries
✅ **Maintainability** - One code path vs. two

---

## Next: Implementation

Would you like to:
1. **Start with Phase 1** (database schema changes) - Straightforward SQL
2. **Do all phases** - Full unification
3. **Keep terraces separate for now** - Add unification later

Which approach makes sense for your timeline?
