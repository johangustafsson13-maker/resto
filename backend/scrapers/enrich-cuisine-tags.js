'use strict';

/**
 * Enrich cuisine tags for venues that have only generic tags like "Restaurant" or "Bar".
 * Uses Claude to infer cuisine from venue name + address.
 * Runs in batches to stay within rate limits.
 *
 * Usage: node scrapers/enrich-cuisine-tags.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pgp = require('pg-promise')();
const Anthropic = require('@anthropic-ai/sdk').default;

const db = pgp(process.env.DATABASE_URL);
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BATCH_SIZE = 30; // venues per Claude call — keep prompts manageable
const SLEEP_MS = 500;  // between batches

const GENERIC_TAGS = ['Restaurant', 'Bar', 'Café', 'Bakery', 'Fast Food'];

const SYSTEM_PROMPT = `You are a restaurant cuisine classifier. Given a list of venue names and addresses in Stockholm, infer the most specific cuisine type(s) for each venue.

Rules:
- Use ONLY these cuisine labels: Pizza, Sushi, Japanese, Chinese, Thai, Indian, Italian, French, American, Mexican, Mediterranean, Greek, Middle Eastern, Lebanese, Turkish, Korean, Vietnamese, Spanish, Seafood, Steakhouse, Vegetarian, Vegan, Burgers, Sandwiches, Brunch, Breakfast, Swedish, Nordic, Asian Fusion, Café, Coffee, Bakery, Patisserie, Bar, Pub, Wine Bar, Cocktail Bar, Fast Food, Noodles, Kebab, Falafel, Smorgas, International
- Infer from the venue name (e.g. "Thai Garden" → Thai, "Pizzeria Roma" → Pizza, "Sushirestaurang" → Sushi)
- If name gives no clue, return ["Restaurant"]
- Return 1–3 tags per venue, most specific first
- Respond ONLY with a JSON array, one entry per venue, in the same order as input

Example input:
1. Thai Garden, Södermalm
2. Burger King, Norrmalm
3. Restaurang Blå Porten, Djurgården

Example output:
[["Thai"],["Burgers","Fast Food"],["Swedish","Café"]]`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseClaudeJSON(text) {
  const cleaned = text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  return JSON.parse(cleaned);
}

async function enrichBatch(venues) {
  const input = venues.map((v, i) => `${i + 1}. ${v.name}, ${v.address}`).join('\n');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001', // cheapest — this is simple classification
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: input }],
  });

  const tags = parseClaudeJSON(response.content[0].text);
  if (!Array.isArray(tags) || tags.length !== venues.length) {
    throw new Error(`Expected ${venues.length} results, got ${tags.length}`);
  }
  return tags;
}

async function main() {
  console.log('🏷️  Resto — Cuisine Tag Enrichment');
  console.log('===================================');

  await db.connect().then(c => { console.log('✓ Database connected'); c.done(); });

  // Fetch venues with only generic tags
  const venues = await db.any(`
    SELECT id, name, address, cuisine_tags
    FROM venues
    WHERE cuisine_tags <@ ARRAY['Restaurant','Bar','Café','Bakery','Fast Food']::text[]
       OR cuisine_tags IS NULL
    ORDER BY review_count DESC NULLS LAST
  `);

  console.log(`\nFound ${venues.length} venues with generic tags — enriching...\n`);

  let updated = 0;
  let errors = 0;

  for (let i = 0; i < venues.length; i += BATCH_SIZE) {
    const batch = venues.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(venues.length / BATCH_SIZE);

    try {
      const tagResults = await enrichBatch(batch);

      for (let j = 0; j < batch.length; j++) {
        const venue = batch[j];
        const newTags = tagResults[j];

        // Only update if we got something more specific than what we had
        const isMoreSpecific = !newTags.every(t => GENERIC_TAGS.includes(t));
        if (isMoreSpecific) {
          await db.none(
            'UPDATE venues SET cuisine_tags = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [newTags, venue.id]
          );
          updated++;
        }
      }

      console.log(`  Batch ${batchNum}/${totalBatches} ✓ (${updated} updated so far)`);
    } catch (err) {
      errors++;
      console.warn(`  Batch ${batchNum}/${totalBatches} ✗ ${err.message}`);
    }

    if (i + BATCH_SIZE < venues.length) await sleep(SLEEP_MS);
  }

  console.log('\n═══════════════════════════════');
  console.log(`✅ Done! Updated ${updated} venues`);
  if (errors) console.log(`   Errors: ${errors} batches`);

  await db.$pool.end();
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
