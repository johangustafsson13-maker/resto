## 1. What Resto is

Resto is a Stockholm sun-finder for outdoor dining. The user opens it on their phone wanting to know where the sun is hitting in central Stockholm right now, or at some specific time in the next few hours. They use it to decide where to sit on a terrace.

The product's value proposition has two parts:
- **Real-time sun and shadow visualization** across central Stockholm
- **Terrace/venue discovery** with sun status integrated

The competitor reference is **hinthint.se** (`hinthint.se/uteserveringar-med-sol-i-stockholm/`). They do shadow rendering well. Resto's differentiation is design language and interaction model (see Section 6).

## 2. Tech stack

- **Frontend:** Next.js, TypeScript, React. Pages under `pages/`, components under `components/`, theme under `lib/theme.ts`.
- **Map:** Mapbox GL JS with `mapbox/light-v11` basemap.
- **Shadow rendering:** [Will be] `mapbox-gl-shadow-simulator` library (see Section 7).
- **Backend:** Node.js with a Postgres database (Supabase-hosted). Exposes `/api/search` and other endpoints. Lives in `backend/`.
- **Sun position:** `suncalc` npm library.
- **Geometric ops:** `@turf/turf` (currently used for polygon shadow projection; will be deprecated once library integration completes).
- **Typography:** Departure Mono (display, self-hosted from departuremono.com, OFL license) + IBM Plex Sans (body, self-hosted from Google Webfonts Helper, OFL license). Files in `public/fonts/`.
- **Local dev:** `npm run dev` runs at `localhost:3131`. Production build via `npm run build && npm start`.

## 3. Project structure
Resto/
├── frontend/                    # Next.js app
│   ├── pages/
│   │   ├── index.tsx           # Map-as-homepage at /  (was search.tsx before A4)
│   │   ├── api/
│   │   │   └── search.ts       # Proxy to backend
│   │   └── auth/
│   │       ├── login.tsx
│   │       └── signup.tsx
│   ├── components/
│   │   ├── VenueMap.tsx        # Mapbox wrapper. Shadow rendering lives here.
│   │   ├── TimeScrubber.tsx    # Bottom-pinned time slider (A6+A7)
│   │   ├── FilterPanel.tsx     # Type + sun filters (currently hidden via {false &&})
│   │   ├── ResultsList.tsx     # Venue card list (currently hidden via {false &&})
│   │   ├── ViewToggle.tsx      # Map/list toggle (currently hidden via {false &&})
│   │   ├── VenueCard.tsx       # Single venue card (renders inside ResultsList)
│   │   ├── SearchBox.tsx       # Used in auth pages
│   │   ├── TypeSelector.tsx    # Used inside FilterPanel
│   │   └── Navigation.tsx      # Top nav (currently unused on homepage)
│   ├── lib/
│   │   ├── theme.ts            # SINGLE SOURCE OF TRUTH for colors, fonts, breakpoints
│   │   └── sunScore.ts         # Sun score / shadow detection helpers
│   ├── public/
│   │   └── fonts/
│   │       ├── DepartureMono-Regular.woff2
│   │       └── ibm-plex-sans-v23-latin-{regular,500,700}.woff2
│   ├── styles/
│   │   └── globals.css         # @font-face declarations + global cursor rules
│   ├── types/
│   │   └── index.ts            # Venue interface, etc.
│   ├── PROJECT_MEMORY.md       # THIS FILE
│   ├── CLAUDE.md               # Working agreements for Cowker sessions
│   ├── PHASE_2_DESIGN_QUESTIONS.md  # Deferred decisions and known issues
│   └── package.json
├── backend/                    # Node.js API (touched rarely, do not modify in frontend sessions)
├── REDESIGN_STRATEGY.md       # Historical: original redesign plan (Phase 1 era)
├── AURORA_DESIGN_VISION.md    # Historical: rejected design direction (Phase 1 era)
└── DESIGN_UPGRADE_SUMMARY.md  # Historical: another rejected direction (Phase 1 era)

## 4. History — what's been built, in order

### Phase 1 (completed)

A structural refactor of an existing MVP. Goal was stability + clean architecture, not visual ambition. 11+ commits.

