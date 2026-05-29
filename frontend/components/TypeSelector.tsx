import { useState } from 'react'
import { COLORS } from '../lib/theme'

export type VenueType = 'restaurant' | 'terrace' | 'both'

interface TypeSelectorProps {
  value: VenueType
  onChange: (type: VenueType) => void
}

interface ButtonOption {
  label: string
  value: VenueType
  icon: string
}

export default function TypeSelector({ value, onChange }: TypeSelectorProps) {
  const [hoveredValue, setHoveredValue] = useState<VenueType | null>(null)
  const buttons: ButtonOption[] = [
    { label: 'Restaurants', value: 'restaurant', icon: '🍽️' },
    { label: 'Terraces', value: 'terrace', icon: '☀️' },
    { label: 'All Venues', value: 'both', icon: '✦' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {buttons.map((btn) => (
        <button
          key={btn.value}
          onClick={() => onChange(btn.value)}
          onMouseEnter={() => setHoveredValue(btn.value)}
          onMouseLeave={() => setHoveredValue(null)}
          style={{
            backgroundColor: value === btn.value
              ? COLORS.accent
              : hoveredValue === btn.value
              ? COLORS.surface2
              : 'transparent',
            color: value === btn.value
              ? COLORS.bg
              : COLORS.text2,
            border: `1px solid ${value === btn.value
              ? COLORS.accent
              : hoveredValue === btn.value
              ? COLORS.border
              : COLORS.border}`,
            padding: '0.75rem 1rem',
            borderRadius: '0',
            fontSize: '13px',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'capitalize',
            cursor: 'pointer',
            transition: 'background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease',
          }}
        >
          <span style={{ marginRight: '0.5rem', fontSize: '14px' }}>{btn.icon}</span>
          {btn.label}
        </button>
      ))}
    </div>
  )
}
