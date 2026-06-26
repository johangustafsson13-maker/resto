# Row Level Security (RLS) Implementation Guide

**Priority**: 🔴 CRITICAL - Security vulnerability  
**Status**: ACTION REQUIRED  
**Date**: 2026-05-28

---

## Overview

Supabase database has flagged that Row Level Security (RLS) is disabled on 4 public tables:
- `users`
- `venues`
- `search_queries`
- `reviews`

Without RLS, anyone can access all data. This must be fixed immediately.

---

## Step-by-Step Fix

### Part 1: Enable RLS on Each Table (Supabase Dashboard)

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to **Authentication** → **Policies** (or Database → Tables)
4. For each of these 4 tables, enable RLS:

#### Table 1: `users`

**Step 1**: Click the table `users` → **Enable RLS** button

**Step 2**: Add Policy - "Users can read their own profile"
```sql
CREATE POLICY "Users can read their own profile"
ON users FOR SELECT
USING (auth.uid() = id);
```

**Step 3**: Add Policy - "Users can update their own profile"
```sql
CREATE POLICY "Users can update their own profile"
ON users FOR UPDATE
USING (auth.uid() = id);
```

---

#### Table 2: `venues`

**Step 1**: Enable RLS on `venues` table

**Step 2**: Add Policy - "Anyone can read venues (public data)"
```sql
CREATE POLICY "Anyone can read venues"
ON venues FOR SELECT
USING (true);
```

**Step 3**: Add Policy - "Only admin can insert/update venues"
```sql
CREATE POLICY "Admin can manage venues"
ON venues FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = 'admin'
  )
);
```

---

#### Table 3: `search_queries`

**Step 1**: Enable RLS on `search_queries` table

**Step 2**: Add Policy - "Users can read their own search queries"
```sql
CREATE POLICY "Users can read own searches"
ON search_queries FOR SELECT
USING (auth.uid() = user_id);
```

**Step 3**: Add Policy - "Users can insert their own search queries"
```sql
CREATE POLICY "Users can insert own searches"
ON search_queries FOR INSERT
WITH CHECK (auth.uid() = user_id);
```

**Step 4**: Add Policy - "Users can delete their own search queries"
```sql
CREATE POLICY "Users can delete own searches"
ON search_queries FOR DELETE
USING (auth.uid() = user_id);
```

---

#### Table 4: `reviews`

**Step 1**: Enable RLS on `reviews` table

**Step 2**: Add Policy - "Anyone can read reviews (public data)"
```sql
CREATE POLICY "Anyone can read reviews"
ON reviews FOR SELECT
USING (true);
```

**Step 3**: Add Policy - "Users can insert their own reviews"
```sql
CREATE POLICY "Users can create reviews"
ON reviews FOR INSERT
WITH CHECK (auth.uid() = user_id);
```

**Step 4**: Add Policy - "Users can update their own reviews"
```sql
CREATE POLICY "Users can update own reviews"
ON reviews FOR UPDATE
USING (auth.uid() = user_id);
```

**Step 5**: Add Policy - "Users can delete their own reviews"
```sql
CREATE POLICY "Users can delete own reviews"
ON reviews FOR DELETE
USING (auth.uid() = user_id);
```

---

## Alternative: SQL Script Approach

If you have direct SQL access, run this complete script:

```sql
-- 1. Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- 2. Users table policies
CREATE POLICY "Users can read their own profile"
ON users FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
ON users FOR UPDATE
USING (auth.uid() = id);

-- 3. Venues table policies (public read, admin only write)
CREATE POLICY "Anyone can read venues"
ON venues FOR SELECT
USING (true);

CREATE POLICY "Admin can manage venues"
ON venues FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND (users.role = 'admin' OR users.is_admin = true)
  )
);

-- 4. Search queries table policies
CREATE POLICY "Users can read own searches"
ON search_queries FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own searches"
ON search_queries FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own searches"
ON search_queries FOR DELETE
USING (auth.uid() = user_id);

-- 5. Reviews table policies
CREATE POLICY "Anyone can read reviews"
ON reviews FOR SELECT
USING (true);

CREATE POLICY "Users can create reviews"
ON reviews FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reviews"
ON reviews FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reviews"
ON reviews FOR DELETE
USING (auth.uid() = user_id);
```

---

## Verification Steps

After implementing RLS:

1. Go back to **Supabase Dashboard** → **Database Linter**
2. Re-run the security check
3. All 4 errors should be gone
4. Status should show: ✅ PASSED

---

## Testing RLS Works

### Test 1: User isolation
- User A logs in and creates a review
- User B logs in and tries to read User A's profile
- Result: User B should get `null` or error (not see User A's data)

### Test 2: Public data
- User A logs in and queries `/api/venues`
- Result: All venues visible (public data)

### Test 3: Admin access
- Admin user tries to insert venue
- Result: Succeeds (admin policy allows)
- Regular user tries to insert venue
- Result: Fails (no permission)

---

## Impact on Application

After RLS is enabled:

✅ **Frontend**: No changes needed (authentication already in place)  
✅ **Backend**: Works as-is (already using auth tokens)  
✅ **Database**: Automatically enforces access control  

Your existing auth token system will work with RLS - Supabase will automatically check `auth.uid()` using your JWT token.

---

## References

- [Supabase RLS Docs](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [RLS Best Practices](https://supabase.com/docs/guides/database/postgres/row-level-security#best-practices)
- [Database Linter](https://supabase.com/docs/guides/database/database-linter)

---

## Timeline

- **Immediate**: Enable RLS and add basic policies
- **Within 24 hours**: Test all policies work correctly
- **Before production**: Audit all data access patterns

---

## Checklist

- [ ] Enable RLS on `users` table
- [ ] Add 2 policies for `users`
- [ ] Enable RLS on `venues` table
- [ ] Add 2 policies for `venues`
- [ ] Enable RLS on `search_queries` table
- [ ] Add 3 policies for `search_queries`
- [ ] Enable RLS on `reviews` table
- [ ] Add 4 policies for `reviews`
- [ ] Verify in Supabase Database Linter (all errors gone)
- [ ] Test user isolation works
- [ ] Test public data access works
- [ ] Test admin permissions work

---

## Questions?

If any policies fail:
1. Check table column names match your schema
2. Check `auth.uid()` matches your user ID column (should be `id`)
3. Check user role column name (might be `is_admin` instead of `role`)
4. Verify foreign keys are correct (e.g., `user_id` in reviews)
