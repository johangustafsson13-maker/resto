'use strict';

/**
 * Resto — Comprehensive Stockholm Venue Scraper
 *
 * Strategy: Nearby Search across 30+ strategic points covering all Stockholm,
 * searching 4 venue types per point. Deduplicates by place_id before calling
 * the expensive Details API, so we only pay for each unique venue once.
 *
 * Estimated coverage: 2,000–3,500 unique venues across greater Stockholm.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pgp = require('pg-promise')();
const axios = require('axios');

const db = pgp(process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/resto_dev');
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

if (!GOOGLE_MAPS_API_KEY) {
  console.error('❌  GOOGLE_MAPS_API_KEY is not set in backend/.env');
  process.exit(1);
}

// ─── Coverage: 30 strategic points across greater Stockholm ───────────────────

const SEARCH_POINTS = [
  // ── Inner City ──────────────────────────────────────────────────────────────
  { name: 'Norrmalm',          lat: 59.3358, lng: 18.0640 },
  { name: 'Gamla Stan',        lat: 59.3240, lng: 18.0710 },
  { name: 'Södermalm Central', lat: 59.3151, lng: 18.0654 },
  { name: 'Östermalm',         lat: 59.3380, lng: 18.0800 },
  { name: 'Vasastan',          lat: 59.3437, lng: 18.0503 },
  { name: 'Kungsholmen',       lat: 59.3298, lng: 18.0370 },
  { name: 'Djurgården',        lat: 59.3263, lng: 18.1060 },

  // ── Södermalm sub-areas ─────────────────────────────────────────────────────
  { name: 'Hornstull',         lat: 59.3167, lng: 18.0345 },
  { name: 'Mariatorget',       lat: 59.3183, lng: 18.0630 },
  { name: 'Slussen',           lat: 59.3197, lng: 18.0727 },
  { name: 'Skanstull',         lat: 59.3077, lng: 18.0707 },
  { name: 'Hammarby Sjöstad',  lat: 59.3038, lng: 18.0920 },

  // ── Östermalm sub-areas ─────────────────────────────────────────────────────
  { name: 'Stureplan',         lat: 59.3337, lng: 18.0736 },
  { name: 'Östermalmstorg',    lat: 59.3365, lng: 18.0785 },
  { name: 'Karlaplan',         lat: 59.3400, lng: 18.0840 },
  { name: 'Gärdet',            lat: 59.3400, lng: 18.1000 },

  // ── Vasastan sub-areas ──────────────────────────────────────────────────────
  { name: 'Odenplan',          lat: 59.3479, lng: 18.0496 },
  { name: 'St Eriksplan',      lat: 59.3400, lng: 18.0390 },

  // ── Kungsholmen sub-areas ───────────────────────────────────────────────────
  { name: 'Fridhemsplan',      lat: 59.3328, lng: 18.0190 },
  { name: 'Rådhuset',          lat: 59.3300, lng: 18.0510 },

  // ── Suburbs ─────────────────────────────────────────────────────────────────
  { name: 'Nacka',             lat: 59.3137, lng: 18.1580 },
  { name: 'Solna',             lat: 59.3600, lng: 18.0010 },
  { name: 'Sundbyberg',        lat: 59.3618, lng: 17.9712 },
  { name: 'Lidingö',           lat: 59.3624, lng: 18.1391 },
  { name: 'Liljeholmen',       lat: 59.3088, lng: 18.0228 },
  { name: 'Hägersten',         lat: 59.2990, lng: 18.0050 },
  { name: 'Farsta',            lat: 59.2450, lng: 18.0970 },
  { name: 'Enskede',           lat: 59.2800, lng: 18.0760 },
  { name: 'Bromma/Alvik',      lat: 59.3335, lng: 17.9750 },
  { name: 'Spånga',            lat: 59.3740, lng: 17.9070 },
];

// Types to search at each point (each is a separate API call)
const VENUE_TYPES = ['restaurant', 'cafe', 'bar', 'bakery'];

// Search radius in meters — 1 500 m gives good density without too much overlap
const SEARCH_RADIUS = 1500;

// ─── Cuisine tag mapping (Google types → human-readable) ─────────────────────

const TYPE_TO_CUISINE = {
  // Specific cuisines
  pizza_restaurant:          'Pizza',
  sushi_restaurant:          'Sushi',
  japanese_restaurant:       'Japanese',
  ramen_restaurant:          'Japanese',
  chinese_restaurant:        'Chinese',
  thai_restaurant:           'Thai',
  indian_restaurant:         'Indian',
  italian_restaurant:        'Italian',
  french_restaurant:         'French',
  american_restaurant:       'American',
  mexican_restaurant:        'Mexican',
  mediterranean_restaurant:  'Mediterranean',
  greek_restaurant:          'Greek',
  middle_eastern_restaurant: 'Middle Eastern',
  lebanese_restaurant:       'Lebanese',
  turkish_restaurant:        'Turkish',
  korean_restaurant:         'Korean',
  vietnamese_restaurant:     'Vietnamese',
  spanish_restaurant:        'Spanish',
  seafood_restaurant:        'Seafood',
  steak_house:               'Steakhouse',
  vegetarian_restaurant:     'Vegetarian',
  vegan_restaurant:          'Vegan',
  burger_restaurant:         'Burgers',
  sandwich_shop:             'Sandwiches',
  noodle_restaurant:         'Noodles',
  brunch_restaurant:         'Brunch',
  breakfast_restaurant:      'Breakfast',
  // Venue types
  cafe:                      'Café',
  coffee_shop:               'Café',
  bar:                       'Bar',
  pub:                       'Pub',
  wine_bar:                  'Wine Bar',
  cocktail_bar:              'Cocktail Bar',
  sports_bar:                'Sports Bar',
  night_club:                'Nightclub',
  bakery:                    'Bakery',
  patisserie:                'Patisserie',
  ice_cream_shop:            'Ice Cream',
  food_court:                'Food Court',
  fast_food_restaurant:      'Fast Food',
  diner:                     'Diner',
};

// Broad types to SKIP as cuisine labels — they add no information
const SKIP_TYPES = new Set([
  'food', 'restaurant', 'establishment', 'point_of_interest',
  'store', 'meal_takeaway', 'meal_delivery', 'local_government_office',
]);

function inferCuisineTags(types = []) {
  const tags = types
    .filter(t => !SKIP_TYPES.has(t))
    .map(t => TYPE_TO_CUISINE[t])
    .filter(Boolean);
  const unique = [...new Set(tags)];
  // Fall back to a broad type only if we have nothing specific
  if (unique.length) return unique;
  if (types.includes('cafe') || types.includes('coffee_shop')) return ['Café'];
  if (types.includes('bar') || types.includes('pub')) return ['Bar'];
  if (types.includes('bakery')) return ['Bakery'];
  return ['Restaurant'];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function withRetry(fn, retries = 3, baseDelay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`  Retry ${i + 1}/${retries}: ${err.message}`);
      await sleep(baseDelay * (i + 1));
    }
  }
}

function mapPriceLevel(level) {
  return (level != null) ? level + 1 : null;
}

function transformHours(openingHours) {
  if (!openingHours?.periods) return null;
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const result = {};
  for (const p of openingHours.periods) {
    const day = days[p.open.day];
    const fmt = t => `${t.slice(0, 2)}:${t.slice(2)}`;
    result[day] = { open: fmt(p.open.time), close: p.close ? fmt(p.close.time) : '23:59' };
  }
  return result;
}

// ─── Step 1: Collect all unique place_ids via Nearby Search ──────────────────
// Cheap: $0.032 per request, no per-venue cost yet.

async function collectPlaceIds() {
  const seen = new Map(); // place_id → { name, lat, lng, types, rating, review_count, price_level }
  let totalRequests = 0;

  for (const point of SEARCH_POINTS) {
    for (const type of VENUE_TYPES) {
      let pageToken = null;
      let page = 0;

      do {
        const params = {
          location: `${point.lat},${point.lng}`,
          radius: SEARCH_RADIUS,
          type,
          key: GOOGLE_MAPS_API_KEY,
          language: 'en',
        };
        if (pageToken) params.pagetoken = pageToken;

        let res;
        try {
          res = await withRetry(() =>
            axios.get('https://maps.googleapis.com/maps/api/place/nearbysearch/json', {
              params,
              timeout: 12000,
            })
          );
          totalRequests++;
        } catch (err) {
          console.warn(`  ⚠ Nearby Search failed (${point.name}/${type}): ${err.message}`);
          break;
        }

        const { status, results = [], next_page_token } = res.data;

        if (status === 'ZERO_RESULTS') break;
        if (!['OK', 'ZERO_RESULTS'].includes(status)) {
          console.warn(`  ⚠ API status ${status} for ${point.name}/${type}`);
          break;
        }

        for (const place of results) {
          if (!seen.has(place.place_id)) {
            seen.set(place.place_id, {
              place_id: place.place_id,
              name: place.name,
              lat: place.geometry?.location?.lat || point.lat,
              lng: place.geometry?.location?.lng || point.lng,
              types: place.types || [],
              rating: place.rating || null,
              review_count: place.user_ratings_total || 0,
              price_level: place.price_level ?? null,
            });
          }
        }

        pageToken = next_page_token || null;
        page++;
        if (pageToken) await sleep(2500); // Google requires delay between pages

      } while (pageToken && page < 3); // max 3 pages = 60 results per type/point
    }

    process.stdout.write(`  📍 ${point.name}: ${seen.size} unique so far\n`);
  }

  console.log(`\n✓ Nearby Search complete: ${seen.size} unique venues found (${totalRequests} API requests)`);
  return [...seen.values()];
}

// ─── Step 2: Fetch Place Details for venues not already in DB ────────────────
// Expensive: $0.017 per request — only call for genuinely new venues.

async function fetchNewPlaceDetails(places) {
  // Check which place_ids already exist in DB
  const placeIds = places.map(p => p.place_id);
  const existing = await db.any(
    'SELECT external_id FROM venues WHERE external_id = ANY($1) AND source = $2',
    [placeIds, 'google_maps']
  );
  const existingIds = new Set(existing.map(r => r.external_id));

  const newPlaces = places.filter(p => !existingIds.has(p.place_id));
  const alreadyInDb = places.filter(p => existingIds.has(p.place_id));

  console.log(`\n📋 ${existingIds.size} already in DB (will update ratings only)`);
  console.log(`🆕 ${newPlaces.length} new venues — fetching full details...`);

  const fields = 'name,formatted_address,geometry,price_level,rating,user_ratings_total,opening_hours,formatted_phone_number,website,types,reviews';
  const detailed = [];

  for (let i = 0; i < newPlaces.length; i++) {
    const place = newPlaces[i];
    try {
      const res = await withRetry(() =>
        axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
          params: { place_id: place.place_id, fields, key: GOOGLE_MAPS_API_KEY, language: 'en' },
          timeout: 12000,
        })
      );
      const d = res.data.result || {};
      const geo = (d.geometry || {}).location || {};
      detailed.push({
        name: d.name || place.name,
        address: d.formatted_address || '',
        lat: geo.lat || place.lat,
        lng: geo.lng || place.lng,
        cuisine_tags: inferCuisineTags(d.types || place.types),
        price_range: mapPriceLevel(d.price_level ?? place.price_level),
        google_rating: d.rating || place.rating || null,
        review_count: d.user_ratings_total || place.review_count || 0,
        phone: d.formatted_phone_number || null,
        website: d.website || null,
        open_hours: transformHours(d.opening_hours),
        external_id: place.place_id,
        source: 'google_maps',
        isNew: true,
        reviews: (d.reviews || []).slice(0, 5).map((r, idx) => ({
          text: r.text || '',
          rating: r.rating || null,
          author: r.author_name || null,
          review_date: r.time ? new Date(r.time * 1000) : null,
          external_id: `${place.place_id}_r_${r.time || idx}`,
          source: 'google_maps',
        })),
      });
    } catch (err) {
      console.warn(`  ⚠ Details failed for ${place.name}: ${err.message}`);
    }

    if ((i + 1) % 50 === 0) {
      console.log(`  Details: ${i + 1}/${newPlaces.length}...`);
    }
    await sleep(100); // polite rate limiting
  }

  // For existing venues, only refresh ratings (no Details API call needed)
  const ratingUpdates = alreadyInDb.map(p => ({
    external_id: p.place_id,
    google_rating: p.rating,
    review_count: p.review_count,
    isNew: false,
  }));

  return { detailed, ratingUpdates };
}

// ─── Step 3: Save to database ─────────────────────────────────────────────────

async function saveVenue(venue) {
  const existing = await db.oneOrNone(
    'SELECT id FROM venues WHERE external_id = $1 AND source = $2',
    [venue.external_id, 'google_maps']
  );

  let venueId;
  let inserted = false;

  if (existing) {
    await db.none(
      `UPDATE venues SET
         name=$1, address=$2, lat=$3, lng=$4, cuisine_tags=$5,
         price_range=$6, google_rating=$7, review_count=$8,
         phone=$9, website=$10, open_hours=$11, updated_at=CURRENT_TIMESTAMP
       WHERE id=$12`,
      [
        venue.name, venue.address, venue.lat, venue.lng, venue.cuisine_tags,
        venue.price_range, venue.google_rating, venue.review_count,
        venue.phone, venue.website,
        venue.open_hours || null,
        existing.id,
      ]
    );
    venueId = existing.id;
  } else {
    const row = await db.one(
      `INSERT INTO venues
         (name, address, lat, lng, cuisine_tags, price_range, google_rating,
          review_count, phone, website, open_hours, source, external_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        venue.name, venue.address, venue.lat, venue.lng, venue.cuisine_tags,
        venue.price_range, venue.google_rating, venue.review_count || 0,
        venue.phone, venue.website,
        venue.open_hours || null,
        'google_maps', venue.external_id,
      ]
    );
    venueId = row.id;
    inserted = true;
  }

  for (const r of venue.reviews || []) {
    if (!r.text) continue;
    await db.none(
      `INSERT INTO reviews (venue_id, text, rating, source, external_id, author, review_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (external_id, source) DO NOTHING`,
      [venueId, r.text, r.rating, 'google_maps', r.external_id, r.author, r.review_date]
    );
  }

  return { venueId, inserted };
}

async function updateRatings(updates) {
  for (const u of updates) {
    await db.none(
      `UPDATE venues SET google_rating=$1, review_count=$2, updated_at=CURRENT_TIMESTAMP
       WHERE external_id=$3 AND source='google_maps'`,
      [u.google_rating, u.review_count, u.external_id]
    );
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🍽️  Resto — Comprehensive Stockholm Venue Scraper');
  console.log('=================================================');
  console.log(`📍 ${SEARCH_POINTS.length} search points × ${VENUE_TYPES.length} types × up to 60 results each`);
  console.log(`🎯 Target: all restaurants, cafés, bars, bakeries in greater Stockholm\n`);

  await db.connect().then(c => { console.log('✓ Database connected'); c.done(); });

  // 1. Collect all place_ids cheaply
  console.log('\n── Phase 1: Nearby Search ───────────────────────────────────');
  const allPlaces = await collectPlaceIds();

  // 2. Fetch full details only for new venues
  console.log('\n── Phase 2: Place Details for new venues ────────────────────');
  const { detailed, ratingUpdates } = await fetchNewPlaceDetails(allPlaces);

  // 3. Save new venues
  console.log('\n── Phase 3: Saving to database ──────────────────────────────');
  let inserted = 0, updated = 0, errors = 0;

  for (const venue of detailed) {
    try {
      const { inserted: wasNew } = await saveVenue(venue);
      if (wasNew) inserted++; else updated++;
    } catch (err) {
      errors++;
      if (errors <= 10) console.error(`  ✗ "${venue.name}": ${err.message}`);
    }
  }

  // 4. Update ratings for existing venues
  await updateRatings(ratingUpdates);

  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log(`✅ Done!`);
  console.log(`   New venues inserted:  ${inserted}`);
  console.log(`   Existing updated:     ${updated + ratingUpdates.length}`);
  if (errors) console.log(`   Errors:               ${errors}`);
  console.log(`   Total unique found:   ${allPlaces.length}`);
  console.log('═══════════════════════════════════════════════');

  await db.$pool.end();
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
