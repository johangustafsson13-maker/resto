# Data Collection Strategy

## Phase 1: MVP (Week 1)

### Google Maps Scraper
**Target:** 500 restaurants in central Stockholm

**Neighborhoods:**
- Norrmalm (city center)
- Gamla Stan (old town)
- Södermalm (trendy area)

**Data Extracted:**
- name, address, phone, website
- lat/lng coordinates
- google_rating, review_count
- opening hours (JSON)
- cuisine tags (inferred from categories)
- reviews (sample: ~5-10 per venue)

**Implementation:**
- Use Puppeteer to scrape Google Maps
- Save to PostgreSQL with external_id (Google Place ID)
- Run weekly to refresh ratings/reviews

### Implementation (`backend/scrapers/google-maps.js`)

```javascript
// Pseudocode
const venues = await scrapeGoogleMaps({
  location: "Stockholm",
  bounds: {
    north: 59.35,
    south: 59.30,
    east: 18.15,
    west: 18.00
  },
  query: "restaurant"
});

// For each venue:
// 1. Extract details
// 2. Scrape 5-10 reviews
// 3. Save to DB with source='google_maps'
```

## Phase 2: Expansion (Week 2-3)

### OpenTable Integration
**Data:**
- Real-time availability
- Reservation links
- Dynamic pricing

**Implementation:**
- Use OpenTable API (if available) or scraper
- Link to Google Place IDs
- Update availability hourly

### TripAdvisor Reviews
**Data:**
- Additional reviews (broader audience)
- Photos
- Detailed ratings by aspect

**Implementation:**
- Scrape or API access
- Merge with Google reviews
- Deduplicate by user + date

### Michelin Guide (Sweden)
**Data:**
- Star ratings (1-3 stars)
- Specialties
- Prestige factor

**Implementation:**
- Manual entry (only ~50 starred restaurants in Stockholm)
- High-priority in ranking
- Star as premium badge

### restaurantguiden.se
**Data:**
- Swedish-specific reviews
- Local expertise

## Data Processing Pipeline

### Raw Data → PostgreSQL

```
Raw Venue Data
    ↓
1. Deduplicate by external_id + source
2. Normalize addresses (geocode if needed)
3. Parse cuisine tags
4. Extract amenities from text
5. Store in venues table
    ↓
Reviews
    ↓
1. Scrape review text
2. Deduplicate by external_id + source + date
3. Store in reviews table
    ↓
Sentiment Analysis (Claude)
    ↓
1. Batch process reviews with Claude
2. Extract sentiment scores
3. Update reviews table with scores
```

### Deduplication Strategy

**Venues:**
- Group by coordinates (lat/lng within 50m)
- Group by name similarity (Levenshtein distance)
- Prefer Google Maps as primary source

**Reviews:**
- Deduplicate by (venue_id, author, review_date, text_hash)
- Keep only one copy from each source
- Merge ratings if available from multiple sources

## Sentiment Analysis

### Pipeline

```
Each review in reviews table
    ↓
Claude sentiment analyzer (batched, 10 reviews/call)
    ↓
Update: sentiment_score, food_quality, service, ambiance, value
    ↓
Re-aggregate venue ratings
```

### Claude Prompts

[See backend/claude/sentiment-analyzer.js]

### Aspect Scores

For each review, extract:
- **food_quality** (0-5): Quality of food/dishes
- **service** (0-5): Friendliness/speed of staff
- **ambiance** (0-5): Atmosphere/decor/noise level
- **value** (0-5): Worth the price

Aggregate per venue (average across reviews) for ranking.

## Data Quality Checks

### Before Storing

```
✓ Venue has name and address
✓ Venue has valid coordinates (within Stockholm bounds)
✓ Phone number format is valid
✓ URL is valid (if provided)
✓ Opening hours parse correctly
✓ No duplicate external_id + source
```

### Before Ranking

```
✓ Venue has at least 5 reviews or recent data
✓ Venue coordinates within search area
✓ Venue is currently open or has consistent hours
✓ Venue cuisine matches common categories
```

## Update Strategy

### Fresh Data Maintenance

- **Google Maps:** Refresh ratings/reviews weekly
- **OpenTable:** Refresh availability hourly
- **Reviews:** Deduplicate and re-score monthly
- **Sentiment:** Re-analyze new reviews as they arrive

### Incremental Updates

```sql
-- Find venues not updated in 7 days
SELECT * FROM venues 
WHERE updated_at < NOW() - INTERVAL '7 days'
ORDER BY google_rating DESC
LIMIT 100;

-- Re-scrape and update
```

## Storage & Indexing

### Indexes for Performance

```sql
-- Location-based queries
CREATE INDEX idx_venues_location ON venues(lat, lng);

-- Cuisine filtering
CREATE INDEX idx_venues_cuisine ON venues USING GIN(cuisine_tags);

-- City filtering
CREATE INDEX idx_venues_city ON venues(city);

-- Review lookups
CREATE INDEX idx_reviews_venue ON reviews(venue_id);

-- Analytics
CREATE INDEX idx_search_queries_user ON search_queries(user_id);
CREATE INDEX idx_search_queries_created ON search_queries(created_at);
```

### Query Optimization

**Find venues near location within budget:**
```sql
SELECT * FROM venues
WHERE city = 'Stockholm'
  AND price_range <= $1
  AND earth_distance(ll_to_earth(lat, lng), 
                     ll_to_earth($2, $3)) < 2000 -- 2km radius
  AND google_rating >= 4.0
ORDER BY google_rating DESC;
```

## Budget & Costs

**Data Collection Costs (MVP):**
- Google Maps Scraper: $0 (free, just computational)
- Claude API (sentiment analysis): ~$10/month
- PostgreSQL storage: <1GB initially, ~$15/month

**Scaling (Month 2+):**
- OpenTable API: $0-500/month (check pricing)
- Additional Claude usage: $20-50/month
- Database growth: $20-50/month

## Future Enhancements

- **Machine Learning:** Train model to predict review sentiment in Swedish
- **Photo Classification:** Analyze restaurant photos for ambiance
- **Social Media:** Pull mentions from Instagram/Twitter for trend detection
- **User Reviews:** Collect proprietary reviews (future feature)
- **Reservation Integration:** Book directly through app
