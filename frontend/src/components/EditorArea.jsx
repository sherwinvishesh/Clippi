/**
 * EditorArea — full non-linear video editor view
 * Now includes: text overlays, video rect tracking, TextTrack in timeline.
 */
import { useRef, useState, useEffect, useCallback, useMemo, forwardRef, useLayoutEffect } from 'react'
import {
  ArrowLeft, Play, Pause, Volume2, VolumeX,
  Maximize2, Film, ChevronDown, Layers, Clock, Pencil,
} from 'lucide-react'
import { motion } from 'framer-motion'
import useClippiStore, { DEFAULT_EDITS } from '../store/useClippiStore'
import VideoToolbar from './VideoToolbar'
import {
  buildCSSFilter, buildVignetteStyle, hasColorEdits, DEFAULT_COLOR_EDITS,
} from './color/colorUtils'
import {
  buildFilterCSS, hasFilterApplied, DEFAULT_FILTER_EDITS,
  filterLabel as getFilterLabel,
} from './filters/filterUtils'
import FilterTrack from './filters/FilterTrack'
import TextOverlay from './text/TextOverlay'
import TextTrack from './text/TextTrack'
import { TEXT_ANIMATION_CSS, isOverlayVisible, DEFAULT_TEXT_OVERLAY } from './text/textUtils'
import VolumeMeter from './VolumeMeter';
import CaptionOverlay from './CaptionOverlay'
import AudioEffectTrack from './AudioEffectTrack'
import VisualEffectTrack from './VisualEffectTrack'

// ─── Inject text animation keyframes once ────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('clippi-text-anims')) {
  const style = document.createElement('style')
  style.id = 'clippi-text-anims'
  style.textContent = TEXT_ANIMATION_CSS
  document.head.appendChild(style)
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

const CLIP_PALETTE = ['#3b82f6', '#06b6d4', '#8b5cf6', '#f59e0b', '#22c55e', '#ec4899', '#f97316', '#14b8a6']
const TRANSITION_COLORS = { cut: '#64748b', fade: '#3b82f6', wipe: '#06b6d4', dissolve: '#8b5cf6' }
const TRANS_MS = 380
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function fmt(sec) {
  if (!isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function buildTicks(dur) {
  if (!dur || dur <= 0) return []
  const raw = dur / 8
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]
  const step = steps.find(s => s >= raw) ?? 300
  const ticks = []
  for (let t = 0; t <= dur; t += step) ticks.push(parseFloat(t.toFixed(2)))
  return ticks
}

function buildOrdered(nodes, edges, clips) {
  if (!nodes.length) return []
  const hasIn = new Set(edges.map(e => e.target))
  const starts = nodes.filter(n => !hasIn.has(n.id))
  const ordered = []
  const visited = new Set()
  const traverse = (id) => {
    if (visited.has(id)) return
    visited.add(id)
    const clip = clips.find(c => c.id === id)
    if (clip) ordered.push({ clip, nodeId: id })
    edges.filter(e => e.source === id).forEach(e => traverse(e.target))
  }
  starts.forEach(n => traverse(n.id))
  nodes.forEach(n => { if (!visited.has(n.id)) traverse(n.id) })
  return ordered
}

function hasUnsavedChanges(clip) {
  const e = clip.edits || DEFAULT_EDITS()
  const s = clip.savedEdits || null
  if (!s) { const d = DEFAULT_EDITS(); return JSON.stringify(e) !== JSON.stringify(d) }
  return JSON.stringify(e) !== JSON.stringify(s)
}

function buildTransform(edits) {
  if (!edits) return ''
  const parts = []
  if (edits.rotation) parts.push(`rotate(${edits.rotation}deg)`)
  if (edits.flipH) parts.push('scaleX(-1)')
  if (edits.flipV) parts.push('scaleY(-1)')
  return parts.join(' ')
}

function buildClipPath(crop) {
  if (!crop) return undefined
  return `inset(${crop.top}% ${crop.right}% ${crop.bottom}% ${crop.left}%)`
}

// ─── CropOverlay ──────────────────────────────────────────────────────────────
function CropOverlay({ crop, containerRef, videoRect, onChange }) {
  const { top = 0, right = 0, bottom = 0, left = 0 } = crop ?? {}
  const x1 = left, y1 = top, x2 = 100 - right, y2 = 100 - bottom

  // ── Get mouse position as % relative to the actual VIDEO area (not the black-bar container)
  const getPos = useCallback((e) => {
    const containerEl = containerRef.current
    if (!containerEl || !videoRect || !videoRect.width) return { rx: 0, ry: 0 }
    const containerRect = containerEl.getBoundingClientRect()
    const rx = ((e.clientX - containerRect.left - videoRect.left) / videoRect.width) * 100
    const ry = ((e.clientY - containerRect.top - videoRect.top) / videoRect.height) * 100
    return { rx, ry }
  }, [containerRef, videoRect])

  const onHandleDown = useCallback((handle, e) => {
    e.preventDefault(); e.stopPropagation()
    const snap = { top, right, bottom, left }
    const onMove = (ev) => {
      const { rx, ry } = getPos(ev)
      const next = { ...snap }
      if (handle.includes('n')) next.top = clamp(ry, 0, 100 - snap.bottom - 5)
      if (handle.includes('s')) next.bottom = clamp(100 - ry, 0, 100 - snap.top - 5)
      if (handle.includes('w')) next.left = clamp(rx, 0, 100 - snap.right - 5)
      if (handle.includes('e')) next.right = clamp(100 - rx, 0, 100 - snap.left - 5)
      onChange(next)
    }
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }, [top, right, bottom, left, getPos, onChange])

  const handles = [
    { id: 'nw', rx: x1, ry: y1, cursor: 'nw-resize' },
    { id: 'n', rx: (x1 + x2) / 2, ry: y1, cursor: 'n-resize' },
    { id: 'ne', rx: x2, ry: y1, cursor: 'ne-resize' },
    { id: 'e', rx: x2, ry: (y1 + y2) / 2, cursor: 'e-resize' },
    { id: 'se', rx: x2, ry: y2, cursor: 'se-resize' },
    { id: 's', rx: (x1 + x2) / 2, ry: y2, cursor: 's-resize' },
    { id: 'sw', rx: x1, ry: y2, cursor: 'sw-resize' },
    { id: 'w', rx: x1, ry: (y1 + y2) / 2, cursor: 'w-resize' },
  ]

  // ── Position overlay exactly over the video content area, not the letterbox container
  const vl = videoRect?.left ?? 0
  const vt = videoRect?.top ?? 0
  const vw = videoRect?.width ?? 0
  const vh = videoRect?.height ?? 0

  return (
    <div style={{ position: 'absolute', left: vl, top: vt, width: vw, height: vh, zIndex: 20, pointerEvents: 'none' }}>
      {/* dark mask: top */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${y1}%`, background: 'rgba(0,0,0,0.65)' }} />
      {/* dark mask: bottom */}
      <div style={{ position: 'absolute', top: `${y2}%`, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)' }} />
      {/* dark mask: left */}
      <div style={{ position: 'absolute', top: `${y1}%`, left: 0, width: `${x1}%`, height: `${y2 - y1}%`, background: 'rgba(0,0,0,0.65)' }} />
      {/* dark mask: right */}
      <div style={{ position: 'absolute', top: `${y1}%`, right: 0, width: `${right}%`, height: `${y2 - y1}%`, background: 'rgba(0,0,0,0.65)' }} />
      {/* crop rect border + grid lines */}
      <div style={{ position: 'absolute', left: `${x1}%`, top: `${y1}%`, width: `${x2 - x1}%`, height: `${y2 - y1}%`, border: '1.5px solid #06b6d4', boxSizing: 'border-box', pointerEvents: 'none' }}>
        {[33, 66].map(p => <div key={`h${p}`} style={{ position: 'absolute', left: 0, right: 0, top: `${p}%`, height: 1, background: 'rgba(6,182,212,0.3)' }} />)}
        {[33, 66].map(p => <div key={`v${p}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${p}%`, width: 1, background: 'rgba(6,182,212,0.3)' }} />)}
      </div>
      {/* drag handles */}
      {handles.map(({ id, rx, ry, cursor }) => (
        <div key={id} onMouseDown={e => onHandleDown(id, e)} style={{
          position: 'absolute', left: `calc(${rx}% - 5px)`, top: `calc(${ry}% - 5px)`,
          width: 10, height: 10, background: '#06b6d4', border: '2px solid #fff',
          borderRadius: 2, cursor, zIndex: 25, pointerEvents: 'all', boxShadow: '0 0 6px rgba(6,182,212,0.8)',
        }} />
      ))}
    </div>
  )
}

// ─── Timeline track helpers ───────────────────────────────────────────────────

const SingleClipTrack = forwardRef(function SingleClipTrack(
  { label, color, duration, editMode, trimStart, trimEnd, onTrimDrag, labelColor }, ref
) {
  const showTrim = editMode === 'trim' && duration > 0
  const ts = trimStart ?? 0, te = trimEnd ?? duration
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: 36 }}>
      <TrackLabel color={labelColor}>{label}</TrackLabel>
      <div ref={ref} style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, position: 'relative', overflow: 'visible' }}>
        <div style={{ position: 'absolute', inset: '30% 0', background: `${color}18`, borderRadius: 4 }} />
        {showTrim && ts > 0 && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(ts / duration) * 100}%`, background: 'rgba(0,0,0,0.55)', borderRadius: '5px 0 0 5px', zIndex: 3 }} />}
        {showTrim && te < duration && <div style={{ position: 'absolute', left: `${(te / duration) * 100}%`, top: 0, bottom: 0, right: 0, background: 'rgba(0,0,0,0.55)', borderRadius: '0 5px 5px 0', zIndex: 3 }} />}
        {showTrim && (
          <>
            <TrimHandle position={(ts / duration) * 100} which="start" label={fmt(ts)} onMouseDown={e => onTrimDrag?.('start', e)} />
            <TrimHandle position={(te / duration) * 100} which="end" label={fmt(te)} onMouseDown={e => onTrimDrag?.('end', e)} />
          </>
        )}
      </div>
    </div>
  )
})

