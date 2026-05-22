'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const puppeteer = require('puppeteer');
const pgp = require('pg-promise')();
const axios = require('axios');

const db = pgp(process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/resto_dev');

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const AREAS = [
  { name: 'Norrmalm',  query: 'restaurants Norrmalm Stockholm Sweden',  lat: 59.3358, lng: 18.0640 },
  { name: 'Gamla Stan', query: 'restaurants Gamla Stan Stockholm Sweden', lat: 59.3240, lng: 18.0710 },
  { name: 'Södermalm', query: 'restaurants Södermalm Stockholm Sweden',  lat: 59.3151, lng: 18.0654 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// Google's price_level 0–4 → our 1–5
function mapPriceLevel(level) {
  return (level != null) ? level + 1 : null;
}

const TYPE_TO_CUISINE = {
  pizza_restaurant: 'Pizza',
  sushi_restaurant: 'Sushi',
  japanese_restaurant: 'Japanese',
  chinese_restaurant: 'Chinese',
  thai_restaurant: 'Thai',
  indian_restaurant: 'Indian',
  italian_restaurant: 'Italian',
  french_restaurant: 'French',
  american_restaurant: 'American',
  mexican_restaurant: 'Mexican',
  mediterranean_restaurant: 'Mediterranean',
  seafood_restaurant: 'Seafood',
  steak_house: 'Steakhouse',
  vegetarian_restaurant: 'Vegetarian',
  vegan_restaurant: 'Vegan',
  burger_restaurant: 'Burgers',
  cafe: 'Café',
  bar: 'Bar',
  bakery: 'Bakery',
  fast_food_restaurant: 'Fast Food',
};

function inferCuisineTags(types = []) {
  const tags = types.map(t => TYPE_TO_CUISINE[t]).filter(Boolean);
  return tags.length ? [...new Set(tags)] : ['Restaurant'];
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

// ─── Approach 1: Google Places API ────────────────────────────────────────────

async function fetchViaPlacesAPI() {
  const all = [];
  for (const area of AREAS) {
    console.log(`\n📍 ${area.name} (Places API)...`);
    const venues = await fetchAreaViaAPI(area);
    all.push(...venues);
    console.log(`   ✓ ${venues.length} restaurants`);
  }
  return all;
}

async function fetchAreaViaAPI(area) {
  const venues = [];
  let pageToken = null;

  do {
    const params = { query: area.query, type: 'restaurant', key: GOOGLE_MAPS_API_KEY };
    if (pageToken) params.pagetoken = pageToken;

    const res = await withRetry(() =>
      axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', { params, timeout: 10000 })
    );
    const { status, results = [], next_page_token, error_message } = res.data;

    if (!['OK', 'ZERO_RESULTS'].includes(status)) {
      console.error(`   Places API error (${status}): ${error_message || ''}`);
      break;
    }

    for (const place of results) {
      const details = await fetchPlaceDetails(place.place_id);
      venues.push(buildVenueFromAPI(place, details));
      await sleep(150); // stay under rate limit
    }

    pageToken = next_page_token || null;
    if (pageToken) await sleep(2500); // required between pages

  } while (pageToken && venues.length < 80);

  return venues;
}

async function fetchPlaceDetails(placeId) {
  const fields = 'name,formatted_address,geometry,price_level,rating,user_ratings_total,opening_hours,formatted_phone_number,website,types,reviews';
  const res = await withRetry(() =>
    axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
      params: { place_id: placeId, fields, key: GOOGLE_MAPS_API_KEY },
      timeout: 10000,
    })
  );
  return res.data.result || {};
}

function buildVenueFromAPI(place, details) {
  const geo = (details.geometry || place.geometry || {}).location || {};
  return {
    name: details.name || place.name,
    address: details.formatted_address || place.formatted_address || '',
    lat: geo.lat || 0,
    lng: geo.lng || 0,
    cuisine_tags: inferCuisineTags(details.types || place.types),
    price_range: mapPriceLevel(details.price_level ?? place.price_level),
    google_rating: details.rating || place.rating || null,
    review_count: details.user_ratings_total || place.user_ratings_total || 0,
    phone: details.formatted_phone_number || null,
    website: details.website || null,
    open_hours: transformHours(details.opening_hours),
    external_id: place.place_id,
    source: 'google_maps',
    reviews: (details.reviews || []).slice(0, 5).map((r, i) => ({
      text: r.text || '',
      rating: r.rating || null,
      author: r.author_name || null,
      review_date: r.time ? new Date(r.time * 1000) : null,
      external_id: `${place.place_id}_r_${r.time || i}`,
      source: 'google_maps',
    })),
  };
}

// ─── Approach 2: Puppeteer scraper ────────────────────────────────────────────

async function fetchViaPuppeteer() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1366,768',
    ],
  });

  const all = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    // Hide automation flag
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    for (const area of AREAS) {
      console.log(`\n📍 ${area.name} (Puppeteer)...`);
      const venues = await scrapeArea(page, area);
      all.push(...venues);
      console.log(`   ✓ ${venues.length} restaurants`);
    }
  } finally {
    await browser.close();
  }
  return all;
}

