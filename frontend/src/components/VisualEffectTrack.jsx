import React from 'react'

const KIND_CONFIG = {
    recolor: { color: '#ec4899', label: '✦ Recolor' },
    blur: { color: '#3b82f6', label: '✦ Blur' },
    spotlight: { color: '#f59e0b', label: '✦ Spotlight' },
}

function TrackLabel({ children, color }) {
    return (
        <div style={{
            width: 44, flexShrink: 0, display: 'flex', alignItems: 'center',
            fontSize: 8, fontFamily: 'JetBrains Mono, monospace',
            color: color || '#64748b', letterSpacing: '0.08em',
            paddingRight: 8, textTransform: 'uppercase',
        }}>
            {children}
        </div>
    )
}

export default function VisualEffectTrack({ effects = [], duration = 0 }) {
    if (!effects.length) return null

    return (
        <>
            {effects.map((effect, i) => {
                const cfg = KIND_CONFIG[effect.kind] || { color: '#ec4899', label: effect.kind }
                return (
                    <div key={effect.id || i} style={{ display: 'flex', alignItems: 'stretch', height: 24, marginBottom: 4 }}>
                        <TrackLabel color={cfg.color}>
                            VISUAL
                        </TrackLabel>
                        <div style={{
                            flex: 1, background: `${cfg.color}12`,
                            border: `1px solid ${cfg.color}44`, borderRadius: 6,
                            position: 'relative', overflow: 'hidden',
                            display: 'flex', alignItems: 'center',
                        }}>
                            {/* top accent line */}
                            <div style={{
                                position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                                background: cfg.color, borderRadius: '5px 5px 0 0',
                            }} />
                            {/* full-width block */}
                            <div style={{
                                position: 'absolute', left: '1%', right: '1%',
                                top: '15%', bottom: '15%',
                                background: `${cfg.color}2a`,
                                border: `1px solid ${cfg.color}55`,
                                borderRadius: 4,
                                display: 'flex', alignItems: 'center', paddingLeft: 8,
                            }}>
                                <span style={{
                                    fontSize: 7, fontFamily: 'JetBrains Mono, monospace',
                                    color: cfg.color, whiteSpace: 'nowrap',
                                    overflow: 'hidden', textOverflow: 'ellipsis',
                                }}>
                                    {cfg.label} · {effect.label}
                                </span>
                            </div>
                        </div>
                    </div>
                )
            })}
        </>
    )
}
