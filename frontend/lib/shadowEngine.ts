/**
 * shadowEngine — pure geometry + caching core for the ground-shadow visualization.
 *
 * Design goals (vs. the old inline approach in VenueMap):
 *  - No turf. Shadow geometry is an O(edges) silhouette sweep, correct for
 *    non-convex (L-shaped) footprints, with zero hull/difference cost.
 *  - Deterministic & pure: every function here is side-effect free and unit-tested
 *    headlessly (see shadowEngine.test.mjs) so the math is proven before it ever
 *    touches Mapbox.
 *  - Cache-friendly: shadow polygons are keyed by (buildingId, sunBucket) so the
 *    engine only recomputes geometry when the sun has actually moved enough or a
 *    new building entered view — not on a blind timer.
 *
 * Coordinate convention matches SunCalc: `azimuth` is radians from south, clockwise
 * (south=0, west=π/2); `altitude` is radians above the horizon.
 */

export type LngLat = [number, number]

export interface BuildingFootprint {
  /** Stable-ish identity for caching (Mapbox feature id, else a coord hash). */
  id: string
  /** Outer ring, [lng, lat]. May be open or closed; winding is normalized internally. */
  ring: LngLat[]
  /** Building height in metres. */
  height: number
}

export interface SunPosition {
  /** radians, SunCalc convention (from south, clockwise) */
  azimuth: number
  /** radians above horizon */
  altitude: number
}

export interface Bounds {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

const METERS_PER_DEGREE_LAT = 111_000

// ─── Sun-position bucketing ───────────────────────────────────────────────────
// Quantize the sun position so we only recompute geometry when it has moved past a
// threshold. 3° azimuth × 2° altitude is well below visual perceptibility for city
// shadows but collapses the per-tick recompute storm into occasional work.

export function sunBucketKey(sun: SunPosition, azStepDeg = 3, altStepDeg = 2): string {
  const azDeg = (sun.azimuth * 180) / Math.PI
  const altDeg = (sun.altitude * 180) / Math.PI
  const az = Math.round(azDeg / azStepDeg)
  const alt = Math.round(altDeg / altStepDeg)
  return `${az}:${alt}`
}

// ─── Shadow offset vector ─────────────────────────────────────────────────────
// Displacement (in degrees) from a footprint vertex to its shadow tip on the ground.

export function shadowOffset(
  height: number,
  sun: SunPosition,
  atLat: number,
): LngLat | null {
  if (sun.altitude <= 0) return null
  // ground shadow length = height / tan(altitude)
  const shadowLenM = height / Math.tan(sun.altitude)
  if (!isFinite(shadowLenM) || shadowLenM <= 0) return null

  // Shadow falls opposite the sun. SunCalc azimuth is from south clockwise; convert
  // to a compass bearing (from north clockwise) for the shadow direction.
  const bearingDeg = ((sun.azimuth * 180) / Math.PI + 180) % 360
  const bearingRad = (bearingDeg - 90) * (Math.PI / 180)

  const dxM = Math.cos(bearingRad) * shadowLenM
  const dyM = Math.sin(bearingRad) * shadowLenM

  const dLng = dxM / (METERS_PER_DEGREE_LAT * Math.cos(atLat * (Math.PI / 180)))
  const dLat = dyM / METERS_PER_DEGREE_LAT
  return [dLng, dLat]
}

// ─── Ring helpers ─────────────────────────────────────────────────────────────

/** Signed area in coordinate units; >0 means counter-clockwise. */
export function signedArea(ring: LngLat[]): number {
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}

/** Returns an open ring (no duplicated closing vertex) wound counter-clockwise. */
export function normalizeRing(ring: LngLat[]): LngLat[] {
  let r = ring.slice()
  if (r.length > 1) {
    const f = r[0]
    const l = r[r.length - 1]
    if (f[0] === l[0] && f[1] === l[1]) r = r.slice(0, -1)
  }
  if (signedArea(r) < 0) r.reverse()
  return r
}

// ─── Silhouette shadow sweep ──────────────────────────────────────────────────
// For a CCW ring, an edge casts a ground shadow when its OUTWARD normal points in
// the shadow direction (dot(normal, offset) > 0). Each such "back edge" produces a
// parallelogram from the edge to its offset copy. The union of these quads is the
// attached ground shadow; the building footprint itself is naturally excluded (no
// difference op needed). Overlaps between adjacent quads are harmless — the fill
// layer paints at flat opacity, so coverage is a visual union.

export function shadowQuads(ring: LngLat[], offset: LngLat): LngLat[][] {
  const r = normalizeRing(ring)
  const n = r.length
  if (n < 3) return []
  const [ox, oy] = offset
  if (ox === 0 && oy === 0) return []

  const quads: LngLat[][] = []
  for (let i = 0; i < n; i++) {
    const a = r[i]
    const b = r[(i + 1) % n]
    const ex = b[0] - a[0]
    const ey = b[1] - a[1]
    // outward normal for a CCW polygon
    const nx = ey
    const ny = -ex
    if (nx * ox + ny * oy <= 0) continue // edge faces the sun → no shadow strip
    const aOff: LngLat = [a[0] + ox, a[1] + oy]
    const bOff: LngLat = [b[0] + ox, b[1] + oy]
    quads.push([a, b, bOff, aOff, a]) // closed ring
  }
  return quads
}

// ─── Viewport culling ─────────────────────────────────────────────────────────

export function ringIntersectsBounds(ring: LngLat[], b: Bounds): boolean {
  // Cheap bbox-vs-bbox test using the ring's own bbox.
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  return !(maxLng < b.minLng || minLng > b.maxLng || maxLat < b.minLat || minLat > b.maxLat)
}

export function expandBounds(b: Bounds, marginDeg: number): Bounds {
  return {
    minLng: b.minLng - marginDeg,
    minLat: b.minLat - marginDeg,
    maxLng: b.maxLng + marginDeg,
    maxLat: b.maxLat + marginDeg,
  }
}

// ─── Cache ────────────────────────────────────────────────────────────────────
// Keyed by `${buildingId}:${sunBucket}`. The bucket is part of the key so a sun
// move simply misses and recomputes; stale buckets are evicted by simple size cap.

export class ShadowCache {
  private map = new Map<string, LngLat[][]>()
  constructor(private maxEntries = 20_000) {}

