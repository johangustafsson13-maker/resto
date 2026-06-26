/**
 * Headless unit tests for shadowEngine — no browser, no Mapbox required.
 * Run with: npm run test:shadow
 */
import * as E from './shadowEngine'

let pass = 0
let fail = 0
const ok = (c: boolean, m: string) => {
  if (c) pass++
  else {
    fail++
    console.log('FAIL:', m)
  }
}

// sun bucketing
const s1: E.SunPosition = { azimuth: 0.5, altitude: 0.6 }
const s2: E.SunPosition = { azimuth: 0.505, altitude: 0.601 }
ok(E.sunBucketKey(s1) === E.sunBucketKey(s2), 'near sun positions share a bucket')
ok(
  E.sunBucketKey({ azimuth: 0, altitude: 0.6 }) !== E.sunBucketKey({ azimuth: 1.5, altitude: 0.6 }),
  'far azimuths differ',
)

// shadowOffset
ok(E.shadowOffset(20, { azimuth: 0, altitude: -0.1 }, 59.3) === null, 'no offset when sun below horizon')
const offN = E.shadowOffset(20, { azimuth: 0, altitude: 0.6 }, 59.3)! // sun south -> shadow north
ok(offN[1] > 0 && Math.abs(offN[0]) < 1e-6, 'sun in south -> shadow north (dLat>0, dLng~0)')
const offHi = E.shadowOffset(20, { azimuth: 0, altitude: 1.4 }, 59.3)!
ok(offHi[1] < offN[1], 'higher sun -> shorter shadow')

// silhouette quads on a unit square (CCW), shadow east
const sq: E.LngLat[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]
const qE = E.shadowQuads(sq, [0.001, 0])
ok(qE.length === 1, 'east shadow -> exactly 1 back-edge quad, got ' + qE.length)
ok(
  qE[0].every((p) => p[0] >= 1 - 1e-9),
  'east quad lies on/east of x=1 (excludes interior)',
)
ok(qE[0].some((p) => p[0] > 1), 'east quad extends east past the wall')

// closed-ring + reversed winding still works
const sqClosedCW: E.LngLat[] = [
  [0, 0],
  [0, 1],
  [1, 1],
  [1, 0],
  [0, 0],
]
ok(E.shadowQuads(sqClosedCW, [0.001, 0]).length === 1, 'winding/closure normalized -> still 1 quad')

// diagonal shadow (NE) -> 2 back edges on a square
ok(E.shadowQuads(sq, [0.001, 0.001]).length === 2, 'NE shadow -> 2 back-edge quads')

// degenerate offset
ok(E.shadowQuads(sq, [0, 0]).length === 0, 'zero offset -> no quads')

// non-convex L-shape doesn't throw and yields quads
const L: E.LngLat[] = [
  [0, 0],
  [2, 0],
  [2, 1],
  [1, 1],
  [1, 2],
  [0, 2],
]
ok(E.shadowQuads(L, [0.001, 0.001]).length > 0, 'L-shape produces shadow quads')

// culling
const b: E.Bounds = { minLng: 0, minLat: 0, maxLng: 1, maxLat: 1 }
ok(E.ringIntersectsBounds([[0.5, 0.5], [0.6, 0.6]], b) === true, 'ring inside bounds intersects')
ok(E.ringIntersectsBounds([[5, 5], [6, 6]], b) === false, 'far ring does not intersect')

// full FC + cache
const cache = new E.ShadowCache()
const blds: E.BuildingFootprint[] = [
  { id: 'a', ring: sq, height: 20 },
  { id: 'far', ring: [[10, 10], [11, 10], [11, 11], [10, 11]], height: 20 },
]
const sun: E.SunPosition = { azimuth: 0.3, altitude: 0.7 }
const fc1 = E.buildShadowFeatureCollection(blds, { sun, bounds: b, atLat: 0.5, cache })
ok(fc1.features.length === 1, 'far building culled, only 1 casts, got ' + fc1.features.length)
ok(fc1.features[0].geometry.type === 'MultiPolygon', 'feature is a MultiPolygon')
const fc2 = E.buildShadowFeatureCollection(blds, { sun, bounds: b, atLat: 0.5, cache })
ok(JSON.stringify(fc1) === JSON.stringify(fc2), 'cached second pass is identical')
ok(
  E.buildShadowFeatureCollection(blds, {
    sun: { azimuth: 0.3, altitude: -0.2 },
    bounds: b,
    atLat: 0.5,
    cache,
  }).features.length === 0,
  'sun below horizon -> empty FC',
)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
