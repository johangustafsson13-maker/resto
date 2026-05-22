import { useState, useRef, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import SearchBox from '../components/SearchBox'
import VenueMap from '../components/VenueMap'
import VenueCard from '../components/VenueCard'
import {
  getToken,
  getUser,
  clearToken,
  updateSearchesRemaining,
  type AuthUser,
} from '../lib/auth'
import type { Venue } from '../types'

export default function Home() {
  const router = useRouter()

  // Auth state — only populated client-side after hydration
  const [mounted, setMounted]       = useState(false)
  const [user, setUser]             = useState<AuthUser | null>(null)

  // Search state
  const [venues, setVenues]         = useState<Venue[]>([])
  const [loading, setLoading]       = useState(false)
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)
  const [searchError, setSearchError]     = useState('')
  const mapContainer = useRef<HTMLDivElement>(null)

  // Hydrate auth state from localStorage once on mount
  useEffect(() => {
    setMounted(true)
    setUser(getUser())
  }, [])

  // Auto-clear search errors after 5 s
  useEffect(() => {
    if (!searchError) return
    const t = setTimeout(() => setSearchError(''), 5000)
    return () => clearTimeout(t)
  }, [searchError])

  const handleLogout = () => {
    clearToken()
    setUser(null)
    setVenues([])
    router.push('/auth/login')
  }

  const handleSearch = async (query: string) => {
    if (!user) return
    setLoading(true)
    setSearchError('')

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ query, limit: 5 }),
      })

      if (response.status === 401) {
        clearToken()
        router.push('/auth/login')
        return
      }

      if (response.status === 403) {
        setSearchError('Daily search limit reached. Upgrade to premium.')
        return
      }

      if (!response.ok) throw new Error('Search failed')

      const data = await response.json()
      setVenues(data.venues || [])

      // Optimistically decrement counter for free users
      if (user.subscription_status !== 'paid') {
        const next = Math.max(0, user.searches_remaining - 1)
        updateSearchesRemaining(next)
        setUser(u => u ? { ...u, searches_remaining: next } : u)
      }
    } catch {
      setSearchError('Connection failed, please try again')
    } finally {
      setLoading(false)
    }
  }

  // Don't render until after hydration to avoid localStorage mismatch
  if (!mounted) return null

  const isAuth = !!user
  const isPaid = user?.subscription_status === 'paid'

  return (
    <>
      <Head>
        <title>Resto - AI Restaurant Finder</title>
        <meta name="description" content="Find the perfect restaurant with AI" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css" rel="stylesheet" />
      </Head>

      <main className="min-h-screen bg-gray-50">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Resto</h1>
              <p className="mt-1 text-gray-600">AI-powered restaurant discovery in Stockholm</p>
            </div>

            {isAuth && (
              <div className="flex items-center gap-3 shrink-0">
                <span className="hidden sm:block text-sm text-gray-500 truncate max-w-[160px]">
                  {user.email}
                </span>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Log Out
                </button>
              </div>
            )}
          </div>
        </header>

        {/* ── Search / Auth prompt ────────────────────────────────────────── */}
        <section className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

            {isAuth ? (
              <>
                {/* Search counter */}
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-gray-500">
                    {isPaid
                      ? 'Unlimited (Premium)'
                      : `Searches remaining: ${user.searches_remaining}/3`}
                  </p>
                </div>

                <SearchBox onSearch={handleSearch} loading={loading} />

                {loading && (
                  <p className="mt-4 text-center text-gray-600">Searching restaurants…</p>
                )}

                {searchError && (
                  <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {searchError}
                  </div>
                )}
              </>
            ) : (
              /* Unauthenticated prompt */
              <div className="text-center py-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Start searching restaurants
                </h2>
                <p className="text-gray-500 mb-8">
                  Sign up free to get started. 3 searches/day included.
                </p>
                <div className="flex justify-center gap-4">
                  <Link
                    href="/auth/signup"
                    className="px-6 py-3 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 transition-colors"
                  >
                    Sign Up
                  </Link>
                  <Link
                    href="/auth/login"
                    className="px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Log In
                  </Link>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Results ────────────────────────────────────────────────────── */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* Map */}
            <div className="lg:col-span-2">
              <div
                ref={mapContainer}
                className="w-full h-96 bg-gray-200 rounded-lg border border-gray-300"
              >
                {venues.length > 0 ? (
                  <VenueMap venues={venues} onVenueSelect={setSelectedVenue} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500">
                    {isAuth
                      ? 'Search for restaurants to see results on the map'
                      : 'Sign in to start searching restaurants'}
                  </div>
                )}
              </div>
            </div>

            {/* Results list */}
            <div className="lg:col-span-1">
              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-gray-900">
                  {venues.length} Results
                </h2>
                {venues.map((venue) => (
                  <VenueCard
                    key={venue.id}
                    venue={venue}
                    selected={selectedVenue?.id === venue.id}
                    onClick={() => setSelectedVenue(venue)}
                  />
                ))}
              </div>
            </div>

          </div>
        </div>
      </main>
    </>
  )
}
