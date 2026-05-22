'use strict';

const { createClient } = require('redis');

const enabled = process.env.REDIS_ENABLED === 'true';

// When disabled, export no-ops so search.js can call these unconditionally.
if (!enabled) {
  module.exports = {
    getCached: async () => null,
    setCached: async () => {},
  };
} else {
  const client = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  });

  client.on('error', err => console.warn('[cache] Redis error:', err.message));

  client.connect()
    .then(() => console.log('[cache] Redis connected'))
    .catch(err =>
      console.warn('[cache] Redis unavailable — search works without cache:', err.message)
    );

  /**
   * Returns parsed cached data for key, or null on miss / error / not ready.
   */
  async function getCached(key) {
    if (!client.isReady) return null;
    try {
      const raw = await client.get(key);
      if (!raw) {
        console.log(`[cache] MISS: ${key}`);
        return null;
      }
      console.log(`[cache] HIT: ${key}`);
      return JSON.parse(raw);
    } catch (err) {
      console.warn('[cache] get failed:', err.message);
      return null;
    }
  }

  /**
   * Serialises data and stores it under key for ttl seconds.
   * Silently swallows errors — a failed write never breaks the caller.
   */
  async function setCached(key, data, ttl = 3600) {
    if (!client.isReady) return;
    try {
      await client.set(key, JSON.stringify(data), { EX: ttl });
    } catch (err) {
      console.warn('[cache] set failed:', err.message);
    }
  }

  module.exports = { getCached, setCached };
}
