/**
 * TextTrack.jsx
 * Renders a TEXT row on the editor timeline.
 * Each text overlay appears as a colored block that can be:
 *   - Dragged (block body) to move start+end together
 *   - Resized from LEFT edge  → changes startTime
 *   - Resized from RIGHT edge → changes endTime
 */
import { useRef, useState, useCallback } from 'react'
import { overlayColor } from './textUtils'

function TrackLabel({ children, color }) {
  return (
    <div style={{
      width: 44, flexShrink: 0, display: 'flex', alignItems: 'center',
      fontSize: 8, fontFamily: 'JetBrains Mono, monospace',
      color: color || 'var(--muted)', letterSpacing: '0.08em',
      paddingRight: 8, textTransform: 'uppercase',
    }}>
      {children}
    </div>
  )
}

export default function TextTrack({
  overlays = [],
  duration  = 0,
  currentTime = 0,
  selectedTextId = null,
  onSelectOverlay,
  onUpdateOverlay,
}) {
  if (!overlays.length || !duration) return null

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: 28 }}>
      <TrackLabel color="#ec4899">TEXT</TrackLabel>
      <TrackBody
        overlays={overlays}
        duration={duration}
        selectedTextId={selectedTextId}
        onSelectOverlay={onSelectOverlay}
        onUpdateOverlay={onUpdateOverlay}
      />
    </div>
  )
}

function TrackBody({ overlays, duration, selectedTextId, onSelectOverlay, onUpdateOverlay }) {
  const railRef = useRef(null)

  const pxToSec = useCallback((px) => {
    const railW = railRef.current?.getBoundingClientRect().width || 1
    return (px / railW) * duration
  }, [duration])

  return (
    <div ref={railRef} style={{
      flex: 1, background: 'rgba(236,72,153,0.04)',
      border: '1px solid rgba(236,72,153,0.18)', borderRadius: 6,
      position: 'relative', overflow: 'visible', userSelect: 'none',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: 'rgba(236,72,153,0.4)', borderRadius: '5px 5px 0 0',
      }} />

      {overlays.map((ov, i) => {
        const col = overlayColor(ov._colorIndex ?? i)
        const sel = selectedTextId === ov.id
        return (
          <DraggableBlock
            key={ov.id}
            ov={ov}
            col={col}
            sel={sel}
            duration={duration}
            pxToSec={pxToSec}
            onSelect={() => onSelectOverlay?.(ov.id)}
            onUpdate={(patch) => onUpdateOverlay?.(ov.id, patch)}
          />
        )
      })}
    </div>
  )
}

const HANDLE_W = 8

function DraggableBlock({ ov, col, sel, duration, pxToSec, onSelect, onUpdate }) {
  const [hovered, setHovered] = useState(false)
  const [preview, setPreview] = useState(null)
  const dragRef = useRef(null)

  const startDrag = useCallback((e, mode) => {
    e.preventDefault()
    e.stopPropagation()
    onSelect()

    const startX   = e.clientX
    const origStart = ov.startTime
    const origEnd   = ov.endTime
    const origDur   = origEnd - origStart

    dragRef.current = true

    const onMove = (me) => {
      const ds = pxToSec(me.clientX - startX)

      if (mode === 'move') {
        let ns = Math.max(0, origStart + ds)
        let ne = ns + origDur
        if (ne > duration) { ne = duration; ns = Math.max(0, ne - origDur) }
        setPreview({ startTime: +ns.toFixed(3), endTime: +ne.toFixed(3) })

      } else if (mode === 'left') {
        const ns = Math.max(0, Math.min(origStart + ds, origEnd - 0.1))
        setPreview({ startTime: +ns.toFixed(3), endTime: origEnd })

      } else if (mode === 'right') {
        const ne = Math.min(duration, Math.max(origEnd + ds, origStart + 0.1))
        setPreview({ startTime: origStart, endTime: +ne.toFixed(3) })
      }
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
      dragRef.current = null
      setPreview(prev => {
        if (prev) onUpdate(prev)
        return null
      })
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
  }, [ov, duration, pxToSec, onSelect, onUpdate])

  const startTime = preview?.startTime ?? ov.startTime
  const endTime   = preview?.endTime   ?? ov.endTime
  const liveL = (startTime / duration) * 100
  const liveW = Math.max(((endTime - startTime) / duration) * 100, 0.5)

  const isDragging = preview !== null

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute',
        left: `${liveL}%`,
        width: `${liveW}%`,
        top: '10%', bottom: '10%',
        zIndex: sel ? 5 : 2,
        display: 'flex',
        alignItems: 'stretch',
      }}
    >
      {/* LEFT handle */}
      <div
        onMouseDown={(e) => startDrag(e, 'left')}
        title="Drag to change start time"
        style={{
          width: HANDLE_W, flexShrink: 0, cursor: 'ew-resize',
          background: sel || hovered ? `${col}dd` : `${col}66`,
          borderRadius: '3px 0 0 3px', transition: 'background 0.1s',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {(sel || hovered) && (
          <div style={{ width: 1.5, height: '55%', background: 'rgba(255,255,255,0.8)', borderRadius: 1 }} />
        )}
      </div>

      {/* BODY */}
      <div
        onMouseDown={(e) => startDrag(e, 'move')}
        title={`"${ov.text.slice(0,30)}" · ${startTime.toFixed(2)}s → ${endTime.toFixed(2)}s`}
        style={{
          flex: 1,
          background: `${col}${sel ? '55' : '22'}`,
          borderTop: `1.5px solid ${col}${sel ? 'ee' : '66'}`,
          borderBottom: `1.5px solid ${col}${sel ? 'ee' : '66'}`,
          borderLeft: 'none', borderRight: 'none',
          cursor: isDragging ? 'grabbing' : 'grab',
          overflow: 'hidden',
          display: 'flex', alignItems: 'center',
          boxShadow: sel ? `0 0 8px ${col}44` : 'none',
          transition: isDragging ? 'none' : 'background 0.12s, box-shadow 0.12s',
          position: 'relative',
        }}
      >
        {liveW > 3 && (
          <span style={{
            fontSize: 7, fontFamily: 'JetBrains Mono, monospace',
            color: sel ? col : `${col}99`,
            whiteSpace: 'nowrap', overflow: 'hidden',
            padding: '0 4px', textOverflow: 'ellipsis',
            letterSpacing: '0.03em', pointerEvents: 'none',
          }}>
            T: {ov.text.slice(0, 18)}{ov.text.length > 18 ? '…' : ''}
          </span>
        )}

        {/* Time tooltip while dragging */}
        {isDragging && (
          <div style={{
            position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
            transform: 'translateX(-50%)',
            background: '#0f172a', border: `1px solid ${col}88`,
            borderRadius: 4, padding: '2px 7px',
            fontSize: 8, fontFamily: 'JetBrains Mono, monospace',
            color: col, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 30,
          }}>
            {startTime.toFixed(2)}s → {endTime.toFixed(2)}s
          </div>
        )}
      </div>

      {/* RIGHT handle */}
      <div
        onMouseDown={(e) => startDrag(e, 'right')}
        title="Drag to change end time"
        style={{
          width: HANDLE_W, flexShrink: 0, cursor: 'ew-resize',
          background: sel || hovered ? `${col}dd` : `${col}66`,
          borderRadius: '0 3px 3px 0', transition: 'background 0.1s',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {(sel || hovered) && (
          <div style={{ width: 1.5, height: '55%', background: 'rgba(255,255,255,0.8)', borderRadius: 1 }} />
        )}
      </div>
    </div>
  )
}