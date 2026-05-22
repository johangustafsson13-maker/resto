/**
 * Venue Ranker Prompts for Claude
 * Ranks restaurants by relevance to user intent
 */

const RANKING_SYSTEM = `You are an expert restaurant recommender in Stockholm. You know the city's restaurant scene intimately and understand what makes a restaurant perfect for different situations.

Your task: Rank restaurants by how well they match the user's intent. **PRIORITIZE CUISINE MATCH ABOVE ALL ELSE** — if a user asks for coffee places, rank coffee shops first, even if they're slightly lower rated. Consider:
1. **Cuisine alignment (PRIMARY)** — does it serve what they're looking for? Coffee, Italian, Thai, etc.
2. Location match (proximity to requested area)
3. Ambiance fit (matches their desired atmosphere)
4. Budget alignment (price range matches their budget)
5. Special features (wifi, outdoor seating, quiet, etc.)
6. Dietary accommodations (vegetarian, vegan, allergies, etc.)
7. Timing appropriateness (hours match requested time)

Respond with ONLY valid JSON. No markdown, no explanation.

Format your response as:
{
  "ranked": [
    {
      "venue_id": "<id or index>",
      "score": 0.95,
      "explanation": "Brief explanation (1-2 sentences) of why this matches their intent"
    }
  ]
}

Score guidelines:
- 1.0: Perfect match across all criteria
- 0.8-0.9: Excellent match, minor misses
- 0.6-0.7: Good match, some criteria don't align
- 0.4-0.5: Decent option, significant gaps
- 0.0-0.3: Poor match, but possibly useful as alternative

Example ranking response:
{
  "ranked": [
    {
      "venue_id": 1,
      "score": 0.95,
      "explanation": "Perfect match: located in Stureplan, upscale ambiance for business, price range 350 SEK average, excellent for lunch meetings."
    },
    {
      "venue_id": 3,
      "score": 0.78,
      "explanation": "Good match: business-friendly, 150 SEK under budget, quiet ambiance, but slightly further from Stureplan."
    }
  ]
}`;

const formatVenueForRanking = (venue) => {
  return `
- ID: ${venue.id}
- Name: ${venue.name}
- Address: ${venue.address}
- Cuisine: ${venue.cuisine_tags?.join(', ') || 'N/A'}
- Rating: ${venue.google_rating || 'N/A'}/5 (${venue.review_count || 0} reviews)
- Price range: ${venue.price_range || 'N/A'}/5
- Features: ${[
    venue.outdoor_seating && 'outdoor seating',
    venue.kid_friendly && 'kid-friendly',
    venue.wheelchair_accessible && 'wheelchair accessible',
    venue.wifi && 'wifi'
  ]
    .filter(Boolean)
    .join(', ') || 'standard'}
- Hours: ${venue.open_hours ? JSON.stringify(venue.open_hours) : 'N/A'}
`;
};

const formatIntentForRanking = (intent) => {
  return `
User's Intent:
- Location: ${intent.location || 'Anywhere in Stockholm'}
- Time: ${intent.time || 'Anytime'}
- Ambiance: ${intent.ambiance?.length ? intent.ambiance.join(', ') : 'Any'}
- Budget: ${intent.budget ? `Max ${intent.budget} SEK` : 'No limit'}
- Party size: ${intent.party_size || 'Not specified'}
- Dietary needs: ${intent.dietary_restrictions?.length ? intent.dietary_restrictions.join(', ') : 'None'}
- Must have: ${intent.must_have_features?.length ? intent.must_have_features.join(', ') : 'None'}
- Occasion: ${intent.special_occasions || 'Casual'}
`;
};

const rankVenues = (venues, intent) => {
  const venuesText = venues
    .map((v, i) => `${i + 1}.${formatVenueForRanking(v)}`)
    .join('\n');

  const intentText = formatIntentForRanking(intent);

  return {
    systemPrompt: RANKING_SYSTEM,
    userMessage: `${intentText}\n\nRestaurants to rank:\n${venuesText}`,
    expectedFields: ['ranked']
  };
};

module.exports = {
  RANKING_SYSTEM,
  formatVenueForRanking,
  formatIntentForRanking,
  rankVenues
};
