/**
 * ColorCorrectionPanel.jsx
 * The full DaVinci-style colour grading panel that lives below the video.
 * Tabs: Basics | Curves | HSL | Wheels | Vignette
 */
import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RotateCcw, ChevronDown, Sun, Contrast, Droplets, Thermometer, Sparkles } from 'lucide-react'
import { DEFAULT_COLOR_EDITS, fmtVal, hasColorEdits } from './colorUtils'
import ColorCurves  from './ColorCurves'
import ColorWheels  from './ColorWheels'

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS = [
  { id: 'basics',   label: 'Basics'   },
  { id: 'curves',   label: 'Curves'   },
  { id: 'hsl',      label: 'HSL'      },
  { id: 'wheels',   label: 'Wheels'   },
  { id: 'vignette', label: 'Vignette' },
]

const HSL_COLORS = [
  { id: 'red',     label: 'Red',     hue: 0   },
  { id: 'orange',  label: 'Orange',  hue: 30  },
  { id: 'yellow',  label: 'Yellow',  hue: 60  },
  { id: 'green',   label: 'Green',   hue: 120 },
  { id: 'aqua',    label: 'Aqua',    hue: 180 },
  { id: 'blue',    label: 'Blue',    hue: 220 },
  { id: 'purple',  label: 'Purple',  hue: 280 },
  { id: 'magenta', label: 'Magenta', hue: 320 },
]

// ─── Slider ───────────────────────────────────────────────────────────────────

function Slider({ label, value, min = -100, max = 100, step = 1, accent = '#3b82f6', onChange }) {
  const pct   = ((value - min) / (max - min)) * 100
  const mid   = ((0 - min) / (max - min)) * 100  // position of 0 on track

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        width: 76, fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
        color: value !== 0 ? '#e2e8f0' : '#64748b', flexShrink: 0,
        letterSpacing: '0.02em',
      }}>
        {label}
      </span>

      <div style={{ flex: 1, position: 'relative', height: 20, display: 'flex', alignItems: 'center' }}>
        {/* Track */}
        <div style={{
          position: 'absolute', left: 0, right: 0, height: 3,
          background: '#1e2d47', borderRadius: 2,
        }}>
          {/* Fill from mid to current */}
          <div style={{
            position: 'absolute',
            left:       `${Math.min(mid, pct)}%`,
            width:      `${Math.abs(pct - mid)}%`,
            height: '100%',
            background: value !== 0 ? accent : '#334155',
            borderRadius: 2,
            transition: 'background 0.15s',
          }} />
          {/* Mid tick */}
          <div style={{
            position: 'absolute',
            left: `${mid}%`, top: -2,
            width: 1, height: 7,
            background: '#334155',
            transform: 'translateX(-50%)',
          }} />
        </div>

        <input
          type="range"
          min={min} max={max} step={step}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          onDoubleClick={() => onChange(0)}
          title="Double-click to reset"
          style={{
            position: 'absolute', left: 0, right: 0,
            width: '100%', height: 20,
            opacity: 0, cursor: 'pointer',
            margin: 0,
          }}
        />
      </div>

      <span
        style={{
          width: 34, textAlign: 'right',
          fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
          color: value !== 0 ? accent : '#334155',
          flexShrink: 0,
        }}
        onDoubleClick={() => onChange(0)}
        title="Double-click to reset"
      >
        {fmtVal(Math.round(value))}
      </span>
    </div>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ children }) {
  return (
    <div style={{
      fontSize: 8, fontFamily: 'JetBrains Mono, monospace',
      color: '#475569', letterSpacing: '0.12em', textTransform: 'uppercase',
      marginTop: 6, marginBottom: 2,
      paddingBottom: 4,
      borderBottom: '1px solid #1e2d47',
    }}>
      {children}
    </div>
  )
}

// ─── Basics panel ─────────────────────────────────────────────────────────────

