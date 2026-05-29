import { COLORS } from '../lib/theme'

interface ViewToggleProps {
  value: 'map' | 'list'
  onChange: (view: 'map' | 'list') => void
}

const OPTIONS: { label: string; value: 'map' | 'list' }[] = [
  { label: 'Map', value: 'map' },
  { label: 'List', value: 'list' },
]

export default function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      {OPTIONS.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1,
              padding: '0.75rem',
              backgroundColor: active ? COLORS.accent : 'transparent',
              color: active ? COLORS.bg : COLORS.accent,
              border: `1px solid ${COLORS.accent}`,
              borderRadius: '0',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background-color 0.2s ease, color 0.2s ease',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
