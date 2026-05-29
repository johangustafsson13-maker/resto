import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mapboxgl: any = typeof window !== 'undefined' ? require('mapbox-gl') : null
// eslint-disable-next-line @typescript-eslint/no-require-imports
const turf: any = typeof window !== 'undefined' ? require('@turf/turf') : null
import SunCalc from 'suncalc'
import { getSunScore, isInShadow } from '../lib/sunScore'
import { COLORS } from '../lib/theme'
import type { Venue } from '../types'

interface VenueMapProps {
  venues: Venue[]
  onVenueSelect?: (venue: Venue) => void
  onShadowStatusChange?: (venueId: string, shadowed: boolean | null) => void
  selectedVenue?: Venue
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

// Calculate shadow polygon for a building footprint
// Projects building shadow based on sun position
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function projectShadowPolygon(
  footprint: number[][],
  buildingHeight: number,
  sunAzimuth: number,
  sunAltitude: number,
  centerLat: number
): number[][] {
  if (sunAltitude <= 0) return [] // No shadows at night

  // Calculate shadow length (in degrees) based on sun altitude and building height
  // Using approximation: shadow_distance ≈ building_height / tan(altitude)
  const shadowLength = buildingHeight / Math.tan(sunAltitude) / 111000 // 111km ≈ 1 degree lat

  // Convert azimuth from radians (south=0, clockwise) to bearing (north=0, clockwise)
  const bearing = (sunAzimuth * 180 / Math.PI + 180) % 360
  const bearingRad = (bearing - 90) * Math.PI / 180 // Convert to standard math convention

  // Offset for shadow (opposite direction of sun)
  const shadowOffsetLng = Math.cos(bearingRad) * shadowLength
  const shadowOffsetLat = Math.sin(bearingRad) * shadowLength

  // Project each point of the footprint backward (away from sun)
  return footprint.map(([lng, lat]) => [
    lng - shadowOffsetLng,
    lat - shadowOffsetLat,
  ])
}

// Generate GeoJSON shadow features from map buildings
// IMPORTANT: Subtracts building footprints so shadows only appear outside buildings
function generateShadowFeatures(
  map: any,
  sunAzimuth: number,
  sunAltitude: number,
  centerLat: number
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
        const footprint = geometry.coordinates[0]
        const shadowProjection = projectShadowPolygon(
          footprint,
          height,
          sunAzimuth,
          sunAltitude,
          centerLat
        )

        if (shadowProjection.length > 3) {
          try {
            // Validate polygons before processing
            if (!Array.isArray(footprint) || footprint.length < 3) {
              if (typeof window !== 'undefined' && (window as any).__DEBUG_SHADOWS) {
                console.warn('[Shadow] Invalid building footprint, skipping')
              }
              return
            }
            if (!Array.isArray(shadowProjection) || shadowProjection.length < 3) {
              if (typeof window !== 'undefined' && (window as any).__DEBUG_SHADOWS) {
                console.warn('[Shadow] Invalid shadow projection, skipping')
              }
              return
            }

            // Ensure coordinates are properly closed (first point = last point)
            const closedFootprint = footprint[footprint.length - 1] === footprint[0] ? footprint : [...footprint, footprint[0]]
            const closedShadow = shadowProjection[shadowProjection.length - 1] === shadowProjection[0] ? shadowProjection : [...shadowProjection, shadowProjection[0]]

            // Create Turf polygon objects
            const buildingFootprint = turf.polygon([closedFootprint])
            const shadowPoly = turf.polygon([closedShadow])

            // Subtract building footprint from shadow polygon
            // Result is the shadow area that's OUTSIDE the building
            const shadowMinusBuilding = turf.difference(shadowPoly, buildingFootprint)

            if (shadowMinusBuilding && shadowMinusBuilding.geometry) {
              const altitudeDeg = sunAltitude * 180 / Math.PI
              const opacityBase = Math.sin(sunAltitude)
              const opacity = Math.max(0.15, Math.min(0.6, opacityBase * 0.7))

              // Only add if geometry is valid and has area
              if (shadowMinusBuilding.geometry.type === 'Polygon' || shadowMinusBuilding.geometry.type === 'MultiPolygon') {
                features.push({
                  type: 'Feature',
                  geometry: shadowMinusBuilding.geometry,
                  properties: {
                    height,
                    opacity,
                    altitude: altitudeDeg,
                  },
                })

                if (typeof window !== 'undefined' && (window as any).__DEBUG_SHADOWS) {
                  console.log('[Shadow] Successfully subtracted building from shadow')
                }
              } else {
                if (typeof window !== 'undefined' && (window as any).__DEBUG_SHADOWS) {
                  console.warn('[Shadow] Difference result has invalid geometry type:', shadowMinusBuilding.geometry.type)
                }
              }
            } else {
              if (typeof window !== 'undefined' && (window as any).__DEBUG_SHADOWS) {
                console.warn('[Shadow] Difference returned no geometry')
              }
            }
          } catch (diffError) {
            if (typeof window !== 'undefined' && (window as any).__DEBUG_SHADOWS) {
              console.warn('[Shadow] Polygon difference failed:', diffError)
              console.warn('[Shadow] Skipping this shadow (not rendering full shadow to avoid covering building)')
            }
            // NOTE: We skip this shadow rather than using the full shadow
            // This prevents buildings from being covered when difference fails
            return
          }
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
function applySunLight(map: any, lat: number, lng: number) {
  const { altitude, azimuth } = SunCalc.getPosition(new Date(), lat, lng)
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
  ({ venues, onVenueSelect, onShadowStatusChange, selectedVenue }, ref) => {
    const mapContainer = useRef<HTMLDivElement>(null)
    const mapRef = useRef<any>(null)
    const markersRef = useRef<any[]>([])
    const [is3D, setIs3D] = useState(false)

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

  // Initialize map once on mount
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [18.0686, 59.3293], // Central Stockholm
      zoom: 12,
    })
    mapRef.current = map

    map.once('load', () => {
      // Request user's location and center map on it (after map is fully loaded)
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
      map.addLayer({
        id: 'ground-shadows',
        type: 'fill',
        source: 'shadow-source',
        paint: {
          'fill-color': COLORS.shadowOverlay, // opacity baked into rgba; fill-opacity must be 1
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

      // Apply real-time sun-derived directional light
      applySunLight(map, 59.3293, 18.0686)

      // Update shadows every 15 seconds as sun moves (reduced from 5s for performance)
      // Only recalculate when zoom is appropriate for shadow rendering (zoom >= 12)
      const shadowInterval = setInterval(() => {
        const zoom = map.getZoom()
        if (zoom >= 12) {
          applySunLight(map, 59.3293, 18.0686)
        }
      }, 15000)

      // Add map controls (zoom, 2D/3D toggle, tilt)
      const controlsDiv = document.createElement('div')
      controlsDiv.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        z-index: 10;
      `

      // Zoom controls
      const zoomDiv = document.createElement('div')
      zoomDiv.style.cssText = `
        background: white;
        border-radius: 4px;
        box-shadow: 0 0 0 2px rgba(0,0,0,0.1);
        display: flex;
        flex-direction: column;
      `

      const zoomInBtn = document.createElement('button')
      zoomInBtn.innerHTML = '+'
      zoomInBtn.style.cssText = `
        width: 36px;
        height: 36px;
        border: none;
        background: white;
        cursor: pointer;
        font-size: 20px;
        font-weight: bold;
        color: #333;
        border-bottom: 1px solid #e0e0e0;
        transition: background 0.2s;
      `
      zoomInBtn.onmouseover = () => zoomInBtn.style.background = '#f5f5f5'
      zoomInBtn.onmouseout = () => zoomInBtn.style.background = 'white'
      zoomInBtn.onclick = () => map.zoomIn()

      const zoomOutBtn = document.createElement('button')
      zoomOutBtn.innerHTML = '−'
      zoomOutBtn.style.cssText = `
        width: 36px;
        height: 36px;
        border: none;
        background: white;
        cursor: pointer;
        font-size: 20px;
        font-weight: bold;
        color: #333;
        transition: background 0.2s;
      `
      zoomOutBtn.onmouseover = () => zoomOutBtn.style.background = '#f5f5f5'
      zoomOutBtn.onmouseout = () => zoomOutBtn.style.background = 'white'
      zoomOutBtn.onclick = () => map.zoomOut()

      zoomDiv.appendChild(zoomInBtn)
      zoomDiv.appendChild(zoomOutBtn)

      // 2D/3D toggle
      const toggle3DBtn = document.createElement('button')
      toggle3DBtn.innerHTML = '3D'
      toggle3DBtn.style.cssText = `
        width: 36px;
        height: 36px;
        border: none;
        background: white;
        cursor: pointer;
        font-size: 12px;
        font-weight: bold;
        color: #333;
        border-radius: 4px;
        box-shadow: 0 0 0 2px rgba(0,0,0,0.1);
        transition: all 0.2s;
      `
      toggle3DBtn.onclick = () => {
        setIs3D(!is3D)
        if (is3D) {
          // Switch to 2D
          map.setPitch(0)
          toggle3DBtn.style.background = 'white'
          toggle3DBtn.style.color = '#333'
          tiltControlsDiv.style.display = 'none'
        } else {
          // Switch to 3D
          map.setPitch(45)
          toggle3DBtn.style.background = '#333'
          toggle3DBtn.style.color = 'white'
          tiltControlsDiv.style.display = 'flex'
        }
      }

      // Tilt controls (for 3D mode)
      const tiltControlsDiv = document.createElement('div')
      tiltControlsDiv.style.cssText = `
        background: white;
        border-radius: 4px;
        box-shadow: 0 0 0 2px rgba(0,0,0,0.1);
        display: none;
        flex-direction: column;
        overflow: hidden;
      `

      const tiltUpBtn = document.createElement('button')
      tiltUpBtn.innerHTML = '▲'
      tiltUpBtn.style.cssText = `
        width: 36px;
        height: 36px;
        border: none;
        background: white;
        cursor: pointer;
        font-size: 16px;
        color: #333;
        border-bottom: 1px solid #e0e0e0;
        transition: background 0.2s;
      `
      tiltUpBtn.onmouseover = () => tiltUpBtn.style.background = '#f5f5f5'
      tiltUpBtn.onmouseout = () => tiltUpBtn.style.background = 'white'
      tiltUpBtn.onclick = () => {
        const currentPitch = map.getPitch()
        map.setPitch(Math.min(60, currentPitch + 5))
      }

      const tiltDownBtn = document.createElement('button')
      tiltDownBtn.innerHTML = '▼'
      tiltDownBtn.style.cssText = `
        width: 36px;
        height: 36px;
        border: none;
        background: white;
        cursor: pointer;
        font-size: 16px;
        color: #333;
        transition: background 0.2s;
      `
      tiltDownBtn.onmouseover = () => tiltDownBtn.style.background = '#f5f5f5'
      tiltDownBtn.onmouseout = () => tiltDownBtn.style.background = 'white'
      tiltDownBtn.onclick = () => {
        const currentPitch = map.getPitch()
        map.setPitch(Math.max(0, currentPitch - 5))
      }

      tiltControlsDiv.appendChild(tiltUpBtn)
      tiltControlsDiv.appendChild(tiltDownBtn)

      controlsDiv.appendChild(zoomDiv)
      controlsDiv.appendChild(toggle3DBtn)
      controlsDiv.appendChild(tiltControlsDiv)

      const mapCanvas = map.getCanvas()
      mapCanvas.parentNode?.appendChild(controlsDiv)

      // Clean up interval on map remove
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
    if (!map) {
      if (typeof window !== 'undefined' && (window as any).__DEBUG_SHADOWS) {
        console.log('[Shadow Status] Map not ready')
      }
      return
    }

    if (typeof window !== 'undefined' && (window as any).__DEBUG_SHADOWS) {
      console.log(`[Shadow Status] Map ready, venues: ${venues.length}`)
    }

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    if (!venues.length) return

    function addMarkers() {
      if (typeof window !== 'undefined' && (window as any).__DEBUG_SHADOWS) {
        console.log(`[Shadow Status] Starting to add ${venues.length} markers...`)
      }
      venues.forEach((venue) => {
        let color: string
        let shadowResult: boolean | null = null

        // Determine color based on venue type and sun status
        if (venue.is_terrace || venue.outdoor_seating) {
          // Terraces and outdoor-seating restaurants: use sun-based color
          const score = getSunScore(venue.lat, venue.lng)
          shadowResult = isInShadow(map, venue.lat, venue.lng)
          const shadowed = shadowResult !== null ? shadowResult : score === 0
          color = markerColor(score, shadowed)

          if (typeof window !== 'undefined' && (window as any).__DEBUG_SHADOWS) {
            console.log(`[Shadow Status] ${venue.name} (terrace): shadowResult=${shadowResult}, shadowed=${shadowed}`)
          }
        } else {
          // Indoor restaurants: use orange color
          color = '#f97316' // orange
          if (typeof window !== 'undefined' && (window as any).__DEBUG_SHADOWS) {
            console.log(`[Shadow Status] ${venue.name} (restaurant): using orange`)
          }
        }

        // Report shadow status back to parent
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

      // Fit map to show all venues
      if (venues.length > 1) {
        const bounds = venues.reduce(
          (b: any, v: Venue) => b.extend([v.lng, v.lat] as [number, number]),
          new mapboxgl.LngLatBounds([venues[0].lng, venues[0].lat], [venues[0].lng, venues[0].lat])
        )
        map.fitBounds(bounds, { padding: 80, maxZoom: 15, animate: true })
      } else if (venues.length === 1) {
        map.flyTo({ center: [venues[0].lng, venues[0].lat], zoom: 15 })
      }
    }

    if (map.loaded()) {
      addMarkers()
    } else {
      map.once('idle', addMarkers)
    }

    return () => {
      markersRef.current.forEach(m => m.remove())
      markersRef.current = []
    }
  }, [venues, onVenueSelect, onShadowStatusChange])

  return <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
  }
)

VenueMapComponent.displayName = 'VenueMap'

export default VenueMapComponent
