import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import VenueMap, { VenueMapHandle } from '../components/VenueMap'
import FilterPanel from '../components/FilterPanel'
import ResultsList from '../components/ResultsList'
import ViewToggle from '../components/ViewToggle'
import { COLORS, BREAKPOINTS } from '../lib/theme'
import type { Venue } from '../types'

// TODO(phase2): When a backend browse endpoint exists (GET /api/browse?type=...&sun=...),
// drop the empty-state gating below and allow no-query browsing. URL filter state is
// already wired — only the fetch logic needs updating.

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
      { pathname: '/search', query: { ...router.query, ...updates } },
      undefined,
      { shallow: true }
    )
  }

  // --- Derived ---
  const filteredVenues = venues.filter((venue) => {
    if (venueType === 'restaurant' && !venue.is_restaurant) return false
    if (venueType === 'terrace' && !venue.is_terrace) return false
    if (sunFilter === 'sunny' && shadowStatus[String(venue.id)] === true) return false
    if (sunFilter === 'shaded' && shadowStatus[String(venue.id)] === false) return false
    return true
  })

  const handleVenueSelect = (venue: Venue) => {
    setSelectedVenue(venue)
    mapRef.current?.flyTo(venue.lat, venue.lng)
  }

  const handleShadowStatusChange = (venueId: string, shadowed: boolean | null) => {
    setShadowStatus((prev) => ({ ...prev, [venueId]: shadowed }))
  }

  // Empty state copy when no query
  const hasActiveFilters = venueType !== 'both' || sunFilter !== 'any'
  const filterSummary = [
    venueType === 'restaurant' ? 'Restaurants' : venueType === 'terrace' ? 'Terraces' : null,
    sunFilter === 'sunny' ? 'Sunny' : sunFilter === 'shaded' ? 'Shaded' : null,
  ].filter(Boolean).join(', ')

  const emptyStateContent = (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '4rem 2rem',
      textAlign: 'center',
    }}>
      <p style={{ fontSize: '18px', fontWeight: 600, color: COLORS.text1, margin: '0 0 0.75rem' }}>
        {hasActiveFilters ? 'Add a search to see results.' : 'What are you looking for?'}
      </p>
      <p style={{ fontSize: '14px', color: COLORS.text2, maxWidth: '480px', lineHeight: '1.7', margin: 0 }}>
        {hasActiveFilters
          ? `You've selected ${filterSummary}. Search for an area or cuisine to find them.`
          : "Try 'sunny terrace in Vasastan', 'Italian dinner in Södermalm', or 'shaded café Östermalm'."}
      </p>
    </div>
  )

  // Map content (loading / error / empty / live map)
  const mapContent = (
    <div style={{ flex: 1, position: 'relative', minHeight: isMobile ? '400px' : 'auto' }}>
      {!searchQuery ? (
        emptyStateContent
      ) : loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: COLORS.text2 }}>
          Searching…
        </div>
      ) : error ? (
        <div style={{ margin: '1.5rem', padding: '1rem', backgroundColor: COLORS.surface2, border: `1px solid ${COLORS.accent}`, color: COLORS.text1, fontSize: '13px' }}>
          {error}
        </div>
      ) : filteredVenues.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: COLORS.text2 }}>
          No venues found
        </div>
      ) : (
        <VenueMap
          ref={mapRef}
          venues={filteredVenues}
          selectedVenue={selectedVenue || undefined}
          onVenueSelect={handleVenueSelect}
          onShadowStatusChange={handleShadowStatusChange}
        />
      )}
    </div>
  )

  return (
    <div style={{
      backgroundColor: COLORS.bg,
      color: COLORS.text1,
      minHeight: '100vh',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif',
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
          {/* Back to landing */}
          <button
            onClick={() => router.push('/')}
            style={{
              backgroundColor: 'transparent',
              color: COLORS.accent,
              border: 'none',
              padding: 0,
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            ← RESTO
          </button>

          {/* Inline search refinement — no new component, ~15 lines */}
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
            !searchQuery ? emptyStateContent : (
              <ResultsList
                venues={filteredVenues}
                selectedVenue={selectedVenue}
                shadowStatus={shadowStatus}
                onVenueSelect={handleVenueSelect}
                loading={loading}
                error={error}
              />
            )
          )}
        </div>
      </div>
    </div>
  )
}