function TrimHandle({ position, which, label, onMouseDown }) {
  const [hover, setHover] = useState(false)
  return (
    <div onMouseDown={onMouseDown} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ position: 'absolute', left: `${position}%`, top: -8, bottom: -8, width: 10, background: hover ? '#60a5fa' : '#3b82f6', borderRadius: 3, border: '2px solid #fff', cursor: 'ew-resize', zIndex: 12, transform: 'translateX(-50%)', boxShadow: `0 0 ${hover ? 10 : 6}px rgba(59,130,246,0.8)`, transition: 'background 0.1s, box-shadow 0.1s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ width: 1, height: '45%', background: 'rgba(255,255,255,0.7)', boxShadow: '2px 0 0 rgba(255,255,255,0.7),-2px 0 0 rgba(255,255,255,0.7)' }} />
      {hover && (
        <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#3b82f6', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', pointerEvents: 'none' }}>
          {label}
        </div>
      )}
    </div>
  )
}

function MultiClipTrack({ label, segments, transitions, duration, activeIdx, audio = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: 36 }}>
      <TrackLabel>{label}</TrackLabel>
      <div style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, position: 'relative', overflow: 'hidden' }}>
        {duration > 0 && segments.map((seg, i) => {
          const lp = (seg.start / duration) * 100, wp = ((seg.end - seg.start) / duration) * 100
          const active = i === activeIdx
          return (
            <div key={seg.clip.id} title={seg.clip.name} style={{ position: 'absolute', left: `${lp}%`, width: `${wp}%`, top: audio ? '38%' : '14%', bottom: '14%', background: `${seg.color}${active ? '3a' : '1c'}`, borderTop: `2px solid ${seg.color}${active ? 'cc' : '55'}`, transition: 'background 0.25s, border-color 0.25s', overflow: 'hidden' }}>
              {!audio && wp > 5 && <span style={{ position: 'absolute', top: '50%', left: 4, transform: 'translateY(-50%)', fontSize: 8, fontFamily: 'JetBrains Mono, monospace', color: active ? seg.color : `${seg.color}88`, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '90%' }}>{seg.clip.name}{seg.clip.edits?.trim && ' ✂'}</span>}
            </div>
          )
        })}
        {duration > 0 && transitions.map((tr, i) => {
          const lp = (tr.at / duration) * 100, color = TRANSITION_COLORS[tr.type] ?? TRANSITION_COLORS.cut
          return <div key={i} title={`${tr.type} transition`} style={{ position: 'absolute', left: `${lp}%`, top: 0, bottom: 0, width: 2, background: color, transform: 'translateX(-50%)', zIndex: 3 }}>{!audio && <div style={{ position: 'absolute', top: -2, left: '50%', transform: 'translateX(-50%)', width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 5px ${color}` }} />}</div>
        })}
      </div>
    </div>
  )
}

function EditsTrack({ clip, trimStart, trimEnd, speed }) {
  const dur = clip?.duration ?? 0; if (!dur) return null
  const hasTrim = clip?.edits?.trim, hasSpeed = speed !== 1
  const hasCrop = !!clip?.edits?.crop, hasRot = !!(clip?.edits?.rotation)
  const hasFlip = clip?.edits?.flipH || clip?.edits?.flipV, isSaved = !!clip?.savedEdits
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: 28 }}>
      <TrackLabel color="#ec4899" style={{ fontSize: 7 }}>EDITS</TrackLabel>
      <div style={{ flex: 1, background: isSaved ? 'rgba(34,197,94,0.04)' : 'rgba(236,72,153,0.04)', border: `1px solid ${isSaved ? 'rgba(34,197,94,0.2)' : 'rgba(236,72,153,0.18)'}`, borderRadius: 6, position: 'relative', overflow: 'visible' }}>
        {isSaved && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'rgba(34,197,94,0.4)', borderRadius: '5px 5px 0 0' }} />}
        {hasTrim && <>
          {trimStart > 0 && <div style={{ position: 'absolute', left: 0, top: '18%', bottom: '18%', width: `${(trimStart / dur) * 100}%`, background: 'rgba(239,68,68,0.25)', border: '1px dashed rgba(239,68,68,0.4)', borderRadius: '3px 0 0 3px' }} />}
          <div style={{ position: 'absolute', left: `${(trimStart / dur) * 100}%`, width: `${((trimEnd - trimStart) / dur) * 100}%`, top: '18%', bottom: '18%', background: 'rgba(59,130,246,0.3)', border: '1px solid #3b82f680', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <span style={{ fontSize: 7, fontFamily: 'JetBrains Mono, monospace', color: '#3b82f6', whiteSpace: 'nowrap' }}>✂ {fmt(trimStart)}–{fmt(trimEnd)}</span>
          </div>
          {trimEnd < dur && <div style={{ position: 'absolute', left: `${(trimEnd / dur) * 100}%`, top: '18%', bottom: '18%', right: 0, background: 'rgba(239,68,68,0.25)', border: '1px dashed rgba(239,68,68,0.4)', borderRadius: '0 3px 3px 0' }} />}
        </>}
        <div style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 3, alignItems: 'center' }}>
          {hasSpeed && <Chip color="#f59e0b">{speed}×</Chip>}
          {hasCrop && <Chip color="#06b6d4">CROP</Chip>}
          {hasRot && <Chip color="#8b5cf6">{clip.edits.rotation}°</Chip>}
          {hasFlip && <Chip color="#f59e0b">{clip.edits.flipH ? 'FLIP-H' : ''}{clip.edits.flipV ? ' FLIP-V' : ''}</Chip>}
          {isSaved && <Chip color="#22c55e">SAVED</Chip>}
        </div>
      </div>
    </div>
  )
}

function ColorTrack({ clip }) {
  const ce = clip?.colorEdits; if (!hasColorEdits(ce)) return null
  const { exposure = 0, contrast = 0, saturation = 0, temperature = 0, vignette = 0, wheels = {} } = ce ?? {}
  const hasWheels = Object.values(wheels).some(w => w.x !== 0 || w.y !== 0)
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: 24 }}>
      <TrackLabel color="#a78bfa">COLOR</TrackLabel>
      <div style={{ flex: 1, background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 6, position: 'relative', overflow: 'visible', display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'absolute', inset: '18% 0', background: 'rgba(139,92,246,0.15)', borderRadius: 3 }} />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'rgba(139,92,246,0.5)', borderRadius: '5px 5px 0 0' }} />
        <div style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 3, alignItems: 'center' }}>
          {exposure !== 0 && <Chip color="#f59e0b">EXP {exposure > 0 ? '+' : ''}{Math.round(exposure)}</Chip>}
          {contrast !== 0 && <Chip color="#a78bfa">CON {contrast > 0 ? '+' : ''}{Math.round(contrast)}</Chip>}
          {saturation !== 0 && <Chip color="#f87171">SAT {saturation > 0 ? '+' : ''}{Math.round(saturation)}</Chip>}
          {temperature !== 0 && <Chip color="#f59e0b">{temperature > 0 ? '🔥' : '❄️'} {Math.abs(Math.round(temperature))}</Chip>}
          {vignette > 0 && <Chip color="#6366f1">VIG {Math.round(vignette)}%</Chip>}
          {hasWheels && <Chip color="#a78bfa">WHEELS</Chip>}
        </div>
      </div>
    </div>
  )
}

function TrackLabel({ children, color }) {
  return (
    <div style={{ width: 44, flexShrink: 0, display: 'flex', alignItems: 'center', fontSize: 8, fontFamily: 'JetBrains Mono, monospace', color: color || 'var(--muted)', letterSpacing: '0.08em', paddingRight: 8, textTransform: 'uppercase' }}>
      {children}
    </div>
  )
}

function Chip({ color, children }) {
  return (
    <span style={{ fontSize: 7, fontFamily: 'JetBrains Mono, monospace', color, background: `${color}18`, border: `1px solid ${color}44`, borderRadius: 3, padding: '1px 4px', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

function LegendSingle({ edits, trimStart, trimEnd, isSaved, isUnsaved, colorEdits, filterEdits, textCount }) {
  const items = []
  if (edits.trim) items.push({ color: '#3b82f6', label: `✂ ${fmt(trimStart)}–${fmt(trimEnd)}` })
  if (edits.speed !== 1) items.push({ color: '#f59e0b', label: `${edits.speed}× speed` })
  if (edits.crop) items.push({ color: '#06b6d4', label: 'Crop applied' })
  if (edits.rotation) items.push({ color: '#8b5cf6', label: `Rotated ${edits.rotation}°` })
  if (edits.flipH) items.push({ color: '#f59e0b', label: 'Flip H' })
  if (edits.flipV) items.push({ color: '#f59e0b', label: 'Flip V' })
  if (hasColorEdits(colorEdits)) items.push({ color: '#a78bfa', label: 'Color graded' })
  if (hasFilterApplied(filterEdits)) items.push({ color: '#a78bfa', label: `◈ ${getFilterLabel(filterEdits.filterId)}` })
  if (textCount > 0) items.push({ color: '#ec4899', label: `T ${textCount} text layer${textCount !== 1 ? 's' : ''}` })
  if (!items.length && !isSaved) return <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'JetBrains Mono, monospace' }}>no edits · click video to open toolbar</span>
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {items.map(({ color, label }, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <div style={{ width: 6, height: 6, borderRadius: 2, background: color }} />
          <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)' }}>{label}</span>
        </div>
      ))}
      {isSaved && !isUnsaved && <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#22c55e', background: '#22c55e18', border: '1px solid #22c55e44', borderRadius: 4, padding: '1px 6px' }}>✓ saved</span>}
      {isUnsaved && <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#f59e0b' }}>· unsaved</span>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main EditorArea
// ─────────────────────────────────────────────────────────────────────────────

export default function EditorArea() {
  const activeClipId = useClippiStore(s => s.activeClipId)

  const {
    getActiveClip, setView, setActiveClip, clips, nodes, edges,
    updateClipEdits, saveClipEdits, revertToSaved, revertClipEdits,
    updateClipColorEdits, resetClipColorEdits,
    updateClipFilterEdits, resetClipFilterEdits,
    addTextOverlay, updateTextOverlay, removeTextOverlay, duplicateTextOverlay,
  } = useClippiStore()

  const canvasRef = useRef(null)
  const [ghost, setGhost] = useState(null)

  const captureFrame = useCallback(() => {
    const v = videoRef.current, c = canvasRef.current
    if (!v || !c || !v.videoWidth) return null
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.9)
  }, [])

  const initialClip = getActiveClip()
  const [source, setSource] = useState(initialClip?.id ?? 'entire')
  const [dropdownOpen, setDropdownOpen] = useState(false)

  // Sync source whenever the store's activeClipId changes (e.g. after AI processes a clip)
  useEffect(() => {
    if (activeClipId && clips.some(c => c.id === activeClipId)) {
      setSource(activeClipId)
    }
  }, [activeClipId])

  const [toolbarVisible, setToolbarVisible] = useState(false)
  const [activeTab, setActiveTab] = useState(null)
  const [editMode, setEditMode] = useState(null)

  // ── Text overlay state ────────────────────────────────────────────────────
  const [selectedTextId, setSelectedTextId] = useState(null)
  const [editingTextId, setEditingTextId] = useState(null)

  const videoRef = useRef(null)
  const videoWrapRef = useRef(null)
  const timelineRef = useRef(null)
  const videoTrackRef = useRef(null)

  // ── Video rect tracking (for text positioning) ────────────────────────────
  const [videoRect, setVideoRect] = useState({ left: 0, top: 0, width: 0, height: 0 })
  const [videoAspect, setVideoAspect] = useState(16 / 9)

  const updateVideoRect = useCallback(() => {
    const v = videoRef.current
    const wrap = videoWrapRef.current
    if (!v || !wrap) return
    const cw = wrap.clientWidth
    const ch = wrap.clientHeight
    const asp = videoAspect
    let w, h
    if (cw / ch > asp) { h = ch; w = ch * asp }
    else { w = cw; h = cw / asp }
    const left = (cw - w) / 2
    const top = (ch - h) / 2
    setVideoRect({ left, top, width: w, height: h })
  }, [videoAspect])

  useEffect(() => {
    updateVideoRect()
    window.addEventListener('resize', updateVideoRect)
    return () => window.removeEventListener('resize', updateVideoRect)
  }, [updateVideoRect])

  // Re-compute when wrap dimensions change
  useEffect(() => {
    if (!videoWrapRef.current) return
    const ro = new ResizeObserver(updateVideoRect)
    ro.observe(videoWrapRef.current)
    return () => ro.disconnect()
  }, [updateVideoRect])

  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [currentT, setCurrentT] = useState(0)
  const [ready, setReady] = useState(false)

  const [playlistIdx, setPlaylistIdx] = useState(0)
  const autoPlayRef = useRef(false)
  const seekPendRef = useRef(null)
  const transPendRef = useRef(null)
  const trimFiredRef = useRef(false)

  const [draggingTrim, setDraggingTrim] = useState(null)
  const [transOverlay, setTransOverlay] = useState(null)

  const orderedEntries = useMemo(() => buildOrdered(nodes, edges, clips), [nodes, edges, clips])
  const orderedClips = useMemo(() => orderedEntries.map(e => e.clip), [orderedEntries])

  const clipSegments = useMemo(() => {
    let off = 0
    return orderedClips.map((clip, i) => {
      const raw = clip.duration ?? 0
      const eff = clip.edits?.trim ? clip.edits.trim.end - clip.edits.trim.start : raw
      const seg = { clip, index: i, start: off, end: off + eff, rawDur: raw, effDur: eff, color: CLIP_PALETTE[i % CLIP_PALETTE.length] }
      off += eff
      return seg
    })
  }, [orderedClips])

  const totalDuration = clipSegments.length ? clipSegments.at(-1).end : 0

  const transitions = useMemo(() => (
    orderedEntries.slice(0, -1).map((entry, i) => {
      const next = orderedEntries[i + 1]; if (!next) return null
      const edge = edges.find(e => e.source === entry.nodeId && e.target === next.nodeId)
      return { at: clipSegments[i + 1]?.start ?? 0, type: edge?.data?.transition ?? 'cut' }
    }).filter(Boolean)
  ), [orderedEntries, edges, clipSegments])

  const activeClip = useMemo(() => {
    if (source === 'entire') return orderedClips[playlistIdx] ?? null
    return clips.find(c => c.id === source) ?? null
  }, [source, orderedClips, playlistIdx, clips])

  const clipEdits = activeClip?.edits ?? DEFAULT_EDITS()
  const trimStart = clipEdits.trim?.start ?? 0
  const trimEnd = clipEdits.trim?.end ?? (activeClip?.duration ?? 0)
  const activeSpeed = clipEdits.speed ?? 1
  const isUnsaved = activeClip ? hasUnsavedChanges(activeClip) : false
  const hasSaved = !!activeClip?.savedEdits

  const colorEdits = activeClip?.colorEdits ?? DEFAULT_COLOR_EDITS()
  const filterEdits = activeClip?.filterEdits ?? DEFAULT_FILTER_EDITS()
  const textOverlays = activeClip?.textOverlays ?? []
  const captions = activeClip?.captions ?? []
  const audioEffects = activeClip?.audioEffects ?? []
  const showAudioTrack = audioEffects.length > 0
  const visualEffects = activeClip?.visualEffects ?? []
  const showVisualTrack = visualEffects.length > 0

  const colorCSS = buildCSSFilter(colorEdits)
  const vignetteStyle = buildVignetteStyle(colorEdits)
  const filterCSS = buildFilterCSS(filterEdits?.filterId, filterEdits?.intensity)
  const filterActive = hasFilterApplied(filterEdits)
  const combinedFilter = [filterCSS, colorCSS].filter(Boolean).join(' ') || undefined

  const displayDuration = source === 'entire' ? totalDuration : (activeClip?.duration ?? 0)

  const globalTime = useMemo(() => {
    if (source !== 'entire') return currentT
    return (clipSegments[playlistIdx]?.start ?? 0) + (currentT - (orderedClips[playlistIdx]?.edits?.trim?.start ?? 0))
  }, [source, clipSegments, playlistIdx, currentT, orderedClips])

  const playheadPct = displayDuration > 0 ? (globalTime / displayDuration) * 100 : 0
  const clipSrc = activeClip
  ? (activeClip.aiVideoUrl || `/api/clips/${activeClip.id}/file?v=${activeClip.refreshKey ?? 0}`)
  : null

  // ── Which text overlays are visible RIGHT NOW ─────────────────────────────
  const visibleTextOverlays = useMemo(() => {
    if (source === 'entire') {
      const result = []
      clipSegments.forEach(seg => {
        const clip = seg.clip
        if (!clip.textOverlays?.length) return
        clip.textOverlays.forEach(overlay => {
          const trimOffset = clip.edits?.trim?.start ?? 0
          const globalStart = seg.start + overlay.startTime - trimOffset
          const globalEnd = seg.start + overlay.endTime - trimOffset
          if (globalTime >= globalStart && globalTime <= globalEnd) {
            result.push({ ...overlay, startTime: globalStart, endTime: globalEnd })
          }
        })
      })
      return result
    }
    return textOverlays.filter(o => isOverlayVisible(o, currentT))
  }, [source, globalTime, currentT, textOverlays, clipSegments])

  // ── Track visibility flags ────────────────────────────────────────────────
  const showEditsTrack = source !== 'entire' && (clipEdits.trim || clipEdits.crop || clipEdits.rotation || clipEdits.flipH || clipEdits.flipV || activeSpeed !== 1 || hasSaved)
  const showColorTrack = source !== 'entire' && hasColorEdits(colorEdits)
  const showFilterTrack = source !== 'entire' && filterActive
  const showTextTrack = source !== 'entire' && textOverlays.length > 0

  // ── Text tab active ───────────────────────────────────────────────────────
  const textTabActive = activeTab === 'text' && toolbarVisible

  // ── Source change → reset ─────────────────────────────────────────────────
  useEffect(() => {
    setPlaying(false); setCurrentT(0); setReady(false)
    setPlaylistIdx(0); setEditMode(null); setActiveTab(null)
    autoPlayRef.current = false; seekPendRef.current = null
    trimFiredRef.current = false; setToolbarVisible(false)
    setSelectedTextId(null); setEditingTextId(null)
  }, [source])

  

  useEffect(() => { const v = videoRef.current; if (!v || !ready) return; v.playbackRate = activeSpeed }, [activeSpeed, ready])

  // ── Trim drag ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!draggingTrim || source === 'entire' || !activeClip) return
    const id = activeClip.id, dur = activeClip.duration ?? 0
    const onMove = (e) => {
      const bar = videoTrackRef.current; if (!bar) return
      const rect = bar.getBoundingClientRect()
      const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1)
      const t = ratio * dur
      const curS = clipEdits.trim?.start ?? 0, curE = clipEdits.trim?.end ?? dur
      if (draggingTrim === 'start') {
        const ns = clamp(t, 0, curE - 0.5)
        updateClipEdits(id, { trim: { start: ns, end: curE } })
        if (videoRef.current) { videoRef.current.currentTime = ns; setCurrentT(ns) }
      } else {
        const ne = clamp(t, curS + 0.5, dur)
        updateClipEdits(id, { trim: { start: curS, end: ne } })
        if (videoRef.current) { videoRef.current.currentTime = ne; setCurrentT(ne) }
      }
    }
    const onUp = () => setDraggingTrim(null)
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [draggingTrim, activeClip, source, updateClipEdits, clipEdits])

  const onClipEnd = useCallback(() => {
    const next = playlistIdx + 1
    if (source === 'entire' && next < orderedClips.length) {
      const fromId = orderedEntries[playlistIdx]?.nodeId, toId = orderedEntries[next]?.nodeId
      const edge = edges.find(e => e.source === fromId && e.target === toId)
      const tt = edge?.data?.transition ?? 'cut'
      autoPlayRef.current = playing
      if (tt === 'cut') { setPlaylistIdx(next); setCurrentT(0); setReady(false) }
      else {
        const frame = captureFrame(); setGhost(frame)
        setTransOverlay({ type: tt, phase: 'hold' }); transPendRef.current = tt
        setPlaylistIdx(next); setCurrentT(0); setReady(false)
      }
    } else { setPlaying(false) }
  }, [source, playlistIdx, orderedClips.length, orderedEntries, edges, playing, captureFrame])

  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current; if (!v) return
    const t = v.currentTime; setCurrentT(t)
    const te = clipEdits.trim?.end
    if (te !== undefined && t >= te - 0.15 && !trimFiredRef.current) {
      trimFiredRef.current = true; v.pause(); onClipEnd()
    }
  }, [clipEdits, onClipEnd])

  const onLoadedMetadata = useCallback(() => {
    const v = videoRef.current; if (!v) return
    setReady(true); trimFiredRef.current = false
    v.playbackRate = activeSpeed
    // Update aspect ratio for text positioning
    if (v.videoWidth && v.videoHeight) {
      setVideoAspect(v.videoWidth / v.videoHeight)
    }
    const ts = clipEdits.trim?.start ?? 0
    v.currentTime = seekPendRef.current !== null ? seekPendRef.current : ts
    setCurrentT(v.currentTime); seekPendRef.current = null
    if (transPendRef.current) {
      const tt = transPendRef.current; transPendRef.current = null
      setTransOverlay({ type: tt, phase: 'in' })
      if (autoPlayRef.current) { v.play().then(() => setPlaying(true)).catch(() => { }); autoPlayRef.current = false }
      setTimeout(() => { setTransOverlay(null); setGhost(null) }, TRANS_MS)
    } else if (autoPlayRef.current) {
      v.play().then(() => setPlaying(true)).catch(() => { }); autoPlayRef.current = false
    }
  }, [activeSpeed, clipEdits])

  // Re-compute video rect when ready
  useEffect(() => { if (ready) updateVideoRect() }, [ready, updateVideoRect])

  

  const onEnded = useCallback(() => { if (!trimFiredRef.current) onClipEnd() }, [onClipEnd])

// - Around line 527
const onVideoClick = useCallback((e) => {
  if (editMode === 'crop' || textTabActive) return 
  
  // We removed the line that toggles setToolbarVisible here
  const v = videoRef.current; if (!v) return
  if (v.paused) { v.play(); setPlaying(true) } else { v.pause(); setPlaying(false) }
}, [editMode, textTabActive])

  const togglePlay = useCallback(() => {
    const v = videoRef.current; if (!v) return
    if (v.paused) {
      trimFiredRef.current = false   // ← allow trim to fire again
      const ts = clipEdits.trim?.start ?? 0
      const te = clipEdits.trim?.end ?? (activeClip?.duration ?? 0)
      // If sitting at/past the trim end, jump back to trim start
      if (v.currentTime >= te - 0.1) {
        v.currentTime = ts
        setCurrentT(ts)
      }
      v.play(); setPlaying(true)
    } else {
      v.pause(); setPlaying(false)
    }
  }, [clipEdits, activeClip])

  const toggleMute = useCallback(() => {
    const v = videoRef.current; if (!v) return
    if (v.paused) {
      trimFiredRef.current = false
      const ts = clipEdits.trim?.start ?? 0
      const te = clipEdits.trim?.end ?? (activeClip?.duration ?? 0)
      if (v.currentTime >= te - 0.1) {
        v.currentTime = ts
        setCurrentT(ts)
      }
      v.play(); setPlaying(true)
    } else {
      v.pause(); setPlaying(false)
    }
  }, [])

  useEffect(() => {
  const handleKeyDown = (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      togglePlay();
    }
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [togglePlay]);

  const seekTo = useCallback((clientX) => {
    if (draggingTrim) return
    const bar = timelineRef.current; if (!bar) return
    const rect = bar.getBoundingClientRect()
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
    if (source === 'entire') {
      const gt = ratio * totalDuration
      const seg = clipSegments.find(s => gt >= s.start && gt <= s.end)
      if (!seg) return
      const localT = gt - seg.start + (seg.clip.edits?.trim?.start ?? 0)
      if (seg.index !== playlistIdx) { seekPendRef.current = localT; autoPlayRef.current = playing; if (videoRef.current) videoRef.current.pause(); setPlaylistIdx(seg.index); setCurrentT(localT); setReady(false) }
      else if (videoRef.current) { videoRef.current.currentTime = localT; setCurrentT(localT) }
    } else {
      const dur = activeClip?.duration ?? 0; if (!dur) return
      const t = ratio * dur
      if (videoRef.current) { videoRef.current.currentTime = t; setCurrentT(t) }
    }
  }, [source, totalDuration, clipSegments, playlistIdx, playing, activeClip, draggingTrim])

  const onTimelineClick = (e) => seekTo(e.clientX)
  const onTimelineDrag = (e) => { if (e.buttons === 1) seekTo(e.clientX) }

  const handleApplyEdit = useCallback((type, value) => {
    if (!activeClip) return
    const id = activeClip.id
    if (type === 'speed') { updateClipEdits(id, { speed: value }); if (videoRef.current) videoRef.current.playbackRate = value; return }
    if (type === 'rotation') { updateClipEdits(id, { rotation: value }); return }
    if (type === 'flipH') { updateClipEdits(id, { flipH: value }); return }
    if (type === 'flipV') { updateClipEdits(id, { flipV: value }); return }
  }, [activeClip, updateClipEdits])

  const handleSave = useCallback(() => { if (activeClip) saveClipEdits(activeClip.id) }, [activeClip, saveClipEdits])
  const handleRevertToSaved = useCallback(() => {
    if (!activeClip) return; revertToSaved(activeClip.id); setEditMode(null); trimFiredRef.current = false
    const ts = activeClip.savedEdits?.trim?.start ?? 0
    if (videoRef.current) { videoRef.current.playbackRate = activeClip.savedEdits?.speed ?? 1; videoRef.current.currentTime = ts }; setCurrentT(ts)
  }, [activeClip, revertToSaved])
  const handleRevertAll = useCallback(() => {
    if (!activeClip) return; revertClipEdits(activeClip.id); setEditMode(null); trimFiredRef.current = false
    if (videoRef.current) { videoRef.current.playbackRate = 1; videoRef.current.currentTime = 0 }; setCurrentT(0)
  }, [activeClip, revertClipEdits])
  const handleCropChange = useCallback((newCrop) => { if (activeClip) updateClipEdits(activeClip.id, { crop: newCrop }) }, [activeClip, updateClipEdits])

  const startTrimDrag = useCallback((handle, e) => {
    e.preventDefault(); e.stopPropagation()
    if (!activeClip?.edits?.trim) updateClipEdits(activeClip.id, { trim: { start: 0, end: activeClip.duration ?? 0 } })
    setDraggingTrim(handle)
  }, [activeClip, updateClipEdits])

  // ── Text handlers ─────────────────────────────────────────────────────────
  const handleTextAdd = useCallback((partialOverlay = {}) => {
    if (!activeClip || source === 'entire') return
    addTextOverlay(activeClip.id, { ...partialOverlay, startTime: partialOverlay.startTime ?? currentT, endTime: partialOverlay.endTime ?? Math.min(currentT + 5, activeClip.duration ?? 10) })
    // Select the newly added overlay (it'll be the last one after re-render)
    setTimeout(() => {
      const clip = useClippiStore.getState().clips.find(c => c.id === activeClip.id)
      const last = clip?.textOverlays?.at(-1)
      if (last) setSelectedTextId(last.id)
    }, 20)
  }, [activeClip, source, currentT, addTextOverlay])

  const handleTextUpdate = useCallback((overlayId, patch) => {
    if (!activeClip) return
    updateTextOverlay(activeClip.id, overlayId, patch)
  }, [activeClip, updateTextOverlay])

  const handleTextRemove = useCallback((overlayId) => {
    if (!activeClip) return
    removeTextOverlay(activeClip.id, overlayId)
    if (selectedTextId === overlayId) setSelectedTextId(null)
    if (editingTextId === overlayId) setEditingTextId(null)
  }, [activeClip, removeTextOverlay, selectedTextId, editingTextId])

  const handleTextDuplicate = useCallback((overlayId) => {
    if (!activeClip) return
    duplicateTextOverlay(activeClip.id, overlayId)
  }, [activeClip, duplicateTextOverlay])

  const handleSelectTextOverlay = useCallback((id) => {
    setSelectedTextId(id)
    if (id && !toolbarVisible) { setToolbarVisible(true); setActiveTab('text') }
    else if (id && activeTab !== 'text') setActiveTab('text')
  }, [toolbarVisible, activeTab])

  // Click on the text track block → open text panel
  const handleTextTrackSelect = useCallback((overlayId) => {
    setSelectedTextId(overlayId)
    setToolbarVisible(true)
    setActiveTab('text')
  }, [])

  // Click away from text overlays (on video) when text tab active → deselect
  const handleVideoAreaClick = useCallback((e) => {
    if (textTabActive && e.target === videoRef.current) {
      setSelectedTextId(null)
      setEditingTextId(null)
    }
    if (editMode === 'crop') return
    if (!textTabActive) {
      setToolbarVisible(prev => !prev)
      const v = videoRef.current; if (!v) return
      if (v.paused) { v.play(); setPlaying(true) } else { v.pause(); setPlaying(false) }
    }
  }, [textTabActive, editMode])

  const ticks = buildTicks(displayDuration)

  const sourceOptions = useMemo(() => [
    { id: 'entire', label: 'Entire Video', sub: `${orderedClips.length} clip${orderedClips.length !== 1 ? 's' : ''} · ${fmt(totalDuration)}`, icon: <Layers size={12} /> },
    ...clips.map(c => ({
      id: c.id, label: c.name, sub: fmt(c.duration ?? 0), icon: <Film size={12} />, thumbnail: c.thumbnail_url,
      hasEdits: !!(c.edits?.trim || c.edits?.crop || c.edits?.rotation || c.edits?.flipH || c.edits?.flipV || (c.edits?.speed && c.edits.speed !== 1)),
      hasColor: hasColorEdits(c.colorEdits),
      hasFilter: hasFilterApplied(c.filterEdits),
      hasText: (c.textOverlays?.length ?? 0) > 0,
    })),
  ], [clips, orderedClips.length, totalDuration])

  const currentOption = sourceOptions.find(o => o.id === source) ?? sourceOptions[0]

  // ── Heights ───────────────────────────────────────────────────────────────
  const audioTrackH = showAudioTrack
    ? (audioEffects.filter(e => ['dubbing', 'denoising'].includes(e.kind)).length * 28) +
    (audioEffects.some(e => ['sound_effect', 'music', 'voiceover'].includes(e.kind)) ? 28 : 0) +
    (audioEffects.some(e => e.kind === 'captions') ? 28 : 0)
    : 0

  const timelineH = 192
    + (showEditsTrack ? 33 : 0)
    + (showColorTrack ? 29 : 0)
    + (showFilterTrack ? 29 : 0)
    + (showTextTrack ? 33 : 0)
    + (showVisualTrack ? (visualEffects.length * 28) : 0)
    + audioTrackH

  const toolbarH = toolbarVisible
    ? (activeTab === 'edit' ? (editMode ? 88 : 70)
      : activeTab === 'color' ? 282
        : activeTab === 'filters' ? (filterActive ? 265 : 222)
          : activeTab === 'text' ? 340
            : activeTab ? 72 : 52)
    : 0

  const videoH = `calc(100% - 48px - ${timelineH}px - ${toolbarH}px)`

  // ── Empty state ───────────────────────────────────────────────────────────
  if (clips.length === 0) {
    return (
      <div style={S.emptyWrap}>
        <div style={S.emptyIcon}><Film size={24} color="var(--muted)" /></div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'Syne, sans-serif', fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No clips yet</p>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>Upload clips on the Canvas, then come back here.</p>
        </div>
        <button onClick={() => setView('canvas')} style={S.backBtn}><ArrowLeft size={13} /> Back to Canvas</button>
      </div>
    )
  }

  return (
    <motion.div key={source} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}
      style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}
    >

      {/* ── Header ────────────────────────────────────────────────────────── */}
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{ height: 48, background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10, flexShrink: 0 }}>
        <button onClick={() => setView('canvas')} style={S.backBtn}><ArrowLeft size={13} /> Back to Flow</button>
        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

        {/* Source picker */}
        <div style={{ position: 'relative', zIndex: 50 }}>
          <button onClick={() => setDropdownOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: dropdownOpen ? 'var(--surface2)' : 'transparent', border: `1px solid ${dropdownOpen ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)', transition: 'all 0.15s', minWidth: 220 }}>
            <span style={{ color: source === 'entire' ? 'var(--accent)' : 'var(--muted)', flexShrink: 0 }}>{currentOption.icon}</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentOption.label}</span>
            <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>{currentOption.sub}</span>
            {currentOption.hasEdits && <span style={{ fontSize: 7, color: '#3b82f6', background: '#3b82f618', border: '1px solid #3b82f644', borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>EDITED</span>}
            {currentOption.hasColor && <span style={{ fontSize: 7, color: '#8b5cf6', background: '#8b5cf618', border: '1px solid #8b5cf644', borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>COLOR</span>}
            {currentOption.hasFilter && <span style={{ fontSize: 7, color: '#a78bfa', background: '#a78bfa18', border: '1px solid #a78bfa44', borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>FILTER</span>}
            {currentOption.hasText && <span style={{ fontSize: 7, color: '#ec4899', background: '#ec489918', border: '1px solid #ec489944', borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>TEXT</span>}
            <ChevronDown size={12} color="var(--muted)" style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
          </button>

          {dropdownOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.65)', minWidth: 280 }}>
              {sourceOptions.map((opt, idx) => (
                <button key={opt.id} onClick={() => { setSource(opt.id); if (opt.id !== 'entire') setActiveClip(opt.id); setDropdownOpen(false) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', background: source === opt.id ? 'rgba(59,130,246,0.12)' : 'transparent', border: 'none', borderBottom: idx < sourceOptions.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 0.12s' }}
                  onMouseEnter={e => { if (source !== opt.id) e.currentTarget.style.background = 'var(--surface2)' }}
                  onMouseLeave={e => { if (source !== opt.id) e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ width: 40, height: 26, borderRadius: 5, flexShrink: 0, background: 'var(--surface2)', overflow: 'hidden', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {opt.thumbnail ? <img src={opt.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: source === opt.id ? 'var(--accent)' : 'var(--muted)' }}>{opt.icon}</span>}
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: source === opt.id ? 'var(--accent)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{opt.sub}</div>
                  </div>
                  {opt.hasEdits && <span style={{ fontSize: 7, color: '#3b82f6' }}>✎</span>}
                  {opt.hasColor && <span style={{ fontSize: 7, color: '#8b5cf6' }}>◎</span>}
                  {opt.hasFilter && <span style={{ fontSize: 7, color: '#a78bfa' }}>◈</span>}
                  {opt.hasText && <span style={{ fontSize: 7, color: '#ec4899' }}>T</span>}
                  {source === opt.id && <span style={{ fontSize: 11, color: 'var(--accent)', flexShrink: 0 }}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {displayDuration > 0 && (
          <div style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '4px 10px'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 7, color: 'var(--muted)', fontFamily: 'JetBrains Mono' }}>PEAK</span>
              <VolumeMeter videoRef={videoRef} />
            </div>
            <div style={{ width: 1, height: 14, background: 'var(--border)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'var(--muted)' }}>
              <Clock size={9} />{fmt(displayDuration)}
            </div>
          </div>
        )}
      </div>

      {dropdownOpen && <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setDropdownOpen(false)} />}

      {/* ── Video preview ──────────────────────────────────────────────────── */}
      <div
        ref={videoWrapRef}
        style={{ flex: '0 0 auto', background: '#000', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: videoH, transition: 'height 0.18s ease', cursor: clipSrc && editMode !== 'crop' ? 'pointer' : 'default', overflow: 'hidden' }}
        onClick={handleVideoAreaClick}
      >
        {/* Hint */}
        {clipSrc && !toolbarVisible && (
          <div style={{ position: 'absolute', top: 10, right: 10, fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(255,255,255,0.28)', background: 'rgba(0,0,0,0.38)', borderRadius: 4, padding: '2px 7px', pointerEvents: 'none', zIndex: 6 }}>
            click to edit
          </div>
        )}

        {/* Badges */}
        {isUnsaved && source !== 'entire' && <div style={{ position: 'absolute', top: 10, left: 10, fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#f59e0b', background: 'rgba(0,0,0,0.65)', border: '1px solid #f59e0b44', borderRadius: 5, padding: '2px 8px', zIndex: 22, pointerEvents: 'none' }}>● unsaved changes</div>}
        {filterActive && source !== 'entire' && <div style={{ position: 'absolute', top: isUnsaved ? 38 : 10, left: 10, fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#a78bfa', background: 'rgba(0,0,0,0.65)', border: '1px solid #a78bfa44', borderRadius: 5, padding: '2px 8px', zIndex: 22, pointerEvents: 'none' }}>◈ {getFilterLabel(filterEdits?.filterId)}</div>}
        {hasColorEdits(colorEdits) && source !== 'entire' && <div style={{ position: 'absolute', top: isUnsaved ? (filterActive ? 66 : 38) : (filterActive ? 38 : 10), left: 10, fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#a78bfa', background: 'rgba(0,0,0,0.65)', border: '1px solid #8b5cf644', borderRadius: 5, padding: '2px 8px', zIndex: 22, pointerEvents: 'none' }}>◎ color graded</div>}

        {/* Video element */}
        {clipSrc ? (
          <video ref={videoRef} key={clipSrc} src={clipSrc}
            onTimeUpdate={onTimeUpdate} onLoadedMetadata={onLoadedMetadata} onEnded={onEnded}
            style={{ maxWidth: '100%', maxHeight: '100%', display: 'block', cursor: editMode === 'crop' ? 'default' : (textTabActive ? 'default' : 'pointer'), transform: buildTransform(clipEdits) || undefined, clipPath: editMode !== 'crop' ? buildClipPath(clipEdits.crop) : undefined, filter: combinedFilter, transition: 'transform 0.2s' }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <Film size={32} color="var(--muted)" />
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>No clips on the canvas yet.</p>
          </div>
        )}

        {/* Vignette */}
        {vignetteStyle && <div style={vignetteStyle} />}

        {/* Crop overlay */}
        {editMode === 'crop' && clipSrc && (
          <CropOverlay crop={clipEdits.crop ?? { top: 0, right: 0, bottom: 0, left: 0 }} containerRef={videoWrapRef} videoRect={videoRect} onChange={handleCropChange} />
        )}

        {/* ── TEXT OVERLAYS ── */}
        {clipSrc && ready && visibleTextOverlays.map(overlay => (
          <TextOverlay
            key={overlay.id}
            overlay={overlay}
            currentTime={source === 'entire' ? globalTime : currentT}
            videoRect={videoRect}
            selected={selectedTextId === overlay.id}
            editing={editingTextId === overlay.id}
            textTabActive={textTabActive}
            onSelect={() => handleSelectTextOverlay(overlay.id)}
            onStartEdit={() => setEditingTextId(overlay.id)}
            onEndEdit={() => setEditingTextId(null)}
            onChange={(patch) => handleTextUpdate(overlay.id, patch)}
          />
        ))}

        {/* ── CAPTION OVERLAY ── */}
        {clipSrc && ready && captions.length > 0 && (
          <CaptionOverlay
            captions={captions}
            currentTime={source === 'entire' ? globalTime : currentT}
            videoRect={videoRect}
          />
        )}

        {/* Transition overlay */}
        {transOverlay && (
          <div key={`${transOverlay.type}-${transOverlay.phase}`} style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none', background: ghost ? `url(${ghost}) center/contain no-repeat #000` : '#000', animation: (() => { if (transOverlay.phase === 'hold') return 'none'; const d = `${TRANS_MS}ms ease-in-out forwards`; if (transOverlay.type === 'fade' || transOverlay.type === 'dissolve') return `tFadeOut ${d}`; if (transOverlay.type === 'wipe') return `tWipeOut ${d}`; return 'none' })() }} />
        )}

        {/* Hidden canvas */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Loading spinner */}
        {clipSrc && !ready && !transOverlay && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)' }}>
            <div style={{ width: 36, height: 36, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        )}

        {/* Clip counter */}
        {source === 'entire' && activeClip && orderedClips.length > 1 && (
          <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', border: `1px solid ${CLIP_PALETTE[playlistIdx % CLIP_PALETTE.length]}44`, borderRadius: 6, padding: '3px 10px', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: CLIP_PALETTE[playlistIdx % CLIP_PALETTE.length] }}>
            {playlistIdx + 1} / {orderedClips.length} · {activeClip.name}
          </div>
        )}

        {/* Controls */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.82))', padding: '24px 14px 10px', display: 'flex', alignItems: 'center', gap: 10, opacity: (source === 'entire' || ready || !!transOverlay) ? 1 : 0, transition: 'opacity 0.2s', zIndex: 20 }}>
          <button onClick={e => { e.stopPropagation(); togglePlay() }} style={S.ctrlBtn}>
            {playing ? <Pause size={14} color="#fff" /> : <Play size={14} color="#fff" />}
          </button>
          <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#e2e8f0', minWidth: 88, userSelect: 'none' }}>
            {fmt(globalTime)} / {fmt(displayDuration)}
          </span>
          {activeSpeed !== 1 && <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#f59e0b', background: '#f59e0b1a', border: '1px solid #f59e0b44', borderRadius: 4, padding: '1px 6px' }}>{activeSpeed}×</span>}
          <div style={{ flex: 1 }} />
          <button 
  onClick={(e) => { 
    e.stopPropagation(); 
    setToolbarVisible(!toolbarVisible); 
    if(!activeTab) setActiveTab('edit'); // Default to the edit tab if none selected
  }} 
  style={{
    ...S.ctrlBtn,
    background: toolbarVisible ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
    width: 'auto',
    padding: '0 10px',
    gap: 6
  }}
>
  <Pencil size={14} color="#fff" />
  <span style={{ fontSize: 11, color: '#fff', fontFamily: 'JetBrains Mono' }}>Edit</span>
</button>
          <button onClick={e => { e.stopPropagation(); toggleMute() }} style={S.ctrlBtn}>
            {muted ? <VolumeX size={14} color="#fff" /> : <Volume2 size={14} color="#fff" />}
          </button>
          <button onClick={e => { e.stopPropagation(); videoRef.current?.requestFullscreen?.() }} style={S.ctrlBtn}>
            <Maximize2 size={14} color="#fff" />
          </button>
        </div>
      </div>

      {/* ── VideoToolbar ───────────────────────────────────────────────────── */}
      <VideoToolbar
        visible={toolbarVisible}
        onClose={() => { setToolbarVisible(false); setActiveTab(null) }}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        activeEditMode={editMode}
        onEditModeChange={setEditMode}
        onApplyEdit={handleApplyEdit}
        onSave={handleSave}
        onRevertToSaved={handleRevertToSaved}
        onRevertAll={handleRevertAll}
        clipEdits={clipEdits}
        hasSavedEdits={hasSaved}
        hasUnsaved={isUnsaved}
        colorEdits={colorEdits}
        onColorEditsChange={useCallback((e) => { if (activeClip) updateClipColorEdits(activeClip.id, e) }, [activeClip, updateClipColorEdits])}
        onColorEditsReset={useCallback(() => { if (activeClip) resetClipColorEdits(activeClip.id) }, [activeClip, resetClipColorEdits])}
        filterEdits={filterEdits}
        onFilterEditsChange={useCallback((e) => { if (activeClip) updateClipFilterEdits(activeClip.id, e) }, [activeClip, updateClipFilterEdits])}
        onFilterEditsReset={useCallback(() => { if (activeClip) resetClipFilterEdits(activeClip.id) }, [activeClip, resetClipFilterEdits])}
        textOverlays={textOverlays}
        selectedTextId={selectedTextId}
        currentTime={currentT}
        clipDuration={activeClip?.duration ?? 10}
        onTextAdd={handleTextAdd}
        onTextUpdate={handleTextUpdate}
        onTextRemove={handleTextRemove}
        onTextDuplicate={handleTextDuplicate}
        onSelectTextOverlay={handleSelectTextOverlay}
      />

      {/* ── Timeline ───────────────────────────────────────────────────────── */}
      <div style={{ height: timelineH, flexShrink: 0, background: 'var(--surface)', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '10px 16px 10px', userSelect: 'none', transition: 'height 0.18s ease' }}>
        {/* Ruler */}
        <div style={{ height: 20, position: 'relative', marginBottom: 6, paddingLeft: 52 }}>
          {ticks.map(t => (
            <div key={t} style={{ position: 'absolute', left: `${displayDuration > 0 ? (t / displayDuration) * 100 : 0}%`, top: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', transform: 'translateX(-50%)' }}>
              <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmt(t)}</span>
              <div style={{ width: 1, height: 3, background: 'var(--border)', marginTop: 2 }} />
            </div>
          ))}
        </div>

        {/* Tracks */}
        <div ref={timelineRef} onClick={onTimelineClick} onMouseMove={onTimelineDrag}
          style={{ flex: 1, position: 'relative', cursor: draggingTrim ? 'ew-resize' : 'crosshair', display: 'flex', flexDirection: 'column', gap: 5 }}
        >
          {/* Playhead */}
          <div style={{ position: 'absolute', left: `${playheadPct}%`, top: -4, bottom: -4, width: 2, background: 'var(--accent)', zIndex: 10, pointerEvents: 'none', boxShadow: '0 0 6px rgba(59,130,246,0.6)', transition: draggingTrim ? 'none' : 'left 0.05s linear' }}>
            <div style={{ position: 'absolute', top: -5, left: '50%', transform: 'translateX(-50%) rotate(45deg)', width: 8, height: 8, background: 'var(--accent)' }} />
          </div>

          {source === 'entire'
            ? <MultiClipTrack label="VIDEO" segments={clipSegments} transitions={transitions} duration={totalDuration} activeIdx={playlistIdx} />
            : <SingleClipTrack ref={videoTrackRef} label="VIDEO" color="var(--accent)" duration={activeClip?.duration ?? 0} editMode={editMode} trimStart={trimStart} trimEnd={trimEnd} onTrimDrag={startTrimDrag} />
          }

          {source === 'entire'
            ? <MultiClipTrack label="AUDIO" segments={clipSegments} transitions={transitions} duration={totalDuration} activeIdx={playlistIdx} audio />
            : <SingleClipTrack label="AUDIO" color="#22c55e" duration={activeClip?.duration ?? 0} />
          }

          {showEditsTrack && <EditsTrack clip={activeClip} trimStart={trimStart} trimEnd={trimEnd} speed={activeSpeed} />}
          {showColorTrack && <ColorTrack clip={activeClip} />}
          {showFilterTrack && <FilterTrack clip={activeClip} />}

          {/* TEXT track */}
          {showTextTrack && (
            <TextTrack
              overlays={textOverlays}
              duration={activeClip?.duration ?? 0}
              currentTime={currentT}
              selectedTextId={selectedTextId}
              onSelectOverlay={handleTextTrackSelect}
              onUpdateOverlay={handleTextUpdate}
            />
          )}

          {showAudioTrack && (
            <AudioEffectTrack
              effects={audioEffects}
              duration={activeClip?.duration ?? 0}
            />
          )}

          {showVisualTrack && (
            <VisualEffectTrack effects={visualEffects} duration={activeClip?.duration ?? 0} />
          )}
        </div>

        {/* Legend */}
        <div style={{ marginTop: 6, paddingLeft: 52, display: 'flex', alignItems: 'center', gap: 12, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {source === 'entire'
            ? clipSegments.map((seg, i) => (
              <div key={seg.clip.id} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <div style={{ width: 7, height: 7, borderRadius: 2, background: seg.color, opacity: i === playlistIdx ? 1 : 0.4 }} />
                <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: i === playlistIdx ? 'var(--text)' : 'var(--muted)', whiteSpace: 'nowrap', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>{seg.clip.name}</span>
              </div>
            ))
            : <LegendSingle edits={clipEdits} trimStart={trimStart} trimEnd={trimEnd} isSaved={hasSaved} isUnsaved={isUnsaved} colorEdits={colorEdits} filterEdits={filterEdits} textCount={textOverlays.length} />
          }
        </div>
      </div>

      <style>{`
        @keyframes spin     { from{transform:rotate(0deg)}     to{transform:rotate(360deg)} }
        @keyframes tFadeIn  { from{opacity:0}                  to{opacity:1} }
        @keyframes tFadeOut { from{opacity:1}                  to{opacity:0} }
        @keyframes tWipeIn  { from{transform:translateX(-100%)} to{transform:translateX(0%)} }
        @keyframes tWipeOut { from{transform:translateX(0%)}   to{transform:translateX(100%)} }
      `}</style>
    </motion.div>
  )
}

const S = {
  backBtn: { display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 10px', cursor: 'pointer', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--muted)', flexShrink: 0, transition: 'color 0.15s' },
  ctrlBtn: { width: 28, height: 28, background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  emptyWrap: { height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', gap: 16 },
  emptyIcon: { width: 64, height: 64, border: '2px dashed var(--border)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' },
}