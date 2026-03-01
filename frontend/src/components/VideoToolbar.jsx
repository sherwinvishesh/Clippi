/**
 * VideoToolbar — with Text & Shapes tab fully enabled.
 * TextPanel is rendered inline when activeTab === 'text'.
 */
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Scissors, Crop, RotateCw, FlipHorizontal, FlipVertical,
  RotateCcw, X, Minus, Plus, Sliders, Save, Check, ChevronDown,
  Clock, Sparkles, Image, Type, MoreHorizontal,
  Triangle, Square, Circle, AlignLeft, Bold, Underline,
} from 'lucide-react'
import ColorCorrectionPanel from './color/ColorCorrectionPanel'
import { hasColorEdits }    from './color/colorUtils'
import FilterPanel          from './filters/FilterPanel'
import { hasFilterApplied } from './filters/filterUtils'
import TextPanel            from './text/TextPanel'

// ─── Speed presets ────────────────────────────────────────────────────────────
const SPEED_PRESETS = [
  { label: '0.25×', value: 0.25 },
  { label: '0.5×',  value: 0.5  },
  { label: '1×',    value: 1    },
  { label: '1.5×',  value: 1.5  },
  { label: '2×',    value: 2    },
  { label: '4×',    value: 4    },
]

// ─── Tab config ───────────────────────────────────────────────────────────────
const TABS = [
  { id: 'edit',    label: 'Edit',           icon: Scissors,       color: '#3b82f6', works: true  },
  { id: 'color',   label: 'Color',          icon: Sparkles,       color: '#8b5cf6', works: true  },
  { id: 'filters', label: 'Filters & LUTs', icon: Image,          color: '#a78bfa', works: true  },
  { id: 'text',    label: 'Text & Shapes',  icon: Type,           color: '#ec4899', works: true  },
  { id: 'more',    label: 'More',           icon: MoreHorizontal, color: '#64748b', works: false },
]

// ─── Coming-soon panel ────────────────────────────────────────────────────────
function ComingSoonPanel({ tab }) {
  const cfg = { more: { color: '#64748b', items: [] } }[tab]
  if (!cfg) return null
  return (
    <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 16px', background: `${cfg.color}0d`,
        border: `1px dashed ${cfg.color}44`, borderRadius: 8,
        fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: cfg.color,
      }}>
        <Clock size={10} />
        Coming soon — these tools are in development
      </div>
    </div>
  )
}

// ─── Revert option ────────────────────────────────────────────────────────────
function RevertOption({ icon, label, desc, color, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '10px 14px',
        background: 'transparent', border: 'none',
        borderBottom: '1px solid var(--border)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        textAlign: 'left', opacity: disabled ? 0.35 : 1,
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = `${color}0d` }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <span style={{ color, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: disabled ? 'var(--muted)' : 'var(--text)' }}>
          {label}
        </div>
        <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 1 }}>{desc}</div>
      </div>
    </button>
  )
}

// ─── Shared sub-components ────────────────────────────────────────────────────
function ModeButton({ active, color, onClick, title, children }) {
  return (
    <button onClick={onClick} title={title} style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 7,
      border: `1px solid ${active ? color : 'var(--border)'}`,
      background: active ? `${color}1a` : 'var(--surface2)',
      cursor: 'pointer', fontSize: 11,
      fontFamily: 'JetBrains Mono, monospace',
      color: active ? color : 'var(--text)',
      transition: 'all 0.12s', flexShrink: 0, userSelect: 'none',
    }}>
      {children}
    </button>
  )
}
function ActionButton({ active, color, onClick, title, children }) {
  return (
    <button onClick={onClick} title={title} style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 7,
      border: `1px solid ${active ? color : 'var(--border)'}`,
      background: active ? `${color}18` : 'var(--surface2)',
      cursor: 'pointer', fontSize: 11,
      fontFamily: 'JetBrains Mono, monospace',
      color: active ? color : 'var(--text)',
      transition: 'all 0.12s', flexShrink: 0, userSelect: 'none',
    }}>
      {children}
    </button>
  )
}
function Divider() {
  return <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0, margin: '0 2px' }} />
}
function ActiveDot({ color }) {
  return <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
}
const nudgeBtn = {
  width: 20, height: 20,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--surface2)', border: '1px solid var(--border)',
  borderRadius: 4, cursor: 'pointer', color: 'var(--muted)', flexShrink: 0,
}

