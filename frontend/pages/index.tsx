import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/router'
import VenueMap, { VenueMapHandle } from '../components/VenueMap'
import FilterPanel from '../components/FilterPanel'
import ResultsList from '../components/ResultsList'
import ViewToggle from '../components/ViewToggle'
import { COLORS, FONTS, BREAKPOINTS } from '../lib/theme'
import type { Venue } from '../types'

// TODO(phase2): When a backend browse endpoint exists (GET /api/browse?type=...&sun=...),
// populate the map on load without requiring a search query. URL filter state is already
// wired — only the fetch logic needs updating. See PHASE_2_DESIGN_QUESTIONS.md item 2.

export default function SearchPage() {
  const router = useRouter()
  const mapRef = useRef<VenueMapHandle>(null)

  // --- URL-derived state (filter values live in URL, survive back/forward) ---
  const searchQuery = typeof router.query.q === 'string' ? router.query.q : ''
  const venueType = (['restaurant', 'terrace', 'both'].includes(router.query.type as string)
    ? router.query.type as 'restaurant' | 'terrace' | 'both'
    : 'both')
  const sunFilter = (['any', 'sunny', 'shaded'].includes(router.query.sun as string)
    ? router.query.sun as 'any' | 'sunny' | 'shaded'
    : 'any')
  const viewMode = router.query.view === 'list' ? 'list' : 'map' as 'map' | 'list'

  // --- Component state (ephemeral, not URL) ---
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)
  const [shadowStatus, setShadowStatus] = useState<Record<string, boolean | null>>({})
  const [isMobile, setIsMobile] = useState(false)
  const [headerQuery, setHeaderQuery] = useState(searchQuery)
  const [headerInputFocused, setHeaderInputFocused] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < BREAKPOINTS.mobile)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Keep header input in sync with URL (e.g. back/forward navigation)
  useEffect(() => {
    setHeaderQuery(searchQuery)
  }, [searchQuery])

  // Fetch when query changes; no-query = clear results, no API call
  useEffect(() => {
    if (!router.isReady) return
    if (!searchQuery) {
      setVenues([])
      setSelectedVenue(null)
      setShadowStatus({})
      return
    }
    const fetchResults = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: searchQuery }),
        })
        if (!response.ok) throw new Error('Search failed')
        const data = await response.json()
        setVenues(data.venues || [])
        setSelectedVenue(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed')
        setVenues([])
      } finally {
        setLoading(false)
      }
    }
    fetchResults()
  }, [router.isReady, searchQuery])

  // --- URL writer: shallow push so filter changes don't re-trigger fetch ---
  const updateQuery = (updates: Partial<Record<'q' | 'type' | 'sun' | 'view', string>>) => {
    router.push(
      { pathname: '/', query: { ...router.query, ...updates } },
      undefined,
      { shallow: true }
    )
  }

  // --- Derived ---
  // useMemo: filteredVenues must have a stable reference. Without it, .filter() returns
  // a new array every render, which changes the `venues` prop to VenueMap on every
  // render, re-firing the markers/fitBounds effect even when data hasn't changed.
  const filteredVenues = useMemo(() => venues.filter((venue) => {
    if (venueType === 'restaurant' && !venue.is_restaurant) return false
    if (venueType === 'terrace' && !venue.is_terrace) return false
    if (sunFilter === 'sunny' && shadowStatus[String(venue.id)] === true) return false
    if (sunFilter === 'shaded' && shadowStatus[String(venue.id)] === false) return false
    return true
  }), [venues, venueType, sunFilter, shadowStatus])

  // useCallback: stable refs so VenueMap's dependency array doesn't see changes
  // on every parent render, which would re-fire addMarkers → fitBounds → zoom reset.
  const handleVenueSelect = useCallback((venue: Venue) => {
    setSelectedVenue(venue)
    mapRef.current?.flyTo(venue.lat, venue.lng)
  }, [])

  const handleShadowStatusChange = useCallback((venueId: string, shadowed: boolean | null) => {
    setShadowStatus((prev) => {
      if (prev[venueId] === shadowed) return prev
      return { ...prev, [venueId]: shadowed }
    })
  }, [])

  // Map is always visible — loading and errors surface as overlays, not map replacements.
  // emptyStateContent removed in A4b: map IS the content, even with no venues loaded.
  const mapContent = (
    <div style={{ flex: 1, position: 'relative', minHeight: isMobile ? '400px' : 'auto' }}>
      <VenueMap
        ref={mapRef}
        venues={filteredVenues}
        selectedVenue={selectedVenue || undefined}
        onVenueSelect={handleVenueSelect}
        onShadowStatusChange={handleShadowStatusChange}
      />
      {loading && (
        <div style={{
          position: 'absolute', top: '0.75rem', right: '3rem',
          backgroundColor: COLORS.surface1, border: `1px solid ${COLORS.border}`,
          padding: '0.375rem 0.75rem', fontSize: '12px', color: COLORS.text2,
        }}>
          Searching…
        </div>
      )}
      {error && (
        <div style={{
          position: 'absolute', top: '0.75rem', left: '0.75rem', right: '0.75rem',
          backgroundColor: COLORS.surface1, border: `1px solid ${COLORS.accent}`,
          padding: '0.75rem 1rem', fontSize: '13px', color: COLORS.text1,
        }}>
          {error}
        </div>
      )}
    </div>
  )

  return (
    <div style={{
      backgroundColor: COLORS.bg,
      color: COLORS.text1,
      minHeight: '100vh',
      fontFamily: FONTS.body,
      display: 'flex',
      flexDirection: 'column',
    }}>

      {/* ── Header: back link + search refinement input + result count ─────── */}
      <div style={{
        backgroundColor: COLORS.surface1,
        borderBottom: `1px solid ${COLORS.border}`,
        flexShrink: 0,
      }}>
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: isMobile ? '0.875rem 1rem' : '0.875rem 2rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1.25rem',
        }}>
          {/* Inline search refinement — header stays full-width in A4, demoted to corner in A5 */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (headerQuery.trim()) updateQuery({ q: headerQuery.trim() })
            }}
            style={{ flex: 1 }}
          >
            <input
              type="text"
              value={headerQuery}
              onChange={(e) => setHeaderQuery(e.target.value)}
              onFocus={() => setHeaderInputFocused(true)}
              onBlur={() => setHeaderInputFocused(false)}
              placeholder="Search restaurants, terraces, neighborhoods..."
              style={{
                width: '100%',
                padding: '0.625rem 0.875rem',
                backgroundColor: COLORS.surface2,
                color: COLORS.text1,
                border: `1px solid ${headerInputFocused ? COLORS.accent : COLORS.border}`,
                fontSize: '14px',
                outline: 'none',
                borderRadius: '0',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s ease',
              }}
            />
          </form>
        </div>

        {/* Result count line */}
        {searchQuery && !loading && (
          <div style={{ maxWidth: '1400px', margin: '0 auto', padding: isMobile ? '0 1rem 0.75rem' : '0 2rem 0.75rem' }}>
            <p style={{ fontSize: '13px', color: COLORS.text2, margin: 0 }}>
              <span style={{ color: COLORS.accent, fontWeight: 600 }}>{filteredVenues.length}</span>
              {' venue' + (filteredVenues.length !== 1 ? 's' : '') + ' for '}
              <span style={{ color: COLORS.text1, fontWeight: 500 }}>"{searchQuery}"</span>
              {filteredVenues.length < venues.length && venues.length > 0
                ? <span style={{ color: COLORS.text3 }}> ({venues.length} total, filtered)</span>
                : null}
            </p>
          </div>
        )}
      </div>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        flex: 1,
        maxWidth: '1400px',
        width: '100%',
        margin: '0 auto',
        minHeight: 0,
      }}>

        {/* FilterPanel — desktop: 220px sidebar with borderRight; mobile: full-width accordion */}
        <FilterPanel
          type={venueType}
          sun={sunFilter}
          onTypeChange={(t) => updateQuery({ type: t })}
          onSunChange={(s) => updateQuery({ sun: s })}
          resultCount={filteredVenues.length}
          isMobile={isMobile}
        />

        {/* Content column: ViewToggle strip + Map or List */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: isMobile ? '600px' : 0 }}>

          {/* ViewToggle strip */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-start',
            padding: '0.75rem 1rem',
            borderBottom: `1px solid ${COLORS.border}`,
            flexShrink: 0,
          }}>
            <div style={{ width: '180px' }}>
              <ViewToggle value={viewMode} onChange={(v) => updateQuery({ view: v })} />
            </div>
          </div>

          {/* Map or List */}
          {viewMode === 'map' ? mapContent : (
            <ResultsList
              venues={filteredVenues}
              selectedVenue={selectedVenue}
              shadowStatus={shadowStatus}
              onVenueSelect={handleVenueSelect}
              loading={loading}
              error={error}
            />
          )}
        </div>
      </div>
    </div>
  )
}
