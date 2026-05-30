export const COLORS = {
  // Backgrounds
  bg:       '#f4f1ea',  // warm cream base
  surface1: '#ffffff',  // cards, panels
  surface2: '#ebe6dc',  // raised, hover, inputs
  border:   '#1a1a1a',  // heavy ink — brutalist outlines

  // Text
  text1: '#0a0a0a',  // near-black ink
  text2: '#4a4a4a',  // secondary
  text3: '#8a8a8a',  // tertiary

  // Accent — primary CTAs, active states. NOT decorative. NOT map-layer.
  accent: '#d92816',  // saturated punk red

  // Map-only — NEVER use outside the map layer.
  // sunOnMap is reserved for the sun overlay (Phase 2, item 1).
  sunOnMap:   '#fbbf24',                    // warm gold, sun-lit areas
  shadeOnMap: 'rgba(110, 130, 165, 0.25)', // cool desaturated, shadowed areas
} as const

export type ColorKey = keyof typeof COLORS

export const FONTS = {
  display: "'Departure Mono', ui-monospace, 'SF Mono', monospace",
  body:    "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
} as const

export const BREAKPOINTS = {
  mobile: 768,
} as const
