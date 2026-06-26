-- Migration: Unify Venue Database Schema (Fixed)
-- Date: 2026-05-28
-- Purpose: Add type flags to support unified terraces+restaurants

-- ============================================================================
-- Phase 1: Add new columns to venues table
-- ============================================================================

-- Add venue type flags
ALTER TABLE venues ADD COLUMN IF NOT EXISTS is_terrace BOOLEAN DEFAULT false;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS is_restaurant BOOLEAN DEFAULT true;

-- Add seating type column
ALTER TABLE venues ADD COLUMN IF NOT EXISTS indoor_seating BOOLEAN DEFAULT true;

-- Add description for venue context
ALTER TABLE venues ADD COLUMN IF NOT EXISTS description TEXT;

-- ============================================================================
-- Phase 2: Create indexes for performance
-- ============================================================================

-- Composite index for filtering by type and seating (main use case)
CREATE INDEX IF NOT EXISTS idx_venues_type_seating ON venues(
  is_terrace,
  is_restaurant,
  outdoor_seating,
  indoor_seating
);

-- Index for location-based queries
CREATE INDEX IF NOT EXISTS idx_venues_location_geo ON venues(lat, lng);

-- Index for cuisine filtering
CREATE INDEX IF NOT EXISTS idx_venues_cuisine ON venues USING GIN(cuisine_tags);

-- ============================================================================
-- Phase 3: Backfill existing data
-- ============================================================================

-- Mark existing outdoor seating venues as terraces
UPDATE venues
SET is_terrace = true
WHERE outdoor_seating = true AND is_terrace = false;

-- Ensure all venues are marked as restaurants (default)
UPDATE venues
SET is_restaurant = true
WHERE is_restaurant = false;

-- Mark cafés as both terraces and restaurants
UPDATE venues
SET is_terrace = true
WHERE cuisine_tags @> ARRAY['Café'] AND is_terrace = false;

-- Mark bars as both indoor and outdoor
UPDATE venues
SET is_terrace = true, indoor_seating = true
WHERE cuisine_tags @> ARRAY['Bar'] AND is_terrace = false;

-- ============================================================================
-- Phase 4: Verify migration
-- ============================================================================

-- Check total venues
SELECT COUNT(*) as total_venues FROM venues;

-- Check terraces
SELECT COUNT(*) as terrace_venues FROM venues WHERE is_terrace = true;

-- Check restaurants
SELECT COUNT(*) as restaurant_venues FROM venues WHERE is_restaurant = true;

-- Check both categories
SELECT COUNT(*) as both_venues FROM venues WHERE is_terrace = true AND is_restaurant = true;

-- Verify indexes created
SELECT indexname FROM pg_indexes WHERE tablename = 'venues' AND indexname LIKE 'idx_venues%';

-- Sample venue with new fields
SELECT
  id,
  name,
  is_terrace,
  is_restaurant,
  outdoor_seating,
  indoor_seating
FROM venues
LIMIT 1;
