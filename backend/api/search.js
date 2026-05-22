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

async function fetchCandidates(intent) {
  const locationCoords = resolveNeighborhood(intent.location);
  const center = locationCoords || STOCKHOLM_CENTER;
  // Narrower radius when user specified a location; wider for "anywhere"
  const radiusKm = locationCoords ? 2.0 : 6.0;

  // Approximate bounding box — 1° lat ≈ 111 km; 1° lng ≈ 57 km at Stockholm's latitude
  const latDelta = radiusKm / 111.0;
  const lngDelta = radiusKm / (111.0 * Math.cos(center.lat * (Math.PI / 180)));
  const maxPrice = budgetToPriceRange(intent.budget);

  // If user specified a cuisine preference, prioritize matching venues
  let cuisineFilter = '';
  let params = [
    center.lat - latDelta, center.lat + latDelta,
    center.lng - lngDelta, center.lng + lngDelta,
    maxPrice,
  ];

  // Simple cuisine keyword detection
  const query = intent.query?.toLowerCase() || '';
  const cuisineKeywords = {
    'coffee': ['café', 'coffee', 'kahve'],
    'burger': ['burger', 'beef'],
    'pizza': ['pizza', 'italian'],
    'thai': ['thai'],
    'indian': ['indian'],
    'sushi': ['sushi', 'japanese'],
    'mexican': ['mexican'],
  };

  for (const [keyword, cuisines] of Object.entries(cuisineKeywords)) {
    if (query.includes(keyword)) {
      const cuisinePatterns = cuisines.map(c => `'${c}'`).join(',');
      cuisineFilter = `AND (cuisine_tags IS NOT NULL AND EXISTS(SELECT 1 FROM unnest(cuisine_tags) AS tag WHERE LOWER(tag) LIKE ANY(ARRAY[${cuisinePatterns.split(',').map(c => `'%' || ${c} || '%'`).join(',')}])))`;
      break;
    }
  }

  return db.any(
    `SELECT id, name, address, lat, lng, cuisine_tags, price_range,
            google_rating, review_count, phone, website, open_hours,
            outdoor_seating, kid_friendly, wheelchair_accessible, wifi
     FROM venues
     WHERE lat::float BETWEEN $1 AND $2
       AND lng::float BETWEEN $3 AND $4
       AND ($5::int IS NULL OR price_range IS NULL OR price_range <= $5)
       ${cuisineFilter}
     ORDER BY google_rating::float DESC NULLS LAST,
              review_count DESC NULLS LAST
     LIMIT 30`,
    params
  );
}

// ─── Step 3: Rank via Claude ──────────────────────────────────────────────────

async function rankCandidates(venues, intent, topN) {
  // Prefix each venue with its DB id so Claude can reference it unambiguously
  const venuesText = venues
    .map((v, i) => `${i + 1}. (venue_id: ${v.id})\n${formatVenueForRanking(v)}`)
    .join('\n');
  const intentText = formatIntentForRanking(intent);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: [{ type: 'text', text: RANKING_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `${intentText}\n\nRestaurants to rank:\n${venuesText}` }],
  });

  const { ranked } = parseClaudeJSON(response.content[0].text);

  const byId = new Map(venues.map(v => [v.id, v]));

  return ranked
    .slice(0, topN)
    .map(r => {
      // Claude may return venue_id as number or string
      const rawId = r.venue_id ?? r.id;
      const venue = byId.get(typeof rawId === 'string' ? parseInt(rawId, 10) : rawId);
      if (!venue) return null;
      return buildResponseVenue(venue, r.explanation);
    })
    .filter(Boolean);
}

function buildResponseVenue(v, explanation = null) {
  return {
    id: v.id,
    name: v.name,
    address: v.address,
    lat: Number(v.lat),
    lng: Number(v.lng),
    cuisine_tags: v.cuisine_tags,
    price_range: v.price_range,
    google_rating: v.google_rating != null ? Number(v.google_rating) : null,
    review_count: v.review_count,
    phone: v.phone,
    website: v.website,
    explanation,
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

/**
 * POST /api/search
 * Body: { query: string, limit?: number (max 5) }
 */
module.exports = async (req, res, next) => {
  try {
    const { query, limit = 5 } = req.body;

    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ error: 'query is required' });
    }

    const trimmed = query.trim();
    const topN = Math.min(Math.max(parseInt(limit, 10) || 5, 1), 5);

    // ── Quota check ───────────────────────────────────────────────────────────
    let quotaUser;
    try {
      quotaUser = await db.oneOrNone(
        'SELECT searches_remaining, searches_reset_at, subscription_status FROM users WHERE id = $1',
        [req.user.userId]
      );
    } catch (err) {
      console.error('[search] quota fetch failed:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!quotaUser) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Reset window when the 24-hour period has expired
    const now = new Date();
    if (quotaUser.searches_reset_at && quotaUser.searches_reset_at < now) {
      const nextReset = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      await db.none(
        'UPDATE users SET searches_remaining = 3, searches_reset_at = $1 WHERE id = $2',
        [nextReset, req.user.userId]
      ).catch(err => console.error('[search] quota reset failed:', err.message));
      quotaUser.searches_remaining = 3;
    }

    const isPaid = quotaUser.subscription_status === 'paid';
    // TEMP: Disable quota for MVP testing — will re-enable for production
    // if (!isPaid && quotaUser.searches_remaining <= 0) {
    //   return res.status(403).json({ error: 'Daily search limit reached. Upgrade to premium.' });
    // }
    // ─────────────────────────────────────────────────────────────────────────

    // 1. Parse natural language → structured intent
    let intent;
    try {
      intent = await parseQueryIntent(trimmed);
    } catch (err) {
      console.error('[search] intent parse failed:', err.message);
      return res.status(500).json({ error: 'Failed to parse search intent' });
    }

    // Cache check — skip the DB fetch and Claude ranking if we have a fresh result
    const key = cacheKey(trimmed, intent);
    const cachedVenues = await cache.getCached(key);
    if (cachedVenues) {
      // TEMP: Disable quota decrement for MVP testing
      // if (!isPaid) {
      //   await db.none(
      //     'UPDATE users SET searches_remaining = GREATEST(searches_remaining - 1, 0) WHERE id = $1',
      //     [req.user.userId]
      //   ).catch(err => console.error('[search] quota decrement failed:', err.message));
      // }
      return res.json({ query: trimmed, intent, venues: cachedVenues });
    }

    // 2. Filter candidates from database
    let candidates;
    try {
      candidates = await fetchCandidates(intent);
    } catch (err) {
      console.error('[search] db query failed:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }

    if (candidates.length === 0) {
      return res.json({ query: trimmed, intent, venues: [] });
    }

    // 3. Rank by relevance — gracefully degrade if Claude call fails
    let venues;
    try {
      venues = await rankCandidates(candidates, intent, topN);
    } catch (err) {
      console.error('[search] ranking failed:', err.message);
      venues = candidates.slice(0, topN).map(v => buildResponseVenue(v));
    }

    // Write-through cache — fire-and-forget, never delays the response
    cache.setCached(key, venues, 3600);

    // Decrement quota for free users (GREATEST prevents going negative on races)
    if (!isPaid) {
      await db.none(
        'UPDATE users SET searches_remaining = GREATEST(searches_remaining - 1, 0) WHERE id = $1',
        [req.user.userId]
      ).catch(err => console.error('[search] quota decrement failed:', err.message));
    }

    return res.json({ query: trimmed, intent, venues });

  } catch (error) {
    next(error);
  }
};
