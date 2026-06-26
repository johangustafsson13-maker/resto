import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
// mapbox-gl touches `window` at import time, so load it lazily on the client only.
const mapboxgl: any = typeof window !== 'undefined' ? require('mapbox-gl') : null
import SunCalc from 'suncalc'
import { useDialKit } from 'dialkit'
import { getSunScore, isInShadow } from '../lib/sunScore'
import { COLORS, BREAKPOINTS } from '../lib/theme'
import type { Venue } from '../types'
import { buildShadowFeatureCollection, ShadowCache, type BuildingFootprint } from '../lib/shadowEngine'

// Module-lifetime cache; keyed by (buildingId, sun-bucket) inside the engine.
const shadowCache = new ShadowCache()

interface VenueMapProps {
  venues: Venue[]
  onVenueSelect?: (venue: Venue) => void
  onShadowStatusChange?: (venueId: string, shadowed: boolean | null) => void
  selectedVenue?: Venue
  scrubbedTime?: Date
}

export interface VenueMapHandle {
  flyTo: (lat: number, lng: number) => void
}

// Extract building footprints currently in view from the Mapbox vector source.
// querySourceFeatures returns geometry already in lng/lat.
function extractBuildings(map: any): BuildingFootprint[] {
  const feats = map.querySourceFeatures('composite', { sourceLayer: 'building' })
  const out: BuildingFootprint[] = []
  for (const f of feats) {
    const g = f.geometry
    if (!g) continue
    const height = Number(f.properties?.height ?? f.properties?.render_height ?? 20) || 20
    const rings: number[][][] =
      g.type === 'Polygon' ? [g.coordinates[0]]
      : g.type === 'MultiPolygon' ? g.coordinates.map((poly: number[][][]) => poly[0])
      : []
    rings.forEach((ring, i) => {
      if (!Array.isArray(ring) || ring.length < 3) return
      const base = f.id != null ? String(f.id) : `${ring[0][0].toFixed(6)},${ring[0][1].toFixed(6)}`
      out.push({
        id: rings.length > 1 ? `${base}#${i}` : base,
        ring: ring as [number, number][],
        height,
      })
    })
  }
  return out
}

// Build the ground-shadow FeatureCollection for the current view via the headless,
// unit-tested shadowEngine — viewport-culled and cached per (building, sun-bucket).
function generateShadowFeatures(
  map: any,
  sunAzimuth: number,
  sunAltitude: number,
  centerLat: number,
): GeoJSON.FeatureCollection {
  if (sunAltitude <= 0) return { type: 'FeatureCollection', features: [] }
  const b = map.getBounds()
  const fc = buildShadowFeatureCollection(extractBuildings(map), {
    sun: { azimuth: sunAzimuth, altitude: sunAltitude },
    bounds: { minLng: b.getWest(), minLat: b.getSouth(), maxLng: b.getEast(), maxLat: b.getNorth() },
    atLat: centerLat,
    cache: shadowCache,
  })
  if (typeof window !== 'undefined' && (window as any).__DEBUG_SHADOWS) {
    console.log(`[Shadow] ${fc.features.length} shadow features (alt ${(sunAltitude * 180 / Math.PI).toFixed(1)}°)`)
  }
  return fc
}

// SunCalc azimuth: radians from south, clockwise (south=0, west=π/2).
// Mapbox setLight position[1]: degrees from north, clockwise (north=0, east=90).
// Mapbox setLight position[2]: elevation in degrees above surface (0=horizon, 90=zenith).
function applySunLight(map: any, lat: number, lng: number, atTime: Date) {
  const { altitude, azimuth } = SunCalc.getPosition(atTime, lat, lng)
  const mapboxAzimuth = ((azimuth * 180 / Math.PI) + 180) % 360
  const elevationDeg = altitude * 180 / Math.PI

  if (altitude > 0) {
    const intensity = Math.min(1, Math.sin(altitude) * 3)
    map.setLight({
      anchor: 'map',
      color: 'white',
      intensity,
      position: [1.15, mapboxAzimuth, Math.max(5, 90 - elevationDeg)],
    })
  } else {
    map.setLight({
      anchor: 'map',
      color: '#4466aa',
      intensity: 0.6,
      position: [1.15, 180, 20],
    })
  }

  // Update ground shadows only (removed 3D volume layer to avoid double shadows)
  const shadowFeatures = generateShadowFeatures(map, azimuth, altitude, lat)
  const shadowSource = map.getSource('shadow-source')
  if (shadowSource) {
    shadowSource.setData(shadowFeatures)
  }
}

function markerColor(score: number, shadowed: boolean): string {
  if (shadowed || score === 0) return '#9ca3af'
  if (score >= 60) return '#22c55e'
  if (score >= 20) return '#facc15'
  return '#9ca3af'
}

