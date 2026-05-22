import jwtDecode from 'jwt-decode'

const TOKEN_KEY = 'resto_token'
const USER_KEY  = 'resto_user'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  email: string
  subscription_status: string
  searches_remaining: number
}

interface JWTPayload {
  userId: string
  email: string
  exp: number
}

// ─── Token helpers ────────────────────────────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

/** Returns true when a non-expired JWT exists in localStorage. */
export function isAuthenticated(): boolean {
  const token = getToken()
  if (!token) return false
  try {
    const { exp } = jwtDecode<JWTPayload>(token)
    return exp * 1000 > Date.now()
  } catch {
    return false
  }
}

// ─── User helpers ─────────────────────────────────────────────────────────────

/** Returns full user from localStorage, falling back to JWT decode for id+email. */
export function getUser(): AuthUser | null {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem(USER_KEY)
  if (stored) {
    try { return JSON.parse(stored) as AuthUser } catch {}
  }
  // Fallback: pull what we can from the token itself
  const token = getToken()
  if (!token) return null
  try {
    const { userId, email } = jwtDecode<JWTPayload>(token)
    return { id: userId, email, subscription_status: 'free', searches_remaining: 0 }
  } catch {
    return null
  }
}

/** Persists an updated searches_remaining without a server round-trip. */
export function updateSearchesRemaining(count: number): void {
  if (typeof window === 'undefined') return
  const user = getUser()
  if (!user) return
  localStorage.setItem(USER_KEY, JSON.stringify({ ...user, searches_remaining: count }))
}

// ─── API calls ────────────────────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

async function authRequest(
  path: string,
  body: object
): Promise<{ token: string; user: AuthUser }> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw Object.assign(new Error('Connection failed, please try again'), { status: 0 })
  }

  const data = await res.json()

  if (!res.ok) {
    throw Object.assign(
      new Error(data.error ?? 'Request failed'),
      { status: res.status }
    )
  }

  setToken(data.token)

  const user: AuthUser = {
    id: data.user.id,
    email: data.user.email,
    subscription_status: data.user.subscription_status,
    // Signup response omits searches_remaining; default to 3 for new accounts
    searches_remaining: data.user.searches_remaining ?? 3,
  }
  localStorage.setItem(USER_KEY, JSON.stringify(user))

  return { token: data.token, user }
}

export function signup(email: string, password: string) {
  return authRequest('/api/auth/signup', { email, password })
}

export function login(email: string, password: string) {
  return authRequest('/api/auth/login', { email, password })
}
