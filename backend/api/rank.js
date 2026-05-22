const Anthropic = require('@anthropic-ai/sdk').default;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * POST /api/rank
 * Rank venues by relevance to user intent
 */
module.exports = async (req, res, next) => {
  try {
    const { venues, intent } = req.body;

    if (!venues || !Array.isArray(venues) || venues.length === 0) {
      return res.status(400).json({ error: 'Venues array is required' });
    }

    if (!intent) {
      return res.status(400).json({ error: 'Intent object is required' });
    }

    // Format venues for Claude
    const venuesText = venues.map((v, i) =>
      `${i + 1}. ${v.name} (${v.cuisine_tags?.join(', ') || 'N/A'}) - Rating: ${v.google_rating}/5, Price: ${v.price_range}/5, Location: ${v.address}`
    ).join('\n');

    const intentText = `
- Location: ${intent.location || 'Anywhere in Stockholm'}
- Time: ${intent.time || 'Anytime'}
- Budget: ${intent.budget ? `${intent.budget} SEK` : 'No limit'}
- Ambiance: ${intent.ambiance || 'Any'}
- Party size: ${intent.party_size || 'Not specified'}
- Dietary needs: ${intent.dietary_restrictions?.length ? intent.dietary_restrictions.join(', ') : 'None'}
    `.trim();

    // Call Claude to rank
    const message = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      system: `You are an expert restaurant recommender. Rank the given restaurants by how well they match the user's intent.

For each restaurant, provide:
1. Ranking score (0-1, where 1 is perfect match)
2. Brief explanation (1-2 sentences) of why it matches or doesn't match

Respond with ONLY valid JSON in this format:
{
  "ranked": [
    {
      "id": "<restaurant_id or index>",
      "score": 0.95,
      "explanation": "Perfect match because..."
    }
  ]
}`,
      messages: [
        {
          role: 'user',
          content: `User's intent:\n${intentText}\n\nRestaurants to rank:\n${venuesText}`
        }
      ]
    });

    const rankingText = message.content[0].text;
    const ranking = JSON.parse(rankingText);

    res.json({
      intent,
      ranking,
      count: ranking.ranked.length
    });

  } catch (error) {
    if (error instanceof SyntaxError) {
      return res.status(400).json({ error: 'Failed to parse Claude response as JSON' });
    }
    next(error);
  }
};
