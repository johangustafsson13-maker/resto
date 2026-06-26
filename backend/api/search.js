'use strict';

const crypto = require('crypto');
const Anthropic = require('@anthropic-ai/sdk').default;
const db = require('../db');
const cache = require('../lib/cache');
const { INTENT_PARSER_SYSTEM } = require('../claude/intent-parser');
const { RANKING_SYSTEM, formatVenueForRanking, formatIntentForRanking } = require('../claude/ranker');

function cacheKey(query, intent) {
  return 'search:' + crypto
    .createHash('md5')
    .update(query + JSON.stringify(intent))
    .digest('hex');
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';

// Freemium quota. OFF by default — there is no billing/upgrade path yet, so
// enabling it would wall free users with no way to pay. Flip QUOTA_ENABLED=true
// once a payment flow exists. The full enforcement logic lives below, gated on
// this flag, so turning it on is a one-line config change (no code edits).
const QUOTA_ENABLED = process.env.QUOTA_ENABLED === 'true';
const FREE_DAILY_SEARCHES = parseInt(process.env.FREE_DAILY_SEARCHES, 10) || 3;

// ─── Neighborhood coordinate lookup ──────────────────────────────────────────

const NEIGHBORHOODS = {
  'stureplan':   { lat: 59.3337, lng: 18.0736 },
  'östermalm':   { lat: 59.3337, lng: 18.0736 },
  'ostermalm':   { lat: 59.3337, lng: 18.0736 },
  'norrmalm':    { lat: 59.3358, lng: 18.0640 },
  'gamla stan':  { lat: 59.3240, lng: 18.0710 },
  'gamlastan':   { lat: 59.3240, lng: 18.0710 },
  'södermalm':   { lat: 59.3151, lng: 18.0654 },
  'sodermalm':   { lat: 59.3151, lng: 18.0654 },
  'vasastan':    { lat: 59.3437, lng: 18.0503 },
  'kungsholmen': { lat: 59.3298, lng: 18.0370 },
  'djurgården':  { lat: 59.3263, lng: 18.1060 },
  'djurgarden':  { lat: 59.3263, lng: 18.1060 },
  'slussen':     { lat: 59.3197, lng: 18.0727 },
  'hornstull':   { lat: 59.3167, lng: 18.0345 },
  'hammarby':    { lat: 59.3038, lng: 18.0920 },
};

// Central Stockholm — used when no neighborhood is specified
const STOCKHOLM_CENTER = { lat: 59.3293, lng: 18.0686 };

function resolveNeighborhood(location) {
  if (!location) return null;
  const key = location.toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .trim();
  // Exact match (handles Swedish chars too)
  if (NEIGHBORHOODS[location.toLowerCase()]) return NEIGHBORHOODS[location.toLowerCase()];
  if (NEIGHBORHOODS[key]) return NEIGHBORHOODS[key];
  // Substring match for partial names like "Söder" or "Östermalm"
  for (const [name, coords] of Object.entries(NEIGHBORHOODS)) {
    if (key.includes(name) || name.includes(key)) return coords;
  }
  return null;
}

// Map SEK budget to maximum price_range (1–5 scale)
function budgetToPriceRange(budgetSEK) {
  if (!budgetSEK) return null;
  if (budgetSEK <= 130) return 1;
  if (budgetSEK <= 280) return 2;
  if (budgetSEK <= 450) return 3;
  if (budgetSEK <= 700) return 4;
  return null; // no upper constraint for generous budgets
}

// Strip ```json ... ``` fences Claude occasionally adds despite instructions
function parseClaudeJSON(text) {
  const cleaned = text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  return JSON.parse(cleaned);
}

// ─── Step 1: Parse intent ─────────────────────────────────────────────────────

async function parseQueryIntent(query) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: [{ type: 'text', text: INTENT_PARSER_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: query }],
  });
  return parseClaudeJSON(response.content[0].text);
}

// ─── Step 2: Filter venues from DB ───────────────────────────────────────────

