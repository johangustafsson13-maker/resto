-- ============================================================================
-- Resto — Row-Level Security policies
-- ============================================================================
-- ARCHITECTURE NOTE — read before changing anything here.
--
-- Resto's application does NOT talk to Postgres with the Supabase anon /
-- authenticated API keys. ALL database access goes through the Express backend
-- (backend/db/index.js), which connects with the privileged Supabase pooler
-- role. That role BYPASSES row-level security. Authentication/authorization for
-- the app is enforced in the backend (bcrypt + JWT, middleware/auth.js), which
-- is the real trust boundary.
--
-- Therefore RLS here is DEFENSE IN DEPTH, scoped to the Supabase API-key surface
-- (PostgREST). It guarantees that IF anyone ever hits the database with the anon
-- or authenticated key (e.g. a future client-direct feature, or a leaked anon
-- key), they can only read public data and can never touch user or analytics
-- rows. It deliberately does NOT use FORCE ROW LEVEL SECURITY, because that would
-- also apply to the backend's privileged role and break the running app.
--
-- The previous version of this file targeted Supabase Auth (auth.uid()) and
-- referenced a `reviews.user_id` column that does not exist — those policies
-- were invalid for this schema and are replaced below.
--
-- Re-runnable: every policy is dropped before being (re)created.
-- ============================================================================

-- ─── Enable RLS (no FORCE — backend role still bypasses, by design) ──────────
ALTER TABLE venues         ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews        ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;

-- ─── VENUES — public, read-only over the API-key surface ─────────────────────
DROP POLICY IF EXISTS "venues_public_read" ON venues;
CREATE POLICY "venues_public_read"
  ON venues FOR SELECT
  USING (true);
-- No INSERT/UPDATE/DELETE policies: writes are backend-only (scraper/admin).

-- ─── REVIEWS — public, read-only ─────────────────────────────────────────────
DROP POLICY IF EXISTS "reviews_public_read" ON reviews;
CREATE POLICY "reviews_public_read"
  ON reviews FOR SELECT
  USING (true);
-- No write policies: reviews are scraped data with no end-user authorship.

-- ─── USERS — fully denied over the API-key surface ───────────────────────────
-- RLS is enabled with NO permissive policies, so anon/authenticated keys get
-- zero access to user rows (no read of password hashes, quotas, etc.). The
-- backend's privileged role bypasses RLS and performs all user operations.
DROP POLICY IF EXISTS "Users can read their own profile" ON users;
DROP POLICY IF EXISTS "Users can update their own profile" ON users;
-- (intentionally no CREATE POLICY for users)

-- ─── SEARCH_QUERIES — fully denied over the API-key surface ──────────────────
-- Analytics rows are written by the backend only. No anon/authenticated access.
DROP POLICY IF EXISTS "Users can read own searches"   ON search_queries;
DROP POLICY IF EXISTS "Users can insert own searches" ON search_queries;
DROP POLICY IF EXISTS "Users can delete own searches" ON search_queries;
-- (intentionally no CREATE POLICY for search_queries)

-- ─── Clean up invalid legacy policies from the previous file (if present) ────
DROP POLICY IF EXISTS "Anyone can read venues"        ON venues;
DROP POLICY IF EXISTS "Anyone can read reviews"       ON reviews;
DROP POLICY IF EXISTS "Users can create reviews"      ON reviews;
DROP POLICY IF EXISTS "Users can update own reviews"  ON reviews;
DROP POLICY IF EXISTS "Users can delete own reviews"  ON reviews;
