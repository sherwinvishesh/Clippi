/**
 * ColorWheels.jsx
 * Three DaVinci-Resolve-style circular colour wheels: Lift / Gamma / Gain.
 * Each wheel lets the user drag within a colour circle to apply a colour cast.
 * The offset of the indicator from center controls hue + saturation.
 */
import { useRef, useCallback, useEffect, useLayoutEffect } from 'react'

const WHEEL_SIZE  = 100   // canvas pixel size
const WHEEL_RADIUS = 44   // colour wheel radius inside canvas
const MAX_OFFSET   = 40   // max offset from center (maps to ±1 in state)

const WHEELS = [
  { id: 'lift',  label: 'Lift',  subtitle: 'Shadows',    color: '#3b82f6' },
  { id: 'gamma', label: 'Gamma', subtitle: 'Midtones',   color: '#a78bfa' },
  { id: 'gain',  label: 'Gain',  subtitle: 'Highlights', color: '#f59e0b' },
]

// ─── Utility ──────────────────────────────────────────────────────────────────

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

/** Draw the HSB colour wheel to a canvas element */
function drawWheel(canvas) {
  if (!canvas) return
  const ctx  = canvas.getContext('2d')
  const cx   = WHEEL_SIZE / 2
  const cy   = WHEEL_SIZE / 2
  const r    = WHEEL_RADIUS

  ctx.clearRect(0, 0, WHEEL_SIZE, WHEEL_SIZE)

  // Draw colour pie slices
  const steps = 360
  for (let deg = 0; deg < steps; deg++) {
    const startAngle = ((deg - 1) * Math.PI) / 180
    const endAngle   = ((deg + 1) * Math.PI) / 180
    const grad       = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    grad.addColorStop(0,   `hsla(${deg}, 0%,   90%, 0.9)`)
    grad.addColorStop(0.4, `hsla(${deg}, 40%,  72%, 0.9)`)
    grad.addColorStop(1,   `hsla(${deg}, 100%, 50%, 0.9)`)
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, r, startAngle, endAngle)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()
  }

  // Darken edges slightly
  const vignette = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r)
  vignette.addColorStop(0,   'rgba(0,0,0,0)')
  vignette.addColorStop(0.7, 'rgba(0,0,0,0)')
  vignette.addColorStop(1,   'rgba(0,0,0,0.35)')
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = vignette
  ctx.fill()

  // Clip circle border
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth   = 1
  ctx.stroke()
}

// ─── Single wheel ────────────────────────────────────────────────────────────