const BASE_SELECT = `
  SELECT id, name, address, lat, lng, cuisine_tags, price_range,
         is_terrace, is_restaurant, indoor_seating, description,
         google_rating, review_count, phone, website, open_hours,
         outdoor_seating, kid_friendly, wheelchair_accessible, wifi,
         outdoor_seats, orientation, neighbourhood, google_place_id
  FROM venues`;

function buildBoundingBox(center, radiusKm) {
  const latDelta = radiusKm / 111.0;
  const lngDelta = radiusKm / (111.0 * Math.cos(center.lat * (Math.PI / 180)));
  return {
    minLat: center.lat - latDelta, maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta, maxLng: center.lng + lngDelta,
  };
}

function matchesCuisine(venue, lowerCuisines) {
  return venue.cuisine_tags && venue.cuisine_tags.some(tag =>
    lowerCuisines.some(c => tag.toLowerCase().includes(c))
  );
}

async function queryArea(box, maxPrice, typeFilter, extraFilter, limit = 80) {
  return db.any(
    `${BASE_SELECT}
     WHERE lat::float BETWEEN $1 AND $2
       AND lng::float BETWEEN $3 AND $4
       AND ($5::int IS NULL OR price_range IS NULL OR price_range <= $5)
       ${typeFilter}
       ${extraFilter}
     ORDER BY google_rating::float DESC NULLS LAST, review_count DESC NULLS LAST
     LIMIT ${limit}`,
    [box.minLat, box.maxLat, box.minLng, box.maxLng, maxPrice]
  );
}

async function fetchCandidates(intent, query, type = 'both', filters = {}) {
  const locationCoords = resolveNeighborhood(intent.location);
  const center = locationCoords || STOCKHOLM_CENTER;
  const maxPrice = budgetToPriceRange(intent.budget);

  let typeFilter = '';
  if (type === 'restaurant') typeFilter = 'AND is_restaurant = true';
  else if (type === 'terrace') typeFilter = 'AND is_terrace = true';

  const extraFilter = filters.outdoor_seating === true ? 'AND outdoor_seating = true' : '';
  const cuisineFromIntent = intent.cuisine && intent.cuisine.length > 0 ? intent.cuisine : null;

  // ── When cuisine is specified: hard filter, never return non-cuisine venues ──
  if (cuisineFromIntent) {
    const lowerCuisines = cuisineFromIntent.map(c => c.toLowerCase());

    // 1. Try local area first (3km if neighborhood known, 6km otherwise)
    const localBox = buildBoundingBox(center, locationCoords ? 3.0 : 6.0);
    const localVenues = await queryArea(localBox, maxPrice, typeFilter, extraFilter, 80);
    const localMatches = localVenues.filter(v => matchesCuisine(v, lowerCuisines));

    if (localMatches.length >= 3) {
      console.log(`[search] cuisine [${cuisineFromIntent}]: ${localMatches.length} matches in local area`);
      return localMatches;
    }

    // 2. Expand city-wide — cuisine is rare or not in that neighborhood
    const cityBox = buildBoundingBox(STOCKHOLM_CENTER, 15.0);
    const cityVenues = await queryArea(cityBox, maxPrice, typeFilter, extraFilter, 150);
    const cityMatches = cityVenues.filter(v => matchesCuisine(v, lowerCuisines));

    if (cityMatches.length > 0) {
      console.log(`[search] cuisine [${cuisineFromIntent}]: ${localMatches.length} local, expanded to ${cityMatches.length} city-wide`);
      return cityMatches;
    }

    // 3. Nothing found — return empty so frontend can show "no results"
    console.log(`[search] cuisine [${cuisineFromIntent}]: no matches found in Stockholm`);
    return [];
  }

  // ── No cuisine specified: return top-rated venues in area ──────────────────
  const box = buildBoundingBox(center, locationCoords ? 3.0 : 6.0);
  return queryArea(box, maxPrice, typeFilter, extraFilter, 80);
}

// ─── Step 3: Rank via Claude ──────────────────────────────────────────────────

