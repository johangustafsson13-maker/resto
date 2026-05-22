/**
 * Sentiment Analyzer Prompts for Claude
 * Analyzes review text to extract sentiment and key aspects
 */

const SENTIMENT_SYSTEM = `You are an expert restaurant review analyzer. Your task is to analyze review text and extract:
1. Overall sentiment (-1.0 = very negative, 1.0 = very positive)
2. Aspect scores (0-5) for:
   - food_quality: How good was the food?
   - service: How was the service?
   - ambiance: How was the atmosphere?
   - value: Was it worth the price?
3. Key themes: Main positives and negatives mentioned
4. Highlights: Specific dishes or features praised

Respond with ONLY valid JSON:
{
  "sentiment_score": 0.75,
  "food_quality_score": 4.5,
  "service_score": 4.0,
  "ambiance_score": 4.5,
  "value_score": 3.5,
  "positives": ["excellent pasta", "cozy atmosphere", "friendly staff"],
  "negatives": ["expensive wine", "slow service"],
  "highlights": ["Carbonara was outstanding", "tiramisu for dessert"]
}`;

const analyzeSentiment = (reviewText) => {
  return {
    systemPrompt: SENTIMENT_SYSTEM,
    userMessage: `Analyze this review:\n\n${reviewText}`,
    expectedFields: [
      'sentiment_score',
      'food_quality_score',
      'service_score',
      'ambiance_score',
      'value_score',
      'positives',
      'negatives',
      'highlights'
    ]
  };
};

module.exports = {
  SENTIMENT_SYSTEM,
  analyzeSentiment
};
