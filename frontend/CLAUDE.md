# Resto — Frontend Context for Claude Code

## Read this first, every session
- ../REDESIGN_STRATEGY.md — the contract. Phase 1 is the current scope.
- Note: AURORA_DESIGN_VISION.md and DESIGN_UPGRADE_SUMMARY.md describe sessions that
  produced docs only — no code was ever committed from them. Treat them as background
  context, not as constraints on the current codebase.

## Palette (Phase 1 — first visual pass, shipping for the first time)
All palette values live in `lib/theme.ts`. Import from there. No inline hex anywhere.

```
Background:  #0a0a0a
Surface 1:   #141414   (cards, panels)
Surface 2:   #1f1f1f   (hover, raised states)
Border:      #2a2a2a
Text 1:      #f5f5f5
Text 2:      #a1a1a1   (secondary)
Text 3:      #6b6b6b   (tertiary)
Accent:      #e8b04b   (warm amber-gold — used sparingly: focus, selected, key metrics, CTA)
Sun status:  #fbbf24   (warm yellow — venues in sun right now)
Shaded:      #6b7280   (cool gray)
Restaurant:  #f97316   (orange — indoor/restaurant venues)
```

Accent usage rule: means "this matters." Focus rings, selected states, key metric
numbers (rating, sun score), the Search CTA. Not decorative borders. Not body text.

## Non-negotiables
- All palette values via lib/theme.ts — never inline hex in components
- Mapbox GL shadow visualization is the product signature — surface it, do not hide it
- Components stay structurally intact: VenueCard, VenueMap, TypeSelector, SearchBox
  ("structurally intact" means props/behaviour/Mapbox wiring — palette is being migrated)
- Test in production build (npm run build && npm start), not dev HMR
- No new state libraries (Redux/Zustand/Context). URL holds search state.
- No new heavyweight deps without asking first

## Anti-targets
- Neon cyberpunk palette (cyan/magenta/purple/particles)
- Light/white backgrounds — the shadow viz needs dark to breathe
- Decorative motion that does not serve data
- Gilt/luxury-finance gold — #e8b04b is amber-warm, not #d4af37

## Current scope
Phase 1: landing → search → results journey.
Deliverables: FilterPanel, ResultsList, ViewToggle extracted from search.tsx monolith;
filter state moved to URL params; palette applied across all pages.
Visual boldness from the dark palette + typography scale + the shadow viz itself.

## Working agreements
- Show visual proof via Chrome DevTools MCP screenshots at every checkpoint
- Run Playwright smoke tests against proven components before committing
- Magic MCP for skeletons of NEW components only — never to restyle proven ones
- One file per commit. Commit, verify build, then next.
