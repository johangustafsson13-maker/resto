# Populate Restaurants with Outdoor Seating

This guide explains how to automatically populate your Supabase database with Stockholm restaurants that have outdoor seating (uteserveringar).

## What This Does

The script `populate-outdoor-seating.js` will:
- ✅ Search Google Maps for restaurants with "outdoor seating", "terrace", "uteservering", etc.
- ✅ Search across 6 Stockholm neighborhoods
- ✅ Fetch details for each restaurant (name, address, rating, price, cuisine, etc.)
- ✅ Mark them with `outdoor_seating = true`
- ✅ Deduplicate results (won't add duplicates)
- ✅ Insert into Supabase database

## How to Run

### Step 1: Terminal - Navigate to Backend
```bash
cd ~/resto/Projects/Resto/backend
```

### Step 2: Run the Scraper
```bash
node scrapers/populate-outdoor-seating.js
```

### Step 3: Wait for Completion
The script will:
- Search 6 areas × 7 keywords = 42 searches
- Take approximately 10-15 minutes to complete
- Show progress with dots (.) for each restaurant found
- Display summary at the end

**Example output:**
```
🍽️  Populating restaurants with outdoor seating...

📍 Norrmalm
  Searching: "restaurants with outdoor seating Stockholm".....................15 results
  Searching: "restaurants with terrace Stockholm".....................12 results
  ...

📊 Found 156 unique restaurants with outdoor seating
💾 Inserting into database...
✅ Successfully inserted 142 new venues
🎉 Done! Total: 142 venues added
```

## What Gets Populated

Each restaurant entry includes:
- **name** - Restaurant name
- **address** - Full address
- **lat/lng** - Coordinates for map display
- **cuisine_tags** - Array of cuisine types (Pizza, Italian, etc.)
- **price_range** - 1-5 scale
- **google_rating** - Star rating from Google
- **review_count** - Number of reviews
- **phone** - Contact number
- **website** - Restaurant website
- **outdoor_seating** - `true` (marked as having outdoor seating)
- **kid_friendly** - Random for variety
- **wheelchair_accessible** - Random for variety
- **wifi** - Random for variety

## After Running

1. **Verify in Supabase:**
   - Go to [Supabase Dashboard](https://app.supabase.com)
   - Go to **Tables** → **venues**
   - Filter by `outdoor_seating = true`
   - Should see 100+ new restaurants

2. **Reload your app:**
   - Refresh http://localhost:3000
   - Click "☀️ Terraces" tab
   - Should now see many more venues
   - Can filter by sunny/shady
   - Can search within results

## Troubleshooting

### "ERROR: Invalid API key"
- Check `.env` file has `GOOGLE_MAPS_API_KEY` set
- Verify API key is active in Google Cloud Console

### "ERROR: Too many requests"
- Google Places API rate limits apply
- Script already has delays built in
- Wait a few minutes and try again

### "ERROR: Connection failed to database"
- Check `.env` has correct `DATABASE_URL`
- Verify Supabase database is accessible
- Check network connection

### Script stops early
- May have hit API rate limits
- Partially inserted data will still be in database
- Run again later to get more results

## Searching for More Venues

To search different areas or keywords, edit the script:

**To add more areas:**
```javascript
const AREAS = [
  // ... existing areas ...
  { name: 'Djurgården', lat: 59.3276, lng: 18.1352 },
  { name: 'Strandvägen', lat: 59.3323, lng: 18.0955 },
];
```

**To search different keywords:**
```javascript
const SEARCH_QUERIES = [
  // ... existing queries ...
  'fine dining Stockholm',
  'romantic restaurants Stockholm',
];
```

Then run again: `node scrapers/populate-outdoor-seating.js`

## Performance Notes

- Script is designed to respect Google's rate limits
- Uses 200-2500ms delays between requests
- Won't overload your database (uses `ON CONFLICT` to skip duplicates)
- Takes ~10-15 minutes for full search

## Next Steps

After populating:

1. ✅ Reload app → See new venues in Terraces tab
2. ✅ Test filters → Click "Sunny" / "Shady"
3. ✅ Test search → Search for specific restaurant
4. ✅ Check sunshine status → Shows ☀️ or 🌳 icons
5. ✅ Optional: Run again with different keywords/areas

---

**Questions?** Check that:
- Google Maps API key is valid and enabled
- `.env` file is in `/backend` directory with `DATABASE_URL`
- You have sufficient API quota in Google Cloud Console
