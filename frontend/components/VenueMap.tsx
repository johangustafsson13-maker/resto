import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mapboxgl: any = typeof window !== 'undefined' ? require('mapbox-gl') : null
// eslint-disable-next-line @typescript-eslint/no-require-imports
const turf: any = typeof window !== 'undefined' ? require('@turf/turf') : null
import SunCalc from 'suncalc'
import { useDialKit } from 'dialkit'
import { getSunScore, isInShadow } from '../lib/sunScore'
import { COLORS, BREAKPOINTS } from '../lib/theme'
import type { Venue } from '../types'

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

// Haversine distance in meters (kept for potential future use)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000 // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.asin(Math.sqrt(a))
  return R * c
}

// Compute the shadow offset vector (in degrees) for a given building height and sun position.
// Returns [offsetLng, offsetLat] — the displacement from building base to shadow tip.
function computeShadowOffset(
  buildingHeight: number,
  sunAzimuth: number,
  sunAltitude: number,
): [number, number] {
  if (sunAltitude <= 0) return [0, 0]

  // shadow_distance = height / tan(altitude), converted from metres to degrees
  const shadowLength = buildingHeight / Math.tan(sunAltitude) / 111000

  // sunAzimuth: south=0, clockwise in radians. Shadow falls opposite the sun.
  const bearing = (sunAzimuth * 180 / Math.PI + 180) % 360
  const bearingRad = (bearing - 90) * Math.PI / 180

  return [
    Math.cos(bearingRad) * shadowLength,
    Math.sin(bearingRad) * shadowLength,
  ]
}

// Generate GeoJSON shadow features from map buildings
// IMPORTANT: Subtracts building footprints so shadows only appear outside buildings
interface ShadowDialParams {
  opacityMinFloor: number
  opacityMaxCap: number
  opacityMult: number
}

function generateShadowFeatures(
  map: any,
  sunAzimuth: number,
  sunAltitude: number,
  centerLat: number,
  dialParams?: ShadowDialParams
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []

  if (sunAltitude <= 0) {
    return { type: 'FeatureCollection', features: [] }
  }

  // Query buildings from the map's composite source
  try {
    const buildings = map.querySourceFeatures('composite', {
      sourceLayer: 'building',
    })

    // Debug: log building count
    if (typeof window !== 'undefined' && (window as any).__DEBUG_SHADOWS) {
      console.log(`[Shadow] Found ${buildings.length} buildings, altitude: ${(sunAltitude * 180 / Math.PI).toFixed(1)}°, azimuth: ${(sunAzimuth * 180 / Math.PI).toFixed(1)}°`)
    }

    buildings.forEach((building: any) => {
      const height = building.properties?.height || 20 // Default 20m if not specified
      const geometry = building.geometry

      if (geometry && geometry.type === 'Polygon') {
        const footprint: number[][] = geometry.coordinates[0]
        if (!Array.isArray(footprint) || footprint.length < 3) return

        const [offsetLng, offsetLat] = computeShadowOffset(height, sunAzimuth, sunAltitude)
        if (offsetLng === 0 && offsetLat === 0) return

        try {
          // Shadow tip points: each footprint vertex shifted in the shadow direction
          const shadowTips = footprint.map(([lng, lat]) => [lng + offsetLng, lat + offsetLat])

          // Build the swept shadow polygon as the convex hull of footprint + shadow tips.
          // This guarantees the shadow is ATTACHED to the building — no floating.
          const allPoints = turf.featureCollection(
            [...footprint, ...shadowTips].map(p => turf.point(p as [number, number]))
          )
          const hull = turf.convex(allPoints)
          if (!hull) return

          // Ensure footprint polygon is closed
          const closedFootprint = footprint[footprint.length - 1][0] === footprint[0][0] &&
                                  footprint[footprint.length - 1][1] === footprint[0][1]
            ? footprint : [...footprint, footprint[0]]

          const buildingPoly = turf.polygon([closedFootprint])

          // Subtract the building itself — show only the ground shadow outside the building
          const shadowOnly = turf.difference(hull, buildingPoly)
          if (!shadowOnly?.geometry) return

          const opacityBase = Math.sin(sunAltitude)
          const minFloor = dialParams?.opacityMinFloor ?? 0.15
          const maxCap   = dialParams?.opacityMaxCap   ?? 0.60
          const mult     = dialParams?.opacityMult     ?? 0.70
          const opacity = Math.max(minFloor, Math.min(maxCap, opacityBase * mult))

          if (shadowOnly.geometry.type === 'Polygon' || shadowOnly.geometry.type === 'MultiPolygon') {
            features.push({
              type: 'Feature',
              geometry: shadowOnly.geometry,
              properties: { height, opacity, altitude: sunAltitude * 180 / Math.PI },
            })
          }
        } catch {
          // Skip malformed building geometry silently
          return
        }
      }
    })

    if (typeof window !== 'undefined' && (window as any).__DEBUG_SHADOWS) {
      console.log(`[Shadow] Generated ${features.length} shadow polygons (building footprints subtracted)`)
    }
  } catch (e) {
    if (typeof window !== 'undefined' && (window as any).__DEBUG_SHADOWS) {
      console.error('[Shadow] Query failed:', e)
    }
  }

  return { type: 'FeatureCollection', features }
}

// SunCalc azimuth: radians from south, clockwise (south=0, west=π/2).
// Mapbox setLight position[1]: degrees from north, clockwise (north=0, east=90).
// Mapbox setLight position[2]: elevation in degrees above surface (0=horizon, 90=zenith).
function applySunLight(map: any, lat: number, lng: number, atTime: Date, dialParams?: ShadowDialParams) {
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
  const shadowFeatures = generateShadowFeatures(map, azimuth, altitude, lat, dialParams)
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
      applySunLight(map, 59.3293, 18.0686, scrubbedTimeRef.current ?? new Date(), dial)

      // Update shadows every 15 seconds as sun moves (reduced from 5s for performance)
      // Only recalculate when zoom is appropriate for shadow rendering (zoom >= 12)
      const shadowInterval = setInterval(() => {
        if (scrubbedTimeRef.current !== undefined) return // user is scrubbing — don't auto-advance
        const zoom = map.getZoom()
        if (zoom >= 12) {
          applySunLight(map, 59.3293, 18.0686, new Date(), dial)
        }
      }, 15000)

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
        if (m && m.loaded()) applySunLight(m, 59.3293, 18.0686, scrubbedTime, dial)
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
