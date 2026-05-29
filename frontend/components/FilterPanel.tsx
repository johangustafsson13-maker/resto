import { useState } from 'react'
import TypeSelector from './TypeSelector'
import { COLORS } from '../lib/theme'

type SunFilter = 'any' | 'sunny' | 'shaded'

interface FilterPanelProps {
  type: 'restaurant' | 'terrace' | 'both'
  sun: SunFilter
  onTypeChange: (type: 'restaurant' | 'terrace' | 'both') => void
  onSunChange: (sun: SunFilter) => void
  resultCount: number
  isMobile: boolean
}

const SUN_OPTIONS: { label: string; value: SunFilter }[] = [
  { label: 'Any', value: 'any' },
  { label: '☀️ Sunny', value: 'sunny' },
  { label: '🌳 Shaded', value: 'shaded' },
]

const sectionLabel: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  color: COLORS.text3,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  margin: '0 0 0.75rem 0',
}

function FilterContent({
  type, sun, onTypeChange, onSunChange, resultCount,
}: Omit<FilterPanelProps, 'isMobile'>) {
  return (
    <>
      <p style={{ fontSize: '12px', color: COLORS.text3, margin: '0 0 1.5rem 0' }}>
        {resultCount} {resultCount === 1 ? 'venue' : 'venues'}
      </p>

      {/* Venue type — uses proven TypeSelector */}
      <div style={{ marginBottom: '1.5rem' }}>
        <p style={sectionLabel}>Type</p>
        <TypeSelector value={type} onChange={onTypeChange} />
      </div>

      {/* Sun status — ghost amber vocabulary: solid = active, outline = alternative */}
      <div>
        <p style={sectionLabel}>Sunlight</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {SUN_OPTIONS.map((opt) => {
            const active = sun === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => onSunChange(opt.value)}
                style={{
                  backgroundColor: active ? COLORS.accent : 'transparent',
                  color: active ? COLORS.bg : COLORS.accent,
                  border: `1px solid ${COLORS.accent}`,
                  padding: '0.75rem 1rem',
                  borderRadius: '0',
                  fontSize: '13px',
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease, color 0.2s ease',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

export default function FilterPanel({
  type, sun, onTypeChange, onSunChange, resultCount, isMobile,
}: FilterPanelProps) {
  // Accordion open/close — UI state only; collapses on page refresh
  const [open, setOpen] = useState(false)

  if (isMobile) {
    return (
      <div style={{ borderBottom: `1px solid ${COLORS.border}` }}>
        {/* Accordion trigger */}
        <button
          onClick={() => setOpen((prev) => !prev)}
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.875rem 1rem',
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600,
            color: COLORS.text2,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          <span>Filters</span>
          <span style={{ fontSize: '10px' }}>{open ? '▲' : '▼'}</span>
        </button>

        {/* Accordion body — expands inline, pushes content down */}
        {open && (
          <div style={{
            padding: '0 1rem 1.5rem',
            borderTop: `1px solid ${COLORS.border}`,
          }}>
            <div style={{ paddingTop: '1rem' }}>
              <FilterContent
                type={type}
                sun={sun}
                onTypeChange={onTypeChange}
                onSunChange={onSunChange}
                resultCount={resultCount}
              />
            </div>
          </div>
        )}
      </div>
    )
  }

  // Desktop: always-visible sidebar
  return (
    <div style={{
      width: '220px',
      flexShrink: 0,
      borderRight: `1px solid ${COLORS.border}`,
      padding: '1.5rem',
    }}>
      <p style={{
        fontSize: '11px',
        fontWeight: 600,
        color: COLORS.text3,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        margin: '0 0 1.5rem 0',
      }}>
        Filters
      </p>
      <FilterContent
        type={type}
        sun={sun}
        onTypeChange={onTypeChange}
        onSunChange={onSunChange}
        resultCount={resultCount}
      />
    </div>
  )
}
