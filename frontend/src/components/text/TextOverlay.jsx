/**
 * TextOverlay.jsx
 * Renders a single draggable, editable text overlay on the video.
 * Handles:
 *   – Drag to reposition (x/y as % of video rect)
 *   – Double-click to enter inline editing
 *   – CSS animations on enter / exit
 *   – Typewriter animation (JS-driven char reveal)
 *   – Selection border + corner handles
 *   – Width-resize via right-edge handle
 */
import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import {
  isOverlayVisible, getAnimInfo, getOutAnimInfo, buildTextShadow,
} from './textUtils'

// ─── Clamp helper ─────────────────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// ─── Typewriter hook ──────────────────────────────────────────────────────────
function useTypewriter(text, visible, animDuration) {
  const [revealed, setRevealed] = useState(0)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!visible) { setRevealed(0); return }
    const total = text.length
    if (total === 0) return
    const intervalMs = Math.max(20, (animDuration * 1000) / total)
    let count = 0
    timerRef.current = setInterval(() => {
      count++
      setRevealed(count)
      if (count >= total) clearInterval(timerRef.current)
    }, intervalMs)
    return () => clearInterval(timerRef.current)
  }, [visible, text, animDuration])

  return revealed
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TextOverlay({
  overlay,
  currentTime,
  videoRect,    // { left, top, width, height } — actual rendered video rect
  selected,
  editing,
  textTabActive,
  onSelect,
  onStartEdit,
  onEndEdit,
  onChange,
}) {
  const containerRef = useRef(null)
  const textRef      = useRef(null)
  const dragRef      = useRef(null)
  const resizeRef    = useRef(null)
  const [animKey, setAnimKey]     = useState(0)
  const [outAnim, setOutAnim]     = useState(false)
  const wasVisibleRef             = useRef(false)
  const isLeaving                 = useRef(false)

  const isVisible = isOverlayVisible(overlay, currentTime)
  const isTypewriter = overlay.animation === 'typewriter'
  const typewriterChars = useTypewriter(
    overlay.text, isVisible && isTypewriter, overlay.animationDuration
  )

  // Trigger in-animation when overlay becomes visible
  useEffect(() => {
    if (isVisible && !wasVisibleRef.current) {
      setAnimKey(k => k + 1)
      setOutAnim(false)
      isLeaving.current = false
      wasVisibleRef.current = true
    } else if (!isVisible && wasVisibleRef.current) {
      wasVisibleRef.current = false
      // out animation
      if (overlay.outAnimation !== 'none') {
        isLeaving.current = true
        setOutAnim(true)
      }
    }
  }, [isVisible, overlay.outAnimation])

  // ── CSS animation string ──────────────────────────────────────────────────
  const animInfo    = getAnimInfo(overlay.animation)
  const outAnimInfo = getOutAnimInfo(overlay.outAnimation)

  const cssAnimation = useMemo(() => {
    if (outAnim && outAnimInfo.cssName) {
      return `${outAnimInfo.cssName} ${overlay.outAnimationDuration}s ease forwards`
    }
    if (isTypewriter) return 'none'
    if (!animInfo.cssName) return 'none'
    return `${animInfo.cssName} ${overlay.animationDuration}s ease forwards`
  }, [outAnim, outAnimInfo, animInfo, overlay, isTypewriter])

  // ── Drag logic ────────────────────────────────────────────────────────────
  const startDrag = useCallback((e) => {
    if (editing || !textTabActive) return
    e.preventDefault()
    e.stopPropagation()
    onSelect()

    const startX = e.clientX
    const startY = e.clientY
    const startOvX = overlay.x
    const startOvY = overlay.y

    const onMove = (mv) => {
      if (!videoRect.width || !videoRect.height) return
      const dx = mv.clientX - startX
      const dy = mv.clientY - startY
      const newX = clamp(startOvX + (dx / videoRect.width)  * 100, 0, 100)
      const newY = clamp(startOvY + (dy / videoRect.height) * 100, 0, 100)
      onChange({ x: newX, y: newY })
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
  }, [editing, textTabActive, overlay.x, overlay.y, videoRect, onSelect, onChange])

  // ── Width-resize logic ────────────────────────────────────────────────────
  const startResize = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    const startX   = e.clientX
    const startW   = overlay.width
    const onMove   = (mv) => {
      if (!videoRect.width) return
      const dx   = mv.clientX - startX
      const newW = clamp(startW + (dx / videoRect.width) * 100, 10, 100)
      onChange({ width: newW })
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
  }, [overlay.width, videoRect.width, onChange])

  // ── Inline text editing ───────────────────────────────────────────────────
  const handleDoubleClick = useCallback((e) => {
    e.stopPropagation()
    if (!textTabActive) return
    onStartEdit()
  }, [textTabActive, onStartEdit])

  useEffect(() => {
    if (editing && textRef.current) {
      textRef.current.focus()
      // Select all text
      const range = document.createRange()
      range.selectNodeContents(textRef.current)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
    }
  }, [editing])

  const handleInput = useCallback((e) => {
    onChange({ text: e.currentTarget.innerText })
  }, [onChange])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      onEndEdit()
      e.preventDefault()
    }
  }, [onEndEdit])

  // ── Don't render if not visible (and no out-anim) ────────────────────────
  if (!isVisible && !outAnim) return null

  // ── Positioning ───────────────────────────────────────────────────────────
  const leftPx   = videoRect.left + (overlay.x / 100) * videoRect.width
  const topPx    = videoRect.top  + (overlay.y / 100) * videoRect.height
  const widthPx  = (overlay.width / 100) * videoRect.width

  const displayText = isTypewriter
    ? overlay.text.slice(0, typewriterChars)
    : overlay.text

  const bgStyle = overlay.hasBackground
    ? {
        background: `${overlay.backgroundColor}${Math.round(overlay.backgroundOpacity * 2.55).toString(16).padStart(2, '0')}`,
        borderRadius: overlay.borderRadius,
        padding: overlay.padding,
      }
    : {}

  const textStyle = {
    fontFamily:    overlay.fontFamily,
    fontSize:      overlay.fontSize,
    fontWeight:    overlay.bold   ? 700 : 400,
    fontStyle:     overlay.italic ? 'italic' : 'normal',
    textDecoration:overlay.underline ? 'underline' : 'none',
    color:         overlay.color,
    textAlign:     overlay.align,
    letterSpacing: overlay.letterSpacing,
    lineHeight:    overlay.lineHeight,
    textShadow:    buildTextShadow(overlay),
    whiteSpace:    'pre-wrap',
    wordBreak:     'break-word',
    userSelect:    editing ? 'text' : 'none',
    cursor:        editing ? 'text' : (textTabActive ? 'move' : 'default'),
    outline:       'none',
  }

  return (
    <div
      ref={containerRef}
      key={animKey}
      onMouseDown={startDrag}
      onDoubleClick={handleDoubleClick}
      onClick={(e) => { e.stopPropagation(); if (!editing) onSelect() }}
      style={{
        position:  'absolute',
        left:      leftPx,
        top:       topPx,
        width:     widthPx,
        transform: 'translate(-50%, -50%)',
        opacity:   overlay.opacity / 100,
        animation: cssAnimation,
        zIndex:    selected ? 25 : 20,
        pointerEvents: textTabActive ? 'all' : 'none',
        boxSizing: 'border-box',
      }}
    >
      {/* Selection border */}
      {selected && textTabActive && (
        <div style={{
          position:    'absolute',
          inset:       -4,
          border:      '1.5px solid #ec4899',
          borderRadius:4,
          pointerEvents:'none',
          boxShadow:   '0 0 0 1px rgba(236,72,153,0.3)',
        }} />
      )}

      {/* Text content */}
      <div style={{ ...bgStyle, display: 'flex', justifyContent: overlay.align === 'center' ? 'center' : overlay.align === 'right' ? 'flex-end' : 'flex-start' }}>
        <div
          ref={textRef}
          contentEditable={editing}
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onBlur={onEndEdit}
          style={textStyle}
          dangerouslySetInnerHTML={editing ? undefined : { __html: displayText.replace(/\n/g, '<br/>') }}
        >
          {editing ? displayText : undefined}
        </div>
      </div>

      {/* Right-edge resize handle */}
      {selected && textTabActive && !editing && (
        <div
          onMouseDown={startResize}
          style={{
            position:  'absolute',
            right:     -8,
            top:       '50%',
            transform: 'translateY(-50%)',
            width:     14,
            height:    28,
            background:'#ec4899',
            border:    '2px solid #fff',
            borderRadius:4,
            cursor:    'ew-resize',
            zIndex:    30,
            display:   'flex',
            alignItems:'center',
            justifyContent:'center',
          }}
        >
          <div style={{ width:1, height:10, background:'rgba(255,255,255,0.7)', boxShadow:'3px 0 0 rgba(255,255,255,0.7)' }} />
        </div>
      )}
    </div>
  )
}