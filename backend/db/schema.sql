-- ============================================================================
-- Resto — Authoritative database schema (single source of truth)
-- ============================================================================
-- This file reflects the ACTUAL production schema. It supersedes the piecemeal
-- files in backend/migrations/, which drifted:
--   * 003_unify_venues_schema.sql  — an abandoned redesign using a `type` enum.
--                                     NOT the design in production. Kept only for history.
--   * 004_unify_venues_schema.sql  — added a generated `searchable_content` column
--                                     that failed to apply; superseded by ↓
--   * 004_unify_venues_schema_fixed.sql — the boolean-flag design that shipped.
--
-- Production `venues` = the original base table + the 004 boolean flags
-- (is_terrace / is_restaurant / indoor_seating) + the terrace columns
-- (neighbourhood / outdoor_seats / orientation / google_place_id), some of which
-- were added out-of-band. They are all consolidated here.
--
-- To stand up a fresh database:  psql "$DATABASE_URL" -f backend/db/schema.sql
-- Then apply RLS:                psql "$DATABASE_URL" -f backend/rls_policies.sql
-- ============================================================================

-- ─── Venues ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venues (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  address VARCHAR(255) NOT NULL,
  city VARCHAR(100) DEFAULT 'Stockholm',
  lat DECIMAL(10, 8) NOT NULL,
  lng DECIMAL(11, 8) NOT NULL,
  neighbourhood TEXT,

  -- Classification (unified restaurants + terraces)
  is_restaurant BOOLEAN DEFAULT true,
  is_terrace    BOOLEAN DEFAULT false,
  is_active     BOOLEAN DEFAULT true,

  -- Details
  cuisine_tags TEXT[],                                  -- e.g. {'Swedish','Modern'}
  price_range  INT CHECK (price_range BETWEEN 1 AND 5), -- 1–5
  google_rating DECIMAL(2, 1),
  review_count  INT DEFAULT 0,

  -- Seating / amenities
  outdoor_seating       BOOLEAN DEFAULT false,
  indoor_seating        BOOLEAN DEFAULT true,
  outdoor_seats         INT,                            -- terrace capacity
  orientation           TEXT CHECK (orientation IS NULL OR orientation IN
                          ('north','south','east','west',
                           'northeast','northwest','southeast','southwest','varies')),
  kid_friendly          BOOLEAN DEFAULT false,
  wheelchair_accessible BOOLEAN DEFAULT false,
  wifi                  BOOLEAN DEFAULT false,

  -- Contact
  phone   VARCHAR(20),
  website VARCHAR(255),

  -- Hours (JSON: { monday: { open, close }, ... })
  open_hours JSONB,

  -- Source tracking
  source          VARCHAR(100),   -- 'google_maps', 'terraces_csv', etc.
  external_id     VARCHAR(255),   -- provider id (Google place_id, etc.)
  google_place_id TEXT,           -- explicit Google place id (terrace imports)

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (external_id, source)
);

CREATE INDEX IF NOT EXISTS idx_venues_city          ON venues(city);
CREATE INDEX IF NOT EXISTS idx_venues_location       ON venues(lat, lng);
CREATE INDEX IF NOT EXISTS idx_venues_cuisine        ON venues USING GIN(cuisine_tags);
CREATE INDEX IF NOT EXISTS idx_venues_type_seating   ON venues(is_terrace, is_restaurant, outdoor_seating, indoor_seating);
CREATE INDEX IF NOT EXISTS idx_venues_rating         ON venues(google_rating DESC NULLS LAST);

-- ─── Reviews ────────────────────────────────────────────────────────────────
-- Scraped/admin data (no end-user authorship). Sentiment columns are reserved
-- for the planned Claude sentiment analysis (not yet populated).
CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  venue_id INT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  text   TEXT NOT NULL,
  rating DECIMAL(2, 1) CHECK (rating BETWEEN 1 AND 5),
  source VARCHAR(100),
  external_id VARCHAR(255),

  -- Sentiment analysis (Claude — reserved, currently unused)
  sentiment_score    DECIMAL(3, 2), -- -1.00 .. 1.00
  food_quality_score DECIMAL(2, 1),
  service_score      DECIMAL(2, 1),
  ambiance_score     DECIMAL(2, 1),
  value_score        DECIMAL(2, 1),

  author      VARCHAR(255),
  review_date TIMESTAMP,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (external_id, source)
);

CREATE INDEX IF NOT EXISTS idx_reviews_venue ON reviews(venue_id);

-- ─── Search queries (analytics — table reserved, not yet written by the app) ──
CREATE TABLE IF NOT EXISTS search_queries (
  id SERIAL PRIMARY KEY,
  user_id          VARCHAR(255),
  query            TEXT NOT NULL,
  intent           JSONB,
  results_count    INT,
  clicked_venue_id INT,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_search_queries_user    ON search_queries(user_id);
CREATE INDEX IF NOT EXISTS idx_search_queries_created ON search_queries(created_at);

-- ─── Users (freemium auth — bcrypt + JWT, handled by the Express backend) ─────
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),

  -- Freemium quota
  searches_remaining INT DEFAULT 3,
  searches_reset_at  TIMESTAMP,
  subscription_status VARCHAR(50) DEFAULT 'free',  -- 'free' | 'paid' | 'trial'
  subscription_expires_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
