/**
 * FilterPanel.jsx
 * DaVinci-Resolve-style filter browser.
 * – Scrollable grid of swatch circles, one per preset.
 * – Category tabs (All / Classic / Tone / Film / Mood / Creative).
 * – Intensity slider (0–100 %).
 * – "Import LUT" slot at the end (stores filename; full WebGL LUT
 *    application is intentionally deferred).
 */
import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RotateCcw, Upload, Check, Layers, X } from 'lucide-react'
import {
  FILTERS,
  FILTER_CATEGORIES,
  DEFAULT_FILTER_EDITS,
  hasFilterApplied,
} from './filterUtils'

// ─── Swatch circle ────────────────────────────────────────────────────────────

function FilterSwatch({ filter, selected, onClick }) {
  const [hovered, setHovered] = useState(false)
  const isLUT = !!filter.isLUT

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={filter.label}
      style={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            5,
        padding:        '7px 4px',
        borderRadius:   9,
        border:         `1.5px solid ${selected ? '#a78bfa' : hovered ? '#4a5568' : 'transparent'}`,
        background:     selected ? '#a78bfa12' : hovered ? '#1e2d4780' : 'transparent',
        cursor:         'pointer',
        transition:     'all 0.12s',
        userSelect:     'none',
        flexShrink:     0,
      }}
    >
      {/* Circle swatch */}
      <div style={{
        width:        52,
        height:       52,
        borderRadius: '50%',
        background:   filter.previewGradient,
        border:       `2px solid ${selected ? '#a78bfa' : 'rgba(255,255,255,0.08)'}`,
        boxShadow:    selected ? '0 0 12px #a78bfa55' : hovered ? '0 0 8px rgba(0,0,0,0.5)' : 'none',
        position:     'relative',
        overflow:     'hidden',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        transition:   'box-shadow 0.12s, border-color 0.12s',
      }}>
        {/* Selected tick overlay */}
        {selected && !isLUT && (
          <div style={{
            position:    'absolute',
            inset:       0,
            background:  'rgba(167,139,250,0.18)',
            display:     'flex',
            alignItems:  'center',
            justifyContent: 'center',
          }}>
            <Check size={16} color="#a78bfa" strokeWidth={2.5} />
          </div>
        )}
        {/* LUT upload icon */}
        {isLUT && (
          <Upload size={16} color="#64748b" />
        )}
      </div>

      {/* Label */}
      <span style={{
        fontSize:      9,
        fontFamily:    'JetBrains Mono, monospace',
        color:         selected ? '#a78bfa' : hovered ? '#94a3b8' : '#64748b',
        whiteSpace:    'nowrap',
        textAlign:     'center',
        maxWidth:      '100%',
        overflow:      'hidden',
        textOverflow:  'ellipsis',
        transition:    'color 0.12s',
      }}>
        {filter.label}
      </span>
    </button>
  )
}

// ─── Intensity slider ────────────────────────────────────────────────────────

