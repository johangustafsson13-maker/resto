import { useState } from 'react'
import { useRouter } from 'next/router'
import { getToken, clearToken } from '../lib/auth'
import { COLORS } from '../lib/theme'

interface NavigationProps {
  user: { email: string; searches_remaining?: number; subscription_status?: string } | null
  onLogout?: () => void
}

export default function Navigation({ user, onLogout }: NavigationProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [logoutButtonHovered, setLogoutButtonHovered] = useState(false)
  const router = useRouter()

  const handleLogout = () => {
    clearToken()
    setMobileMenuOpen(false)
    onLogout?.()
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50" style={{
      backgroundColor: 'rgba(10, 10, 10, 0.95)', // COLORS.bg at 95% opacity for frosted effect
      borderBottom: `1px solid ${COLORS.border}`,
      backdropFilter: 'blur(10px)',
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '0 1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        height: '64px',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 style={{
            fontSize: '24px',
            fontWeight: 300,
            margin: 0,
            color: COLORS.text1,
            letterSpacing: '0.05em',
          }}>
            RESTO
          </h1>
          <div style={{
            fontSize: '11px',
            color: COLORS.text3,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontWeight: 500,
          }}>
            Stockholm
          </div>
        </div>

        {/* Desktop Menu */}
        <div style={{ display: 'flex' }} className="hidden md:flex items-center gap-8">
          {user && (
            <>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontSize: '13px', color: COLORS.text2 }}>
                  {user.email}
                </p>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', fontWeight: 600, color: COLORS.text1 }}>
                  {user.subscription_status === 'paid' ? '✨ Unlimited' : `${user.searches_remaining || 0} searches left`}
                </p>
              </div>
              <button
                onClick={handleLogout}
                onMouseEnter={() => setLogoutButtonHovered(true)}
                onMouseLeave={() => setLogoutButtonHovered(false)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: logoutButtonHovered ? COLORS.surface2 : 'transparent',
                  border: `1px solid ${logoutButtonHovered ? COLORS.accent : COLORS.border}`,
                  borderRadius: '0',
                  fontSize: '13px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  cursor: 'pointer',
                  color: logoutButtonHovered ? COLORS.accent : COLORS.text2,
                  transition: 'all 0.2s ease',
                }}
              >
                Logout
              </button>
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0.5rem',
            fontSize: '24px',
            color: COLORS.text1,
          }}
          className="md:hidden"
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div style={{
          borderTop: `1px solid ${COLORS.border}`,
          padding: '1rem',
          backgroundColor: COLORS.surface1,
        }} className="md:hidden">
          {user && (
            <>
              <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: `1px solid ${COLORS.border}` }}>
                <p style={{ margin: 0, fontSize: '13px', color: COLORS.text2, marginBottom: '0.5rem' }}>
                  {user.email}
                </p>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: COLORS.text1 }}>
                  {user.subscription_status === 'paid' ? '✨ Unlimited searches' : `${user.searches_remaining || 0} searches left`}
                </p>
              </div>
              <button
                onClick={handleLogout}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: COLORS.accent,
                  color: COLORS.bg,
                  border: 'none',
                  borderRadius: '0',
                  fontSize: '13px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  cursor: 'pointer',
                }}
              >
                Logout
              </button>
            </>
          )}
        </div>
      )}
    </nav>
  )
}