// ─── Main VideoToolbar ────────────────────────────────────────────────────────
export default function VideoToolbar({
  visible,
  onClose,
  activeTab,
  onTabChange,
  activeEditMode,
  onEditModeChange,
  onApplyEdit,
  onSave,
  onRevertToSaved,
  onRevertAll,
  clipEdits = {},
  hasSavedEdits = false,
  hasUnsaved = false,
  // Color
  colorEdits,
  onColorEditsChange,
  onColorEditsReset,
  // Filter
  filterEdits,
  onFilterEditsChange,
  onFilterEditsReset,
  // Text
  textOverlays = [],
  selectedTextId,
  currentTime = 0,
  clipDuration = 10,
  onTextAdd,
  onTextUpdate,
  onTextRemove,
  onTextDuplicate,
  onSelectTextOverlay,
}) {
  const { rotation = 0, flipH = false, flipV = false, speed = 1, trim, crop } = clipEdits
  const [sliderVal,  setSliderVal]  = useState(speed)
  const [saveFlash,  setSaveFlash]  = useState(false)
  const [revertOpen, setRevertOpen] = useState(false)

  useEffect(() => { setSliderVal(speed) }, [speed])

  const filterTouched = hasFilterApplied(filterEdits)
  const hasAnyEdits   = rotation !== 0 || flipH || flipV || speed !== 1 || trim || crop

  const commitSpeed = (val) => {
    const v = Math.round(Math.min(4, Math.max(0.1, val)) * 100) / 100
    setSliderVal(v)
    onApplyEdit('speed', v)
  }

  const handleSave = () => {
    onSave()
    setSaveFlash(true)
    setTimeout(() => setSaveFlash(false), 1800)
  }

  const toggleMode = (mode) => onEditModeChange(activeEditMode === mode ? null : mode)

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          style={{
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            position: 'relative', zIndex: 30, flexShrink: 0,
          }}
        >
          {/* ══ ROW 1 — Tabs + actions ══════════════════════════════ */}
          <div style={{
            display: 'flex', alignItems: 'center',
            padding: '6px 14px', gap: 4,
            borderBottom: (activeTab && activeTab !== 'color' && activeTab !== 'filters' && activeTab !== 'text')
              ? '1px solid var(--border)' : 'none',
          }}>
            {TABS.map((tab) => {
              const Icon   = tab.icon
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(active ? null : tab.id)}
                  title={tab.works ? tab.label : `${tab.label} — coming soon`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 8,
                    border: `1px solid ${active ? tab.color : 'var(--border)'}`,
                    background: active ? `${tab.color}1a` : 'var(--surface2)',
                    cursor: 'pointer', fontSize: 11,
                    fontFamily: 'JetBrains Mono, monospace',
                    color: active ? tab.color : tab.works ? 'var(--text)' : 'var(--muted)',
                    opacity: tab.works ? 1 : 0.6, transition: 'all 0.13s',
                    flexShrink: 0, userSelect: 'none', position: 'relative',
                  }}
                >
                  <Icon size={12} />
                  {tab.label}
                  {!tab.works && (
                    <span style={{ fontSize: 7, fontFamily: 'JetBrains Mono, monospace', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 3px', color: 'var(--muted)', letterSpacing: '0.05em' }}>
                      SOON
                    </span>
                  )}
                  {tab.id === 'edit' && (trim || crop || rotation || flipH || flipV || speed !== 1) && <ActiveDot color={tab.color} />}
                  {tab.id === 'color' && hasColorEdits(colorEdits) && <ActiveDot color={tab.color} />}
                  {tab.id === 'filters' && filterTouched && <ActiveDot color={tab.color} />}
                  {tab.id === 'text' && textOverlays.length > 0 && <ActiveDot color={tab.color} />}
                </button>
              )
            })}

            {/* ── Right: Save / Revert / Close ── */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={handleSave}
                disabled={!hasUnsaved && !hasAnyEdits}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 12px', borderRadius: 8,
                  border: `1px solid ${saveFlash ? '#22c55e' : hasUnsaved ? '#22c55e66' : 'var(--border)'}`,
                  background: saveFlash ? '#22c55e20' : hasUnsaved ? '#22c55e0d' : 'var(--surface2)',
                  cursor: (hasUnsaved || hasAnyEdits) ? 'pointer' : 'not-allowed',
                  fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
                  color: saveFlash ? '#22c55e' : hasUnsaved ? '#22c55e' : 'var(--muted)',
                  opacity: (!hasUnsaved && !hasAnyEdits) ? 0.4 : 1,
                  transition: 'all 0.2s', flexShrink: 0,
                }}
              >
                {saveFlash ? <Check size={12} /> : <Save size={12} />}
                {saveFlash ? 'Saved!' : 'Save'}
              </button>

              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setRevertOpen(v => !v)}
                  disabled={!hasAnyEdits && !hasSavedEdits}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '5px 10px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--surface2)',
                    cursor: (hasAnyEdits || hasSavedEdits) ? 'pointer' : 'not-allowed',
                    fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
                    color: 'var(--muted)',
                    opacity: (!hasAnyEdits && !hasSavedEdits) ? 0.4 : 1,
                    transition: 'all 0.13s', flexShrink: 0,
                  }}
                >
                  <RotateCcw size={12} />
                  Revert
                  <ChevronDown size={10} style={{ transform: revertOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                </button>
                <AnimatePresence>
                  {revertOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.97 }}
                      transition={{ duration: 0.12 }}
                      style={{
                        position: 'absolute', right: 0, top: 'calc(100% + 6px)',
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 10, overflow: 'hidden',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                        minWidth: 200, zIndex: 99,
                      }}
                    >
                      {hasSavedEdits && (
                        <RevertOption icon={<RotateCcw size={12} />} label="Revert to last save" desc="Undo changes since your last save" color="#f59e0b"
                          onClick={() => { onRevertToSaved(); setRevertOpen(false) }} disabled={!hasUnsaved} />
                      )}
                      <RevertOption icon={<RotateCcw size={12} />} label="Revert to original" desc="Remove all edits completely" color="#ef4444"
                        onClick={() => { onRevertAll(); setRevertOpen(false); onEditModeChange(null) }} disabled={!hasAnyEdits && !hasSavedEdits} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <Divider />

              <button
                onClick={onClose}
                style={{
                  width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', border: '1px solid var(--border)',
                  borderRadius: 7, cursor: 'pointer', color: 'var(--muted)', transition: 'all 0.13s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
              >
                <X size={12} />
              </button>
            </div>
          </div>

          {/* ══ ROW 2 — Context panels ════════════════════════════════ */}
          <AnimatePresence mode="wait">

            {/* ── EDIT panel ── */}
            {activeTab === 'edit' && (
              <motion.div key="edit"
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.14 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none' }}>
                  <ModeButton active={activeEditMode === 'trim'} color="#3b82f6" onClick={() => toggleMode('trim')} title="Drag blue handles on timeline">
                    <Scissors size={12} />Trim{trim && <ActiveDot color="#3b82f6" />}
                  </ModeButton>
                  <ModeButton active={activeEditMode === 'crop'} color="#06b6d4" onClick={() => toggleMode('crop')} title="Drag handles on video to crop">
                    <Crop size={12} />Crop{crop && <ActiveDot color="#06b6d4" />}
                  </ModeButton>
                  <Divider />
                  <ActionButton active={rotation !== 0} color="#8b5cf6" onClick={() => onApplyEdit('rotation', (rotation + 90) % 360)} title="Rotate 90° clockwise">
                    <RotateCw size={12} />Rotate{rotation !== 0 && <span style={{ fontSize: 9, color: '#8b5cf6', marginLeft: 2 }}>{rotation}°</span>}
                  </ActionButton>
                  <ActionButton active={flipH} color="#f59e0b" onClick={() => onApplyEdit('flipH', !flipH)} title="Flip horizontal">
                    <FlipHorizontal size={12} />Flip H
                  </ActionButton>
                  <ActionButton active={flipV} color="#f59e0b" onClick={() => onApplyEdit('flipV', !flipV)} title="Flip vertical">
                    <FlipVertical size={12} />Flip V
                  </ActionButton>
                  <Divider />
                  <span style={{ fontSize: 8, fontFamily: 'JetBrains Mono, monospace', color: '#f59e0b', letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>Speed</span>
                  {SPEED_PRESETS.map(({ label, value }) => (
                    <button key={value} onClick={() => commitSpeed(value)} style={{
                      padding: '3px 8px', borderRadius: 6,
                      border: `1px solid ${Math.abs(sliderVal - value) < 0.01 ? '#f59e0b' : 'var(--border)'}`,
                      background: Math.abs(sliderVal - value) < 0.01 ? '#f59e0b20' : 'var(--surface2)',
                      fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
                      color: Math.abs(sliderVal - value) < 0.01 ? '#f59e0b' : 'var(--text)',
                      cursor: 'pointer', transition: 'all 0.1s', flexShrink: 0,
                    }}>
                      {label}
                    </button>
                  ))}
                  <input type="range" min={0.1} max={4} step={0.05} value={sliderVal}
                    onChange={e => setSliderVal(parseFloat(e.target.value))}
                    onMouseUp={e => commitSpeed(parseFloat(e.target.value))}
                    style={{ width: 100, accentColor: '#f59e0b', cursor: 'pointer', flexShrink: 0 }}
                  />
                  <div style={{ minWidth: 42, padding: '2px 7px', background: '#f59e0b18', border: '1px solid #f59e0b44', borderRadius: 5, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#f59e0b', textAlign: 'center', flexShrink: 0 }}>
                    {sliderVal.toFixed(2)}×
                  </div>
                  <button onClick={() => commitSpeed(Math.max(0.1, sliderVal - 0.05))} style={nudgeBtn}><Minus size={9} /></button>
                  <button onClick={() => commitSpeed(Math.min(4, sliderVal + 0.05))} style={nudgeBtn}><Plus size={9} /></button>
                </div>
                {(activeEditMode === 'trim' || activeEditMode === 'crop') && (
                  <div style={{ padding: '5px 14px', background: 'var(--bg)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: activeEditMode === 'trim' ? '#3b82f6' : '#06b6d4' }} />
                    <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: 'var(--muted)' }}>
                      {activeEditMode === 'trim'
                        ? <>Drag the <span style={{ color: '#3b82f6' }}>blue handles</span> on the timeline to set in/out points{trim && <span style={{ color: 'var(--text)', marginLeft: 8 }}>· {trim.start.toFixed(2)}s → {trim.end.toFixed(2)}s</span>}</>
                        : <>Drag the <span style={{ color: '#06b6d4' }}>cyan handles</span> on the video to crop{crop && <span style={{ color: 'var(--text)', marginLeft: 8 }}>· T:{crop.top.toFixed(0)}% R:{crop.right.toFixed(0)}% B:{crop.bottom.toFixed(0)}% L:{crop.left.toFixed(0)}%</span>}</>
                      }
                    </span>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── COLOR panel ── */}
            {activeTab === 'color' && (
              <motion.div key="color" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}>
                <ColorCorrectionPanel colorEdits={colorEdits} onChange={onColorEditsChange} onReset={onColorEditsReset} />
              </motion.div>
            )}

            {/* ── FILTERS panel ── */}
            {activeTab === 'filters' && (
              <motion.div key="filters" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}>
                <FilterPanel filterEdits={filterEdits} onChange={onFilterEditsChange} onReset={onFilterEditsReset} />
              </motion.div>
            )}

            {/* ── TEXT panel ── */}
            {activeTab === 'text' && (
              <motion.div key="text" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}>
                <TextPanel
                  textOverlays={textOverlays}
                  selectedTextId={selectedTextId}
                  currentTime={currentTime}
                  clipDuration={clipDuration}
                  onAdd={onTextAdd}
                  onUpdate={onTextUpdate}
                  onRemove={onTextRemove}
                  onDuplicate={onTextDuplicate}
                  onSelectOverlay={onSelectTextOverlay}
                />
              </motion.div>
            )}

            {/* ── Coming-soon panels ── */}
            {['more'].includes(activeTab) && (
              <motion.div key={activeTab}
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.14 }}
                style={{ overflow: 'hidden' }}
              >
                <ComingSoonPanel tab={activeTab} />
              </motion.div>
            )}

          </AnimatePresence>

          {revertOpen && <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setRevertOpen(false)} />}
        </motion.div>
      )}
    </AnimatePresence>
  )
}