async function rankCandidates(venues, intent, topN, originalQuery) {
  const intentText = formatIntentForRanking(intent, originalQuery);

  // Only send top 30 candidates to Claude — keeps prompt small and response fast
  const candidateSlice = venues.slice(0, 30);
  const venuesTextSliced = candidateSlice
    .map((v, i) => `${i + 1}. (venue_id: ${v.id})\n${formatVenueForRanking(v)}`)
    .join('\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: [{ type: 'text', text: RANKING_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `${intentText}\n\nRestaurants to rank:\n${venuesTextSliced}` }],
  });

  const raw = response.content[0].text;
  const { ranked } = parseClaudeJSON(raw);

  const byId = new Map(candidateSlice.map(v => [v.id, v]));

  const results = ranked
    .slice(0, topN)
    .map(r => {
      const rawId = r.venue_id ?? r.id;
      const id = typeof rawId === 'string' ? parseInt(rawId, 10) : rawId;
      const venue = byId.get(id);
      if (!venue) {
        console.warn(`[rank] Claude returned unknown venue_id ${rawId} — skipping`);
        return null;
      }
      return buildResponseVenue(venue, r.explanation);
    })
    .filter(Boolean);

  console.log(`[rank] Claude ranked ${ranked.length} venues → returning ${results.length}`);
  return results;
}

function buildResponseVenue(v, explanation = null) {
  const venue = {
    id: v.id,
    name: v.name,
    address: v.address,
    lat: Number(v.lat),
    lng: Number(v.lng),
    google_rating: v.google_rating != null ? Number(v.google_rating) : null,
    review_count: v.review_count,
    neighbourhood: v.neighbourhood,
    is_terrace: v.is_terrace || false,
    is_restaurant: v.is_restaurant !== false,
    outdoor_seating: v.outdoor_seating || false,
    indoor_seating: v.indoor_seating !== false,
    description: v.description,
    explanation,
  };

  // Common fields for both restaurants and terraces
  venue.cuisine_tags = v.cuisine_tags;
  venue.price_range = v.price_range;
  venue.phone = v.phone;
  venue.website = v.website;
  venue.kid_friendly = v.kid_friendly;
  venue.wheelchair_accessible = v.wheelchair_accessible;
  venue.wifi = v.wifi;

  // Terrace-specific fields
  if (v.is_terrace) {
    venue.outdoor_seats = v.outdoor_seats;
    venue.orientation = v.orientation;
  }

  return venue;
}

// ─── Freemium quota (flag-gated; off until billing exists) ────────────────────

// Loads the caller's quota row, resets the 24h window if it has elapsed, and
// decides whether the search is allowed. Returns either { quotaUser, isPaid } or
// { error: { status, body } } ready to hand straight to Express.
async function checkQuota(userId) {
  let quotaUser;
  try {
    quotaUser = await db.oneOrNone(
      'SELECT searches_remaining, searches_reset_at, subscription_status FROM users WHERE id = $1',
      [userId]
    );
  } catch (err) {
    console.error('[search] quota fetch failed:', err.message);
    return { error: { status: 500, body: { error: 'Database error' } } };
  }
  if (!quotaUser) {
    return { error: { status: 401, body: { error: 'User not found' } } };
  }

  // Reset the rolling 24-hour window when it has expired.
  const now = new Date();
  if (quotaUser.searches_reset_at && quotaUser.searches_reset_at < now) {
    const nextReset = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    await db.none(
      'UPDATE users SET searches_remaining = $1, searches_reset_at = $2 WHERE id = $3',
      [FREE_DAILY_SEARCHES, nextReset, userId]
    ).catch(err => console.error('[search] quota reset failed:', err.message));
    quotaUser.searches_remaining = FREE_DAILY_SEARCHES;
  }

  const isPaid = quotaUser.subscription_status === 'paid';
  if (!isPaid && quotaUser.searches_remaining <= 0) {
    return { error: { status: 403, body: { error: 'Daily search limit reached. Upgrade to premium.' } } };
  }
  return { quotaUser, isPaid };
}