Key outputs:
- Established `lib/theme.ts` as single source of truth for design tokens
- Refactored 400-line `pages/search.tsx` monolith into proper components: `FilterPanel`, `ResultsList`, `ViewToggle`
- Lifted filter state to URL params (`?type=`, `?sun=`, `?view=`, `?q=`)
- Fixed three pre-existing bugs surfaced by removing mock data:
  - `router.isReady` race condition in fetch
  - Wrong API proxy URL (missing `/api/` prefix)
  - Response key mismatch (`results` vs `venues`)
- Tested in production build (`npm run build && npm start`) per Principle 4

Phase 1 ended with a working but generic-looking dark dashboard. Functional, refactored, but design-uninspired.

### Pass A — Design pass (completed)

A complete visual reinvention from "generic dark SaaS" to "punk-zine brutalist warm-light map-as-homepage." 15 commits on the `design-pass-v1` branch (pushed to origin).

**A1: Palette flip.** Dark gold palette → warm-light brutalist:
- `bg: #f4f1ea` (warm cream base)
- `surface1: #ffffff` (cards, panels)
- `surface2: #ebe6dc` (raised, hover)
- `border: #1a1a1a` (heavy ink — brutalist outlines, not gray)
- `text1: #0a0a0a` (near-black ink)
- `text2: #4a4a4a`
- `text3: #8a8a8a`
- `accent: #d92816` (saturated punk red, primary CTAs)
- `sunOnMap: #fbbf24` (warm gold — RESERVED for map only, never UI)
- `shadeOnMap: rgba(110, 130, 165, 0.25)` (cool desaturated for shadow overlay)

**Critical palette rule:** `sunOnMap` (gold/amber) is sacred to the map. Do NOT use it for any UI chrome — buttons, accents, status badges, anything. Use `accent` (punk red) for UI active states instead. This separation is load-bearing for the design.

**A2: Typography.** Installed Departure Mono (display, pixel-mechanical/transit-board aesthetic) + IBM Plex Sans (body, sober workhorse). Both self-hosted in `public/fonts/`, both OFL-licensed free for commercial use. Preloaded Departure Mono.

**A3 + A3.5 + A3.6 + A3.7:** Switched basemap to `mapbox/light-v11`. Caught and fixed a continuously-running re-render loop (15-second auto-advance interval + `setShadowStatus` reference identity churn) that had been silently re-firing `fitBounds` and preventing zoom interaction. Verified shadow color reads as data against the light basemap.

**A4 (3 commits):** Retired `/search` route. Map IS the homepage at `/`. Old landing page deleted. `git mv pages/search.tsx pages/index.tsx` to preserve history. Added permanent redirect `/search → /`.

**A5 + A5.5 + A5.6:** Punk-zine homepage layout:
- Massive RESTO wordmark in Departure Mono, `clamp(8rem, 13vw, 16rem)`, top-left, deliberately cropping at viewport edge
- Tagline: "The city shifts. The shadows move."
- Brutalist search input top-right (2px ink border, no radius, punk-red submit)
- Sunset caption bottom-right (real SunCalc-derived value, 60s refresh) — REMOVED in A7 as redundant with the scrubber
- Full-bleed map fills viewport, UI floats on it via `position: absolute`
- Filter sidebar/ViewToggle wrapped in `{false && (...)}` — dormant, restored in Pass B
- A5.5: Restored 3D pitch toggle and tilt controls (incorrectly removed during A5). Brutalist styling, bottom-left. Includes stale-closure fix from Phase 1.
- A5.6: Bridge-fixed VenueCard's references to deleted palette tokens (`COLORS.sunny`, `COLORS.shaded` → `COLORS.accent`, `COLORS.text3`). True redesign of card status pills is Pass B work.

**A6:** Built `components/TimeScrubber.tsx`. Bottom-pinned slider, full-width mobile / 80% centered desktop. Left edge = now, right edge = sunset. Chunky 15-minute discrete snapping (Option Y, not smooth glide — punk-zine mechanical feel). Past-sunset state shifts to "Tomorrow [time]" with sunrise→sunset range. URL state via `?t=ISO8601`. Pure component, emits `onTimeChange(Date)` only.

