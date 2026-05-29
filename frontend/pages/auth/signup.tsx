import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { signup, isAuthenticated } from '../../lib/auth'
import { COLORS } from '../../lib/theme'

export default function SignUpPage() {
  const router = useRouter()
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState(false)
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)

  useEffect(() => {
    if (isAuthenticated()) router.replace('/')
  }, [router])

  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(''), 5000)
    return () => clearTimeout(t)
  }, [error])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setLoading(true)
    setError('')
    try {
      await signup(email, password)
      setSuccess(true)
      setTimeout(() => router.push('/'), 2000)
    } catch (err: unknown) {
      const e = err as Error & { status?: number }
      if (e.status === 409)       setError('Email already registered')
      else if (e.status === 400)  setError(e.message || 'Invalid input')
      else if ((e.status ?? 0) >= 500) setError('Server error, please try again')
      else                        setError(e.message || 'Connection failed, please try again')
    } finally {
      setLoading(false)
    }
  }

  const canSubmit = !loading && !!email && !!password

  return (
    <>
      <Head>
        <title>Sign Up — Resto</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main style={{ minHeight: '100vh', backgroundColor: COLORS.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div style={{ width: '100%', maxWidth: '420px' }}>

          {/* Brand */}
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <h1 style={{ fontSize: '36px', fontWeight: 700, color: COLORS.text1, margin: 0, fontFamily: 'Georgia, serif' }}>RESTO</h1>
            <p style={{ marginTop: '0.5rem', color: COLORS.text2, fontSize: '14px' }}>AI restaurant discovery in Stockholm</p>
          </div>

          <div style={{ backgroundColor: COLORS.surface1, border: `1px solid ${COLORS.border}`, padding: '2rem' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: COLORS.text1, marginBottom: '1.5rem' }}>Create Account</h2>

            {success ? (
              <div style={{ textAlign: 'center', paddingTop: '1.5rem', paddingBottom: '1.5rem' }}>
                <p style={{ color: '#22c55e', fontWeight: 600, fontSize: '16px' }}>
                  Welcome! You get 3 free searches.
                </p>
                <p style={{ marginTop: '0.5rem', color: COLORS.text2, fontSize: '13px' }}>Redirecting…</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {error && (
                  <div style={{ backgroundColor: COLORS.surface2, border: `1px solid ${COLORS.accent}`, color: COLORS.text1, padding: '1rem', fontSize: '13px' }}>
                    {error}
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: COLORS.text2, marginBottom: '0.5rem' }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    style={{ width: '100%', padding: '0.75rem 1rem', border: `1px solid ${emailFocused ? COLORS.accent : COLORS.border}`, borderRadius: '0', backgroundColor: COLORS.surface2, fontSize: '14px', color: COLORS.text1, boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.2s' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: COLORS.text2, marginBottom: '0.5rem' }}>
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                    style={{ width: '100%', padding: '0.75rem 1rem', border: `1px solid ${passwordFocused ? COLORS.accent : COLORS.border}`, borderRadius: '0', backgroundColor: COLORS.surface2, fontSize: '14px', color: COLORS.text1, boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.2s' }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  style={{ width: '100%', padding: '0.75rem 1rem', backgroundColor: canSubmit ? COLORS.accent : COLORS.surface2, color: canSubmit ? COLORS.bg : COLORS.text3, border: 'none', borderRadius: '0', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: canSubmit ? 'pointer' : 'not-allowed', transition: 'background-color 0.2s' }}
                >
                  {loading ? 'Creating account…' : 'Sign Up'}
                </button>
              </form>
            )}

            <p style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '13px', color: COLORS.text2 }}>
              Already have an account?{' '}
              <Link href="/auth/login" style={{ color: COLORS.accent, textDecoration: 'none', fontWeight: 600 }}>
                Log in
              </Link>
            </p>
          </div>
        </div>
      </main>
    </>
  )
}
