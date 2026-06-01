# Phase 2 — Design Questions & Deferred Items

## 1. Shadow visualization — color and rendering depth (updated in design-pass-v1 A3.7)
design-pass-v1 switched to light-v11 basemap with shadeOnMap rgba(110, 130, 165, 0.25).

COLOR: Verified correct in A3.7 diagnostic. The cool blue-gray reads clearly against cream
streets. No opacity change needed.

RENDERING DEPTH (new issue): Shadow polygons currently extend across entire block areas,
including other buildings' footprints — because the difference operation only subtracts the
*source* building, not all occluding buildings. At late-afternoon sun angles (long shadows),
this makes the whole visible area appear uniformly gray rather than showing precise
street-level shadow geometry. Fix: in generateShadowFeatures, subtract ALL building footprints
(not just the source building) from each shadow polygon. This is a significant perf/geometry
change — evaluate whether turf.difference iteration over all buildings is feasible, or whether
a GPU-side approach (masking with a buildings layer) is more appropriate.

Original question (invert metaphor to warm-glow on sunny areas) still deferred. Warm-glow
sunOnMap layer is Phase 2 item 1 per the original design brief.

## 2. Backend browse endpoint (no-query filtered browse)
Phase 1 (C10) chose: no API call when ?q= is absent, show prompt with example queries.
After design-pass-v1 A4: map-as-homepage at / is permanently empty of venues until the
user searches. This is the primary missing piece of the map-as-homepage UX — the map loads
but shows no venue pins on first visit. Phase 2 backend browse endpoint moves to top priority.
Frontend unblock when backend ships: drop the "no q means no fetch" gating in pages/index.tsx
(formerly pages/search.tsx). URL filter state is already wired — only the fetch logic changes.

## 3. Cuisine and price filters in FilterPanel
Phase 1 (C8) ships type and sun filters only. Cuisine and price intentionally deferred.
Add as chip multi-select (cuisine) and button group (price), wire through URL state.

## 4. TypeScript strictness cleanup
tsconfig.json has noUnusedLocals and noUnusedParameters set to false (relaxed during Phase 1).
Re-enable both and clean up the unused-variable warnings they surface.

## 5. Typography polish + micro-interactions
Per REDESIGN_STRATEGY.md Phase 2 scope. Wait until Phase 1 ships to a preview environment and is used in real conditions for a few days before deciding what actually needs polish.

## 6. Frontend → backend auth forwarding
Current state: backend /api/search requires a JWT Bearer token; frontend API route (pages/api/search.ts) doesn't forward credentials.
Dev-only auth bypass was added in phase1(c9.6) to unblock Phase 1 verification: middleware/auth.js skips the JWT check when NODE_ENV=development, and api/search.js skips the quota block.
Phase 2 must: design credential forwarding (forward user session token from cookie/localStorage through pages/api/search.ts to backend), remove the dev bypass in both middleware/auth.js and api/search.js, and verify auth gating works correctly end-to-end.

## 7. Pre-existing render loop in search.tsx (fixed in design-pass-v1 A3.5 + A3.6)
The bug had TWO independent causes — both are required to be fixed together.

Cause 1 (A3.5): handleShadowStatusChange and handleVenueSelect were recreated each render
(no useCallback), and filteredVenues was recomputed each render (no useMemo). This made
VenueMap's [venues, onVenueSelect, onShadowStatusChange] effect dependency array unstable
on every parent render.

Cause 2 (A3.6): Even with stable callback refs and useMemo, setShadowStatus was called with
a new object on every addMarkers cycle ({...prev, [venueId]: result} always creates a new
reference). This busted the filteredVenues useMemo even when shadow values were unchanged,
producing a new filteredVenues array, triggering VenueMap's effect, registering a new
map.once('idle', addMarkers), which fired after the next fitBounds animation — infinite loop.

Fix: setShadowStatus returns prev unchanged when value hasn't changed (identity guard).
Defensive: map.off('idle', addMarkers) before map.once('idle', addMarkers) in VenueMap.

Warning: If you see only the useCallback/useMemo fix (A3.5) and think it's sufficient —
it is not. The setShadowStatus identity guard (A3.6) is equally necessary. Without it,
the loop reasserts via filteredVenues reference churn.

Investigate other components for the same pattern — any inline function passed as a prop to a
component with a useEffect dependency array is a candidate for both issues.

## 8. VenueCard status pills (sunny/shaded badges)
Bridge-fixed in A5.6 to use COLORS.accent and COLORS.text3 placeholders. The A1 palette
deliberately deleted COLORS.sunny and COLORS.shaded (gold/gray tokens) to make amber sacred
to the map; VenueCard hadn't been rendered (hidden behind {false && ...}) so the breakage
was silent until A6 forced a full module-graph build.
Real design decision for these pills lives in Pass B's card redesign — options include:
ink-on-cream uniform treatment, accent color for 'sunny right now' active state, removal
of color coding entirely with text-only labels, or moving sun status off the card and onto
the map exclusively. Pick during Pass B card design pass.

## 9. Verification gap — dormant render paths
A1 palette deletion broke VenueCard's color references silently because VenueCard wasn't
in the active render path (FilterPanel/ResultsList wrapped in {false && ...}). The break
surfaced in A6 when a fresh build validated the whole module graph.
Lesson: run `npm run build` (full TypeScript pass) at the end of each commit, not just at
the final commit. Dormant paths still contain code that needs validation.

## 10. 3D pitch toggle — history and current state
Briefly removed in design-pass-v1 A5 (incorrectly, without authorization) and restored in A5.5.
Current state: 3D toggle at bottom-left (bottom: 4.5rem), brutalist styling matching A5 search input
(2px ink border, no radius, punk-red #d92816 background when active). Tilt ▲/▼ appear adjacent
when 3D mode is active. Phase 1 had the controls at top-right — moved in A5.5 to avoid conflict
with the new search input.
If you see the 3D toggle in an unexpected position compared to Phase 1, that's why.

## Process note
Address items 1, 2, and 6 first — those are real architectural questions deferred from Phase 1. Items 3-5 are polish; let real usage inform priority.
