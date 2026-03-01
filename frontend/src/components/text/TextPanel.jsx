/**
 * TextPanel.jsx
 * Full-featured text overlay editor panel.
 * Left column: overlay list + Add button
 * Right section: property controls for selected overlay
 */
import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Trash2, Copy, Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight, RotateCcw,
  ChevronDown, Type, Sparkles, Clock,
} from 'lucide-react'
import {
  FONT_OPTIONS, TEXT_ANIMATIONS, TEXT_OUT_ANIMATIONS,
  TEXT_PRESETS, QUICK_COLORS, overlayColor, DEFAULT_TEXT_OVERLAY,
} from './textUtils'

// ─── Small helpers ────────────────────────────────────────────────────────────

function Label({ children, color }) {
  return (
    <span style={{
      fontSize:     8,
      fontFamily:   'JetBrains Mono, monospace',
      color:        color || '#475569',
      letterSpacing:'0.1em',
      textTransform:'uppercase',
      display:      'block',
      marginBottom: 3,
    }}>
      {children}
    </span>
  )
}

function Row({ children, gap = 8, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap, ...style }}>
      {children}
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: '#1e2d47', margin: '6px 0' }} />
}

function ToggleBtn({ active, color = '#ec4899', onClick, title, children, size = 'sm' }) {
  const p = size === 'sm' ? '4px 8px' : '4px 10px'
  return (
    <button onClick={onClick} title={title} style={{
      padding:     p,
      borderRadius:5,
      border:      `1px solid ${active ? color : 'var(--border)'}`,
      background:  active ? `${color}18` : 'var(--surface2)',
      cursor:      'pointer',
      display:     'flex', alignItems: 'center', justifyContent: 'center',
      color:       active ? color : 'var(--muted)',
      transition:  'all 0.12s',
      flexShrink:  0,
    }}>
      {children}
    </button>
  )
}

function Slider({ label, value, min = 0, max = 100, step = 1, accent = '#ec4899', unit = '', onChange }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 72, fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#64748b', flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ flex: 1, position: 'relative', height: 18, display: 'flex', alignItems: 'center' }}>
        <div style={{ position:'absolute', left:0, right:0, height:3, background:'#1e2d47', borderRadius:2 }}>
          <div style={{ position:'absolute', left:0, width:`${pct}%`, height:'100%', background: value !== min ? accent : '#334155', borderRadius:2 }} />
        </div>
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          onDoubleClick={() => onChange(min === 0 ? 0 : (min + max) / 2)}
          style={{ position:'absolute', left:0, right:0, width:'100%', height:18, opacity:0, cursor:'pointer', margin:0 }}
        />
      </div>
      <span style={{ width: 12, textAlign:'right', fontSize:9, fontFamily:'JetBrains Mono, monospace', color: accent, flexShrink:0 }}>
        {value}{unit}
      </span>
    </div>
  )
}

// ─── Font picker ──────────────────────────────────────────────────────────────

function FontPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const current = FONT_OPTIONS.find(f => f.family === value) ?? FONT_OPTIONS[0]

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <button onClick={() => setOpen(v => !v)} style={{
        width:       '100%',
        display:     'flex', alignItems: 'center', gap: 6,
        background:  'var(--surface2)', border: `1px solid ${open ? '#ec4899' : 'var(--border)'}`,
        borderRadius:6, padding: '5px 9px', cursor: 'pointer',
        fontSize: 11, fontFamily: current.family, color: 'var(--text)',
        transition: 'border-color 0.12s',
      }}>
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current.label}
        </span>
        <ChevronDown size={10} color="var(--muted)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, zIndex: 91, overflow: 'hidden',
            boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
            maxHeight: 260, overflowY: 'auto',
          }}>
            {FONT_OPTIONS.map(font => (
              <button
                key={font.id}
                onClick={() => { onChange(font.family); setOpen(false) }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 10px', background: font.family === value ? '#ec489918' : 'transparent',
                  border: 'none', borderBottom: '1px solid var(--border)',
                  cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (font.family !== value) e.currentTarget.style.background = 'var(--surface2)' }}
                onMouseLeave={e => { if (font.family !== value) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ fontFamily: font.family, fontSize: 16, color: '#e2e8f0', minWidth: 22 }}>Aa</span>
                <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: font.family === value ? '#ec4899' : '#94a3b8' }}>
                  {font.label}
                </span>
                <span style={{ fontSize: 8, color: '#334155', marginLeft: 'auto', fontFamily: 'JetBrains Mono, monospace' }}>{font.category}</span>
                {font.family === value && <span style={{ color: '#ec4899', fontSize: 10 }}>✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Animation picker ─────────────────────────────────────────────────────────

function AnimPicker({ value, options, onChange, label }) {
  const [open, setOpen] = useState(false)
  const current = options.find(a => a.id === value) ?? options[0]
  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <Label>{label}</Label>
      <button onClick={() => setOpen(v => !v)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 6,
        background: 'var(--surface2)', border: `1px solid ${open ? '#ec4899' : 'var(--border)'}`,
        borderRadius: 6, padding: '5px 9px', cursor: 'pointer',
        fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)',
        transition: 'border-color 0.12s',
      }}>
        <span style={{ flex: 1, textAlign: 'left' }}>{current.label}</span>
        <ChevronDown size={10} color="var(--muted)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, zIndex: 91, overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)', maxHeight: 200, overflowY: 'auto',
          }}>
            {options.map(opt => (
              <button
                key={opt.id}
                onClick={() => { onChange(opt.id); setOpen(false) }}
                style={{
                  width: '100%', padding: '6px 10px',
                  background: opt.id === value ? '#ec489918' : 'transparent',
                  border: 'none', borderBottom: '1px solid var(--border)',
                  cursor: 'pointer', textAlign: 'left',
                  fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
                  color: opt.id === value ? '#ec4899' : '#94a3b8',
                  display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (opt.id !== value) e.currentTarget.style.background = 'var(--surface2)' }}
                onMouseLeave={e => { if (opt.id !== value) e.currentTarget.style.background = 'transparent' }}
              >
                {opt.label}
                {opt.id === value && <span style={{ marginLeft: 'auto', color: '#ec4899', fontSize: 10 }}>✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Color Quick Pick ─────────────────────────────────────────────────────────

function ColorPicker({ value, onChange, label }) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {QUICK_COLORS.map(c => (
          <button key={c} onClick={() => onChange(c)} title={c} style={{
            width: 20, height: 20, borderRadius: 4, background: c,
            border: `2px solid ${value === c ? '#ec4899' : 'transparent'}`,
            cursor: 'pointer', flexShrink: 0, padding: 0,
            boxShadow: value === c ? '0 0 0 1px rgba(236,72,153,0.5)' : 'none',
            transition: 'border-color 0.1s',
          }} />
        ))}
        {/* Native color picker for custom */}
        <label title="Custom color" style={{
          width: 20, height: 20, borderRadius: 4, cursor: 'pointer',
          background: 'linear-gradient(135deg, #f00,#ff0,#0f0,#0ff,#00f,#f0f)',
          border: '2px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <input type="color" value={value} onChange={e => onChange(e.target.value)} style={{ opacity: 0, position: 'absolute', width: 1, height: 1 }} />
        </label>
      </div>
    </div>
  )
}

// ─── Overlay list item ────────────────────────────────────────────────────────

function OverlayListItem({ ov, index, selected, onSelect, onDuplicate, onRemove }) {
  const col = overlayColor(ov._colorIndex ?? index)
  const [hov, setHov] = useState(false)

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display:      'flex', alignItems: 'center', gap: 8,
        padding:      '7px 10px',
        borderRadius: 7,
        background:   selected ? `${col}18` : hov ? 'var(--surface2)' : 'transparent',
        border:       `1px solid ${selected ? col : 'transparent'}`,
        cursor:       'pointer', transition: 'all 0.12s',
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: 2, background: col, flexShrink: 0 }} />
      <span style={{
        flex: 1, fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
        color: selected ? 'var(--text)' : '#94a3b8',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {ov.text.slice(0, 24) || 'Empty text'}
      </span>
      <span style={{ fontSize: 8, color: '#334155', fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>
        {ov.startTime.toFixed(1)}s–{ov.endTime.toFixed(1)}s
      </span>
      {hov && (
        <div style={{ display: 'flex', gap: 3 }}>
          <button onClick={e => { e.stopPropagation(); onDuplicate() }} title="Duplicate" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '2px 3px', borderRadius: 3 }}>
            <Copy size={10} />
          </button>
          <button onClick={e => { e.stopPropagation(); onRemove() }} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px 3px', borderRadius: 3 }}>
            <Trash2 size={10} />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Section block ────────────────────────────────────────────────────────────

function Section({ title, color = '#ec4899', children }) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div>
      <button onClick={() => setCollapsed(v => !v)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 6,
        background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
      }}>
        <ChevronDown size={9} color={color} style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
        <span style={{ fontSize: 8, fontFamily: 'JetBrains Mono, monospace', color, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          {title}
        </span>
        <div style={{ flex: 1, height: 1, background: `${color}25`, marginLeft: 4 }} />
      </button>
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ paddingBottom: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main TextPanel ───────────────────────────────────────────────────────────

export default function TextPanel({
  textOverlays = [],
  selectedTextId,
  currentTime,
  clipDuration,
  onAdd,
  onUpdate,
  onRemove,
  onDuplicate,
  onSelectOverlay,
}) {
  const selected = textOverlays.find(o => o.id === selectedTextId) ?? null
  const upd      = useCallback((patch) => {
    if (!selected) return
    onUpdate(selected.id, patch)
  }, [selected, onUpdate])

  const handlePreset = useCallback((preset) => {
    onAdd({ ...preset.defaults, text: preset.defaults.text ?? 'Type here', startTime: currentTime, endTime: Math.min(currentTime + 5, clipDuration) })
  }, [onAdd, currentTime, clipDuration])

  return (
    <div style={{
      display:       'flex',
      background:    'var(--surface)',
      borderTop:     '1px solid var(--border)',
      flexShrink:    0,
      maxHeight:     340,
      overflow:      'hidden',
    }}>

      {/* ── LEFT: Overlay list ───────────────────────────────────────── */}
      <div style={{
        width:       200,
        flexShrink:  0,
        borderRight: '1px solid var(--border)',
        display:     'flex',
        flexDirection:'column',
      }}>
        {/* Presets header */}
        <div style={{
          padding:      '6px 10px 4px',
          borderBottom: '1px solid var(--border)',
          flexShrink:   0,
        }}>
          <Row gap={5} style={{ marginBottom: 6 }}>
            <div style={{
              width: 20, height: 20, borderRadius: 5,
              background: '#ec489920', border: '1px solid #ec489940',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Type size={10} color="#ec4899" />
            </div>
            <span style={{ fontSize: 10, fontFamily: 'Syne, sans-serif', fontWeight: 600, color: '#e2e8f0' }}>
              Text Layers
            </span>
            <button
              onClick={() => onAdd({ startTime: currentTime, endTime: Math.min(currentTime + 5, clipDuration) })}
              title="Add new text"
              style={{
                marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
                background: '#ec489920', border: '1px solid #ec489944',
                borderRadius: 5, padding: '3px 7px', cursor: 'pointer',
                fontSize: 9, color: '#ec4899', fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              <Plus size={9} />
              Add
            </button>
          </Row>

          {/* Preset thumbnails */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {TEXT_PRESETS.map(preset => (
              <button
                key={preset.id}
                onClick={() => handlePreset(preset)}
                title={`Add "${preset.label}" preset`}
                style={{
                  background: '#1e2d47', border: '1px solid var(--border)',
                  borderRadius: 5, padding: '3px 7px', cursor: 'pointer',
                  fontSize: 8, fontFamily: preset.defaults.fontFamily,
                  color: '#94a3b8', whiteSpace: 'nowrap', transition: 'all 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#ec4899'; e.currentTarget.style.color = '#ec4899' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = '#94a3b8' }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Overlay list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 6, scrollbarWidth: 'thin', scrollbarColor: '#1e2d47 transparent' }}>
          {textOverlays.length === 0 ? (
            <div style={{ padding: 12, textAlign: 'center' }}>
              <Type size={20} color="#1e2d47" style={{ margin: '0 auto 8px' }} />
              <p style={{ fontSize: 9, color: '#334155', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.6 }}>
                No text layers yet.<br />
                Click "Add" or pick a preset.
              </p>
            </div>
          ) : (
            textOverlays.map((ov, i) => (
              <OverlayListItem
                key={ov.id}
                ov={ov}
                index={i}
                selected={selectedTextId === ov.id}
                onSelect={() => onSelectOverlay(ov.id)}
                onDuplicate={() => onDuplicate(ov.id)}
                onRemove={() => onRemove(ov.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── RIGHT: Properties ────────────────────────────────────────── */}
      <div style={{
        flex:      1,
        overflowY: 'auto',
        padding:   '8px 12px',
        scrollbarWidth: 'thin',
        scrollbarColor: '#1e2d47 transparent',
      }}>
        {!selected ? (
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <Sparkles size={22} color="#334155" style={{ margin: '0 auto 8px' }} />
            <p style={{ fontSize: 9, color: '#334155', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.7 }}>
              Select a text layer to edit<br />
              or add a new one.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* Text content */}
            <Section title="Content" color="#ec4899">
              <textarea
                value={selected.text}
                onChange={e => upd({ text: e.target.value })}
                rows={2}
                style={{
                  width: '100%', resize: 'vertical',
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '6px 9px',
                  fontSize: 12, fontFamily: selected.fontFamily,
                  color: 'var(--text)', outline: 'none',
                  lineHeight: 1.4, boxSizing: 'border-box',
                }}
              />
            </Section>

            {/* Font */}
            <Section title="Typography" color="#a78bfa">
              <Row gap={6}>
                <FontPicker value={selected.fontFamily} onChange={v => upd({ fontFamily: v })} />
                <div style={{ display:'flex', alignItems:'center', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:5, overflow:'hidden', flexShrink:0 }}>
                  <button
                    onClick={() => upd({ fontSize: Math.max(8, (selected.fontSize || 48) - 1) })}
                    style={{ width:22, height:26, background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}
                    title="Decrease size"
                  >−</button>
                  <input
                    type="number" min={8} max={300} value={selected.fontSize}
                    onChange={e => upd({ fontSize: parseInt(e.target.value) || 48 })}
                    style={{
                      width: 36, background: 'transparent', border: 'none',
                      padding: '4px 2px', fontSize: 11,
                      fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)',
                      outline: 'none', textAlign: 'center',
                    }}
                  />
                  <button
                    onClick={() => upd({ fontSize: Math.min(300, (selected.fontSize || 48) + 1) })}
                    style={{ width:22, height:26, background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}
                    title="Increase size"
                  >+</button>
                </div>
              </Row>

              {/* Style toggles */}
              <Row gap={4}>
                <ToggleBtn active={selected.bold}      onClick={() => upd({ bold: !selected.bold })}           title="Bold">
                  <Bold size={11} />
                </ToggleBtn>
                <ToggleBtn active={selected.italic}    onClick={() => upd({ italic: !selected.italic })}       title="Italic">
                  <Italic size={11} />
                </ToggleBtn>
                <ToggleBtn active={selected.underline} onClick={() => upd({ underline: !selected.underline })} title="Underline">
                  <Underline size={11} />
                </ToggleBtn>
                <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
                <ToggleBtn active={selected.align === 'left'}   onClick={() => upd({ align: 'left' })}   title="Left align">
                  <AlignLeft size={11} />
                </ToggleBtn>
                <ToggleBtn active={selected.align === 'center'} onClick={() => upd({ align: 'center' })} title="Center align">
                  <AlignCenter size={11} />
                </ToggleBtn>
                <ToggleBtn active={selected.align === 'right'}  onClick={() => upd({ align: 'right' })}  title="Right align">
                  <AlignRight size={11} />
                </ToggleBtn>
              </Row>

              <Slider label="Letter Spacing" value={selected.letterSpacing} min={-5} max={30} step={0.5} accent="#a78bfa" unit="px"
                onChange={v => upd({ letterSpacing: v })} />
              <Slider label="Line Height" value={selected.lineHeight} min={0.7} max={3} step={0.05} accent="#a78bfa" unit="×"
                onChange={v => upd({ lineHeight: v })} />
            </Section>

            {/* Color */}
            <Section title="Color" color="#f59e0b">
              <ColorPicker value={selected.color} onChange={v => upd({ color: v })} label="Text Color" />
            </Section>

            {/* Background */}
            <Section title="Background" color="#06b6d4">
              <Row gap={8}>
                <ToggleBtn active={selected.hasBackground} color="#06b6d4" onClick={() => upd({ hasBackground: !selected.hasBackground })}>
                  <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}>BG</span>
                </ToggleBtn>
                <span style={{ fontSize: 9, color: '#64748b', fontFamily: 'JetBrains Mono, monospace' }}>
                  {selected.hasBackground ? 'Background enabled' : 'No background'}
                </span>
              </Row>
              {selected.hasBackground && (
                <>
                  <ColorPicker value={selected.backgroundColor} onChange={v => upd({ backgroundColor: v })} label="BG Color" />
                  <Slider label="Opacity" value={selected.backgroundOpacity} min={0} max={100} accent="#06b6d4" unit="%" onChange={v => upd({ backgroundOpacity: v })} />
                  <Slider label="Padding" value={selected.padding} min={0} max={40} accent="#06b6d4" unit="px" onChange={v => upd({ padding: v })} />
                  <Slider label="Radius"  value={selected.borderRadius} min={0} max={40} accent="#06b6d4" unit="px" onChange={v => upd({ borderRadius: v })} />
                </>
              )}
            </Section>

            {/* Shadow */}
            <Section title="Shadow" color="#8b5cf6">
              <Row gap={8}>
                <ToggleBtn active={selected.textShadow} color="#8b5cf6" onClick={() => upd({ textShadow: !selected.textShadow })}>
                  <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}>SH</span>
                </ToggleBtn>
                <span style={{ fontSize: 9, color: '#64748b', fontFamily: 'JetBrains Mono, monospace' }}>
                  {selected.textShadow ? 'Shadow enabled' : 'No shadow'}
                </span>
              </Row>
              {selected.textShadow && (
                <>
                  <ColorPicker value={selected.shadowColor} onChange={v => upd({ shadowColor: v })} label="Shadow Color" />
                  <Slider label="Blur"   value={selected.shadowBlur} min={0} max={40} accent="#8b5cf6" unit="px" onChange={v => upd({ shadowBlur: v })} />
                  <Slider label="X"      value={selected.shadowX}    min={-20} max={20} accent="#8b5cf6" unit="px" onChange={v => upd({ shadowX: v })} />
                  <Slider label="Y"      value={selected.shadowY}    min={-20} max={20} accent="#8b5cf6" unit="px" onChange={v => upd({ shadowY: v })} />
                </>
              )}
            </Section>

            {/* Opacity */}
            <Section title="Opacity" color="#64748b">
              <Slider label="Opacity" value={selected.opacity} min={0} max={100} accent="#64748b" unit="%" onChange={v => upd({ opacity: v })} />
            </Section>

            {/* Animation */}
            <Section title="Animation" color="#22c55e">
              <Row gap={6}>
                <AnimPicker value={selected.animation}    options={TEXT_ANIMATIONS}     onChange={v => upd({ animation: v })}    label="Enter" />
                <AnimPicker value={selected.outAnimation} options={TEXT_OUT_ANIMATIONS} onChange={v => upd({ outAnimation: v })} label="Exit"  />
              </Row>
              <Row gap={6}>
                <div style={{ flex: 1 }}>
                  <Slider label="In Duration" value={selected.animationDuration}    min={0.1} max={3} step={0.05} accent="#22c55e" unit="s" onChange={v => upd({ animationDuration: v })} />
                </div>
                <div style={{ flex: 1 }}>
                  <Slider label="Out Duration" value={selected.outAnimationDuration} min={0.1} max={3} step={0.05} accent="#22c55e" unit="s" onChange={v => upd({ outAnimationDuration: v })} />
                </div>
              </Row>
            </Section>

            {/* Timing */}
            <Section title="Timing" color="#f59e0b">
              <Row gap={6}>
                <div style={{ flex: 1 }}>
                  <Label>Start (s)</Label>
                  <input
                    type="number" min={0} max={selected.endTime - 0.1} step={0.1}
                    value={parseFloat(selected.startTime.toFixed(2))}
                    onChange={e => {
                      const v = parseFloat(e.target.value)
                      if (!isNaN(v) && v < selected.endTime) upd({ startTime: Math.max(0, v) })
                    }}
                    style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 5, padding: '4px 7px', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)', outline: 'none' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <Label>End (s)</Label>
                  <input
                    type="number" min={selected.startTime + 0.1} max={clipDuration} step={0.1}
                    value={parseFloat(selected.endTime.toFixed(2))}
                    onChange={e => {
                      const v = parseFloat(e.target.value)
                      if (!isNaN(v) && v > selected.startTime) upd({ endTime: Math.min(clipDuration, v) })
                    }}
                    style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 5, padding: '4px 7px', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)', outline: 'none' }}
                  />
                </div>
              </Row>
              <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                <button
                  onClick={() => upd({ startTime: parseFloat(currentTime.toFixed(2)) })}
                  style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 5, padding: '4px 6px', cursor: 'pointer', fontSize: 8, fontFamily: 'JetBrains Mono, monospace', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                >
                  <Clock size={8} /> Set start → now
                </button>
                <button
                  onClick={() => upd({ endTime: parseFloat(currentTime.toFixed(2)) })}
                  style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 5, padding: '4px 6px', cursor: 'pointer', fontSize: 8, fontFamily: 'JetBrains Mono, monospace', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                >
                  <Clock size={8} /> Set end → now
                </button>
              </div>
            </Section>

            {/* Delete */}
            <Divider />
            <button
              onClick={() => { onRemove(selected.id); onSelectOverlay(null) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: '#ef444408', border: '1px solid #ef444430',
                borderRadius: 6, padding: '6px 12px', cursor: 'pointer',
                fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#ef4444',
              }}
            >
              <Trash2 size={11} /> Delete this text layer
            </button>
          </div>
        )}
      </div>
    </div>
  )
}