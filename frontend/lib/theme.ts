export const COLORS = {
  // Backgrounds
  bg:       '#0a0a0a',
  surface1: '#141414',  // cards, panels
  surface2: '#1f1f1f',  // hover, raised states
  border:   '#2a2a2a',

  // Text
  text1: '#f5f5f5',
  text2: '#a1a1a1',  // secondary
  text3: '#6b6b6b',  // tertiary

  // Accent — use sparingly: focus rings, selected states, key metrics, CTA
  accent: '#e8b04b',

  // Status — data colors, not decorative
  sunny:      '#fbbf24',  // venues in sun right now
  shaded:     '#6b7280',  // shaded venues
  restaurant: '#f97316',  // indoor / restaurant-only venues
} as const

export type ColorKey = keyof typeof COLORS

export const BREAKPOINTS = {
  mobile: 768,
} as const
