import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/router'
import VenueMap, { VenueMapHandle } from '../components/VenueMap'
import TimeScrubber from '../components/TimeScrubber'
import ResultsList from '../components/ResultsList'
import VenueDetailSheet from '../components/VenueDetailSheet'
import FilterPanel from '../components/FilterPanel'
import { getToken, isAuthenticated } from '../lib/auth'
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

  // --- Component state ---
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)
  const [shadowStatus, setShadowStatus] = useState<Record<string, boolean | null>>({})
  const [isMobile, setIsMobile] = useState(false)
  const [headerQuery, setHeaderQuery] = useState(searchQuery)
  const [headerInputFocused, setHeaderInputFocused] = useState(false)
  const [scrubbedTime, setScrubbedTime] = useState<Date | undefined>(undefined)

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

  // Restore scrubbed time from ?t= URL param — shadows load at the URL time, not real time
  useEffect(() => {
    if (!router.isReady) return
    const tp = router.query.t
    if (typeof tp === 'string') {
      const parsed = new Date(tp)
      if (!isNaN(parsed.getTime())) setScrubbedTime(parsed)
    }
  }, [router.isReady]) // eslint-disable-line react-hooks/exhaustive-deps

  // Browse fetch — runs on mount and when type filter changes, but only when no search query
  useEffect(() => {
    if (!router.isReady || searchQuery) return
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (venueType !== 'both') params.set('type', venueType)
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/browse?${params}`)
        if (!res.ok) throw new Error('Browse failed')
        const data = await res.json()
        setVenues(data.venues || [])
        setSelectedVenue(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load venues')
        setVenues([])
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [router.isReady, searchQuery, venueType]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch when query changes; no-query = hand off to browse effect above
  useEffect(() => {
    if (!router.isReady) return
    if (!searchQuery) {
      setSelectedVenue(null)
      setShadowStatus({})
      return
    }
    const run = async () => {
      if (!isAuthenticated()) {
        const next = encodeURIComponent(`/?q=${encodeURIComponent(searchQuery)}`)
        router.push(`/auth/login?next=${next}`)
        return
      }

      setLoading(true)
      setError(null)
      try {
        const token = getToken()
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ query: searchQuery }),
        })
        if (res.status === 401) {
          const next = encodeURIComponent(`/?q=${encodeURIComponent(searchQuery)}`)
          router.push(`/auth/login?next=${next}`)
          return
        }
        if (!res.ok) throw new Error('Search failed')
        const data = await res.json()
        setVenues(data.venues || [])
        setSelectedVenue(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed')
        setVenues([])
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [router.isReady, searchQuery]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- URL writer: shallow push so filter changes don't re-trigger fetch ---
  const updateQuery = (updates: Partial<Record<'q' | 'type' | 'sun' | 'view', string>>) => {
    router.push(
      { pathname: '/', query: { ...router.query, ...updates } },
      undefined,
      { shallow: true }
    )
  }

  // useMemo: stable reference prevents VenueMap from re-firing markers on every render
  const filteredVenues = useMemo(() => venues.filter((venue) => {
    if (venueType === 'restaurant' && !venue.is_restaurant) return false
    if (venueType === 'terrace' && !venue.is_terrace) return false
    if (sunFilter === 'sunny' && shadowStatus[String(venue.id)] === true) return false
    if (sunFilter === 'shaded' && shadowStatus[String(venue.id)] === false) return false
    return true
  }), [venues, venueType, sunFilter, shadowStatus])

  // useCallback: stable refs prevent VenueMap's dependency array from firing on every render
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

  // ─── Shared style constants ─────────────────────────────────────────────────
  const edge = isMobile ? '0.75rem' : '1.25rem'

  return (
    <div style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      backgroundColor: COLORS.bg,
      fontFamily: FONTS.body,
    }}>

      {/* ── Map — full bleed, z-index 0 ─────────────────────────────────── */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <VenueMap
          ref={mapRef}
          venues={filteredVenues}
          selectedVenue={selectedVenue || undefined}
          onVenueSelect={handleVenueSelect}
          onShadowStatusChange={handleShadowStatusChange}
          scrubbedTime={scrubbedTime}
        />
        {loading && (
          <div style={{
            position: 'absolute',
            top: '3.75rem',
            right: edge,
            backgroundColor: COLORS.surface1,
            border: `1px solid ${COLORS.border}`,
            padding: '0.25rem 0.625rem',
            fontSize: '11px',
            fontFamily: FONTS.body,
            color: COLORS.text2,
            zIndex: 15,
            pointerEvents: 'none',
          }}>
            Searching…
          </div>
        )}
        {error && (
          <div style={{
            position: 'absolute',
            top: '3.75rem',
            left: edge,
            right: edge,
            backgroundColor: COLORS.surface1,
            border: `2px solid ${COLORS.accent}`,
            padding: '0.75rem 1rem',
            fontSize: '13px',
            fontFamily: FONTS.body,
            color: COLORS.text1,
            zIndex: 15,
          }}>
            {error}
          </div>
        )}
      </div>

      {/* ── RESTO wordmark + tagline — top-left, layered on the map ─────── */}
      {/*
        Wordmark uses clamp(8rem, 13vw, 16rem):
          390px  → 8rem  (128px) — Departure Mono at this size spans ~390-420px,
                                   cropping the O at the viewport right edge ✓
          1440px → 13vw  (~187px) — extends ~560px from left edge into map
          2560px → capped at 16rem (256px)
        pointerEvents: none — map receives drag/scroll events through the wordmark area.
      */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: 10,
        pointerEvents: 'none',
        userSelect: 'none',
      }}>
        <h1 style={{
          fontFamily: FONTS.display,
          fontSize: 'clamp(8rem, 13vw, 16rem)',
          lineHeight: 1,
          color: COLORS.text1,
          margin: 0,
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
        }}>
          RESTO
        </h1>
        <p style={{
          fontFamily: FONTS.body,
          fontSize: isMobile ? '12px' : '14px',
          fontWeight: 400,
          color: COLORS.text1,
          margin: '0.375rem 0 0',
          paddingLeft: '0.25rem',
          whiteSpace: 'nowrap',
          lineHeight: 1.4,
        }}>
          The city shifts. The shadows move.
        </p>
      </div>

      {/* ── Search input — top-right ─────────────────────────────────────── */}
      {/*
        Desktop: input + 44px red submit button.
        Mobile:  same layout — button is real (44×44px meets Apple's tap target minimum).
                 Arrow is the only red element in the UI.
      */}
      <div style={{
        position: 'absolute',
        top: edge,
        right: edge,
        zIndex: 30,
      }}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (headerQuery.trim()) updateQuery({ q: headerQuery.trim() })
          }}
          style={{ display: 'flex', alignItems: 'stretch' }}
        >
          <input
            type="text"
            value={headerQuery}
            onChange={(e) => setHeaderQuery(e.target.value)}
            onFocus={() => setHeaderInputFocused(true)}
            onBlur={() => setHeaderInputFocused(false)}
            placeholder={isMobile ? 'search' : 'search the city'}
            style={{
              width: isMobile ? '130px' : '200px',
              height: '44px',
              padding: '0 0.75rem',
              fontFamily: FONTS.body,
              fontSize: '13px',
              color: COLORS.text1,
              backgroundColor: COLORS.surface1,
              border: `2px solid ${headerInputFocused ? COLORS.accent : COLORS.border}`,
              borderRight: 'none',
              borderRadius: 0,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <button
            type="submit"
            style={{
              width: '44px',
              height: '44px',
              backgroundColor: COLORS.accent,
              color: '#ffffff',
              border: `2px solid ${COLORS.border}`,
              borderLeft: `2px solid ${COLORS.accent}`,
              borderRadius: 0,
              cursor: 'pointer',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#b31f10' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = COLORS.accent }}
          >
            →
          </button>
        </form>
      </div>

      {/* ── Venue count — bottom-left when search active ─────────────────── */}
      {!loading && filteredVenues.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: '2.5rem',
          left: edge,
          zIndex: 10,
          pointerEvents: 'none',
        }}>
          <span style={{
            fontFamily: FONTS.display,
            fontSize: '13px',
            color: COLORS.text1,
          }}>
            {filteredVenues.length}
          </span>
          <span style={{
            fontFamily: FONTS.body,
            fontSize: '11px',
            color: COLORS.text2,
            marginLeft: '0.3rem',
          }}>
            {filteredVenues.length !== 1 ? 'venues' : 'venue'}
          </span>
        </div>
      )}

      {/* ── A7: TimeScrubber wired to live shadow recalculation ─────────── */}
      {/* Sunset info now lives in scrubber's right-edge label — standalone caption removed */}
      <TimeScrubber
        isMobile={isMobile}
        onTimeChange={setScrubbedTime}
      />

      {/* ── Pass B Session 2: ResultsList + VenueDetailSheet ──────────────── */}
      {/* Desktop: right-side panel. Mobile: full-width below map.
          Detail sheet: bottom sheet (mobile) / anchored card (desktop) */}

      {filteredVenues.length > 0 && (
        <>
          {/* ResultsList — right panel on desktop, full-width on mobile */}
          <div
            style={{
              position: 'absolute',
              top: isMobile ? undefined : edge,
              bottom: isMobile ? '0' : undefined,
              right: edge,
              left: isMobile ? edge : undefined,
              width: isMobile ? 'auto' : '320px',
              height: isMobile ? '40vh' : 'auto',
              maxHeight: isMobile ? '40vh' : '70vh',
              backgroundColor: COLORS.surface1,
              border: `2px solid ${COLORS.border}`,
              borderRadius: '0',
              zIndex: 20,
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                padding: '0.75rem 1rem',
                borderBottom: `1px solid ${COLORS.border}`,
                fontSize: '12px',
                color: COLORS.text2,
                fontWeight: 600,
                backgroundColor: COLORS.surface2,
              }}
            >
              {filteredVenues.length} {filteredVenues.length === 1 ? 'venue' : 'venues'}
            </div>
            <FilterPanel
              type={venueType}
              sun={sunFilter}
              onTypeChange={(t) => updateQuery({ type: t })}
              onSunChange={(s) => updateQuery({ sun: s })}
            />
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              <ResultsList
                venues={filteredVenues}
                selectedVenue={selectedVenue}
                shadowStatus={shadowStatus}
                onVenueSelect={handleVenueSelect}
                loading={loading}
                error={null}
              />
            </div>
          </div>

          {/* Detail Sheet — bottom sheet on mobile, anchored card on desktop */}
          <VenueDetailSheet
            venue={selectedVenue ?? null}
            shadowStatus={shadowStatus}
            onDismiss={() => setSelectedVenue(null)}
            isMobile={isMobile}
          />
        </>
      )}


    </div>
  )
}
