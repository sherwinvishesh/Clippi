/**
 * ColorCurves.jsx
 * Interactive DaVinci-Resolve-style RGB/Master curves editor.
 * Draggable control points on an SVG canvas.
 */
import { useState, useRef, useCallback, useEffect } from 'react'

const SIZE   = 150   // SVG viewBox dimension
const PAD    = 12    // padding inside the SVG

const CHANNELS = [
  { id: 'master', label: 'M', color: '#e2e8f0', bg: 'rgba(255,255,255,0.06)' },
  { id: 'r',      label: 'R', color: '#f87171', bg: 'rgba(248,113,113,0.06)' },
  { id: 'g',      label: 'G', color: '#4ade80', bg: 'rgba(74,222,128,0.06)'  },
  { id: 'b',      label: 'B', color: '#60a5fa', bg: 'rgba(96,165,250,0.06)'  },
]

const GRID_DIVS = 4

// ─── Clamp + normalize helpers ────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Convert SVG coords to curve [0-255] coords
function svgToCurve(sv, dim) {
  const inner = dim - PAD * 2
  const x     = clamp(Math.round(((sv.x - PAD) / inner) * 255), 0, 255)
  const y     = clamp(Math.round(255 - ((sv.y - PAD) / inner) * 255), 0, 255)
  return [x, y]
}

// Convert curve [0-255] coords to SVG coords
function curveToSvg(cx, cy, dim) {
  const inner = dim - PAD * 2
  return {
    x: PAD + (cx / 255) * inner,
    y: PAD + ((255 - cy) / 255) * inner,
  }
}