async function dismissConsent(page) {
  const selectors = [
    'button[aria-label*="Accept all"]',
    'button[aria-label*="Agree"]',
    'form[action*="consent"] button[type="submit"]',
    '#L2AGLb', // "I agree" button ID in some regions
  ];
  for (const sel of selectors) {
    const btn = await page.$(sel).catch(() => null);
    if (btn) { await btn.click(); await sleep(800); return; }
  }
}

async function scrapeArea(page, area) {
  const url = `https://www.google.com/maps/search/${encodeURIComponent(area.query)}`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(3000);
  } catch (err) {
    console.error(`   Navigation failed: ${err.message}`);
    return [];
  }

  await dismissConsent(page);
  await sleep(1000);

  const feedExists = await page.waitForSelector('[role="feed"]', { timeout: 15000 }).catch(() => null);
  if (!feedExists) {
    console.warn(`   No results feed found`);
    return [];
  }

  // Scroll feed to load more results
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => {
      const feed = document.querySelector('[role="feed"]');
      if (feed) feed.scrollTop = feed.scrollHeight;
    });
    await sleep(1500);
  }

  // Collect unique place URLs from the results list
  const placeUrls = await page.evaluate(() => {
    const seen = new Set();
    return Array.from(document.querySelectorAll('a[href*="/maps/place/"]'))
      .map(a => a.href)
      .filter(href => {
        const key = href.split('?')[0];
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 60);
  });

  console.log(`   Found ${placeUrls.length} place URLs, visiting each...`);

  const venues = [];
  for (let i = 0; i < placeUrls.length; i++) {
    try {
      const venue = await scrapePlacePage(page, placeUrls[i], area);
      if (venue) {
        venues.push(venue);
        if ((i + 1) % 10 === 0) console.log(`   Progress: ${i + 1}/${placeUrls.length}`);
      }
    } catch (err) {
      // Skip silently — fragile selectors, bot detection, etc.
    }
    await sleep(600 + Math.random() * 600);
  }
  return venues;
}

