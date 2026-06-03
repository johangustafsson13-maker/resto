# Pass B Session 1 — Auth Forwarding

**Status:** Active. Frontend → backend credential forwarding. Removes dev bypass. Closes the deploy blocker.

## What this work is

Currently the backend has working auth middleware but it's bypassed in dev (lines 9-13 of `backend/middleware/auth.js`). The frontend has a complete localStorage-backed JWT system in `lib/auth.ts` but the search call doesn't use it. This session bridges the gap.

After this session, the search endpoint requires a valid JWT in production. Anonymous users can still browse the map and use the time scrubber, but search forces login.

## Files in scope

Declared upfront per working agreements. If you find yourself needing to touch a file outside this list, STOP and surface (a/b/c question).

- `frontend/pages/api/search.ts` — Forward `Authorization` header to backend
- `frontend/pages/index.tsx` — Send JWT on search submit, handle 401 by redirecting to login
- `backend/middleware/auth.js` — Remove dev bypass (lines 9-13)

NOT in scope:
- `frontend/lib/auth.ts` (already complete, don't modify)
- `frontend/pages/auth/login.tsx` (already complete, don't modify)
- `frontend/pages/auth/signup.tsx` (assumed complete — verify but don't modify)
- `backend/api/auth.js` (already complete, don't modify)
- Any visual/design changes
- Anonymous trial credits or anything Option C-shaped

## Behavior decisions made up front

**1. Login wall scope:** Search requires auth. Map view, scrubber, 3D toggle remain anonymous-accessible. Anonymous user submitting search → redirect to `/auth/login?next=<encoded-current-url>`. After login → router.push back to `next` URL with query preserved.

**2. Token storage:** localStorage, as `lib/auth.ts` already implements. Don't migrate to cookies in this session.

**3. Token expiry handling:** If `isAuthenticated()` returns false (token missing or expired) at search time, treat exactly the same as never-logged-in — redirect to login. The 401 response from backend is the fallback for race conditions.

**4. Logged-in state visibility:** Not in scope this session. No "Hi {email}" or logout button anywhere. That's a Pass B Session 2 concern.

## Step-by-step

### Step 1 — Forward token through frontend proxy

In `frontend/pages/api/search.ts`, after the existing `if (!query)` guard, read the incoming Authorization header and forward it. Approximately:

```typescript
const authHeader = req.headers.authorization
const response = await fetch(`${apiUrl}/api/search`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(authHeader ? { Authorization: authHeader } : {}),
  },
  body: JSON.stringify({ query }),
})
```

The spread is so we forward only if present. Backend handles the missing-header case (returns 401).

If the backend returns 401, propagate it cleanly. Today the code does `if (!response.ok) throw new Error(...)` which collapses all errors. Change to:

```typescript
if (response.status === 401) {
  return res.status(401).json({ error: 'Authentication required' })
}
if (!response.ok) {
  throw new Error(`Backend API responded with ${response.status}`)
}
```

So that the frontend can distinguish "you need to log in" from "the server is broken."

### Step 2 — Send token from search call

Find where `pages/index.tsx` calls `/api/search`. Add the token:

```typescript
import { getToken, isAuthenticated } from '../lib/auth'

// In the search submit handler:
const handleSearch = async (query: string) => {
  if (!isAuthenticated()) {
    const next = encodeURIComponent(`/?q=${encodeURIComponent(query)}`)
    router.push(`/auth/login?next=${next}`)
    return
  }
  
  const token = getToken()
  const response = await fetch('/api/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query }),
  })
  
  if (response.status === 401) {
    // Token expired between isAuthenticated() check and request
    const next = encodeURIComponent(`/?q=${encodeURIComponent(query)}`)
    router.push(`/auth/login?next=${next}`)
    return
  }
  // ... existing error handling and result rendering
}
```

The pre-flight `isAuthenticated()` check avoids one wasted request. The 401 fallback catches the race where the token expired between check and fetch.

### Step 3 — Honor `?next=` in login page

In `frontend/pages/auth/login.tsx`, the current success handler does:

```typescript
setTimeout(() => router.push('/'), 2000)
```

Change to read `next` query param:

```typescript
setTimeout(() => {
  const next = typeof router.query.next === 'string' ? router.query.next : '/'
  router.push(next)
}, 2000)
```

Validate the `next` value is a relative URL (starts with `/`, doesn't contain `://`) to prevent open-redirect issues. If invalid, fall back to `/`.

### Step 4 — Remove backend dev bypass

In `backend/middleware/auth.js`, delete lines 9-13:

```javascript
// TEMP: relaxed for local dev — Phase 2 will implement proper credential forwarding from frontend API route
if (process.env.NODE_ENV === 'development') {
  req.user = null;
  return next();
}
```

After deletion, the middleware does its real job in both dev and prod. Test in dev: search without a token → 401. Search with token → succeeds.

## Verification gates

After all four steps, before committing:

1. **Anonymous map view still works.** Open `/` in incognito (no localStorage). Map loads, wordmark renders, scrubber drags, 3D toggle works. No 401s in console.

2. **Anonymous search redirects to login.** In incognito, type a query in the search box, submit. Should redirect to `/auth/login?next=...`. The `next` param should contain a URL-encoded path including the query.

3. **Login then search works.** From the login redirect, log in. Should redirect back to `/` with the search query in the URL. Search should fire and return results.

4. **Direct logged-in search works.** Already logged in, visit `/`, search. Should work without any redirect.

5. **Expired token handling.** Manually corrupt the JWT in localStorage (e.g. set it to `"bad-token"`), reload, attempt search. Should redirect to login cleanly, not throw.

6. **Backend dev mode actually requires auth now.** From terminal:
```bash
   curl -X POST http://localhost:3001/api/search \
     -H "Content-Type: application/json" \
     -d '{"query":"test"}'
```
   Should return `401`. Same request with `-H "Authorization: Bearer <real-token-from-localStorage>"` should return search results.

7. **Production build passes.** `npm run build && npm start` in `frontend/`. No type errors. Walk through gates 1-5 against the production build.

## Risks

- **The `/api/search` proxy might be reached from places other than `pages/index.tsx`.** If FilterPanel, ResultsList, or other components also fetch `/api/search`, they need the token too. Audit before assuming index.tsx is the only caller. Currently FilterPanel and ResultsList are wrapped in `{false && (...)}`, but they exist in the codebase and will be restored in Pass B Session 3.

  **Action:** After Step 2, grep the frontend for `/api/search`:
```bash
  grep -rn "/api/search" frontend --include="*.tsx" --include="*.ts"
```
  If hits exist outside `pages/index.tsx` and `pages/api/search.ts`, address each one or surface that the scope needs to expand.

- **`backend/api/search.js` location uncertain.** During investigation we couldn't find this file at `backend/api/search.js`. The actual location might be different. Before Step 4, verify:
```bash
  find /Users/johangustafsson/resto/Projects/Resto/backend -name "search*" -type f -not -path "*/node_modules/*"
```
  And check how the `auth` middleware is wired into the search route. The middleware must actually be applied to the search route or removing the bypass changes nothing. Surface what's found.

- **JWT secret rotation.** The backend uses `process.env.JWT_SECRET`. If it's been changed since users last signed up, existing tokens fail. Not a blocker for this session, but worth noting that any production deploy of this work requires a stable secret.

## Commit

Single commit, all four steps:
auth(forwarding): forward JWT from frontend through proxy to backend; remove dev bypass

pages/api/search.ts: forward Authorization header to backend, propagate 401
pages/index.tsx: send Bearer token on search, redirect to login if missing
pages/auth/login.tsx: honor ?next= query param after successful login
backend/middleware/auth.js: remove dev-only auth bypass (Phase 1 c9.6)

Closes Phase 2 item 6. Required before any public deploy.

If the audit in the first risk surfaces other callers, additional commits cover each.

## After this session

Update `PHASE_2_DESIGN_QUESTIONS.md`:
- Mark item 6 (auth forwarding) as completed
- Add a note: "Anonymous users can browse the map and scrubber, but search requires login. Search-quota UX (showing remaining searches, prompting upgrade) is a future Pass B session."

The app is now functionally complete enough for first preview deploy after Pass B Session 2 (cards) + Session 3 (filter restoration) land. Auth being real is the structural prerequisite — the rest is filling in the surface.wc -l PASS_B_SESSION_1_SPIKE.md
git add PASS_B_SESSION_1_SPIKE.md
git commit -m "auth: spike for Pass B Session 1 (forward JWT, remove dev bypass)"
git push origin design-pass-v1
