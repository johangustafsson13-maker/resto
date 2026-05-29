import { useState } from 'react'
import { COLORS } from '../lib/theme'

interface SearchBoxProps {
  onSearch: (query: string) => void
  loading?: boolean
}

export default function SearchBox({ onSearch, loading = false }: SearchBoxProps) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [clearHovered, setClearHovered] = useState(false)
  const [clearBtnHovered, setClearBtnHovered] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      onSearch(query)
    }
  }

  const canSubmit = !loading && !!query.trim()

  return (
    <form onSubmit={handleSubmit} style={{ width: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Input field */}
        <div
          style={{
            position: 'relative',
            borderRadius: '0',
            border: `1px solid ${focused ? COLORS.accent : COLORS.border}`,
            backgroundColor: COLORS.surface2,
            transition: 'border-color 0.2s ease',
          }}
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search restaurants, neighborhoods..."
            style={{
              width: '100%',
              padding: '1rem',
              backgroundColor: 'transparent',
              color: COLORS.text1,
              border: 'none',
              outline: 'none',
              fontSize: '14px',
              fontWeight: 300,
            }}
          />

          {/* Inline clear button */}
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              onMouseEnter={() => setClearHovered(true)}
              onMouseLeave={() => setClearHovered(false)}
              style={{
                position: 'absolute',
                right: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: clearHovered ? COLORS.accent : COLORS.text2,
                cursor: 'pointer',
                fontSize: '18px',
                transition: 'color 0.2s ease',
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              flex: 1,
              padding: '0.875rem 1rem',
              backgroundColor: canSubmit ? COLORS.accent : COLORS.surface2,
              color: canSubmit ? COLORS.bg : COLORS.text3,
              border: 'none',
              borderRadius: '0',
              fontSize: '13px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              transition: 'background-color 0.2s ease',
            }}
          >
            {loading ? '⟳ Searching...' : 'Search'}
          </button>

          {query && !loading && (
            <button
              type="button"
              onClick={() => setQuery('')}
              onMouseEnter={() => setClearBtnHovered(true)}
              onMouseLeave={() => setClearBtnHovered(false)}
              style={{
                padding: '0.875rem 1rem',
                backgroundColor: clearBtnHovered ? COLORS.surface2 : 'transparent',
                color: COLORS.accent,
                border: `1px solid ${COLORS.accent}`,
                borderRadius: '0',
                fontSize: '13px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
              }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Hint text */}
        <p style={{ fontSize: '12px', color: COLORS.text3, textAlign: 'left', margin: 0, fontWeight: 300 }}>
          Try: "cozy coffee" • "sunny terrace" • "Södermalm"
        </p>
      </div>
    </form>
  )
}
