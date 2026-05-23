import { memo, useState, useCallback } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
} from '@xyflow/react'

const TRANSITIONS = [
  { id: 'cut',     label: 'Cut',     desc: 'Instant jump'      },
  { id: 'fade',    label: 'Fade',    desc: 'Dissolve to black' },
  { id: 'wipe',    label: 'Wipe',    desc: 'Slide over'        },
  { id: 'dissolve',label: 'Dissolve',desc: 'Soft blend'        },
]

const TRANSITION_COLORS = {
  cut:     '#64748b',
  fade:    '#3b82f6',
  wipe:    '#06b6d4',
  dissolve:'#8b5cf6',
}

function TransitionEdge({
  id,
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition,
  targetPosition,
  data = {},
  selected,
}) {
  const [open, setOpen] = useState(false)
  const { setEdges }    = useReactFlow()

  const transition = data.transition || 'cut'
  const color      = TRANSITION_COLORS[transition] || TRANSITION_COLORS.cut

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  })

  const setTransition = useCallback((t) => {
    setEdges((eds) =>
      eds.map((e) =>
        e.id === id ? { ...e, data: { ...e.data, transition: t } } : e
      )
    )
    setOpen(false)
  }, [id, setEdges])

  return (
    <>
      <BaseEdge
        path={edgePath}
        style={{
          stroke: selected ? color : `${color}99`,
          strokeWidth: selected ? 2.5 : 1.5,
          strokeDasharray: transition === 'cut' ? 'none' : '6 3',
          transition: 'stroke 0.15s, stroke-width 0.15s',
        }}
      />

      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
            zIndex: 10,
          }}
          className="nodrag nopan"
        >
          {/* Pill label */}
          <button
            onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: open ? 'var(--surface)' : 'var(--surface2)',
              border: `1px solid ${selected ? color : 'var(--border)'}`,
              borderRadius: 20,
              padding: '3px 9px 3px 7px',
              cursor: 'pointer',
              fontSize: 10,
              fontFamily: 'JetBrains Mono, monospace',
              color: color,
              letterSpacing: '0.05em',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{
              width: 6, height: 6,
              borderRadius: '50%',
              background: color,
              display: 'inline-block',
              flexShrink: 0,
            }} />
            {transition.toUpperCase()}
            <span style={{ color: 'var(--muted)', marginLeft: 1 }}>▾</span>
          </button>

          {/* Dropdown */}
          {open && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                minWidth: 140,
              }}
            >
              {TRANSITIONS.map((t) => (
                <button
                  key={t.id}
                  onClick={(e) => { e.stopPropagation(); setTransition(t.id) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%',
                    padding: '8px 12px',
                    background: transition === t.id
                      ? `${TRANSITION_COLORS[t.id]}18`
                      : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) =>
                    transition !== t.id && (e.currentTarget.style.background = 'var(--surface2)')
                  }
                  onMouseLeave={(e) =>
                    transition !== t.id && (e.currentTarget.style.background = 'transparent')
                  }
                >
                  <span style={{
                    width: 8, height: 8,
                    borderRadius: '50%',
                    background: TRANSITION_COLORS[t.id],
                    flexShrink: 0,
                  }} />
                  <div>
                    <div style={{
                      fontSize: 11,
                      fontFamily: 'JetBrains Mono, monospace',
                      color: 'var(--text)',
                    }}>
                      {t.label}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--muted)' }}>
                      {t.desc}
                    </div>
                  </div>
                  {transition === t.id && (
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: 10,
                      color: TRANSITION_COLORS[t.id],
                    }}>✓</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

export default memo(TransitionEdge)