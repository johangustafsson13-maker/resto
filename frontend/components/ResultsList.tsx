import VenueCard from './VenueCard'
import { COLORS } from '../lib/theme'
import type { Venue } from '../types'

interface ResultsListProps {
  venues: Venue[]
  selectedVenue: Venue | null
  shadowStatus: Record<string, boolean | null>
  onVenueSelect: (venue: Venue) => void
  loading: boolean
  error: string | null
}

const centeredMessage: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '3rem 1.5rem',
  fontSize: '14px',
  color: COLORS.text2,
}

export default function ResultsList({
  venues,
  selectedVenue,
  shadowStatus,
  onVenueSelect,
  loading,
  error,
}: ResultsListProps) {
  if (loading) {
    return <div style={centeredMessage}>Searching…</div>
  }

  if (error) {
    return (
      <div style={{
        margin: '1.5rem',
        padding: '1rem',
        backgroundColor: COLORS.surface2,
        border: `1px solid ${COLORS.accent}`,
        color: COLORS.text1,
        fontSize: '13px',
      }}>
        {error}
      </div>
    )
  }

  if (venues.length === 0) {
    return <div style={centeredMessage}>No venues found</div>
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      {venues.map((venue, i) => (
        <div
          key={venue.id}
          style={{
            borderBottom: i < venues.length - 1 ? `1px solid ${COLORS.border}` : 'none',
          }}
        >
          <VenueCard
            venue={venue}
            selected={selectedVenue?.id === venue.id}
            onClick={() => onVenueSelect(venue)}
            shadowed={shadowStatus[String(venue.id)] ?? null}
          />
        </div>
      ))}
    </div>
  )
}