**A7:** Wired TimeScrubber to VenueMap. Added `scrubbedTime?: Date` prop to VenueMap. Threaded through `applySunLight()` which was internally calling `new Date()`. Added 100ms debounce on shadow recalc to prevent jank during fast drags. Gated the 15-second auto-advance interval to only fire when `scrubbedTime === undefined`. Removed redundant sunset caption (scrubber's right-edge label carries that info now). Repositioned 3D button to `bottom: 5.5rem` on mobile to clear the scrubber.

**A7.1:** Fixed a 180° shadow direction bug that had been present since Phase 1. The shadow projection vector was applied with subtraction when it should have been addition — shadows pointed *toward* the sun instead of *away*. Bug was invisible to every prior verification gate because they checked "shadows render" not "shadows match physical reality." Caught by comparing Resto's output to hinthint.se's output for the same neighborhood at the same time. **This bug-finding pattern is the most important meta-lesson of Pass A — see Section 9.**

End of Pass A: a working map-as-homepage with live time-scrubbing, dark-ink punk-zine UI on warm cream, real shadow rendering. But shadow quality is polygon-based (per-building, with visible seams between adjacent shadows and partial overlap onto buildings the shadows should fall behind). This is the bottleneck Pass B addresses.

### Pass B planning (in progress, where this document picks up)

The remaining structural and visual gaps after Pass A:
- Shadow rendering quality (the polygon approach has inherent limitations)
- Venue cards redesigned for the new palette
- FilterPanel + ViewToggle restored and restyled
- Venue tap interaction (anchored card on desktop, bottom sheet on mobile)
- SMHI cloud cover integration (the "sunny" status becomes honest when it factors in weather)
- Auth forwarding so the app actually works in production deploy (Phase 2 item — still required before deploy)

The shadow rendering quality piece is the next session's primary work. See Section 7.

## 5. Working agreements (carry over from Phase 1 + Pass A)

These are how Cowker sessions work on this project. They were learned the hard way over many commits. Honor them strictly.

### File scope discipline

**Every commit declares which files it will modify, upfront.** If you find yourself needing to touch a file outside the declared scope, STOP and surface:

> "I need to touch [file] for [reason]. (a) include in current commit and amend the message, (b) separate commit same session, or (c) defer?"

Three choices, one question. Takes 30 seconds. The cost of this discipline is small; the cost of silent scope creep is large. We've corrected this pattern three times across Phase 1 + Pass A. It needs to stay locked in.

### Bundle nothing silently

When you find a latent bug during a scoped commit, pause and ask whether the fix belongs in this commit or its own. Do NOT bundle a bug fix into a commit whose message doesn't mention it. Pattern violations:
- Phase 1 C4: `stopPropagation` on a link, bundled into a palette migration
- Phase 1 A3.5: `hasValidCoords` guard, bundled into a render-loop fix
- Pass A A5: 160 lines of custom DOM controls deleted, bundled into a layout commit (worst instance — fixed in A5.5)

### Verification gates are real

Every commit that changes appearance produces screenshots at 390px mobile and 1440px desktop. Run `npm run build && npm start` (production build, not dev HMR) on commits that change architecture or state shape. Do NOT declare a commit done based on indirect evidence (network status, console output, "looks right in code"). The actual rendered page is the test.

**Specifically: never insert mock data to make a verification screenshot work.** If real data isn't available, surface that as a question. The "screenshot mock" pattern from Phase 1's C7-C9 cost us real verification on multiple commits.

### Verify against reality, not internal consistency

This is the deepest lesson from A7.1's shadow-direction bug. Internal consistency (code compiles, output renders, no errors thrown) is not correctness. For any feature that represents physical reality (shadows, sun position, time, location, etc.), the verification gate must compare output against an external reference — another site, a published spec, manual calculation.

The 180° shadow bug survived 30+ commits, two verification regimes, and multiple Cowker sessions because nobody compared to a reference site until the user opened hinthint.se. Don't repeat this.

### One feature per session

`REDESIGN_STRATEGY.md` Principle 6: complete one section, test, commit, then move to the next. Don't combine unrelated work in the same session. Long sessions hit context limits (we've hit them twice). When you're 70% through a session and notice another thing that could be improved, log it in `PHASE_2_DESIGN_QUESTIONS.md` and continue with the current scope.