// Decrement a free user's remaining searches (GREATEST avoids going negative on
// concurrent requests). No-op when the quota feature is off or the user is paid.
async function decrementQuota(userId, isPaid) {
  if (!QUOTA_ENABLED || isPaid) return;
  await db.none(
    'UPDATE users SET searches_remaining = GREATEST(searches_remaining - 1, 0) WHERE id = $1',
    [userId]
  ).catch(err => console.error('[search] quota decrement failed:', err.message));
}

// ─── Handler ──────────────────────────────────────────────────────────────────

/**
 * POST /api/search
 * Body: {
 *   query: string,
 *   type?: 'restaurant' | 'terrace' | 'both' (default: 'both'),
 *   limit?: number (max 10, default 5),
 *   filters?: {
 *     outdoor_seating?: boolean,
 *     price_max?: 1-5,
 *     cuisine?: string[],
 *     sunshine?: boolean
 *   },
 *   lat?: number,
 *   lng?: number
 * }
 */
async function handler(req, res, next) {
  try {
    const { query, limit = 5, type = 'both', filters = {}, lat, lng } = req.body;

    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ error: 'query is required' });
    }

    // Validate type parameter
    if (!['restaurant', 'terrace', 'both', 'all'].includes(type)) {
      return res.status(400).json({ error: 'type must be "restaurant", "terrace", "both", or "all"' });
    }

    const trimmed = query.trim();
    const topN = Math.min(Math.max(parseInt(limit, 10) || 5, 1), 10);

    // ── Freemium quota — no-op unless QUOTA_ENABLED=true ─────────────────────
    let isPaid = false;
    if (QUOTA_ENABLED) {
      const q = await checkQuota(req.user.userId);
      if (q.error) return res.status(q.error.status).json(q.error.body);
      isPaid = q.isPaid;
    }

    // 1. Parse natural language → structured intent
    let intent;
    try {
      intent = await parseQueryIntent(trimmed);
      console.log(`[search] intent: location=${intent.location} cuisine=${JSON.stringify(intent.cuisine)} time=${intent.time}`);
    } catch (err) {
      console.error('[search] intent parse failed:', err.message);
      return res.status(500).json({ error: 'Failed to parse search intent' });
    }

    // Cache check — skip the DB fetch and Claude ranking on a fresh hit.
    // cache.* are no-ops when REDIS_ENABLED is not 'true', so this is safe always.
    const key = cacheKey(trimmed, intent);
    const cachedVenues = await cache.getCached(key);
    if (cachedVenues) {
      await decrementQuota(req.user.userId, isPaid);
      return res.json({ query: trimmed, type, intent, venues: cachedVenues, total: cachedVenues.length });
    }

    // 2. Filter candidates from database
    let candidates;
    try {
      candidates = await fetchCandidates(intent, trimmed, type, filters);
    } catch (err) {
      console.error('[search] db query failed:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }

    console.log(`[search] candidates: ${candidates.length} venues (top: ${candidates.slice(0,3).map(v => v.name).join(', ')})`);

    if (candidates.length === 0) {
      return res.json({ query: trimmed, intent, venues: [] });
    }

    // 3. Rank candidates via Claude
    let venues;
    try {
      venues = await rankCandidates(candidates, intent, topN, trimmed);
    } catch (err) {
      console.error('[search] Claude ranking failed, falling back to rating sort:', err.message);
      // Graceful fallback: return top-rated candidates with a generic explanation
      venues = candidates
        .slice(0, topN)
        .map(v => buildResponseVenue(v, null));
    }

    // Write-through cache — fire-and-forget, never delays the response
    cache.setCached(key, venues, 3600);

    // Decrement quota for free users (no-op unless QUOTA_ENABLED=true)
    await decrementQuota(req.user.userId, isPaid);

    return res.json({
      query: trimmed,
      type,
      intent,
      venues,
      total: venues.length,
    });

  } catch (error) {
    next(error);
  }
}

module.exports = handler;
module.exports.fetchCandidates = fetchCandidates;
module.exports.buildResponseVenue = buildResponseVenue;
