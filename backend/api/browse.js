'use strict';

const { fetchCandidates, buildResponseVenue } = require('./search');

// GET /api/browse — public, no auth, no Claude calls
// Returns top-rated venues for the map default state
module.exports = async (req, res, next) => {
  try {
    const type = ['restaurant', 'terrace', 'both'].includes(req.query.type)
      ? req.query.type : 'both';
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

    const nullIntent = { location: null, budget: null };
    const candidates = await fetchCandidates(nullIntent, '', type, {});
    const venues = candidates.slice(0, limit).map(v => buildResponseVenue(v));

    return res.json({ venues, total: venues.length });
  } catch (err) {
    next(err);
  }
};
