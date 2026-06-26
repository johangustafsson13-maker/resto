#!/usr/bin/env node
/**
 * Import Terraces from CSV into Resto Supabase
 *
 * Usage: RESTO_KEY="your-key" node import-terraces-from-csv.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { createClient } = require('@supabase/supabase-js');

// Configuration
const RESTO_CONFIG = {
  url: 'https://fbukjbbdlsfywjszuoqo.supabase.co',
  key: process.env.RESTO_KEY || '',
};

const CSV_PATH = path.join(os.homedir(), 'Downloads/Supabase Snippet Fetch Active Venues.csv');

// ============================================================================
// CSV PARSING (simple, handles quoted fields)
// ============================================================================

function parseCSV(csvText) {
  const lines = csvText.split('\n');
  if (lines.length < 2) throw new Error('CSV is empty or missing data');

  // Parse header
  const header = parseCSVLine(lines[0]);
  console.log('CSV Columns:', header);

  // Parse rows
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVLine(lines[i]);
    const row = {};
    header.forEach((col, idx) => {
      row[col] = values[idx];
    });
    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// ============================================================================
// TRANSFORMATION TO RESTO SCHEMA
// ============================================================================

function transformTerraces(csvRows) {
  return csvRows.map((row) => ({
    type: 'terrace',
    name: row.name || null,
    address: row.address || null,
    lat: row.lat ? parseFloat(row.lat) : null,
    lng: row.lng ? parseFloat(row.lng) : null,
    neighbourhood: row.neighbourhood || null,
    orientation: row.orientation || null,
    outdoor_seats: row.outdoor_seats ? parseInt(row.outdoor_seats) : null,
    google_place_id: row.google_place_id || null,
    is_active: row.is_active !== 'false',
    source: 'stockholm-sun-finder',
    external_id: row.id,
    created_at: row.created_at || new Date().toISOString(),
  }));
}

// ============================================================================
// MAIN IMPORT LOGIC
// ============================================================================

async function importTerraces() {
  console.log('🏠 Stockholm Explorer - CSV Import');
  console.log('━'.repeat(60));

  try {
    // Validate config
    if (!RESTO_CONFIG.key) {
      throw new Error('RESTO_KEY environment variable not set. Run: RESTO_KEY="your-key" node import-terraces-from-csv.js');
    }

    // Read CSV
    console.log('\n📖 Reading CSV file...');
    if (!fs.existsSync(CSV_PATH)) {
      throw new Error(`CSV not found at: ${CSV_PATH}`);
    }

    const csvText = fs.readFileSync(CSV_PATH, 'utf8');
    console.log(`✓ Read CSV (${csvText.length} bytes)`);

    // Parse CSV
    console.log('\n🔍 Parsing CSV...');
    const csvRows = parseCSV(csvText);
    console.log(`✓ Found ${csvRows.length} rows`);

    // Transform
    console.log('\n🔄 Transforming to Resto schema...');
    const terraces = transformTerraces(csvRows);
    console.log(`✓ Transformed ${terraces.length} terraces`);

    // Sample
    console.log('\nSample terrace:');
    console.log(JSON.stringify(terraces[0], null, 2));

    // Connect to Resto
    console.log('\n📡 Connecting to Resto Supabase...');
    const restoClient = createClient(RESTO_CONFIG.url, RESTO_CONFIG.key);
    console.log('✓ Connected');

    // Check for duplicates (optional - skip if fails)
    console.log('\n🔍 Checking for existing terraces...');
    let newTerraces = terraces;

    try {
      const { data: existing, error: checkError } = await restoClient
        .from('venues')
        .select('external_id, id')
        .eq('type', 'terrace')
        .limit(1000);

      if (checkError && checkError.code !== 'PGRST116') {
        console.warn('  ⚠️  Could not check for duplicates, will attempt import anyway');
      } else {
        const existingIds = new Set(existing?.map(e => e.external_id) || []);
        newTerraces = terraces.filter(t => !existingIds.has(t.external_id));
        console.log(`  - ${existingIds.size} terraces already in Resto`);
      }
    } catch (e) {
      console.warn('  ⚠️  Could not check for duplicates, will attempt import anyway');
    }

    console.log(`  - ${newTerraces.length} terraces to import`);

    if (newTerraces.length === 0) {
      console.log('✓ All terraces already imported.');
      return;
    }

    // Import in batches
    console.log('\n📥 Importing terraces...');
    const batchSize = 100;
    let imported = 0;

    for (let i = 0; i < newTerraces.length; i += batchSize) {
      const batch = newTerraces.slice(i, i + batchSize);
      const { error: importError, data: importedData } = await restoClient
        .from('venues')
        .insert(batch)
        .select('id');

      if (importError) {
        console.error(`✗ Batch ${Math.floor(i / batchSize) + 1} failed:`, importError.message);
        console.error('First item in batch:', JSON.stringify(batch[0], null, 2));
        throw importError;
      }

      imported += importedData?.length || 0;
      const progress = Math.min(imported, newTerraces.length);
      const percentage = Math.round((progress / newTerraces.length) * 100);
      console.log(`  - Batch ${Math.floor(i / batchSize) + 1}: ${progress}/${newTerraces.length} (${percentage}%)`);
    }

    console.log(`✓ Imported ${imported} terraces`);

    // Verify
    console.log('\n✅ Verifying...');

    try {
      const { data: venues } = await restoClient
        .from('venues')
        .select('type')
        .limit(1000);

      if (venues) {
        const restaurants = venues.filter(v => v.type === 'restaurant').length;
        const terraces = venues.filter(v => v.type === 'terrace').length;
        console.log(`  - Restaurants: ${restaurants}`);
        console.log(`  - Terraces: ${terraces}`);
      }
    } catch (e) {
      console.log('  - Verification skipped (network issue)');
    }

    // Success
    console.log('\n' + '━'.repeat(60));
    console.log('🎉 IMPORT COMPLETE!');
    console.log('━'.repeat(60));
    console.log('\nNext steps:');
    console.log('1. Update stockholm-sun-finder Supabase credentials:');
    console.log('   File: src/integrations/supabase/client.ts');
    console.log('   Update SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY');
    console.log('');
    console.log('2. Update TerraceCard.tsx to filter by type:');
    console.log('   .eq("type", "terrace")');
    console.log('');
    console.log('3. Deploy and test');

  } catch (error) {
    console.error('\n❌ IMPORT FAILED');
    console.error('━'.repeat(60));
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run
importTerraces();