function Wheel({ id, label, subtitle, color, value, onChange }) {
  const canvasRef = useRef(null)
  const dragging  = useRef(false)

  useLayoutEffect(() => { drawWheel(canvasRef.current) }, [])

  const cx = WHEEL_SIZE / 2
  const cy = WHEEL_SIZE / 2

  // Convert state x/y (−1…1) → canvas pixel offset
  const indicatorX = cx + (value.x ?? 0) * MAX_OFFSET
  const indicatorY = cy + (value.y ?? 0) * MAX_OFFSET

  const getOffset = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect   = canvas.getBoundingClientRect()
    const scale  = WHEEL_SIZE / rect.width
    const px     = (e.clientX - rect.left) * scale - cx
    const py     = (e.clientY - rect.top)  * scale - cy
    const dist   = Math.sqrt(px * px + py * py)
    const maxD   = MAX_OFFSET
    const clamped = dist > maxD ? maxD / dist : 1
    return {
      x: clamp(px * clamped / maxD, -1, 1),
      y: clamp(py * clamped / maxD, -1, 1),
    }
  }, [cx, cy])

  const onDown = useCallback((e) => {
    e.preventDefault()
    dragging.current = true
    onChange(id, getOffset(e))
  }, [id, onChange, getOffset])

  const onMove = useCallback((e) => {
    if (!dragging.current) return
    onChange(id, getOffset(e))
  }, [id, onChange, getOffset])

  const onUp = useCallback(() => { dragging.current = false }, [])

  useEffect(() => {
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',  onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [onMove, onUp])

  const dist = Math.sqrt((value.x ?? 0) ** 2 + (value.y ?? 0) ** 2)
  const angle = Math.atan2(value.y ?? 0, value.x ?? 0) * (180 / Math.PI)
  const isActive = dist > 0.01

  const reset = (e) => {
    e.stopPropagation()
    onChange(id, { x: 0, y: 0 })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>

      {/* Label */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
          color: isActive ? color : '#e2e8f0', fontWeight: 600,
          letterSpacing: '0.06em',
        }}>
          {label}
        </div>
        <div style={{ fontSize: 9, color: '#475569', fontFamily: 'JetBrains Mono, monospace' }}>
          {subtitle}
        </div>
      </div>

      {/* Canvas */}
      <div style={{ position: 'relative', userSelect: 'none' }}>
        <canvas
          ref={canvasRef}
          width={WHEEL_SIZE}
          height={WHEEL_SIZE}
          style={{
            width: WHEEL_SIZE, height: WHEEL_SIZE,
            borderRadius: '50%',
            cursor: 'crosshair',
            border: `1.5px solid ${isActive ? color : '#1e2d47'}`,
            boxShadow: isActive ? `0 0 10px ${color}44` : 'none',
            transition: 'border-color 0.2s, box-shadow 0.2s',
          }}
          onMouseDown={onDown}
        />

        {/* Indicator dot */}
        <div style={{
          position:    'absolute',
          left:        indicatorX - 5,
          top:         indicatorY - 5,
          width:       10,
          height:      10,
          borderRadius: '50%',
          background:  isActive ? color : '#e2e8f0',
          border:      '2px solid #0a0f1a',
          boxShadow:   isActive ? `0 0 6px ${color}` : '0 0 3px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
          transition:  isActive ? 'none' : 'background 0.2s',
        }} />

        {/* Center crosshair */}
        <div style={{
          position:  'absolute',
          left:      cx - 4,
          top:       cy - 4,
          width:     8,
          height:    8,
          pointerEvents: 'none',
        }}>
          <div style={{ position: 'absolute', left: 3, top: 0, width: 1, height: 8, background: 'rgba(255,255,255,0.15)' }} />
          <div style={{ position: 'absolute', left: 0, top: 3, width: 8, height: 1, background: 'rgba(255,255,255,0.15)' }} />
        </div>
      </div>

      {/* Readout + reset */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, minHeight: 16 }}>
        {isActive ? (
          <>
            <span style={{
              fontSize: 9, fontFamily: 'JetBrains Mono, monospace',
              color, background: `${color}18`, border: `1px solid ${color}33`,
              borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap',
            }}>
              {Math.round(angle)}° {(dist * 100).toFixed(0)}%
            </span>
            <button onClick={reset} style={{
              fontSize: 8, fontFamily: 'JetBrains Mono, monospace',
              color: '#475569', background: 'transparent',
              border: '1px solid #1e2d47', borderRadius: 3,
              padding: '1px 5px', cursor: 'pointer',
            }}>
              ✕
            </button>
          </>
        ) : (
          <span style={{ fontSize: 9, color: '#334155', fontFamily: 'JetBrains Mono, monospace' }}>
            centered
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Main ColorWheels component ───────────────────────────────────────────────

export default function ColorWheels({ wheels, onChange }) {
  const handleChange = useCallback((id, newVal) => {
    onChange({ ...wheels, [id]: newVal })
  }, [wheels, onChange])

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-around',
        gap: 12, padding: '4px 0',
      }}>
        {WHEELS.map(w => (
          <Wheel
            key={w.id}
            {...w}
            value={wheels?.[w.id] ?? { x: 0, y: 0 }}
            onChange={handleChange}
          />
        ))}
      </div>

      <p style={{
        fontSize: 9, color: '#334155',
        fontFamily: 'JetBrains Mono, monospace',
        textAlign: 'center', marginTop: 10,
      }}>
        Drag within the wheel to apply a colour cast to that tonal range
      </p>
    </div>
  )
}