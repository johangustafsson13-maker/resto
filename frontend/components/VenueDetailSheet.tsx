import { useEffect, useState } from 'react'
import VenueCard from './VenueCard'
import { COLORS } from '../lib/theme'
import type { Venue } from '../types'

interface VenueDetailSheetProps {
  venue: Venue | null
  shadowStatus: Record<string, boolean | null>
  onDismiss: () => void
  isMobile: boolean
}

export default function VenueDetailSheet({
  venue,
  shadowStatus,
  onDismiss,
  isMobile,
}: VenueDetailSheetProps) {
  const [isVisible, setIsVisible] = useState(false)

  // Animation state for smooth transitions
  useEffect(() => {
    setIsVisible(!!venue)
  }, [venue])

  if (!venue) return null

  const shadowed = shadowStatus[String(venue.id)] ?? null

  // ─── MOBILE: BOTTOM SHEET ──────────────────────────────────────────
  if (isMobile) {
    return (
      <>
        {/* Scrim/backdrop */}
        {isVisible && (
          <div
            onClick={onDismiss}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(10, 10, 10, 0.3)',
              zIndex: 99,
              animation: 'fadeIn 0.2s ease',
            }}
          />
        )}

        {/* Bottom sheet */}
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            backgroundColor: COLORS.surface1,
            borderTop: `2px solid ${COLORS.border}`,
            borderLeft: `2px solid ${COLORS.border}`,
            borderRight: `2px solid ${COLORS.border}`,
            maxHeight: '80vh',
            overflowY: 'auto',
            animation: isVisible ? 'slideUp 0.3s ease' : 'slideDown 0.3s ease',
          }}
        >
          {/* Close handle / header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1rem',
              borderBottom: `1px solid ${COLORS.border}`,
              position: 'sticky',
              top: 0,
              backgroundColor: COLORS.surface1,
              zIndex: 101,
            }}
          >
            <div
              style={{
                width: '40px',
                height: '3px',
                backgroundColor: COLORS.border,
                borderRadius: '2px',
                margin: '0 auto',
              }}
            />
            <button
              onClick={onDismiss}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '20px',
                cursor: 'pointer',
                padding: '0',
                color: COLORS.text2,
              }}
            >
              ✕
            </button>
          </div>

          {/* Card content */}
          <div style={{ padding: '0' }}>
            <VenueCard venue={venue} shadowed={shadowed} mode="detail" />
          </div>
        </div>

        <style>{`
          @keyframes slideUp {
            from {
              transform: translateY(100%);
            }
            to {
              transform: translateY(0);
            }
          }
          @keyframes slideDown {
            from {
              transform: translateY(0);
            }
            to {
              transform: translateY(100%);
            }
          }
          @keyframes fadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }
        `}</style>
      </>
    )
  }

  // ─── DESKTOP: ANCHORED CARD ───────────────────────────────────────
  return (
    <>
      {/* Scrim/backdrop — dismiss on click */}
      {isVisible && (
        <div
          onClick={onDismiss}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99,
          }}
        />
      )}

      {/* Anchored card — positioned bottom-right of map */}
      <div
        style={{
          position: 'fixed',
          bottom: '2.5rem',
          right: '1.25rem',
          width: '320px',
          maxHeight: '70vh',
          overflowY: 'auto',
          zIndex: 100,
          animation: isVisible ? 'popIn 0.2s ease' : 'popOut 0.2s ease',
        }}
      >
        <div
          style={{
            position: 'relative',
          }}
        >
          {/* Close button — top-right of card */}
          <button
            onClick={onDismiss}
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              background: COLORS.surface1,
              border: `1px solid ${COLORS.border}`,
              width: '32px',
              height: '32px',
              borderRadius: '0',
              cursor: 'pointer',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              color: COLORS.text2,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = COLORS.surface2
              e.currentTarget.style.borderColor = COLORS.accent
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = COLORS.surface1
              e.currentTarget.style.borderColor = COLORS.border
            }}
          >
            ✕
          </button>

          {/* Card content */}
          <VenueCard venue={venue} shadowed={shadowed} mode="detail" />
        </div>
      </div>

      <style>{`
        @keyframes popIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes popOut {
          from {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
          to {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
        }
      `}</style>
    </>
  )
}
