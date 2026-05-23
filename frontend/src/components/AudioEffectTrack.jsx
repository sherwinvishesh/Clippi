import React from 'react'

/**
 * AudioEffectTrack
 * Renders audio effect rows inside the timeline for a given clip.
 *
 * OVERLAPPING effects (SFX, music, voiceover) — mix on top of original audio
 * REPLACING  effects (dubbing, denoising)      — replace original audio track
 * CAPTIONS                                     — subtitle-only, no audio change
 */

const KIND_CONFIG = {
  sound_effect: { color: '#06b6d4', label: '♪ SFX',      type: 'overlay' },
  music:        { color: '#22c55e', label: '♪ Music',     type: 'overlay' },
  voiceover:    { color: '#8b5cf6', label: '♪ Voice',     type: 'overlay' },
  dubbing:      { color: '#f97316', label: '🌐 Dub',       type: 'replace' },
  denoising:    { color: '#f59e0b', label: '✦ Denoised',  type: 'replace' },
  captions:     { color: '#eab308', label: '◫ Captions',  type: 'caption' },
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

export default function AudioEffectTrack({ effects = [], duration = 0 }) {
  if (!effects.length) return null

  const replacing = effects.filter(e => KIND_CONFIG[e.kind]?.type === 'replace')
  const overlays  = effects.filter(e => KIND_CONFIG[e.kind]?.type === 'overlay')
  const captions  = effects.filter(e => e.kind === 'captions')

  return (
    <>
      {/* ── REPLACING effects (dubbing, denoising) — full-width bar ── */}
      {replacing.map((effect, i) => {
        const cfg = KIND_CONFIG[effect.kind] || { color: '#f97316', label: effect.kind }
        return (
          <div key={effect.id || i} style={{ display: 'flex', alignItems: 'stretch', height: 24, marginBottom: 4 }}>
            <TrackLabel color={cfg.color}>
              {effect.kind === 'dubbing' ? 'DUB' : 'AUDIO'}
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

      {/* ── OVERLAY effects (SFX, music, voiceover) — may have a timestamp ── */}
      {overlays.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'stretch', height: 24, marginBottom: 4 }}>
          <TrackLabel color="#8b5cf6">FX</TrackLabel>
          <div style={{
            flex: 1, background: 'rgba(139,92,246,0.05)',
            border: '1px solid rgba(139,92,246,0.2)', borderRadius: 6,
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 2,
              background: 'rgba(139,92,246,0.5)', borderRadius: '5px 5px 0 0',
            }} />
            {overlays.map((effect, i) => {
              const cfg      = KIND_CONFIG[effect.kind] || { color: '#8b5cf6' }
              const hasTime  = effect.timestamp !== undefined && duration > 0
              const leftPct  = hasTime ? (effect.timestamp / duration) * 100 : 1
              const widthPct = hasTime
                ? Math.max(2, ((effect.duration ?? 2) / duration) * 100)
                : 98

              return (
                <div key={effect.id || i} title={effect.label} style={{
                  position:   'absolute',
                  left:       `${leftPct}%`,
                  width:      `${widthPct}%`,
                  top: '15%', bottom: '15%',
                  background: `${cfg.color}30`,
                  border:     `1px solid ${cfg.color}66`,
                  borderRadius: 3,
                  display:    'flex', alignItems: 'center',
                  paddingLeft: 4, overflow: 'hidden',
                }}>
                  <span style={{
                    fontSize: 7, fontFamily: 'JetBrains Mono, monospace',
                    color: cfg.color, whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {cfg.label} · {effect.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── CAPTIONS ── */}
      {captions.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'stretch', height: 24, marginBottom: 4 }}>
          <TrackLabel color="#eab308">CC</TrackLabel>
          <div style={{
            flex: 1, background: 'rgba(234,179,8,0.05)',
            border: '1px solid rgba(234,179,8,0.25)', borderRadius: 6,
            position: 'relative', overflow: 'hidden',
            display: 'flex', alignItems: 'center',
          }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 2,
              background: 'rgba(234,179,8,0.5)', borderRadius: '5px 5px 0 0',
            }} />
            <div style={{
              position: 'absolute', left: '1%', right: '1%',
              top: '15%', bottom: '15%',
              background: 'rgba(234,179,8,0.18)',
              border: '1px solid rgba(234,179,8,0.4)',
              borderRadius: 3,
              display: 'flex', alignItems: 'center', paddingLeft: 8,
            }}>
              <span style={{
                fontSize: 7, fontFamily: 'JetBrains Mono, monospace',
                color: '#eab308', whiteSpace: 'nowrap',
              }}>
                ◫ Captions · {captions[0].label}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}