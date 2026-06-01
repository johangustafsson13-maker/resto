import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import SunCalc from 'suncalc'
import { COLORS, FONTS } from '../lib/theme'

const LAT = 59.3293
const LNG = 18.0686
const SNAP_MS = 15 * 60 * 1000 // 15 minutes

interface TimeScrubberProps {
  onTimeChange: (time: Date) => void
  isMobile: boolean
}

function snap15(ms: number): number {
  return Math.round(ms / SNAP_MS) * SNAP_MS
}

function hhmm(d: Date): string {
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0')
}

function getWindow(now: Date): { start: Date; end: Date; isTomorrow: boolean } {
  const today = SunCalc.getTimes(now, LAT, LNG)
  if (!isNaN(today.sunset.getTime()) && now < today.sunset) {
    return { start: now, end: today.sunset, isTomorrow: false }
  }
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tmrw = SunCalc.getTimes(tomorrow, LAT, LNG)
  return { start: tmrw.sunrise, end: tmrw.sunset, isTomorrow: true }
}

export default function TimeScrubber({ onTimeChange, isMobile }: TimeScrubberProps) {
  const router = useRouter()
  const trackRef = useRef<HTMLDivElement>(null)

  // Keep fresh router.query available inside drag effect closure without re-triggering
  const queryRef = useRef(router.query)
  useEffect(() => { queryRef.current = router.query }, [router.query])

  const [start, setStart] = useState<Date>(new Date())
  const [end, setEnd] = useState<Date>(new Date())
  const [isTomorrow, setIsTomorrow] = useState(false)
  const [time, setTime] = useState<Date>(new Date())
  const [isDragging, setIsDragging] = useState(false)
  const [ready, setReady] = useState(false)

  // Ref so the drag effect closure always reads the current snapped time
  const timeRef = useRef<Date>(time)
  useEffect(() => { timeRef.current = time }, [time])

  // Initialize time window once router is ready (reads ?t= URL param)
  useEffect(() => {
    if (!router.isReady) return
    const now = new Date()
    const win = getWindow(now)
    setStart(win.start)
    setEnd(win.end)
    setIsTomorrow(win.isTomorrow)

    let init = win.start
    const tp = router.query.t
    if (typeof tp === 'string') {
      const parsed = new Date(tp)
      if (!isNaN(parsed.getTime()) && parsed >= win.start && parsed <= win.end) {
        init = parsed
      }
      // Malformed, out of range, or past-sunset: fall through to startTime default
    }
    setTime(init)
    setReady(true)
  }, [router.isReady]) // eslint-disable-line react-hooks/exhaustive-deps

  const xToTime = useCallback((clientX: number): Date | null => {
    const el = trackRef.current
    if (!el) return null
    const { left, width } = el.getBoundingClientRect()
    const ratio = Math.max(0, Math.min((clientX - left) / width, 1))
    const raw = start.getTime() + ratio * (end.getTime() - start.getTime())
    return new Date(Math.max(start.getTime(), Math.min(end.getTime(), snap15(raw))))
  }, [start, end])

  useEffect(() => {
    if (!isDragging) return

    const move = (x: number) => {
      const t = xToTime(x)
      if (t && t.getTime() !== timeRef.current.getTime()) setTime(t)
    }

    const release = (x: number) => {
      const t = xToTime(x)
      if (t) {
        setTime(t)
        onTimeChange(t)
        router.push(
          { pathname: '/', query: { ...queryRef.current, t: t.toISOString() } },
          undefined,
          { shallow: true }
        )
      }
      setIsDragging(false)
      document.body.classList.remove('grabbing')
    }

    const mm = (e: MouseEvent) => move(e.clientX)
    const mu = (e: MouseEvent) => release(e.clientX)
    const tm = (e: TouchEvent) => { e.preventDefault(); move(e.touches[0].clientX) }
    const te = (e: TouchEvent) => release(e.changedTouches[0].clientX)

    document.addEventListener('mousemove', mm)
    document.addEventListener('mouseup', mu)
    document.addEventListener('touchmove', tm, { passive: false })
    document.addEventListener('touchend', te)
    return () => {
      document.removeEventListener('mousemove', mm)
      document.removeEventListener('mouseup', mu)
      document.removeEventListener('touchmove', tm)
      document.removeEventListener('touchend', te)
      document.body.classList.remove('grabbing')
    }
  }, [isDragging, xToTime, onTimeChange, router])

  if (!ready) return null

  const span = end.getTime() - start.getTime()
  const pct = span > 0 ? ((time.getTime() - start.getTime()) / span) * 100 : 0

  // Hourly ticks: first whole hour strictly after start, up to (not including) end
  const ticks: Date[] = []
  if (span > 0) {
    const first = new Date(start)
    first.setMinutes(0, 0, 0)
    first.setHours(first.getHours() + 1)
    for (let t = new Date(first); t < end; t = new Date(t.getTime() + 3_600_000)) {
      ticks.push(new Date(t))
    }
  }

  const displayLabel = isTomorrow ? `${hhmm(time)} tomorrow` : hhmm(time)
  const leftEdgeLabel = isTomorrow ? `Tomorrow ${hhmm(start)}` : 'now'
  const rightEdgeLabel = isTomorrow ? `Tomorrow ${hhmm(end)}` : hhmm(end)

  // Flip label anchor at track edges to prevent off-screen overflow
  const labelOffset =
    pct < 15 ? 'translateX(0)' :
    pct > 85 ? 'translateX(-100%)' :
    'translateX(-50%)'

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      ...(isMobile
        ? { left: 0, width: '100%' }
        : { left: '50%', transform: 'translateX(-50%)', width: '80%' }),
      height: '80px',
      // COLORS.bg (#f4f1ea) at 0.85 opacity → D9 alpha in 8-digit hex
      backgroundColor: COLORS.bg + 'D9',
      borderTop: `2px solid ${COLORS.border}`,
      zIndex: 30,
      userSelect: 'none',
    }}>

      {/* Track reference — inset 12px per side keeps handle visible at endpoints */}
      <div
        ref={trackRef}
        style={{
          position: 'absolute',
          inset: '0 12px',
        }}
      >
        {/* Time display — floats above the panel (bottom: 100% of trackRef = top of panel) */}
        <div style={{
          position: 'absolute',
          left: `${pct}%`,
          bottom: 'calc(100% + 6px)',
          transform: labelOffset,
          fontFamily: FONTS.display,
          fontSize: '2rem',
          lineHeight: 1,
          color: COLORS.text1,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          {displayLabel}
        </div>

        {/* Track line */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          right: 0,
          height: '2px',
          backgroundColor: COLORS.border,
          transform: 'translateY(-50%)',
        }} />

        {/* Hourly tick marks */}
        {ticks.map((tick) => {
          const tp = ((tick.getTime() - start.getTime()) / span) * 100
          return (
            <div key={tick.getTime()} style={{
              position: 'absolute',
              left: `${tp}%`,
              top: 'calc(50% - 4px)',
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              pointerEvents: 'none',
            }}>
              <div style={{
                width: '2px',
                height: '8px',
                backgroundColor: COLORS.border,
              }} />
              <div style={{
                marginTop: '3px',
                fontFamily: FONTS.body,
                fontSize: '12px',
                color: COLORS.text3,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}>
                {hhmm(tick)}
              </div>
            </div>
          )
        })}

        {/* Left and right edge labels */}
        <div style={{
          position: 'absolute',
          left: 0,
          top: 'calc(50% + 12px)',
          fontFamily: FONTS.body,
          fontSize: '12px',
          color: COLORS.text3,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          {leftEdgeLabel}
        </div>
        <div style={{
          position: 'absolute',
          right: 0,
          top: 'calc(50% + 12px)',
          fontFamily: FONTS.body,
          fontSize: '12px',
          color: COLORS.text3,
          whiteSpace: 'nowrap',
          textAlign: 'right',
          pointerEvents: 'none',
        }}>
          {rightEdgeLabel}
        </div>

        {/* Handle — 24×48px, punk red, no radius */}
        <div
          onMouseDown={(e) => {
            e.preventDefault()
            setIsDragging(true)
            document.body.classList.add('grabbing')
          }}
          onTouchStart={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          style={{
            position: 'absolute',
            left: `${pct}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: '24px',
            height: '48px',
            backgroundColor: COLORS.accent,
            border: `2px solid ${COLORS.border}`,
            borderRadius: 0,
            cursor: isDragging ? 'grabbing' : 'grab',
            zIndex: 1,
            touchAction: 'none',
          }}
        />
      </div>
    </div>
  )
}
