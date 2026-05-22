import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import type { Venue } from '../types'

interface VenueMapProps {
  venues: Venue[]
  onVenueSelect?: (venue: Venue) => void
}

export default function VenueMap({ venues, onVenueSelect }: VenueMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)

  useEffect(() => {
    if (!mapContainer.current) return

    // Initialize map
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [18.0686, 59.3293], // Stockholm center
      zoom: 12,
    })

    // Add markers for venues
    venues.forEach((venue) => {
      const marker = new mapboxgl.Marker({ color: '#F97316' })
        .setLngLat([venue.lng, venue.lat])
        .setPopup(
          new mapboxgl.Popup({ offset: 25 }).setHTML(
            `<strong>${venue.name}</strong><br>${venue.address}`
          )
        )
        .addTo(map.current!)

      // Click handler
      marker.getElement().addEventListener('click', () => {
        onVenueSelect?.(venue)
      })
    })

    return () => {
      if (map.current) {
        map.current.remove()
      }
    }
  }, [venues, onVenueSelect])

  return <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
}
