#!/usr/bin/env node
/**
 * Automated Terrace Data Migration Script
 * Consolidates stockholm-sun-finder terraces into Resto's Supabase
 *
 * Usage: node migrate-terraces.js
 *
 * Before running:
 * 1. Get API keys from both Supabase instances
 * 2. Set environment variables or edit credentials below
 * 3. Run: node migrate-terraces.js
 */

const { createClient } = require('@supabase/supabase-js');

// ============================================================================
// CONFIGURATION - UPDATE THESE WITH YOUR SUPABASE CREDENTIALS
// ============================================================================

const SUN_FINDER_CONFIG = {
  url: 'https://guucodkurwwqgylbreag.supabase.co',
  // Get this from: https://app.supabase.com > guucodkurwwqgylbreag > Settings > API > anon public
  key: process.env.SUNFINDER_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1dWNvZGt1cnd3cWd5bGJyZWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODM2MDAsImV4cCI6MjA5MTI1OTYwMH0.NYFTg1FYcfg0F-3ZQ1XIeqnnf6fI8AxA3Gxe_aM6JxU',
};

const RESTO_CONFIG = {
  url: 'https://fbukjbbdlsfywjszuoqo.supabase.co',
  // Get this from: https://app.supabase.com > fbukjbbdlsfywjszuoqo > Settings > API > anon public
  key: process.env.RESTO_KEY || '',
};

// ============================================================================
// VALIDATION
// ============================================================================

if (!RESTO_CONFIG.key) {
  console.error('❌ ERROR: RESTO_KEY not set!');
  console.error('\nTo get your Resto Supabase key:');
  console.error('1. Go to https://app.supabase.com');
  console.error('2. Select project: fbukjbbdlsfywjszuoqo');
  console.error('3. Settings → API → Copy "anon public" key');
  console.error('4. Set it: RESTO_KEY="your-key-here" node migrate-terraces.js');
  process.exit(1);
}

// ============================================================================
// MAIN MIGRATION LOGIC
// ============================================================================

async function migrateTerraces() {
  console.log('🏠 Stockholm Explorer - Terrace Data Migration');
  console.log('━'.repeat(60));

  try {
    // Step 1: Connect to both instances
    console.log('\n📡 Connecting to Supabase instances...');
    const sunFinderClient = createClient(SUN_FINDER_CONFIG.url, SUN_FINDER_CONFIG.key);
    const restoClient = createClient(RESTO_CONFIG.url, RESTO_CONFIG.key);
    console.log('✓ Connected to both instances');

    // Step 2: Export terraces from sun-finder
    console.log('\n📤 Exporting terraces from stockholm-sun-finder...');
    const { data: terraces, error: exportError } = await sunFinderClient
      .from('venues')
      .select('id, name, address, lat, lng, neighbourhood, orientation, outdoor_seats, is_active, google_place_id, created_at')
      .eq('is_active', true);

    if (exportError) {
      throw new Error(`Failed to export terraces: ${exportError.message}`);
    }

    console.log(`✓ Exported ${terraces.length} terraces`);

    if (terraces.length === 0) {
      console.warn('⚠️  No active terraces found in stockholm-sun-finder. Migration complete but no data transferred.');
      return;
    }

    // Step 3: Transform data to Resto schema
    console.log('\n🔄 Transforming data to Resto schema...');
    const transformed = terraces.map((terrace, index) => ({
      type: 'terrace',
      name: terrace.name,
      address: terrace.address,
      lat: parseFloat(terrace.lat),
      lng: parseFloat(terrace.lng),
      neighbourhood: terrace.neighbourhood || null,
      orientation: terrace.orientation || null,
      outdoor_seats: terrace.outdoor_seats ? parseInt(terrace.outdoor_seats) : null,
      google_place_id: terrace.google_place_id || null,
      is_active: terrace.is_active !== false,
      source: 'stockholm-sun-finder',
      external_id: terrace.id, // Store original UUID
      created_at: terrace.created_at || new Date().toISOString(),
    }));

    console.log(`✓ Transformed ${transformed.length} terraces`);

    // Step 4: Check for existing data
    console.log('\n🔍 Checking for existing terraces in Resto...');
    const { data: existing, error: checkError } = await restoClient
      .from('venues')
      .select('external_id')
      .eq('type', 'terrace');

    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116 means table doesn't exist yet, which is fine
      throw new Error(`Failed to check existing data: ${checkError.message}`);
    }

    const existingIds = new Set(existing?.map(e => e.external_id) || []);
    const newTerraces = transformed.filter(t => !existingIds.has(t.external_id));

    console.log(`  - ${existingIds.size} terraces already in Resto`);
    console.log(`  - ${newTerraces.length} new terraces to import`);

    if (newTerraces.length === 0) {
      console.log('✓ All terraces already imported. No action needed.');
      return;
    }

    // Step 5: Import in batches (Supabase has limits)
    console.log('\n📥 Importing terraces into Resto...');
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
        throw importError;
      }

      imported += importedData?.length || 0;
      const progress = Math.min(imported, newTerraces.length);
      console.log(`  - Batch ${Math.floor(i / batchSize) + 1}: Imported ${progress}/${newTerraces.length}`);
    }

    console.log(`✓ Imported ${imported} new terraces`);

    // Step 6: Verify the migration
    console.log('\n✅ Verifying migration...');
    const { data: allVenues, error: countError } = await restoClient
      .from('venues')
      .select('type')
      .limit(2000);

    if (countError) {
      console.warn('⚠️  Could not verify counts:', countError.message);
    } else {
      const restaurantCount = allVenues.filter(v => v.type === 'restaurant').length;
      const terraceCount = allVenues.filter(v => v.type === 'terrace').length;
      console.log(`  - Restaurants: ${restaurantCount}`);
      console.log(`  - Terraces: ${terraceCount}`);
      console.log(`  - Total venues: ${restaurantCount + terraceCount}`);
    }

    // Check for data quality
    const { data: invalidData, error: qualityError } = await restoClient
      .from('venues')
      .select('id')
      .eq('type', 'terrace')
      .or('name.is.null,address.is.null')
      .limit(5);

    if (!qualityError && invalidData.length > 0) {
      console.warn(`⚠️  Found ${invalidData.length} terraces with missing data (name or address)`);
    } else if (!qualityError) {
      console.log('✓ All terrace data validation passed');
    }

    // Success!
    console.log('\n' + '━'.repeat(60));
    console.log('🎉 MIGRATION COMPLETE!');
    console.log('━'.repeat(60));
    console.log('\nNext steps:');
    console.log('1. Update stockholm-sun-finder Supabase credentials');
    console.log('   File: src/integrations/supabase/client.ts');
    console.log('   Update to use Resto Supabase URL and key');
    console.log('');
    console.log('2. Update TerraceCard.tsx query to filter by type:');
    console.log('   .eq("type", "terrace")');
    console.log('');
    console.log('3. Deploy stockholm-sun-finder');
    console.log('');
    console.log('4. Test: Load stockholm-sun-finder and verify terraces display');

  } catch (error) {
    console.error('\n❌ MIGRATION FAILED');
    console.error('━'.repeat(60));
    console.error('Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Verify Supabase credentials are correct');
    console.error('2. Check network connectivity');
    console.error('3. Ensure you have read/write permissions');
    console.error('4. Check Supabase project status at app.supabase.com');
    process.exit(1);
  }
}

// ============================================================================
// RUN MIGRATION
// ============================================================================

migrateTerraces();