### Test in production build for stability work

`REDESIGN_STRATEGY.md` Principle 4. Dev HMR has masked refresh loops, hot-reload artifacts, and TypeScript errors that production build catches. Architecture changes get a production build test before being declared done.

### Commit message format

`phase1(c#):` for Phase 1, `design(A#):` for Pass A, `design(B#):` for Pass B. Commit messages must honestly reflect what's in the diff. If you fixed a bug while doing a palette migration, the commit message mentions both. `git log` is the audit trail; lying in commit messages destroys it.

## 6. Strategic positioning

This section exists because in mid-Pass A there was a real strategic discussion about what Resto is competing on. Recording it here so future sessions don't re-litigate.

Resto's differentiators:
- **Punk-zine brutalist design language** — distinctive, opinionated, not a generic dining-app aesthetic
- **Time scrubber as primary interaction** — competitors have time sliders but Resto puts it at the visual center
- **Map-as-homepage** — no landing page, no doorway, you're in the product immediately
- **Editorial framing** — the wordmark crops at the viewport edge, the tagline is opinionated, the layout breaks grids on purpose

Resto is NOT competing on:
- Venue data freshness or coverage (the underlying database is what it is)
- Shadow rendering accuracy as a differentiator (commoditized — see Section 7)
- Restaurant booking / reservations
- Reviews / ratings beyond what's in the venue data

Hinthint.se is the most directly comparable competitor. They do shadow rendering very well, they have similar venue data, they have a normal landing-then-list UX. Resto's bet is that the design and interaction model matter as much as the data quality.

## 7. Pass B Session 1 — Shadow rendering upgrade

**Status:** Deferred. Originally planned as Pass B Session 1, but reprioritized — auth forwarding (Phase 2 item 6, formerly Pass B Session 5) is the actual blocker for any public deploy and moves to Pass B Session 1. Shadow quality is real but is optimizing a product that isn't yet shippable. Revisit after the app is functionally complete and has been used in real conditions. This is the work that comes next. Detailed because it's the immediate priority and because the research is non-obvious.

### The problem

Current shadow rendering in `VenueMap.tsx` works like this:
1. Query Mapbox's `composite/building` source for building footprints in the viewport
2. For each building, compute a shadow polygon using sun azimuth + altitude (post-A7.1 the math is correct)
3. Subtract the building's own footprint from its shadow (so the shadow doesn't paint over the building casting it)
4. Render all shadow polygons as a single GeoJSON `fill` layer in `shadeOnMap` color

Three quality problems with this approach:
- **Adjacent shadows have visible internal seams.** Each building's shadow is a separate semi-transparent polygon. Where two buildings' shadows meet, the polygon edges show as faint lines — the shadows don't merge into one continuous shape.
- **Shadows still paint over neighboring buildings.** Subtracting only the casting building's footprint, not all visible building footprints, means Building A's shadow can paint over Building B if B is in A's shadow path.
- **No tree shadows.** Trees are a major shadow source in Stockholm; we don't have them at all.

A polygon-based approach can't easily solve all three. The right architecture is **GPU ray-marching on a heightmap** — for each pixel on the ground, march a ray toward the sun and check if any height intersects it. This is how ShadeMap.app and almost certainly hinthint.se do it.

### The solution

Use **`mapbox-gl-shadow-simulator`** (npm package, by Ted Piotrowski, the ShadeMap creator).

- npm: `mapbox-gl-shadow-simulator`
- GitHub: `https://github.com/ted-piotrowski/mapbox-gl-shadow-simulator`
- Requires API key from `shademap.app/about` (free for non-commercial dev)
- Plugs in as a Mapbox custom layer
- Takes a `date`, automatically reads terrain from a DEM tile source and buildings from a Mapbox source
- Renders shadows via WebGL ray-marching shader
- Same approach hinthint uses (or very close)