function BasicsPanel({ edits, onChange }) {
  const set = (key) => (v) => onChange({ ...edits, [key]: v })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <SectionHeader>Tone</SectionHeader>
      <Slider label="Exposure"    value={edits.exposure}   accent="#f59e0b" onChange={set('exposure')} />
      <Slider label="Contrast"    value={edits.contrast}   accent="#a78bfa" onChange={set('contrast')} />
      <Slider label="Highlights"  value={edits.highlights} accent="#fcd34d" onChange={set('highlights')} />
      <Slider label="Shadows"     value={edits.shadows}    accent="#60a5fa" onChange={set('shadows')} />
      <Slider label="Whites"      value={edits.whites}     accent="#f1f5f9" onChange={set('whites')} />
      <Slider label="Blacks"      value={edits.blacks}     accent="#475569" onChange={set('blacks')} />

      <SectionHeader>Colour</SectionHeader>
      <Slider label="Saturation"  value={edits.saturation} accent="#f87171" onChange={set('saturation')} />
      <Slider label="Vibrance"    value={edits.vibrance}   accent="#fb923c" onChange={set('vibrance')} />

      <SectionHeader>White Balance</SectionHeader>
      <Slider label="Temperature" value={edits.temperature} accent="#f59e0b" onChange={set('temperature')} />
      <Slider label="Tint"        value={edits.tint}        accent="#4ade80" onChange={set('tint')} />

      <SectionHeader>Detail</SectionHeader>
      <Slider label="Sharpness"   value={edits.sharpness}  min={0} max={100} accent="#94a3b8" onChange={set('sharpness')} />
    </div>
  )
}

// ─── HSL panel ────────────────────────────────────────────────────────────────