const VenueMapComponent = forwardRef<VenueMapHandle, VenueMapProps>(
  ({ venues, onVenueSelect, onShadowStatusChange, selectedVenue, scrubbedTime }, ref) => {
    const mapContainer = useRef<HTMLDivElement>(null)
    const mapRef = useRef<any>(null)
    const markersRef = useRef<any[]>([])
    const [is3D, setIs3D] = useState(false)
    const scrubbedTimeRef = useRef<Date | undefined>(scrubbedTime)
    const shadowDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // ── DialKit: live shadow tuning (dev only — hidden in production) ──────────
    const dial = useDialKit('Shadows', {
      color: '#6e82a5',
      opacity: [0.25, 0.0, 1.0],
      opacityMinFloor: [0.15, 0.0, 0.5],
      opacityMaxCap:   [0.60, 0.1, 1.0],
      opacityMult:     [0.70, 0.1, 2.0],
      outlineOpacity:  [0.20, 0.0, 1.0],
      buildings: {
        color: '#bbbbbb',
        opacity: [0.4, 0.0, 1.0],
      },
    })

    // Sync dial changes → live mapbox layer paint (no reload needed)
    useEffect(() => {
      const map = mapRef.current
      if (!map || !map.isStyleLoaded()) return
      try {
        map.setPaintProperty('ground-shadows', 'fill-color', dial.color)
        map.setPaintProperty('ground-shadows', 'fill-opacity', dial.opacity)
        map.setPaintProperty('ground-shadows-outline', 'line-opacity', dial.outlineOpacity)
        map.setPaintProperty('sun-buildings', 'fill-extrusion-color', dial.buildings.color)
        map.setPaintProperty('sun-buildings', 'fill-extrusion-opacity', dial.buildings.opacity)
      } catch { /* map not ready yet */ }
    }, [dial.color, dial.opacity, dial.outlineOpacity, dial.buildings.color, dial.buildings.opacity])

    // Expose flyTo method via ref
    useImperativeHandle(ref, () => ({
      flyTo: (lat: number, lng: number) => {
        if (mapRef.current) {
          mapRef.current.flyTo({
            center: [lng, lat],
            zoom: 15,
            duration: 1000,
          })
        }
      },
    }), [])

    // Keep ref in sync so map-init closure and interval always see the latest prop value
    useEffect(() => { scrubbedTimeRef.current = scrubbedTime }, [scrubbedTime])

  // Initialize map once on mount
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [18.0686, 59.3293], // Central Stockholm
      zoom: 12,
    })
    mapRef.current = map

    map.once('load', () => {
      // Temporarily disabled for browse endpoint testing
      /*
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords
            map.flyTo({
              center: [longitude, latitude],
              zoom: 14,
              duration: 2000,
            })

            // Add a marker for user's location
            const userMarkerEl = document.createElement('div')
            userMarkerEl.style.cssText = `
              width: 12px;
              height: 12px;
              background: #3b82f6;
              border: 3px solid white;
              border-radius: 50%;
              box-shadow: 0 0 0 2px #3b82f6;
              cursor: pointer;
            `

            new mapboxgl.Marker({ element: userMarkerEl })
              .setLngLat([longitude, latitude])
              .setPopup(new mapboxgl.Popup({ offset: 12, closeButton: false }).setHTML(
                '<strong style="font-size:13px">Your Location</strong>'
              ))
              .addTo(map)

            if (typeof window !== 'undefined' && (window as any).__DEBUG_SHADOWS) {
              console.log(`[Location] User at: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`)
            }
          },
          (error) => {
            if (typeof window !== 'undefined' && (window as any).__DEBUG_SHADOWS) {
              console.log('[Location] Permission denied or error:', error.message)
            }
            // Fallback: stay centered on Stockholm
          }
        )
      }
      */
      // Add ground shadows source
      map.addSource('shadow-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      // 3D buildings for shadow ray-casting (add first so we can layer shadows before it)
      map.addLayer({
        id: 'sun-buildings',
        source: 'composite',
        'source-layer': 'building',
        filter: ['==', 'extrude', 'true'],
        type: 'fill-extrusion',
        minzoom: 12,
        paint: {
          'fill-extrusion-color': '#bbb',
          'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 12, 0, 14.5, ['get', 'height']],
          'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 12, 0, 14.5, ['get', 'min_height']],
          'fill-extrusion-opacity': 0.4,
        },
      })

      // Add ground shadows layer (2D only - clean, no double shadows)
      // Overlay color tuned for dark-v11 basemap — see COLORS.shadowOverlay in theme.ts
      // TODO(phase2): Consider inverting metaphor — warm glow on sunny areas instead of cool
      // tint on shadowed areas. Product is "find sun," not "find shadow." The current approach
      // tints occluded areas (cartographic convention) but the product story argues for
      // highlighting lit areas with COLORS.sunny. Changing this requires reworking generateShadowFeatures
      // to instead mark sun-exposed polygons.
      map.addLayer({
        id: 'ground-shadows',
        type: 'fill',
        source: 'shadow-source',
        paint: {
          'fill-color': COLORS.shadeOnMap, // opacity baked into rgba; fill-opacity must be 1
          'fill-opacity': 1,
          'fill-antialias': true,
        },
      }, 'sun-buildings') // Insert before buildings layer

      // Optional: Add subtle shadow outline for edge definition
      map.addLayer({
        id: 'ground-shadows-outline',
        type: 'line',
        source: 'shadow-source',
        paint: {
          'line-color': '#0f0f1a', // Darker than fill for subtle definition
          'line-width': 0.5,
          'line-opacity': 0.2,     // Very subtle
        },
      })

      // Apply sun light at scrubbed time if set, otherwise at current real time
      applySunLight(map, 59.3293, 18.0686, scrubbedTimeRef.current ?? new Date())

      // ── Event-driven shadow recompute ──────────────────────────────────────
      // Shadows redraw when the map settles after a pan/zoom (so newly revealed
      // areas always fill in) and on a slow clock tick. Geometry is viewport-culled
      // and cached per (building, sun-bucket), so these calls are cheap.
      const ZOOM_MIN = 12
      const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

      const recomputeShadows = () => {
        const src = map.getSource('shadow-source')
        if (map.getZoom() < ZOOM_MIN) { if (src) src.setData(EMPTY_FC); return }
        applySunLight(map, 59.3293, 18.0686, scrubbedTimeRef.current ?? new Date())
      }

      let moveTimer: ReturnType<typeof setTimeout> | null = null
      const onMoveSettle = () => {
        if (moveTimer) clearTimeout(moveTimer)
        moveTimer = setTimeout(recomputeShadows, 150)
      }
      map.on('moveend', onMoveSettle)
      map.on('zoomend', onMoveSettle)

      // Slow tick advances the real-time sun; near-free when the sun bucket is unchanged.
      const shadowInterval = setInterval(() => {
        if (scrubbedTimeRef.current !== undefined) return // user is scrubbing
        recomputeShadows()
      }, 30000)

      // 3D pitch toggle + tilt controls — brutalist styling, bottom-left.
      // Mobile: 5.5rem (88px) to clear the 80px scrubber panel. Desktop: 4.5rem.
      // Uses a local let to track state and avoid the stale-closure bug from Phase 1.
      let is3DLocal = false

      const isMobileViewport = window.innerWidth < BREAKPOINTS.mobile
      const controlsDiv = document.createElement('div')
      controlsDiv.style.cssText = `
        position: absolute;
        bottom: ${isMobileViewport ? '5.5rem' : '4.5rem'};
        left: 0.75rem;
        display: flex;
        flex-direction: row;
        align-items: center;
        z-index: 10;
      `

      const toggle3DBtn = document.createElement('button')
      toggle3DBtn.innerHTML = '3D'
      toggle3DBtn.style.cssText = `
        width: 44px;
        height: 44px;
        border: 2px solid ${COLORS.border};
        background: ${COLORS.surface1};
        color: ${COLORS.text1};
        cursor: pointer;
        font-family: 'IBM Plex Sans', -apple-system, sans-serif;
        font-size: 13px;
        font-weight: 600;
        border-radius: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      `

      const tiltControlsDiv = document.createElement('div')
      tiltControlsDiv.style.cssText = `display: none; flex-direction: row; align-items: center;`

      const tiltUpBtn = document.createElement('button')
      tiltUpBtn.innerHTML = '▲'
      tiltUpBtn.style.cssText = `
        width: 44px;
        height: 44px;
        border: 2px solid ${COLORS.border};
        border-left: none;
        background: ${COLORS.surface1};
        color: ${COLORS.text1};
        cursor: pointer;
        font-size: 14px;
        border-radius: 0;
      `

      const tiltDownBtn = document.createElement('button')
      tiltDownBtn.innerHTML = '▼'
      tiltDownBtn.style.cssText = `
        width: 44px;
        height: 44px;
        border: 2px solid ${COLORS.border};
        border-left: none;
        background: ${COLORS.surface1};
        color: ${COLORS.text1};
        cursor: pointer;
        font-size: 14px;
        border-radius: 0;
      `

      toggle3DBtn.onclick = () => {
        is3DLocal = !is3DLocal
        setIs3D(is3DLocal)
        if (is3DLocal) {
          map.setPitch(45)
          toggle3DBtn.style.background = COLORS.accent
          toggle3DBtn.style.color = '#ffffff'
          toggle3DBtn.style.borderColor = COLORS.accent
          tiltControlsDiv.style.display = 'flex'
        } else {
          map.setPitch(0)
          toggle3DBtn.style.background = COLORS.surface1
          toggle3DBtn.style.color = COLORS.text1
          toggle3DBtn.style.borderColor = COLORS.border
          tiltControlsDiv.style.display = 'none'
        }
      }

      tiltUpBtn.onclick = () => map.setPitch(Math.min(60, map.getPitch() + 5))
      tiltDownBtn.onclick = () => map.setPitch(Math.max(0, map.getPitch() - 5))

      tiltControlsDiv.appendChild(tiltUpBtn)
      tiltControlsDiv.appendChild(tiltDownBtn)
      controlsDiv.appendChild(toggle3DBtn)
      controlsDiv.appendChild(tiltControlsDiv)
      map.getCanvas().parentNode?.appendChild(controlsDiv)

      // Clean up interval and controls on map remove
      const originalRemove = map.remove.bind(map)
      map.remove = function() {
        clearInterval(shadowInterval)
        if (moveTimer) clearTimeout(moveTimer)
        map.off('moveend', onMoveSettle)
        map.off('zoomend', onMoveSettle)
        controlsDiv.remove()
        originalRemove()
      }
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  // Update markers whenever venues change
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    if (!venues.length) return

    function addMarkers() {
      // Guard: skip venues with missing/invalid coordinates — prevents NaN crash in fitBounds/Marker
      const hasValidCoords = (v: Venue) => v.lat != null && v.lng != null && !isNaN(v.lat) && !isNaN(v.lng)

      venues.forEach((venue) => {
        if (!hasValidCoords(venue)) return

        let color: string
        let shadowResult: boolean | null = null

        if (venue.is_terrace || venue.outdoor_seating) {
          const score = getSunScore(venue.lat, venue.lng)
          shadowResult = isInShadow(map, venue.lat, venue.lng)
          const shadowed = shadowResult !== null ? shadowResult : score === 0
          color = markerColor(score, shadowed)
        } else {
          color = '#f97316'
        }

        onShadowStatusChange?.(String(venue.id), shadowResult)

        const el = document.createElement('div')
        el.style.cssText = [
          'width:14px', 'height:14px', 'border-radius:50%',
          `background:${color}`, 'border:2px solid white',
          'box-shadow:0 1px 4px rgba(0,0,0,0.3)', 'cursor:pointer',
        ].join(';')

        const popup = new mapboxgl.Popup({ offset: 12, closeButton: false }).setHTML(
          `<strong style="font-size:13px">${venue.name}</strong>` +
          (venue.address ? `<br><span style="font-size:11px;color:#666">${venue.address}</span>` : '')
        )

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([venue.lng, venue.lat])
          .setPopup(popup)
          .addTo(map)

        el.addEventListener('click', () => onVenueSelect?.(venue))
        markersRef.current.push(marker)
      })

      // Fit map to show all venues (valid coords only)
      const validVenues = venues.filter(hasValidCoords)
      if (validVenues.length > 1) {
        const bounds = validVenues.reduce(
          (b: any, v: Venue) => b.extend([v.lng, v.lat] as [number, number]),
          new mapboxgl.LngLatBounds([validVenues[0].lng, validVenues[0].lat], [validVenues[0].lng, validVenues[0].lat])
        )
        map.fitBounds(bounds, { padding: 80, maxZoom: 15, animate: true })
      } else if (validVenues.length === 1) {
        map.flyTo({ center: [validVenues[0].lng, validVenues[0].lat], zoom: 15 })
      }
    }

    if (map.loaded()) {
      addMarkers()
    } else {
      map.off('idle', addMarkers) // defensive: clear any pending listener from a previous cycle
      map.once('idle', addMarkers)
    }

    return () => {
      markersRef.current.forEach(m => m.remove())
      markersRef.current = []
    }
  }, [venues, onVenueSelect, onShadowStatusChange])

    // Debounced shadow redraw when scrubber moves — 100ms prevents thrash on fast drag
    useEffect(() => {
      if (scrubbedTime === undefined) return
      if (shadowDebounceRef.current) clearTimeout(shadowDebounceRef.current)
      shadowDebounceRef.current = setTimeout(() => {
        const m = mapRef.current
        if (m && m.loaded()) applySunLight(m, 59.3293, 18.0686, scrubbedTime)
      }, 100)
      return () => {
        if (shadowDebounceRef.current) clearTimeout(shadowDebounceRef.current)
      }
    }, [scrubbedTime])

  return <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
  }
)

VenueMapComponent.displayName = 'VenueMap'

export default VenueMapComponent
