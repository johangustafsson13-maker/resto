const Anthropic = require('@anthropic-ai/sdk').default;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * POST /api/parse-intent
 * Parse natural language query into structured intent
 */
module.exports = async (req, res, next) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Call Claude to parse intent
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: `You are an expert restaurant intent parser. Extract the following from Swedish restaurant queries:
- location: Area/neighborhood in Stockholm (or null if not specified)
- time: 'breakfast', 'lunch', 'dinner', 'late_night', or null
- ambiance: 'casual', 'romantic', 'business', 'family', 'quiet', 'lively', or null
- budget: Maximum SEK budget (or null if not specified)
- party_size: Number of people (or null)
- dietary_restrictions: Array of restrictions ('vegetarian', 'vegan', 'gluten_free', etc.)
- outdoor: true if outdoor seating requested, false otherwise
- must_have_features: Array of required features ('wifi', 'quiet', 'music', etc.)

Respond with ONLY valid JSON, no markdown or extra text.`,
      messages: [
        {
          role: 'user',
          content: query
        }
      ]
    });

    const intentText = message.content[0].text;
    const intent = JSON.parse(intentText);

    res.json({
      query,
      intent,
      parsed: true
    });

  } catch (error) {
    if (error instanceof SyntaxError) {
      return res.status(400).json({ error: 'Failed to parse Claude response as JSON' });
    }
    next(error);
  }
};