// Build a smooth SVG path through sorted control points
function buildPath(points, dim) {
  if (!points || points.length < 2) return ''
  const pts = [...points].sort((a, b) => a[0] - b[0])

  const svgPts = pts.map(([cx, cy]) => curveToSvg(cx, cy, dim))

  let d = `M ${svgPts[0].x} ${svgPts[0].y}`
  for (let i = 1; i < svgPts.length; i++) {
    const prev = svgPts[i - 1]
    const curr = svgPts[i]
    const cpx  = (prev.x + curr.x) / 2
    d += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`
  }
  return d
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ColorCurves({ curves, onChange }) {
  const [activeChannel, setActiveChannel] = useState('master')
  const [dragging, setDragging]           = useState(null)   // { ptIndex }
  const svgRef = useRef(null)

  const activeCh  = CHANNELS.find(c => c.id === activeChannel)
  const points    = curves?.[activeChannel] ?? [[0, 0], [255, 255]]

  // Convert SVG mouse event to curve coordinates
  const getCurveCoords = useCallback((e) => {
    const svg    = svgRef.current
    if (!svg) return [0, 0]
    const rect   = svg.getBoundingClientRect()
    const scaleX = SIZE / rect.width
    const scaleY = SIZE / rect.height
    return svgToCurve(
      { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY },
      SIZE,
    )
  }, [])

  // Add a point on double-click
  const handleSvgDblClick = useCallback((e) => {
    e.preventDefault()
    const [nx, ny]  = getCurveCoords(e)
    const newPoints = [...points, [nx, ny]].sort((a, b) => a[0] - b[0])
    onChange(activeChannel, newPoints)
  }, [activeChannel, points, onChange, getCurveCoords])

  // Start dragging a point
  const handlePointDown = useCallback((e, idx) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging({ ptIndex: idx })
  }, [])

  // Move point while dragging
  const handleMouseMove = useCallback((e) => {
    if (dragging === null) return
    const [nx, ny]  = getCurveCoords(e)
    const newPoints = points.map((p, i) => i === dragging.ptIndex ? [nx, ny] : p)
    onChange(activeChannel, newPoints.sort((a, b) => a[0] - b[0]))
  }, [dragging, points, activeChannel, onChange, getCurveCoords])

  const handleMouseUp = useCallback(() => setDragging(null), [])

  // Delete point on right-click (if more than 2 remain)
  const handlePointRightClick = useCallback((e, idx) => {
    e.preventDefault()
    if (points.length <= 2) return
    const newPoints = points.filter((_, i) => i !== idx)
    onChange(activeChannel, newPoints)
  }, [activeChannel, points, onChange])

  useEffect(() => {
    if (dragging === null) return
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup',  handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup',  handleMouseUp)
    }
  }, [dragging, handleMouseMove, handleMouseUp])

  const gridLines = []
  for (let i = 1; i < GRID_DIVS; i++) {
    const pos = PAD + (i / GRID_DIVS) * (SIZE - PAD * 2)
    gridLines.push(
      <line key={`h${i}`} x1={PAD} y1={pos} x2={SIZE - PAD} y2={pos}
        stroke="rgba(255,255,255,0.07)" strokeWidth="0.5" />,
      <line key={`v${i}`} x1={pos} y1={PAD} x2={pos} y2={SIZE - PAD}
        stroke="rgba(255,255,255,0.07)" strokeWidth="0.5" />,
    )
  }

  const path   = buildPath(points, SIZE)
  const sortedPoints = [...points].sort((a, b) => a[0] - b[0])

  const resetChannel = () => {
    onChange(activeChannel, [[0, 0], [255, 255]])
  }

  const hasChanges = JSON.stringify(points) !== JSON.stringify([[0, 0], [255, 255]])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Channel selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {CHANNELS.map(ch => (
          <button
            key={ch.id}
            onClick={() => setActiveChannel(ch.id)}
            style={{
              width: 30, height: 24, borderRadius: 5,
              border: `1px solid ${activeChannel === ch.id ? ch.color : '#1e2d47'}`,
              background: activeChannel === ch.id ? `${ch.bg}` : 'transparent',
              cursor: 'pointer', fontSize: 10,
              fontFamily: 'JetBrains Mono, monospace',
              color: activeChannel === ch.id ? ch.color : '#64748b',
              fontWeight: 600, transition: 'all 0.12s',
            }}
          >
            {ch.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {hasChanges && (
          <button
            onClick={resetChannel}
            style={{
              fontSize: 9, fontFamily: 'JetBrains Mono, monospace',
              color: '#64748b', background: 'transparent',
              border: '1px solid #1e2d47', borderRadius: 4,
              padding: '2px 7px', cursor: 'pointer',
            }}
          >
            Reset
          </button>
        )}
      </div>

      {/* SVG curves editor */}
      <div style={{
        position: 'relative',
        background: '#0a0f1a',
        border: '1px solid #1e2d47',
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          style={{
            width: '100%',
            aspectRatio: '1',
            cursor: dragging ? 'grabbing' : 'crosshair',
            userSelect: 'none',
          }}
          onDoubleClick={handleSvgDblClick}
        >
          {/* Background fill with channel tint */}
          <rect x={PAD} y={PAD}
            width={SIZE - PAD*2} height={SIZE - PAD*2}
            fill={activeCh.bg} />

          {/* Grid */}
          {gridLines}

          {/* Diagonal reference line */}
          <line x1={PAD} y1={SIZE - PAD} x2={SIZE - PAD} y2={PAD}
            stroke="rgba(255,255,255,0.12)" strokeWidth="1"
            strokeDasharray="3 3" />

          {/* Curve path */}
          {path && (
            <path
              d={path}
              fill="none"
              stroke={activeCh.color}
              strokeWidth="1.8"
              opacity="0.9"
            />
          )}

          {/* Area under curve */}
          {path && (
            <path
              d={`${path} L ${SIZE - PAD} ${SIZE - PAD} L ${PAD} ${SIZE - PAD} Z`}
              fill={activeCh.color}
              opacity="0.05"
            />
          )}

          {/* Control points */}
          {sortedPoints.map(([cx, cy], i) => {
            const sv = curveToSvg(cx, cy, SIZE)
            return (
              <g key={i}>
                <circle
                  cx={sv.x} cy={sv.y} r={8}
                  fill="transparent"
                  style={{ cursor: 'grab' }}
                  onMouseDown={e => handlePointDown(e, i)}
                  onContextMenu={e => handlePointRightClick(e, i)}
                />
                <circle
                  cx={sv.x} cy={sv.y} r={4}
                  fill={activeCh.color}
                  stroke="#0a0f1a"
                  strokeWidth="1.5"
                  style={{ cursor: 'grab', pointerEvents: 'none' }}
                  opacity={dragging?.ptIndex === i ? 1 : 0.85}
                />
              </g>
            )
          })}

          {/* Border */}
          <rect x={PAD} y={PAD}
            width={SIZE - PAD*2} height={SIZE - PAD*2}
            fill="none" stroke="#1e2d47" strokeWidth="0.5" />
        </svg>

        {/* Axis labels */}
        <div style={{
          position: 'absolute', bottom: 2, left: PAD, right: PAD,
          display: 'flex', justifyContent: 'space-between',
          fontSize: 7, fontFamily: 'JetBrains Mono, monospace',
          color: '#334155', pointerEvents: 'none',
        }}>
          <span>0</span>
          <span style={{ color: '#475569', fontSize: 7 }}>INPUT</span>
          <span>255</span>
        </div>
        <div style={{
          position: 'absolute', top: PAD, bottom: PAD, left: 2,
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          alignItems: 'center', pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 7, fontFamily: 'JetBrains Mono, monospace', color: '#334155', transform: 'rotate(-90deg)', marginLeft: -4 }}>255</span>
          <span style={{ fontSize: 7, fontFamily: 'JetBrains Mono, monospace', color: '#334155', transform: 'rotate(-90deg)', marginLeft: -4 }}>0</span>
        </div>
      </div>

      <p style={{
        fontSize: 9, color: '#334155',
        fontFamily: 'JetBrains Mono, monospace',
        textAlign: 'center', marginTop: -4,
      }}>
        Double-click to add • Right-click to remove • Drag to adjust
      </p>
    </div>
  )
}