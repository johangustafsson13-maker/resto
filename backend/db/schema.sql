-- Venues table
CREATE TABLE IF NOT EXISTS venues (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  address VARCHAR(255) NOT NULL,
  city VARCHAR(100) DEFAULT 'Stockholm',
  lat DECIMAL(10, 8) NOT NULL,
  lng DECIMAL(11, 8) NOT NULL,

  -- Details
  cuisine_tags TEXT[], -- e.g., ['Swedish', 'Modern', 'Vegetarian']
  price_range INT CHECK (price_range >= 1 AND price_range <= 5), -- 1-5
  google_rating DECIMAL(2, 1),
  review_count INT DEFAULT 0,

  -- Amenities
  outdoor_seating BOOLEAN DEFAULT false,
  kid_friendly BOOLEAN DEFAULT false,
  wheelchair_accessible BOOLEAN DEFAULT false,
  wifi BOOLEAN DEFAULT false,

  -- Contact
  phone VARCHAR(20),
  website VARCHAR(255),

  -- Hours (JSON)
  open_hours JSONB,

  -- Metadata
  source VARCHAR(100), -- 'google_maps', 'openapi', etc.
  external_id VARCHAR(255), -- Google place ID, etc.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(external_id, source)
);

-- Reviews table
CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  venue_id INT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  text TEXT NOT NULL,
  rating DECIMAL(2, 1) CHECK (rating >= 1 AND rating <= 5),
  source VARCHAR(100), -- 'google_maps', 'tripadvisor', etc.
  external_id VARCHAR(255),

  -- Sentiment analysis (Claude-analyzed)
  sentiment_score DECIMAL(3, 2), -- -1.0 to 1.0
  food_quality_score DECIMAL(2, 1),
  service_score DECIMAL(2, 1),
  ambiance_score DECIMAL(2, 1),
  value_score DECIMAL(2, 1),

  author VARCHAR(255),
  review_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(external_id, source)
);

-- Search queries (for analytics)
CREATE TABLE IF NOT EXISTS search_queries (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  query TEXT NOT NULL,
  intent JSONB,
  results_count INT,
  clicked_venue_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users table (freemium auth)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),

  -- Freemium
  searches_remaining INT DEFAULT 3,
  searches_reset_at TIMESTAMP,
  subscription_status VARCHAR(50) DEFAULT 'free', -- 'free', 'paid', 'trial'
  subscription_expires_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_venues_city ON venues(city);
CREATE INDEX idx_venues_cuisine ON venues USING GIN(cuisine_tags);
CREATE INDEX idx_venues_location ON venues(lat, lng);
CREATE INDEX idx_reviews_venue ON reviews(venue_id);
CREATE INDEX idx_search_queries_user ON search_queries(user_id);
CREATE INDEX idx_search_queries_created ON search_queries(created_at);
CREATE INDEX idx_users_email ON users(email);