function IntensitySlider({ value, onChange, filterLabel }) {
  const pct = value

  return (
    <div style={{
      display:     'flex',
      alignItems:  'center',
      gap:         10,
      padding:     '8px 14px',
      borderTop:   '1px solid var(--border)',
      background:  'var(--surface)',
      flexShrink:  0,
    }}>
      <span style={{
        fontSize:   10,
        fontFamily: 'JetBrains Mono, monospace',
        color:      '#64748b',
        width:      62,
        flexShrink: 0,
      }}>
        Intensity
      </span>

      {/* Track */}
      <div style={{ flex: 1, position: 'relative', height: 20, display: 'flex', alignItems: 'center' }}>
        <div style={{
          position:     'absolute',
          left:         0, right: 0,
          height:       3,
          background:   '#1e2d47',
          borderRadius: 2,
        }}>
          <div style={{
            position:     'absolute',
            left:         0,
            width:        `${pct}%`,
            height:       '100%',
            background:   '#a78bfa',
            borderRadius: 2,
            transition:   'width 0.05s',
          }} />
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={e => onChange(parseInt(e.target.value))}
          style={{
            position:  'absolute',
            left:      0, right: 0,
            width:     '100%',
            height:    20,
            opacity:   0,
            cursor:    'pointer',
            margin:    0,
          }}
        />
      </div>

      {/* Value */}
      <span style={{
        width:      32,
        textAlign:  'right',
        fontSize:   10,
        fontFamily: 'JetBrains Mono, monospace',
        color:      '#a78bfa',
        flexShrink: 0,
      }}>
        {value}%
      </span>

      {/* Active filter chip */}
      {filterLabel && (
        <span style={{
          fontSize:   9,
          fontFamily: 'JetBrains Mono, monospace',
          color:      '#a78bfa',
          background: '#a78bfa18',
          border:     '1px solid #a78bfa33',
          borderRadius: 4,
          padding:    '1px 7px',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>
          {filterLabel}
        </span>
      )}
    </div>
  )
}

// ─── Main FilterPanel ────────────────────────────────────────────────────────

export default function FilterPanel({ filterEdits, onChange, onReset }) {
  const [category, setCategory] = useState('all')
  const lutInputRef = useRef(null)

  const edits      = filterEdits ?? DEFAULT_FILTER_EDITS()
  const filterId   = edits.filterId   ?? 'none'
  const intensity  = edits.intensity  ?? 100
  const lutName    = edits.lutName    ?? null
  const touched    = hasFilterApplied(edits)

  const activeFilter = FILTERS.find(f => f.id === filterId)

  // Filters to display, respecting category tab
  const visibleFilters = FILTERS.filter(f => {
    if (category === 'all') return true
    if (f.id === 'none') return true      // always show "None"
    if (f.isLUT) return category === 'all' // LUT only in All
    return f.category === category
  })

  const selectFilter = useCallback((id) => {
    onChange({ ...edits, filterId: id })
  }, [edits, onChange])

  const setIntensity = useCallback((val) => {
    onChange({ ...edits, intensity: val })
  }, [edits, onChange])

  const handleLUTFile = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Store LUT filename; actual shader-based LUT application is a future task
    onChange({ ...edits, filterId: 'lut', lutName: file.name })
    e.target.value = ''
  }, [edits, onChange])

  const clearLUT = useCallback(() => {
    onChange({ ...edits, filterId: 'none', lutName: null })
  }, [edits, onChange])

  return (
    <div style={{
      background:    'var(--surface)',
      borderTop:     '1px solid var(--border)',
      display:       'flex',
      flexDirection: 'column',
      flexShrink:    0,
    }}>

      {/* ── Category tab bar ─────────────────────────────────────── */}
      <div style={{
        display:     'flex',
        alignItems:  'center',
        padding:     '0 12px',
        height:      36,
        borderBottom: '1px solid var(--border)',
        gap:          3,
        overflowX:   'auto',
        scrollbarWidth: 'none',
      }}>
        {/* Icon */}
        <div style={{
          width:   22, height: 22,
          borderRadius: 6,
          background: '#a78bfa20',
          border:  '1px solid #a78bfa40',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, marginRight: 4,
        }}>
          <Layers size={11} color="#a78bfa" />
        </div>

        {FILTER_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            style={{
              padding:    '3px 10px',
              borderRadius: 6,
              border:     `1px solid ${category === cat.id ? '#a78bfa' : 'transparent'}`,
              background: category === cat.id ? '#a78bfa18' : 'transparent',
              cursor:     'pointer',
              fontSize:   10,
              fontFamily: 'JetBrains Mono, monospace',
              color:      category === cat.id ? '#a78bfa' : '#64748b',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'all 0.12s',
            }}
          >
            {cat.label}
          </button>
        ))}

        {/* Reset button – only when a filter is active */}
        <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
          {touched && (
            <button
              onClick={onReset}
              style={{
                display:    'flex', alignItems: 'center', gap: 4,
                padding:    '3px 9px',
                borderRadius: 6,
                border:     '1px solid #ef444433',
                background: '#ef444408',
                cursor:     'pointer',
                fontSize:   10,
                fontFamily: 'JetBrains Mono, monospace',
                color:      '#ef4444',
              }}
            >
              <RotateCcw size={9} />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Filter grid ──────────────────────────────────────────── */}
      <div style={{
        overflowY:   'auto',
        maxHeight:   148,
        padding:     '8px 12px 4px',
        scrollbarWidth:  'thin',
        scrollbarColor:  '#1e2d47 transparent',
      }}>
        <div style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))',
          gap:                 4,
        }}>
          {visibleFilters.map(filter => (
            <FilterSwatch
              key={filter.id}
              filter={filter}
              selected={filterId === filter.id}
              onClick={() => {
                if (filter.isLUT) lutInputRef.current?.click()
                else selectFilter(filter.id)
              }}
            />
          ))}
        </div>
      </div>

      {/* ── LUT status bar ───────────────────────────────────────── */}
      {filterId === 'lut' && lutName && (
        <div style={{
          display:    'flex', alignItems: 'center', gap: 8,
          padding:    '5px 14px',
          background: '#0f1a2e',
          borderTop:  '1px solid var(--border)',
          fontSize:   9,
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          <span style={{ color: '#a78bfa' }}>◎</span>
          <span style={{ color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            LUT: {lutName}
          </span>
          <span style={{
            fontSize: 8, color: '#64748b',
            background: '#1e2d47', borderRadius: 3, padding: '1px 5px',
          }}>
            preview only
          </span>
          <button onClick={clearLUT} style={{
            background: 'transparent', border: 'none',
            cursor: 'pointer', color: '#64748b', padding: '1px 3px',
            borderRadius: 3,
          }}>
            <X size={10} />
          </button>
        </div>
      )}

      {/* ── Intensity slider ─────────────────────────────────────── */}
      {touched && filterId !== 'lut' && (
        <IntensitySlider
          value={intensity}
          onChange={setIntensity}
          filterLabel={activeFilter?.label}
        />
      )}

      {/* Hidden LUT file input */}
      <input
        ref={lutInputRef}
        type="file"
        accept=".cube,.3dl,.lut,.look"
        onChange={handleLUTFile}
        style={{ display: 'none' }}
      />
    </div>
  )
}