  key(buildingId: string, bucket: string): string {
    return `${buildingId}:${bucket}`
  }

  get(buildingId: string, bucket: string): LngLat[][] | undefined {
    return this.map.get(this.key(buildingId, bucket))
  }

  set(buildingId: string, bucket: string, quads: LngLat[][]): void {
    if (this.map.size >= this.maxEntries) {
      // Evict oldest insertion (Map preserves insertion order).
      const first = this.map.keys().next().value
      if (first !== undefined) this.map.delete(first)
    }
    this.map.set(this.key(buildingId, bucket), quads)
  }

  clear(): void {
    this.map.clear()
  }
}

// ─── Top-level: build a GeoJSON FeatureCollection for the current view ─────────

export interface BuildShadowsOptions {
  sun: SunPosition
  bounds: Bounds
  /** centre latitude used for the metres→degrees conversion */
  atLat: number
  /** extra margin (deg) around the viewport so shadows don't pop at edges */
  marginDeg?: number
  cache?: ShadowCache
}

export function buildShadowFeatureCollection(
  buildings: BuildingFootprint[],
  opts: BuildShadowsOptions,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  if (opts.sun.altitude <= 0) {
    return { type: 'FeatureCollection', features }
  }

  const bucket = sunBucketKey(opts.sun)
  const viewBounds = expandBounds(opts.bounds, opts.marginDeg ?? 0.003)

  for (const b of buildings) {
    if (!ringIntersectsBounds(b.ring, viewBounds)) continue

    let quads = opts.cache?.get(b.id, bucket)
    if (!quads) {
      const offset = shadowOffset(b.height, opts.sun, opts.atLat)
      quads = offset ? shadowQuads(b.ring, offset) : []
      opts.cache?.set(b.id, bucket, quads)
    }
    if (!quads.length) continue

    features.push({
      type: 'Feature',
      geometry: { type: 'MultiPolygon', coordinates: quads.map((q) => [q]) },
      properties: { id: b.id, height: b.height },
    })
  }

  return { type: 'FeatureCollection', features }
}