async function scrapePlacePage(page, url, area) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);

  const data = await page.evaluate((fallbackLat, fallbackLng) => {
    const first = (sels, attr) => {
      for (const s of sels) {
        const el = document.querySelector(s);
        if (!el) continue;
        const val = attr ? el.getAttribute(attr) : el.textContent?.trim();
        if (val) return val;
      }
      return null;
    };

    const name = first(['h1.DUwDvf', 'h1[data-attrid="title"]', 'h1']);

    const ratingStr = first(['.F7nice > span[aria-hidden]', 'span.ceNzKf', 'span.Aq14fc']);
    const rating = ratingStr ? parseFloat(ratingStr.replace(',', '.')) : null;

    const reviewStr = first(['span[aria-label*="review"]', '.F7nice span:not([aria-hidden])']);
    const reviewCount = reviewStr ? parseInt(reviewStr.replace(/\D/g, ''), 10) || 0 : 0;

    // address & phone from accessible buttons
    const addrBtn = document.querySelector('button[data-item-id="address"]');
    const address = addrBtn
      ? (addrBtn.getAttribute('aria-label') || addrBtn.textContent || '').replace(/^Address:\s*/i, '').trim()
      : null;

    const phoneBtn = Array.from(document.querySelectorAll('button[data-item-id]'))
      .find(b => b.getAttribute('data-item-id')?.startsWith('phone'));
    const phone = phoneBtn
      ? (phoneBtn.getAttribute('aria-label') || phoneBtn.textContent || '').replace(/^Phone:\s*/i, '').trim()
      : null;

    const websiteA = document.querySelector('a[data-item-id="authority"]');
    const website = websiteA ? websiteA.href : null;

    const priceEl = document.querySelector('[aria-label*="Price"], span.mgr77e');
    const priceLevel = priceEl
      ? ((priceEl.getAttribute('aria-label') || priceEl.textContent).match(/\$/g) || []).length || null
      : null;

    // Opening hours from table rows
    const hours = {};
    document.querySelectorAll('tr.y0skZc, table.eK4R0e tr').forEach(row => {
      const cells = row.querySelectorAll('td, th');
      if (cells.length >= 2) {
        const day = cells[0].textContent.trim().toLowerCase();
        const time = cells[1].textContent.trim();
        if (day && time && day.length < 12) hours[day] = time;
      }
    });

    // Category chips (cuisine info)
    const categories = Array.from(document.querySelectorAll('span.DkEaL, button.DkEaL'))
      .map(el => el.textContent.trim())
      .filter(t => t && t.length < 50);

    // Place ID from URL (ChIJ…)
    const pidMatch = window.location.href.match(/ChIJ[A-Za-z0-9_-]+/);
    const placeId = pidMatch ? pidMatch[0] : null;

    // Coordinates from URL @lat,lng
    const coordMatch = window.location.href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    const lat = coordMatch ? parseFloat(coordMatch[1]) : fallbackLat;
    const lng = coordMatch ? parseFloat(coordMatch[2]) : fallbackLng;

    // Sample reviews
    const reviews = Array.from(document.querySelectorAll('div.jftiEf, div[data-review-id]'))
      .slice(0, 5)
      .map((el, i) => {
        const text = el.querySelector('.wiI7pd, span.review-full-text')?.textContent?.trim() || '';
        const starEl = el.querySelector('span.kvMYJc, span[aria-label*="star"]');
        const stars = starEl ? parseFloat((starEl.getAttribute('aria-label') || '').match(/[\d.]+/)?.[0] || 0) : null;
        const author = el.querySelector('.d4r55, .TSUbDb')?.textContent?.trim() || null;
        const dateText = el.querySelector('.rsqaWe, span.dehysf')?.textContent?.trim() || null;
        return { text, rating: stars, author, dateText, idx: i };
      })
      .filter(r => r.text);

    return { name, rating, reviewCount, address, phone, website, priceLevel, hours, categories, placeId, lat, lng, reviews };
  }, area.lat, area.lng);

  if (!data.name || !data.placeId) return null;

  return {
    name: data.name,
    address: data.address || `${area.name}, Stockholm, Sweden`,
    lat: data.lat || area.lat,
    lng: data.lng || area.lng,
    cuisine_tags: data.categories.length ? data.categories : ['Restaurant'],
    price_range: data.priceLevel,
    google_rating: isNaN(data.rating) ? null : data.rating,
    review_count: data.reviewCount || 0,
    phone: data.phone || null,
    website: data.website || null,
    open_hours: Object.keys(data.hours).length ? data.hours : null,
    external_id: data.placeId,
    source: 'google_maps',
    reviews: data.reviews.map(r => ({
      text: r.text,
      rating: r.rating,
      author: r.author,
      review_date: parseRelativeDate(r.dateText),
      external_id: `${data.placeId}_r_${r.idx}`,
      source: 'google_maps',
    })),
  };
}

function parseRelativeDate(str) {
  if (!str) return null;
  const m = str.match(/(\d+)\s+(year|month|week|day)/i);
  if (!m) return new Date();
  const n = parseInt(m[1]);
  const d = new Date();
  const u = m[2].toLowerCase();
  if (u === 'year')  d.setFullYear(d.getFullYear() - n);
  if (u === 'month') d.setMonth(d.getMonth() - n);
  if (u === 'week')  d.setDate(d.getDate() - n * 7);
  if (u === 'day')   d.setDate(d.getDate() - n);
  return d;
}

// ─── Database ─────────────────────────────────────────────────────────────────

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
        venue.open_hours ? venue.open_hours : null,
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
        venue.open_hours ? venue.open_hours : null,
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🍽️  Resto — Google Maps Scraper');
  console.log('================================');

  // Verify DB connection
  await db.connect().then(c => { console.log('✓ Database connected'); c.done(); });

  let venues = [];

  if (GOOGLE_MAPS_API_KEY) {
    console.log('Mode: Google Places API\n');
    venues = await fetchViaPlacesAPI();
  } else {
    console.log('Mode: Puppeteer (headless browser)');
    console.log('⚠️  For faster, more reliable results add GOOGLE_MAPS_API_KEY to backend/.env');
    console.log('   Free key at: https://console.cloud.google.com/ (Places API, free tier is sufficient)\n');
    venues = await fetchViaPuppeteer();
  }

  console.log(`\n💾 Saving ${venues.length} venues...`);

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const venue of venues) {
    try {
      const { inserted: wasNew } = await saveVenue(venue);
      if (wasNew) inserted++; else updated++;
    } catch (err) {
      errors++;
      if (errors <= 5) console.error(`  ✗ "${venue.name}": ${err.message}`);
    }
  }

  console.log('');
  const errPart = errors ? `, ${errors} errors` : '';
  console.log(`✓ Scraped ${venues.length} restaurants, inserted ${inserted}, updated ${updated}${errPart}`);

  await db.$pool.end();
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
