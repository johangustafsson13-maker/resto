import { useRouter } from 'next/router'
import SearchBox from '../components/SearchBox'
import { COLORS } from '../lib/theme'

export default function Home() {
  const router = useRouter()

  const handleSearch = (query: string) => {
    router.push(`/search?q=${encodeURIComponent(query)}`)
  }

  return (
    <div style={{
      backgroundColor: COLORS.bg,
      color: COLORS.text1,
      minHeight: '100vh',
      padding: '3rem 2rem',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        maxWidth: '700px',
        width: '100%',
        textAlign: 'center',
      }}>
        {/* Brand */}
        <div style={{ marginBottom: '4rem' }}>
          <h1 style={{
            fontSize: '96px',
            fontWeight: 900,
            margin: '0 0 1rem 0',
            color: COLORS.text1,
            letterSpacing: '-3px',
            lineHeight: '1',
            fontFamily: 'Georgia, serif',
          }}>
            RESTO
          </h1>

          {/* Accent line */}
          <div style={{
            height: '4px',
            width: '120px',
            backgroundColor: COLORS.accent,
            transform: 'rotate(-15deg)',
            margin: '0 auto 3rem',
            borderRadius: '2px',
          }} />

          <p style={{
            fontSize: '20px',
            margin: '0 0 1.5rem 0',
            color: COLORS.text2,
            fontWeight: 300,
            lineHeight: '1.8',
            letterSpacing: '0.5px',
          }}>
            Find Stockholm's best restaurants & terraces with real-time sunlight intelligence.
          </p>
        </div>

        {/* Search */}
        <div style={{ marginBottom: '6rem' }}>
          <SearchBox onSearch={handleSearch} />
        </div>
      </div>
    </div>
  )
}
