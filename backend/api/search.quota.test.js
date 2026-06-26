'use strict';
/**
 * Integration tests for the freemium quota gating in api/search.js.
 * No real DB / Claude / Redis — dependencies are mocked via require.cache so the
 * test runs headlessly. Run with: npm test
 */

const dbPath = require.resolve('../db');
const cachePath = require.resolve('../lib/cache');
const aiPath = require.resolve('@anthropic-ai/sdk');
const searchPath = require.resolve('./search');

const state = { users: {}, fetchQuota: 0, decrements: 0, cacheReturn: null };

const mockDb = {
  oneOrNone: async (sql, params) => {
    if (/FROM users/.test(sql)) { state.fetchQuota++; return state.users[params[0]] || null; }
    return null;
  },
  none: async (sql) => { if (/searches_remaining = GREATEST/.test(sql)) state.decrements++; return null; },
  any: async () => ([{ id: 1, name: 'A', address: 'x', lat: 59.3, lng: 18.0, cuisine_tags: ['Italian'], price_range: 2, google_rating: 4.5, review_count: 10, is_restaurant: true }]),
};
const mockCache = { getCached: async () => state.cacheReturn, setCached: async () => {} };
class MockAnthropic {
  constructor() {
    this.messages = { create: async (args) => {
      const sys = (args.system && args.system[0] && args.system[0].text) || '';
      if (/intent parser/i.test(sys)) {
        return { content: [{ text: JSON.stringify({ location: null, cuisine: [], time: null, ambiance: null, budget: null, party_size: null, dietary_restrictions: [], outdoor: false, must_have_features: [], special_occasions: null }) }] };
      }
      return { content: [{ text: JSON.stringify({ ranked: [{ venue_id: 1, score: 0.9, explanation: 'good' }] }) }] };
    } };
  }
}

function inject() {
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mockDb };
  require.cache[cachePath] = { id: cachePath, filename: cachePath, loaded: true, exports: mockCache };
  require.cache[aiPath] = { id: aiPath, filename: aiPath, loaded: true, exports: { default: MockAnthropic } };
}
function freshHandler() { delete require.cache[searchPath]; inject(); return require(searchPath); }
function makeRes() { const r = { statusCode: 200, body: null }; r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; }
const run = async (h, userId) => { const res = makeRes(); await h({ body: { query: 'pizza' }, user: { userId } }, res, (e) => { throw e; }); return res; };

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const reset = (u) => { state.users = { u1: u }; state.fetchQuota = 0; state.decrements = 0; state.cacheReturn = null; };

(async () => {
  // QUOTA OFF (default) → no quota DB work, behaves as live today
  delete process.env.QUOTA_ENABLED;
  reset({ searches_remaining: 0, searches_reset_at: null, subscription_status: 'free' });
  let res = await run(freshHandler(), 'u1');
  ok(res.statusCode === 200, 'OFF: 200');
  ok(res.body && res.body.venues && res.body.venues.length === 1, 'OFF: returns venues');
  ok(state.fetchQuota === 0, 'OFF: quota not fetched');
  ok(state.decrements === 0, 'OFF: not decremented');

  // QUOTA ON, free user exhausted → 403
  process.env.QUOTA_ENABLED = 'true';
  reset({ searches_remaining: 0, searches_reset_at: null, subscription_status: 'free' });
  res = await run(freshHandler(), 'u1');
  ok(res.statusCode === 403, 'ON/exhausted: 403');
  ok(state.decrements === 0, 'ON/exhausted: no decrement');

  // QUOTA ON, free user with budget → 200 + one decrement
  reset({ searches_remaining: 3, searches_reset_at: null, subscription_status: 'free' });
  res = await run(freshHandler(), 'u1');
  ok(res.statusCode === 200, 'ON/has-quota: 200');
  ok(state.fetchQuota === 1, 'ON/has-quota: quota fetched once');
  ok(state.decrements === 1, 'ON/has-quota: decremented once');

  // QUOTA ON, paid user → 200 even at 0 remaining, never decremented
  reset({ searches_remaining: 0, searches_reset_at: null, subscription_status: 'paid' });
  res = await run(freshHandler(), 'u1');
  ok(res.statusCode === 200, 'ON/paid: 200 at 0 remaining');
  ok(state.decrements === 0, 'ON/paid: not decremented');

  // Cache hit → returns cached venues, still counts against quota
  reset({ searches_remaining: 3, searches_reset_at: null, subscription_status: 'free' });
  state.cacheReturn = [{ id: 9, name: 'cached' }];
  res = await run(freshHandler(), 'u1');
  ok(res.statusCode === 200 && res.body.venues[0].name === 'cached', 'cache hit: returns cached');
  ok(state.decrements === 1, 'cache hit: still decrements');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
