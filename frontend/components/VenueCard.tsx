import { useMemo, useState } from 'react'
import { getSunScore } from '../lib/sunScore'
import { COLORS } from '../lib/theme'
import type { Venue } from '../types'

interface VenueCardProps {
  venue: Venue
  selected?: boolean
  onClick?: () => void
  shadowed?: boolean | null
}

export default function VenueCard({ venue, selected = false, onClick, shadowed = null }: VenueCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const sunScore = useMemo(
    () => (venue.lat != null && venue.lng != null)
      ? getSunScore(venue.lat, venue.lng)
      : null,
    [venue.lat, venue.lng]
  )

  const venueTypeLabel = venue.is_terrace && venue.is_restaurant
    ? 'DUAL'
    : venue.is_terrace
    ? 'TERRACE'
    : 'RESTAURANT'

  const borderColor = selected
    ? COLORS.accent
    : isHovered
    ? COLORS.accent
    : COLORS.border

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        padding: '1.5rem',
        borderRadius: '0',
        backgroundColor: COLORS.surface1,
        border: `1px solid ${borderColor}`,
        cursor: 'pointer',
        transition: 'border-color 0.2s ease',
      }}
    >
      {/* Name and type */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: COLORS.text1 }}>
          {venue.name}
        </h3>
        <span style={{
          fontSize: '11px',
          fontWeight: 600,
          padding: '0.25rem 0.5rem',
          backgroundColor: 'transparent',
          color: COLORS.accent,
          borderRadius: '0',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          marginLeft: '0.5rem',
          border: `1px solid ${COLORS.accent}`,
        }}>
          {venueTypeLabel}
        </span>
      </div>

      {/* Address */}
      <p style={{ fontSize: '13px', color: COLORS.text2, margin: '0 0 0.75rem 0', lineHeight: '1.4' }}>
        {venue.address}
      </p>

      {/* Sun status */}
      {(venue.is_terrace || venue.outdoor_seating) && shadowed !== null && (
        <div style={{ marginBottom: '0.75rem' }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.4rem 0.7rem',
            backgroundColor: COLORS.surface2,
            color: shadowed ? COLORS.shaded : COLORS.sunny,
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: '0',
            border: `1px solid ${COLORS.border}`,
          }}>
            {shadowed ? '🌳 Shaded' : '☀️ Sunny'}
          </span>
        </div>
      )}

      {/* Seating tags */}
      {(venue.outdoor_seating || venue.indoor_seating) && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          {venue.outdoor_seating && (
            <span style={{
              fontSize: '12px',
              padding: '0.3rem 0.6rem',
              backgroundColor: COLORS.surface2,
              color: COLORS.text1,
              borderRadius: '0',
              border: `1px solid ${COLORS.border}`,
            }}>
              🪑 Outdoor
            </span>
          )}
          {venue.indoor_seating && (
            <span style={{
              fontSize: '12px',
              padding: '0.3rem 0.6rem',
              backgroundColor: COLORS.surface2,
              color: COLORS.text2,
              borderRadius: '0',
              border: `1px solid ${COLORS.border}`,
            }}>
              🏠 Indoor
            </span>
          )}
        </div>
      )}

      {/* Rating & price */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem', fontSize: '13px', color: COLORS.text1 }}>
        {venue.google_rating && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ color: COLORS.accent }}>★</span>
            <span style={{ fontWeight: 600 }}>{venue.google_rating.toFixed(1)}</span>
          </div>
        )}
        {venue.is_restaurant && venue.price_range && (
          <span style={{ color: COLORS.text3 }}>
            {'●'.repeat(venue.price_range)}
          </span>
        )}
      </div>

      {/* Cuisines */}
      {venue.cuisine_tags && venue.cuisine_tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
          {venue.cuisine_tags.slice(0, 2).map((tag) => (
            <span key={tag} style={{
              fontSize: '12px',
              padding: '0.25rem 0.5rem',
              backgroundColor: COLORS.surface2,
              color: COLORS.text2,
              borderRadius: '0',
              border: `1px solid ${COLORS.border}`,
            }}>
              {tag}
            </span>
          ))}
          {venue.cuisine_tags.length > 2 && (
            <span style={{
              fontSize: '12px',
              padding: '0.25rem 0.5rem',
              color: COLORS.text3,
            }}>
              +{venue.cuisine_tags.length - 2}
            </span>
          )}
        </div>
      )}

      {/* Website link */}
      {venue.website && (
        <div style={{ paddingTop: '0.75rem', borderTop: `1px solid ${COLORS.border}`, marginTop: '0.75rem' }}>
          <a
            href={venue.website}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: COLORS.accent,
              textDecoration: 'none',
              transition: 'opacity 0.2s ease',
              cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            View website →
          </a>
        </div>
      )}
    </div>
  )
}
