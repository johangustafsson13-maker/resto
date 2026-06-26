# Data Migration Guide: Consolidating Supabase Instances
**Timeline: 30 minutes**

## Problem
- **Resto** uses Supabase instance: `fbukjbbdlsfywjszuoqo`
- **stockholm-sun-finder** uses Supabase instance: `guucodkurwwqgylbreag`
- Need to consolidate into single instance (keep Resto's)

## Solution
Export terraces data from sun-finder's Supabase, transform it, import into Resto's Supabase.

---

## Step 1: Export Terraces Data from sun-finder Supabase

### Option A: Using Supabase UI (Recommended)
1. Go to [Supabase Console](https://app.supabase.com) → Select `guucodkurwwqgylbreag` project
2. Navigate to **SQL Editor**
3. Run this query to export terraces as JSON:
```sql
SELECT 
  id,
  name,
  address,
  lat,
  lng,
  neighbourhood,
  orientation,
  outdoor_seats,
  is_active,
  google_place_id,
  created_at
FROM venues
WHERE is_active = true
ORDER BY id;
```
4. Click **Download as CSV** (or copy results)

### Option B: Using psql CLI
```bash
# Connect to sun-finder Supabase
psql postgresql://postgres.[PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres

# Export to file
\COPY (
  SELECT 
    id, name, address, lat, lng, neighbourhood, orientation, 
    outdoor_seats, is_active, google_place_id, created_at
  FROM venues
  WHERE is_active = true
) TO 'terraces_export.csv' CSV HEADER;
```

---

## Step 2: Transform Data for Resto Schema

Save this as `terraces_import.json` (ready for Resto's schema):

```json
[
  {
    "type": "terrace",
    "name": "Terrace Name",
    "address": "Street Address",
    "lat": 59.3293,
    "lng": 18.0686,
    "neighbourhood": "vasastan",
    "orientation": "south",
    "outdoor_seats": 40,
    "is_active": true,
    "google_place_id": "ChIJ...",
    "source": "stockholm-sun-finder",
    "external_id": "[UUID-from-original]",
    "created_at": "2024-05-22T10:00:00Z"
  },
  ...
]
```

### Transform Script (Node.js)
```javascript
const fs = require('fs');
const csv = require('csv-parse');

// Read exported CSV
const parser = csv.parse({
  columns: true,
  skip_empty_lines: true,
});

const terraces = [];
parser.on('readable', function() {
  let record;
  while (record = parser.read()) {
    terraces.push({
      type: 'terrace',
      name: record.name,
      address: record.address,
      lat: parseFloat(record.lat),
      lng: parseFloat(record.lng),
      neighbourhood: record.neighbourhood || null,
      orientation: record.orientation || null,
      outdoor_seats: record.outdoor_seats ? parseInt(record.outdoor_seats) : null,
      google_place_id: record.google_place_id || null,
      source: 'stockholm-sun-finder',
      external_id: record.id,
      created_at: record.created_at
    });
  }
});

parser.on('finish', function() {
  fs.writeFileSync('terraces_import.json', JSON.stringify(terraces, null, 2));
  console.log(`✓ Transformed ${terraces.length} terraces`);
});

fs.createReadStream('terraces_export.csv').pipe(parser);
```

---

## Step 3: Create New Unified Venues Table in Resto Supabase

Run migration on Resto's Supabase instance:

```sql
-- Step 1: Backup current restaurants
CREATE TABLE venues_restaurants_backup AS 
SELECT * FROM venues;

-- Step 2: Drop old constraints temporarily
ALTER TABLE venues DROP CONSTRAINT IF EXISTS venues_pkey CASCADE;

-- Step 3: Add new columns for terraces
ALTER TABLE venues ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'restaurant';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS google_place_id VARCHAR(255);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS orientation VARCHAR(50);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS outdoor_seats INT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS neighbourhood VARCHAR(255);

-- Step 4: Mark existing restaurants
UPDATE venues SET type = 'restaurant' WHERE type = 'restaurant' OR type IS NULL;

-- Step 5: Add back constraints
ALTER TABLE venues ADD PRIMARY KEY (id);
ALTER TABLE venues ADD CONSTRAINT check_type CHECK (type IN ('restaurant', 'terrace'));

-- Step 6: Create indexes for new columns
CREATE INDEX idx_venues_type ON venues(type);
CREATE INDEX idx_venues_location_type ON venues(lat, lng, type);
```

---

## Step 4: Import Terraces into Resto Supabase

### Using Supabase UI
1. Go to [Supabase Console](https://app.supabase.com) → Select `fbukjbbdlsfywjszuoqo` project
2. Navigate to **Data Editor** → Select `venues` table
3. Click **Insert** → **New Row**
4. Or use **Import CSV/JSON** if available

### Using Node.js Script
```javascript
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  'https://fbukjbbdlsfywjszuoqo.supabase.co',
  'YOUR_SUPABASE_KEY_FROM_RESTO'
);

async function importTerraces() {
  const terraces = JSON.parse(fs.readFileSync('terraces_import.json', 'utf8'));
  
  // Insert in batches of 100
  for (let i = 0; i < terraces.length; i += 100) {
    const batch = terraces.slice(i, i + 100);
    const { error } = await supabase
      .from('venues')
      .insert(batch);
    
    if (error) {
      console.error(`Batch ${i/100} failed:`, error);
    } else {
      console.log(`✓ Imported ${i + batch.length} terraces`);
    }
  }
}

importTerraces();
```

### Using SQL directly
```sql
-- From psql connected to Resto's Supabase
\COPY venues (type, name, address, lat, lng, neighbourhood, orientation, outdoor_seats, google_place_id, source, external_id, created_at, is_active)
FROM 'terraces_import.csv' CSV HEADER;
```

---

## Step 5: Verify Data

Run these queries in Resto's Supabase to verify:

```sql
-- Count by type
SELECT type, COUNT(*) as count FROM venues GROUP BY type;
-- Expected: restaurants | [count], terraces | [count]

-- Check for invalid data
SELECT COUNT(*) as invalid FROM venues WHERE name IS NULL OR address IS NULL;
-- Expected: 0

-- Sample terraces
SELECT * FROM venues WHERE type = 'terrace' LIMIT 5;

-- Check for duplicate external_ids
SELECT external_id, COUNT(*) as count FROM venues 
WHERE external_id IS NOT NULL 
GROUP BY external_id 
HAVING COUNT(*) > 1;
-- Expected: (empty)
```

---

## Step 6: Update stockholm-sun-finder to Use Resto's Supabase

File: `/Users/johangustafsson/stockholm-sun-finder/src/integrations/supabase/client.ts`

```typescript
// Before
const SUPABASE_URL = "https://guucodkurwwqgylbreag.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "...sun-finder key...";

// After
const SUPABASE_URL = "https://fbukjbbdlsfywjszuoqo.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."; // Get from Resto's Supabase
```

**How to find the key:**
1. Go to Resto's Supabase instance: https://app.supabase.com → fbukjbbdlsfywjszuoqo
2. Settings → API → Copy "anon public" key
3. Paste into stockholm-sun-finder's client.ts

---

## Step 7: Update stockholm-sun-finder Queries

File: `/Users/johangustafsson/stockholm-sun-finder/src/components/TerraceCard.tsx`

```typescript
// Before: Queried all venues
const { data, error } = await supabase
  .from("venues")
  .select("id, name, neighbourhood, outdoor_seats, orientation, address, lat, lng")
  .eq("is_active", true);

// After: Query only terraces
const { data, error } = await supabase
  .from("venues")
  .select("id, name, neighbourhood, outdoor_seats, orientation, address, lat, lng")
  .eq("type", "terrace")
  .eq("is_active", true);
```

---

## Step 8: Test Migration

1. **Backend:** Run `npm test` in `/Users/johangustafsson/resto/Projects/Resto/backend`
   - Verify search returns both restaurants and terraces
2. **Frontend:** Run stockholm-sun-finder locally
   - Verify terraces load and display correctly
   - Test sun calculations still work
3. **Deployment:** 
   - Update Resto backend search.js to handle type='terrace'
   - Deploy to production

---

## Rollback Plan (if needed)

### Option 1: Restore from Backup (safest)
```sql
-- In Resto's Supabase
DELETE FROM venues WHERE type = 'terrace';
-- Terraces are now gone, restaurants remain unchanged
```

### Option 2: Full Rollback
```sql
-- Drop the new table structure
DROP TABLE venues;
-- Restore from backup
ALTER TABLE venues_restaurants_backup RENAME TO venues;
```

---

## Success Checklist

- [ ] Exported terraces data from sun-finder Supabase
- [ ] Transformed data to Resto schema
- [ ] Created new unified schema in Resto Supabase
- [ ] Imported terraces successfully
- [ ] Verified counts: restaurants + terraces = total
- [ ] Updated stockholm-sun-finder Supabase credentials
- [ ] Updated TerraceCard.tsx query to filter by type='terrace'
- [ ] Tested locally: both projects work with unified Supabase
- [ ] No duplicate external_ids
- [ ] All data validation passed

---

## Timeline Estimate
- Step 1 (Export): 5 min
- Step 2 (Transform): 5 min
- Step 3 (Create table): 5 min
- Step 4 (Import): 10 min
- Step 5 (Verify): 5 min
- Step 6-7 (Update code): 10 min
- Step 8 (Test): 10 min

**Total: ~50 minutes**

---

## Questions?

If you encounter issues:
1. Check Supabase query logs for errors
2. Verify CSV formatting (UTF-8, proper delimiters)
3. Test batch import with small subset first (10 rows)
4. Check network connectivity to Supabase

