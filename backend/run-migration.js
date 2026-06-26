#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pgp = require('pg-promise')();
const db = pgp(process.env.DATABASE_URL);

async function runMigration() {
  try {
    console.log('🔄 Running Migration 004: Unify Venues Schema\n');

    // Read migration SQL
    const migrationPath = path.join(__dirname, 'migrations', '004_unify_venues_schema.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    // Split into statements (simple approach)
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));

    let executed = 0;

    for (const statement of statements) {
      try {
        await db.none(statement);
        executed++;
        const preview = statement.substring(0, 60).replace(/\n/g, ' ');
        console.log(`✅ ${preview}...`);
      } catch (err) {
        if (err.message.includes('already exists')) {
          console.log(`⚠️  Already exists: ${statement.substring(0, 40)}...`);
        } else {
          console.error(`❌ Error: ${err.message}`);
          throw err;
        }
      }
    }

    console.log(`\n✅ Migration complete! (${executed} statements executed)`);
    console.log('\n📊 Verification:\n');

    // Run verification queries
    const totalVenues = await db.one('SELECT COUNT(*) as count FROM venues');
    console.log(`   Total venues: ${totalVenues.count}`);

    const terraces = await db.one('SELECT COUNT(*) as count FROM venues WHERE is_terrace = true');
    console.log(`   Marked as terraces: ${terraces.count}`);

    const restaurants = await db.one('SELECT COUNT(*) as count FROM venues WHERE is_restaurant = true');
    console.log(`   Marked as restaurants: ${restaurants.count}`);

    const both = await db.one('SELECT COUNT(*) as count FROM venues WHERE is_terrace = true AND is_restaurant = true');
    console.log(`   Both categories: ${both.count}`);

    // Check indexes
    const indexes = await db.query(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'venues' AND indexname LIKE 'idx_venues%'"
    );
    console.log(`\n   Indexes created: ${indexes.length}`);
    indexes.forEach(idx => console.log(`     - ${idx.indexname}`));

    // Sample venue
    const sample = await db.oneOrNone(
      'SELECT id, name, is_terrace, is_restaurant, outdoor_seating, indoor_seating FROM venues WHERE is_terrace = true LIMIT 1'
    );
    if (sample) {
      console.log(`\n   Sample terrace venue: ${sample.name}`);
      console.log(`     - is_terrace: ${sample.is_terrace}`);
      console.log(`     - is_restaurant: ${sample.is_restaurant}`);
      console.log(`     - outdoor_seating: ${sample.outdoor_seating}`);
      console.log(`     - indoor_seating: ${sample.indoor_seating}`);
    }

    console.log('\n🎉 Database schema unified successfully!');

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pgp.end();
  }
}

runMigration();
