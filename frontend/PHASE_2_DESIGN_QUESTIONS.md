# Phase 2 — Design Questions & Deferred Items

## 1. Shadow visualization metaphor on dark basemap
Phase 1 (C9.5) chose Option 1: cool blue-gray overlay rgba(120, 140, 180, 0.35) on dark-v11 basemap.
Open question: invert metaphor to render warm-glow on SUN-LIT areas instead of cool-tint on shaded areas.
The product is "find sun," not "find shadow." Worth prototyping on a branch and comparing visually.

## 2. Backend browse endpoint (no-query filtered browse)
Phase 1 (C10) chose: no API call when ?q= is absent, show prompt with example queries.
Open question: add GET /api/browse?type=...&sun=... that returns venues matching filters without a query.
Frontend unblock when backend ships: drop the "no q means no fetch" gating in search.tsx.

## 3. Cuisine and price filters in FilterPanel
Phase 1 (C8) ships type and sun filters only. Cuisine and price intentionally deferred.
Add as chip multi-select (cuisine) and button group (price), wire through URL state.

## 4. TypeScript strictness cleanup
tsconfig.json has noUnusedLocals and noUnusedParameters set to false (relaxed during Phase 1).
Re-enable both and clean up the unused-variable warnings they surface.

## 5. Typography polish + micro-interactions
Per REDESIGN_STRATEGY.md Phase 2 scope. Wait until Phase 1 ships to a preview environment and is used in real conditions for a few days before deciding what actually needs polish.

## Process note
Address items 1 and 2 first — those are real architectural questions deferred from Phase 1. Items 3-5 are polish; let real usage inform priority.
