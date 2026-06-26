-- Migration 003: Unify venues schema for restaurants + terraces
-- This migration consolidates restaurant and terrace data into a single venues table
-- Date: 2026-05-22
-- Timeline: Execute in testing environment first, then production

-- ============================================================================
-- STEP 1: Create backup tables (for rollback safety)
-- ============================================================================

-- Back up existing restaurant data
CREATE TABLE IF NOT EXISTS venues_restaurants_backup AS
SELECT * FROM venues WHERE true;

-- Create terrace backup if it exists
CREATE TABLE IF NOT EXISTS venues_terraces_backup AS
SELECT * FROM (
  SELECT
    id,
    'terrace' AS type,
    name,
    neighbourhood,
    outdoor_seats,
    orientation,
    address,
    lat,
    lng,
    NULL AS cuisine_tags,
    NULL AS price_range,
    NULL AS phone,
    NULL AS website,
    NULL AS open_hours,
    NULL AS kid_friendly,
    NULL AS wheelchair_accessible,
    NULL AS wifi,
    NULL AS google_rating,
    NULL AS review_count,
    NULL AS outdoor_seating,
    NULL AS sun_score_current,
    NOW() AS created_at,
    NOW() AS updated_at
  FROM public.venues_terraces
) WHERE false; -- This will be empty initially, adjust if terraces table exists

-- ============================================================================
-- STEP 2: Rename existing venues table and create new unified schema
-- ============================================================================

-- Rename old restaurants table
ALTER TABLE IF EXISTS venues RENAME TO venues_restaurants_old;

-- Create new unified venues table
CREATE TABLE venues (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('restaurant', 'terrace')),

  -- Common fields
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  lat DECIMAL(9,6) NOT NULL,
  lng DECIMAL(9,6) NOT NULL,
  neighbourhood TEXT DEFAULT NULL,

  -- Restaurant-specific
  cuisine_tags TEXT[] DEFAULT NULL,
  price_range INT DEFAULT NULL CHECK (price_range >= 1 AND price_range <= 5),
  phone TEXT DEFAULT NULL,
  website TEXT DEFAULT NULL,
  open_hours JSONB DEFAULT NULL,
  kid_friendly BOOLEAN DEFAULT NULL,
  wheelchair_accessible BOOLEAN DEFAULT NULL,
  wifi BOOLEAN DEFAULT NULL,

  -- Terrace-specific
  outdoor_seats INT DEFAULT NULL,
  orientation TEXT DEFAULT NULL CHECK (orientation IS NULL OR orientation IN ('north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'varies')),
  sun_score_current INT DEFAULT NULL CHECK (sun_score_current IS NULL OR (sun_score_current >= 0 AND sun_score_current <= 100)),

  -- Common metadata
  google_rating DECIMAL(3,1) DEFAULT NULL CHECK (google_rating IS NULL OR (google_rating >= 0 AND google_rating <= 5)),
  review_count INT DEFAULT NULL,
  outdoor_seating BOOLEAN DEFAULT NULL,

  -- Source tracking (for terraces imported from sun-finder)
  google_place_id TEXT DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT DEFAULT NULL,
  external_id TEXT DEFAULT NULL,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- STEP 3: Create indexes for performance
-- ============================================================================

CREATE INDEX idx_venues_type ON venues(type);
CREATE INDEX idx_venues_location ON venues(lat, lng);
CREATE INDEX idx_venues_location_type ON venues(lat, lng, type);
CREATE INDEX idx_venues_cuisine ON venues USING GIN(cuisine_tags) WHERE type = 'restaurant';
CREATE INDEX idx_venues_rating ON venues(google_rating DESC NULLS LAST) WHERE type = 'restaurant';
CREATE INDEX idx_venues_sun_score ON venues(sun_score_current DESC NULLS LAST) WHERE type = 'terrace';

-- ============================================================================
-- STEP 4: Migrate restaurant data
-- ============================================================================

INSERT INTO venues (
  id,
  type,
  name,
  address,
  lat,
  lng,
  neighbourhood,
  cuisine_tags,
  price_range,
  phone,
  website,
  open_hours,
  kid_friendly,
  wheelchair_accessible,
  wifi,
  google_rating,
  review_count,
  outdoor_seating,
  source,
  external_id,
  created_at,
  updated_at
)
SELECT
  id,
  'restaurant' AS type,
  name,
  address,
  lat,
  lng,
  NULL AS neighbourhood,
  cuisine_tags,
  price_range,
  phone,
  website,
  open_hours,
  kid_friendly,
  wheelchair_accessible,
  wifi,
  google_rating,
  review_count,
  outdoor_seating,
  source,
  external_id,
  created_at,
  updated_at
FROM venues_restaurants_old;

-- ============================================================================
-- STEP 5: Migrate terrace data (if venues_terraces table exists)
-- ============================================================================

-- NOTE: Uncomment and adjust the query below if you have a venues_terraces table
-- This example assumes terraces have: id, name, neighbourhood, outdoor_seats, orientation, address, lat, lng

-- DO $$
-- BEGIN
--   IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'venues_terraces') THEN
--     INSERT INTO venues (
--       id,
--       type,
--       name,
--       address,
--       lat,
--       lng,
--       neighbourhood,
--       outdoor_seats,
--       orientation,
--       created_at,
--       updated_at
--     )
--     SELECT
--       id + 10000 AS id,  -- Offset IDs to avoid conflicts
--       'terrace' AS type,
--       name,
--       address,
--       lat,
--       lng,
--       neighbourhood,
--       outdoor_seats,
--       orientation,
--       NOW() AS created_at,
--       NOW() AS updated_at
--     FROM venues_terraces
--     WHERE NOT EXISTS (SELECT 1 FROM venues WHERE id = venues_terraces.id);
--   END IF;
-- END $$;

-- ============================================================================
-- STEP 6: Verify migration
-- ============================================================================

-- Count records by type
SELECT type, COUNT(*) as count FROM venues GROUP BY type;

-- Check for any NULL values that shouldn't be
SELECT COUNT(*) as invalid_entries FROM venues WHERE name IS NULL OR address IS NULL;

-- ============================================================================
-- STEP 7: Drop old backup table (ONLY after verification)
-- ============================================================================

-- WARNING: Only run after verifying the migration was successful
-- DROP TABLE venues_restaurants_old;

-- ============================================================================
-- Rollback instructions if needed:
-- ============================================================================
-- 1. DROP TABLE venues;
-- 2. ALTER TABLE venues_restaurants_old RENAME TO venues;
-- 3. ALTER TABLE venues_restaurants_backup DROP CONSTRAINT IF EXISTS CHECK;

