/**
 * FilterTrack.jsx
 * Renders a compact FILTER row on the editor timeline (below AUDIO / EDITS)
 * whenever a clip has a non-trivial filter applied.
 * Uses the same visual language as ColorTrack in EditorArea.jsx.
 */
import { hasFilterApplied, filterLabel, FILTERS } from './filterUtils'

// ─── Local helpers (mirrors EditorArea helpers) ───────────────────────────────

function TrackLabel({ children, color }) {
  return (
    <div style={{
      width:      44,
      flexShrink: 0,
      display:    'flex',
      alignItems: 'center',
      fontSize:   8,
      fontFamily: 'JetBrains Mono, monospace',
      color:      color || 'var(--muted)',
      letterSpacing: '0.08em',
      paddingRight: 8,
      textTransform: 'uppercase',
    }}>
      {children}
    </div>
  )
}

function Chip({ color, children }) {
  return (
    <span style={{
      fontSize:   7,
      fontFamily: 'JetBrains Mono, monospace',
      color,
      background: `${color}18`,
      border:     `1px solid ${color}44`,
      borderRadius: 3,
      padding:    '1px 4px',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}

// ─── FilterTrack ─────────────────────────────────────────────────────────────

export default function FilterTrack({ clip }) {
  const fe = clip?.filterEdits
  if (!hasFilterApplied(fe)) return null

  const fid    = fe.filterId
  const label  = filterLabel(fid)
  const filter = FILTERS.find(f => f.id === fid)
  const itns   = fe.intensity ?? 100
  const isLUT  = fid === 'lut'

  // Use the filter's preview gradient as a subtle active bar colour
  const accentColor = '#a78bfa'

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: 24 }}>
      <TrackLabel color={accentColor}>FILTER</TrackLabel>

      <div style={{
        flex:        1,
        background:  'rgba(167,139,250,0.05)',
        border:      '1px solid rgba(167,139,250,0.22)',
        borderRadius: 6,
        position:    'relative',
        overflow:    'hidden',
        display:     'flex',
        alignItems:  'center',
      }}>
        {/* Subtle gradient fill bar */}
        <div style={{
          position:   'absolute',
          inset:      '18% 0',
          background: filter?.previewGradient ?? 'rgba(167,139,250,0.15)',
          opacity:    0.2,
          borderRadius: 3,
        }} />

        {/* Top indicator stripe */}
        <div style={{
          position:     'absolute',
          top:          0, left: 0, right: 0,
          height:       2,
          background:   `linear-gradient(90deg, ${accentColor}80, ${accentColor}30)`,
          borderRadius: '5px 5px 0 0',
        }} />

        {/* Chips on the right */}
        <div style={{
          position:  'absolute',
          right:     6,
          top:       '50%',
          transform: 'translateY(-50%)',
          display:   'flex',
          gap:       3,
          alignItems: 'center',
        }}>
          <Chip color={accentColor}>{isLUT ? `LUT: ${fe.lutName ?? 'custom'}` : label}</Chip>
          {!isLUT && itns !== 100 && (
            <Chip color="#7c3aed">{itns}%</Chip>
          )}
        </div>
      </div>
    </div>
  )
}