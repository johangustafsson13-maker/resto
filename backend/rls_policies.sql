-- Row Level Security (RLS) Policies for Stockholm Explorer
-- Fixed for actual schema structure

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- ============ USERS TABLE ============
-- Users can read their own profile
CREATE POLICY "Users can read their own profile"
ON users FOR SELECT
USING (auth.uid() = id::text);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile"
ON users FOR UPDATE
USING (auth.uid() = id::text);

-- ============ VENUES TABLE ============
-- Anyone can read venues (public data - restaurants are public)
CREATE POLICY "Anyone can read venues"
ON venues FOR SELECT
USING (true);

-- Disable write access for now (venues managed by admin backend)
-- If you want to allow venue creation later, add:
-- CREATE POLICY "Users can insert venues"
-- ON venues FOR INSERT
-- WITH CHECK (true);

-- ============ SEARCH QUERIES TABLE ============
-- Users can read their own search queries
CREATE POLICY "Users can read own searches"
ON search_queries FOR SELECT
USING (auth.uid()::text = user_id);

-- Users can insert their own search queries
CREATE POLICY "Users can insert own searches"
ON search_queries FOR INSERT
WITH CHECK (auth.uid()::text = user_id);

-- Users can delete their own search queries
CREATE POLICY "Users can delete own searches"
ON search_queries FOR DELETE
USING (auth.uid()::text = user_id);

-- ============ REVIEWS TABLE ============
-- Anyone can read reviews (public data)
CREATE POLICY "Anyone can read reviews"
ON reviews FOR SELECT
USING (true);

-- Users can create their own reviews
-- Note: user_id should be UUID, but it's stored as VARCHAR, so we cast auth.uid() to text
CREATE POLICY "Users can create reviews"
ON reviews FOR INSERT
WITH CHECK (auth.uid()::text = user_id);

-- Users can update their own reviews
CREATE POLICY "Users can update own reviews"
ON reviews FOR UPDATE
USING (auth.uid()::text = user_id);

-- Users can delete their own reviews
CREATE POLICY "Users can delete own reviews"
ON reviews FOR DELETE
USING (auth.uid()::text = user_id);
