import { COLORS, FONTS } from '../lib/theme'

type VenueType = 'restaurant' | 'terrace' | 'both'
type SunFilter = 'any' | 'sunny' | 'shaded'

interface FilterPanelProps {
  type: VenueType
  sun: SunFilter
  onTypeChange: (type: VenueType) => void
  onSunChange: (sun: SunFilter) => void
}

const TYPE_OPTIONS: { label: string; value: VenueType }[] = [
  { label: 'Restaurant', value: 'restaurant' },
  { label: 'Terrace', value: 'terrace' },
  { label: 'Both', value: 'both' },
]

const SUN_OPTIONS: { label: string; value: SunFilter }[] = [
  { label: 'Any', value: 'any' },
  { label: 'Sunny', value: 'sunny' },
  { label: 'Shaded', value: 'shaded' },
]

const chipBase: React.CSSProperties = {
  padding: '0.25rem 0.625rem',
  fontSize: '11px',
  fontFamily: FONTS.body,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  borderRadius: 0,
  whiteSpace: 'nowrap',
  transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
}

export default function FilterPanel({ type, sun, onTypeChange, onSunChange }: FilterPanelProps) {
  return (
    <div style={{
      padding: '0.5rem 0.75rem',
      borderBottom: `1px solid ${COLORS.border}`,
      display: 'flex',
      flexDirection: 'column',
      gap: '0.375rem',
      backgroundColor: COLORS.surface1,
    }}>
      {/* Type row */}
      <div style={{ display: 'flex', gap: '0.375rem' }}>
        {TYPE_OPTIONS.map((opt) => {
          const active = type === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => onTypeChange(opt.value)}
              style={{
                ...chipBase,
                backgroundColor: active ? COLORS.accent : 'transparent',
                color: active ? '#ffffff' : COLORS.text3,
                border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Sun row */}
      <div style={{ display: 'flex', gap: '0.375rem' }}>
        {SUN_OPTIONS.map((opt) => {
          const active = sun === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => onSunChange(opt.value)}
              style={{
                ...chipBase,
                backgroundColor: active ? COLORS.accent : 'transparent',
                color: active ? '#ffffff' : COLORS.text3,
                border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