function HSLPanel({ hsl, onChange }) {
  const [expanded, setExpanded] = useState('red')
  const update = useCallback((colorId, axis, val) => {
    onChange({
      ...hsl,
      [colorId]: { ...(hsl[colorId] ?? { hue: 0, saturation: 0, luminance: 0 }), [axis]: val },
    })
  }, [hsl, onChange])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {HSL_COLORS.map(({ id, label, hue }) => {
        const val     = hsl?.[id] ?? { hue: 0, saturation: 0, luminance: 0 }
        const isOpen  = expanded === id
        const touched = val.hue !== 0 || val.saturation !== 0 || val.luminance !== 0

        return (
          <div key={id} style={{
            border: `1px solid ${isOpen ? `hsl(${hue},70%,40%)` : '#1e2d47'}`,
            borderRadius: 7,
            overflow: 'hidden',
            background: isOpen ? `hsl(${hue},80%,5%)` : 'transparent',
            transition: 'all 0.12s',
          }}>
            {/* Header */}
            <button
              onClick={() => setExpanded(isOpen ? null : id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px',
                background: 'transparent', border: 'none', cursor: 'pointer',
              }}
            >
              <div style={{
                width: 12, height: 12, borderRadius: '50%',
                background: `hsl(${hue}, 80%, 55%)`,
                flexShrink: 0,
              }} />
              <span style={{
                fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
                color: touched ? `hsl(${hue},80%,65%)` : '#94a3b8', flex: 1, textAlign: 'left',
              }}>
                {label}
              </span>
              {touched && (
                <span style={{
                  fontSize: 8, color: `hsl(${hue},70%,55%)`,
                  background: `hsl(${hue},70%,10%)`,
                  border: `1px solid hsl(${hue},70%,25%)`,
                  borderRadius: 3, padding: '1px 5px',
                }}>
                  edited
                </span>
              )}
              <ChevronDown size={10} color="#475569" style={{
                transform: isOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s',
              }} />
            </button>

            {/* Sliders */}
            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{ padding: '4px 10px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <Slider label="Hue"        value={val.hue}        accent={`hsl(${hue},80%,55%)`} onChange={v => update(id, 'hue', v)} />
                    <Slider label="Saturation" value={val.saturation} accent={`hsl(${hue},80%,55%)`} onChange={v => update(id, 'saturation', v)} />
                    <Slider label="Luminance"  value={val.luminance}  accent={`hsl(${hue},80%,55%)`} onChange={v => update(id, 'luminance', v)} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}

// ─── Vignette panel ───────────────────────────────────────────────────────────

function VignettePanel({ edits, onChange }) {
  const set = (key) => (v) => onChange({ ...edits, [key]: v })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <SectionHeader>Vignette</SectionHeader>
      <Slider label="Amount"   value={edits.vignette}        min={0} max={100} accent="#8b5cf6" onChange={set('vignette')} />
      <Slider label="Feather"  value={edits.vignetteFeather} min={0} max={100} accent="#6366f1" onChange={set('vignetteFeather')} />

      {/* Preview circle */}
      {edits.vignette > 0 && (
        <div style={{
          width: '100%', aspectRatio: '16/9',
          borderRadius: 8,
          background: `radial-gradient(ellipse at center, transparent ${Math.max(5, Math.round((1 - edits.vignette/100 * 0.85) * edits.vignetteFeather))  }%, rgba(0,0,0,${(edits.vignette/100*0.9).toFixed(2)}) 100%)`,
          border: '1px solid #1e2d47',
          marginTop: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'JetBrains Mono, monospace' }}>
            preview
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ColorCorrectionPanel({ colorEdits, onChange, onReset }) {
  const [activeTab, setActiveTab] = useState('basics')

  const edits   = colorEdits ?? DEFAULT_COLOR_EDITS()
  const touched = hasColorEdits(edits)

  const updateCurves = useCallback((channel, points) => {
    onChange({ ...edits, curves: { ...edits.curves, [channel]: points } })
  }, [edits, onChange])

  const updateWheels = useCallback((newWheels) => {
    onChange({ ...edits, wheels: newWheels })
  }, [edits, onChange])

  const updateHSL = useCallback((newHSL) => {
    onChange({ ...edits, hsl: newHSL })
  }, [edits, onChange])

  return (
    <div style={{
      background:   'var(--surface)',
      borderTop:    '1px solid var(--border)',
      display:      'flex',
      flexDirection:'column',
      flexShrink:   0,
    }}>

      {/* ── Tab bar ──────────────────────────────────────────────────── */}
      <div style={{
        display:     'flex',
        alignItems:  'center',
        padding:     '0 12px',
        height:      38,
        borderBottom:'1px solid var(--border)',
        background:  'var(--surface)',
        gap:          4,
        overflowX:   'auto',
        scrollbarWidth: 'none',
      }}>
        {/* Colour grading icon */}
        <div style={{
          width: 22, height: 22, borderRadius: 6,
          background: '#8b5cf620', border: '1px solid #8b5cf640',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, marginRight: 4,
        }}>
          <Sparkles size={11} color="#a78bfa" />
        </div>

        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '4px 11px', borderRadius: 7,
              border: `1px solid ${activeTab === tab.id ? '#8b5cf6' : 'transparent'}`,
              background: activeTab === tab.id ? '#8b5cf618' : 'transparent',
              cursor: 'pointer', fontSize: 10,
              fontFamily: 'JetBrains Mono, monospace',
              color: activeTab === tab.id ? '#a78bfa' : '#64748b',
              transition: 'all 0.12s', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            {tab.label}
          </button>
        ))}

        {/* Reset button */}
        <div style={{ marginLeft: 'auto' }}>
          {touched && (
            <button
              onClick={onReset}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 7,
                border: '1px solid #ef444433',
                background: '#ef444408',
                cursor: 'pointer', fontSize: 10,
                fontFamily: 'JetBrains Mono, monospace',
                color: '#ef4444',
                flexShrink: 0,
              }}
            >
              <RotateCcw size={10} />
              Reset All
            </button>
          )}
        </div>
      </div>

      {/* ── Tab content ──────────────────────────────────────────────── */}
      <div style={{
        overflowY:  'auto',
        maxHeight:  190,
        padding:    '10px 14px',
        scrollbarWidth: 'thin',
        scrollbarColor: '#1e2d47 transparent',
      }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            {activeTab === 'basics' && (
              <BasicsPanel edits={edits} onChange={onChange} />
            )}
            {activeTab === 'curves' && (
              <ColorCurves
                curves={edits.curves}
                onChange={updateCurves}
              />
            )}
            {activeTab === 'hsl' && (
              <HSLPanel
                hsl={edits.hsl}
                onChange={updateHSL}
              />
            )}
            {activeTab === 'wheels' && (
              <ColorWheels
                wheels={edits.wheels}
                onChange={updateWheels}
              />
            )}
            {activeTab === 'vignette' && (
              <VignettePanel edits={edits} onChange={onChange} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}