This replaces the entire current polygon-based shadow system in `VenueMap.tsx`. The existing `applySunLight()`, `generateShadowFeatures()`, `projectShadowPolygon()` functions all become unnecessary — they get removed.

### Integration shape

```typescript
// In VenueMap.tsx (sketch — actual implementation in the session)
import ShadeMap from 'mapbox-gl-shadow-simulator'

const shadeMap = new ShadeMap({
  date: scrubbedTime ?? new Date(),
  color: '#1a2e4a',   // dark blue-ink for the shadow color
  opacity: 0.35,
  apiKey: process.env.NEXT_PUBLIC_SHADEMAP_API_KEY,
  terrainSource: {
    tileSize: 256,
    maxZoom: 15,
    getSourceUrl: ({ x, y, z }) =>
      `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
    getElevation: ({ r, g, b }) => (r * 256 + g + b / 256) - 32768,
  },
  getFeatures: async () => {
    return map.querySourceFeatures('composite', { sourceLayer: 'building' })
      .filter(f => f.properties?.height || f.properties?.render_height)
  },
}).addTo(map)

// On scrubber change:
shadeMap.setDate(scrubbedTime ?? new Date())
```

### Costs and license

- **Library:** Free via npm
- **API key:** Free for non-commercial development. Contact `shademap.app/about` to request. Commercial pricing is private — when ready to deploy publicly, contact Ted Piotrowski to negotiate.
- **Terrain tiles:** AWS terrarium tiles are free globally. Mapbox also has free terrain-RGB tiles. Both work with the library.
- **No commercial commitment required for the dev/staging phase.** Just don't deploy publicly without commercial license sorted.

### What to remove from VenueMap.tsx

Once the library is integrated and verified working:
- `projectShadowPolygon()` function
- `generateShadowFeatures()` function
- The `applySunLight()` function's shadow-rendering parts (the `setLight()` call for building lighting can stay, that's a different feature)
- The `shadow-source` and `ground-shadows` Mapbox layer setup
- The 15-second auto-advance interval (the library may handle its own update logic — verify in docs)
- The `shadowDebounceRef` (library should handle its own debouncing)

What stays:
- The `is3D` toggle and tilt controls
- The marker rendering for venues
- The `flyTo` ref export
- Everything in VenueMap that isn't shadow geometry

### SMHI cloud cover integration

In the same session as the library integration, add SMHI's free public weather forecast:

- Endpoint: `https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point/lon/{lng}/lat/{lat}/data.json`
- Returns hourly forecast for the next ~10 days including total cloud cover (`tcc_mean`, 0-8 scale where 0 is clear sky and 8 is overcast)
- Hardcoded to Stockholm coordinates (`lon=18.0686, lat=59.3293`) is fine for now

How it integrates: a venue's "sunny" status currently depends only on whether geometric ray-cast from the sun reaches the venue's location. After SMHI integration, "sunny" requires both:
1. Geometric ray reaches the location (no obstruction), AND
2. Cloud cover at the scrubbed time is below some threshold (e.g. < 4 on SMHI's 0-8 scale)

When clouds are heavy, "sunny" venues become "cloudy" and shadow visualization could optionally fade to show "doesn't matter where the sun is, it's overcast."

For Pass B Session 1: implement the SMHI fetch, store cloud cover in state, and adjust the binary `isSunny` boolean in `sunScore.ts`'s logic. Visual treatment of "cloudy" state is a polish question for a later session.

### Session 1 scope

**File scope (declared upfront, per working agreements):**
- `components/VenueMap.tsx` (replace shadow rendering with library, keep everything else)
- `package.json` + `package-lock.json` (add `mapbox-gl-shadow-simulator` dependency)
- `lib/sunScore.ts` (incorporate cloud cover into sun-status logic)
- `lib/smhi.ts` (NEW — fetch and cache SMHI cloud cover data)
- `types/index.ts` (add cloud cover type if needed)
- `.env.local` (add `NEXT_PUBLIC_SHADEMAP_API_KEY` after obtaining)
- `pages/index.tsx` (only if needed to pass cloud cover state — try to avoid)

**NOT in scope:**
- Venue card redesign (Pass B Session 2)
- FilterPanel restoration (Pass B Session 3)
- Auth forwarding (Phase 2 item, its own session)
- Any visual polish or animation changes
- Any Mapbox Studio custom basemap (Phase 2 item)

**Steps in order:**
1. Obtain ShadeMap API key from `shademap.app/about`
2. Install `mapbox-gl-shadow-simulator` via npm
3. In VenueMap.tsx: integrate the library alongside existing shadows (don't delete the old code yet)
4. Verify the library renders shadows correctly at street zoom on Vasastan/Rörstrand
5. Compare visual quality against hinthint.se for the same neighborhood at the same time
6. If quality matches hinthint: delete the old polygon shadow code, commit
7. Wire the time scrubber to call `shadeMap.setDate()` on `onTimeChange`
8. Add `lib/smhi.ts`: fetch cloud cover, cache for the session, expose as a hook or context
9. In `lib/sunScore.ts`: factor cloud cover into the sun status boolean
10. Test that cloudy hours produce different venue colors than sunny hours

**Verification gates for Session 1:**
- Mobile 390px and desktop 1440px screenshots with shadows rendered via library, at multiple times (`/?t=tomorrow-T13:00`, `/?t=tomorrow-T17:00`, `/?t=tomorrow-T08:00`)
- Side-by-side comparison screenshot: Resto at 13:00 tomorrow vs hinthint.se at 13:00 tomorrow, same neighborhood. Visual quality must be comparable.
- Time scrubber drag still works and shadows update in real time
- Console clean, no errors
- Production build (`npm run build && npm start`) passes
- SMHI fetch verified: console-log the cloud cover for a known time, confirm it matches SMHI's published forecast for that hour
- Cloud cover threshold test: pick a known-cloudy hour from SMHI forecast, verify venue "sunny" status correctly reads false

### Risks

- **API key request takes time.** Ted Piotrowski runs ShadeMap mostly solo. The request might take days. Plan for this — don't expect to start Session 1 the same day you decide to use the library.
- **Visual quality might not match hinthint.** If after integration the shadows still don't match hinthint's quality, the cause is likely that hinthint uses a higher-resolution DEM (perhaps Lantmäteriet 1m) or has tree data we don't have. Library supports custom DEM sources; this would be a Pass B Session 1.5 if needed.
- **Library API surface might constrain the time-scrubber integration.** If `setDate()` is too slow for live scrubbing, we may need to debounce on the scrubber side. Surface this if it appears.
- **Performance on older mobile devices.** GPU ray-marching is more expensive than polygon fills. If mobile performance is bad, the library may have settings to reduce shader steps. Document if it happens.

### Future sessions in Pass B (after Session 1)

- **Session 2: Venue cards.** Redesign VenueCard for the new palette. Decide what status pills look like (the A5.6 bridge values are placeholders). Probably restore `ResultsList` rendering on `/` as a contextual side panel or modal, not the always-visible sidebar from Phase 1.
- **Session 3: Filter panel.** Restore `FilterPanel` and `ViewToggle` from their `{false && (...)}` dormancy. Restyle to brutalist punk-zine. Probably integrate as a top-corner control set rather than a full sidebar.
- **Session 4: Venue tap interaction.** Anchored card on desktop (small block adjacent to the marker with a connecting line), bottom sheet on mobile. This is the venue-detail UX.
- **Session 5: Auth forwarding (Phase 2 item 6).** Frontend forwards user credentials to backend. Required before any public deploy. Remove the dev-only auth bypass that was added during Phase 1 C9.6.

After all five sessions: ready for first public preview deploy. After 1-2 weeks of real usage, decide what visual polish (Phase 2 item 5) actually matters and which Phase 2 backlog items deserve their own sessions.

## 8. Phase 2 backlog (deferred decisions)

These are tracked in `PHASE_2_DESIGN_QUESTIONS.md` (read that file directly for current status). Summary at time of this writing:

1. ~~Shadow rendering metaphor on dark basemap~~ — moot after Pass A flipped to light
2. **Backend browse endpoint** — `/api/browse` to return venues matching filters without a query. Unblocks no-query browse at `/?type=terrace&sun=sunny`
3. **Cuisine and price filters** — additional FilterPanel controls beyond type and sun
4. **TypeScript strictness cleanup** — `noUnusedLocals` and `noUnusedParameters` were relaxed in Phase 1; re-enable and clean up
5. **Typography polish + micro-interactions** — defer until real usage informs priority
6. **Auth forwarding** — frontend sends user credentials to backend. Hard prerequisite for public deploy. Will be Pass B Session 5.
7. **Mobile leftmost-position visual collision** — TimeScrubber time display and 3D button compete at ~12px left anchor on mobile when handle is far-left
8. **VenueCard status pill final design** — bridge-fixed in A5.6 to use `accent` and `text3`. Real design call needed in Pass B Session 2.
9. **Shadow rendering correctness** — addressed by Pass B Session 1 (this document, Section 7)
10. ~~3D toggle positioning~~ — addressed in A5.5
11. **Shadow direction verification methodology** — bug history note from A7.1; reminds future sessions to verify against external reference

## 9. Meta-lessons (this is the most important section to actually read)

These are patterns learned the hard way. They're more durable than any specific code or design decision.

### Internal consistency ≠ correctness

A7.1's 180° shadow bug survived 30+ commits because verification gates only checked that shadows rendered, not that they pointed the right way. For any feature that represents physical reality, you must have an **external ground-truth reference** in your verification gate. Without one, "plausible-looking output" can be silently wrong for months.

In Pass B Session 1, the ground-truth reference is hinthint.se. Visually compare Resto's output against hinthint's for the same area at the same time. If they don't match, find out why before declaring done.

### Mock data hides bugs

In Phase 1 (C7-C9), Cowker added mock data to make screenshots possible while the API wasn't returning real data. Three real bugs hid behind the mocks:
- `router.isReady` race
- Wrong API proxy path
- Wrong response key

If real data isn't available, surface that as a blocker. Don't paper it with mocks.

### Scope creep is the most common failure mode

In Phase 1 + Pass A, we caught scope creep three times. The pattern: while making the requested change, also make some related-seeming change without asking. Each instance is small. Cumulatively they destroy the audit trail.

The fix: declare file scope upfront in every commit. If you need to touch something outside scope, ask (a/b/c question). 30 seconds of friction to preserve clean history.

### "Just one more thing" sessions become broken sessions

Context limits are real. When a session is 70% through its planned scope and you notice another thing that could be improved, log it in `PHASE_2_DESIGN_QUESTIONS.md` and STOP. The next session will pick it up cleanly. Trying to do "just one more thing" is how sessions hit context limits and have to be restarted.

### Commit messages must match diffs

The audit trail is `git log`. If a commit says "fix render loop" but the diff also deletes 160 lines of features, the log lies. Future-you (or future Cowker) can't trust the history. Lying commit messages destroy revertability. Amend honestly when needed.

### Verify against the future failure mode

The same disciplines that worked in Phase 1 + Pass A will be tested in Pass B. The disciplines aren't punitive — they're load-bearing. When you feel friction (writing out file scope, asking before bundling, restating context after a recap), that friction is the discipline working. The cost of skipping it is the cost of the failure modes above.

---

## 10. How to start a new session

When you open a new Cowker session for this project:

1. Open Claude Code from `frontend/`
2. The first message you send Cowker is approximately:
Read these files in order, then report back:

PROJECT_MEMORY.md (THIS IS THE PRIMARY ONE — read it carefully)
CLAUDE.md
PHASE_2_DESIGN_QUESTIONS.md
lib/theme.ts
The most recent commit's diff via git log -1 -p

Then summarize back to me:

The current state of the project (what's shipped, what's not)
What we're about to work on (Pass B Session 1 = shadow library integration)
The working agreements (file scope, scope creep, verification gates, etc.)
Any open questions you have before we start

Don't propose code yet. Don't write code yet. Just orient.

3. After Cowker orients, give it the specific session brief. For Pass B Session 1, that's Section 7 of this document.

4. Use the same disciplined pattern that worked in Phase 1 + Pass A: file scope declared, screenshots at gates, real verification against reality, no scope creep, one feature per session.wc -l PROJECT_MEMORY.md
wc -l PROJECT_MEMORY.md


