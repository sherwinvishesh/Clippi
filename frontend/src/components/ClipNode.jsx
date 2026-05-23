import { memo, useState, useRef, useEffect } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Film, Clock, MoreVertical, Trash2 } from 'lucide-react'
import useClippiStore from '../store/useClippiStore'

function formatDuration(seconds) {
  if (!seconds || seconds === 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function ClipNode({ id, data, selected }) {
  const setActiveClip = useClippiStore((s) => s.setActiveClip)
  const removeClip    = useClippiStore((s) => s.removeClip)

  // Subscribe to AI state for THIS specific clip
  const aiProcessing = useClippiStore((s) => s.clips.find(c => c.id === id)?.aiProcessing ?? false)
  const aiReplaced   = useClippiStore((s) => s.clips.find(c => c.id === id)?.aiReplaced   ?? false)

  const [imgError,  setImgError]  = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [showMenu,  setShowMenu]  = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const videoRef = useRef(null)

  const handleDoubleClick = () => setActiveClip(id)

  // Stop preview video at 5 seconds
  useEffect(() => {
    const video = videoRef.current
    if (!video || !isHovered) return

    const handleTimeUpdate = () => {
      if (video.currentTime >= 5) video.pause()
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    return () => video.removeEventListener('timeupdate', handleTimeUpdate)
  }, [isHovered])

  return (
    <div
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setShowMenu(false) }}
      title="Double-click to open in editor | Hover to preview"
      style={{
        width: 200,
        background: 'var(--surface)',
        border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: selected
          ? '0 0 0 3px rgba(59,130,246,0.25), 0 8px 32px rgba(0,0,0,0.4)'
          : '0 4px 20px rgba(0,0,0,0.3)',
        cursor: 'grab',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        userSelect: 'none',
      }}
    >
      {/* ── Thumbnail / Preview Area ── */}
      <div style={{
        width: '100%',
        height: 112,
        background: 'var(--surface2)',
        position: 'relative',
        overflow: 'hidden',
      }}>

        {/* Action Menu Toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu) }}
          style={{
            position: 'absolute', top: 6, right: 6, zIndex: 20,
            background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: 6,
            width: 24, height: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#fff',
          }}
        >
          <MoreVertical size={14} />
        </button>

        {/* Dropdown Menu */}
        {showMenu && (
          <div style={{
            position: 'absolute', top: 34, right: 6, zIndex: 30,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)', minWidth: 120,
          }}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (confirm('Remove this clip?')) removeClip(id)
              }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', background: 'transparent', border: 'none',
                borderRadius: 4, cursor: 'pointer', color: '#ef4444',
                fontSize: 11, fontFamily: 'JetBrains Mono, monospace', textAlign: 'left',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <Trash2 size={12} />
              Remove Clip
            </button>
          </div>
        )}

        {/* Hover Video Preview */}
        {isHovered && (
          <video
            ref={videoRef}
            src={`/api/clips/${id}/file`}
            autoPlay muted playsInline
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: 'cover', zIndex: 10,
            }}
          />
        )}

        {/* Static Thumbnail */}
        {data.thumbnail_url && !imgError ? (
          <>
            {!imgLoaded && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Film size={24} color="var(--muted)" />
              </div>
            )}
            <img
              src={data.thumbnail_url}
              alt={data.name}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
              style={{
                width: '100%', height: '100%',
                objectFit: 'cover',
                opacity: imgLoaded ? 1 : 0,
                transition: 'opacity 0.2s',
                display: 'block',
              }}
            />
          </>
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <Film size={24} color="var(--muted)" />
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>No preview</span>
          </div>
        )}

        {/* Duration badge */}
        {data.duration > 0 && (
          <div style={{
            position: 'absolute', bottom: 6, right: 6,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(4px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 5, padding: '2px 6px',
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 10, color: '#e2e8f0',
            fontFamily: 'JetBrains Mono, monospace',
            zIndex: 11,
          }}>
            <Clock size={9} />
            {formatDuration(data.duration)}
          </div>
        )}

        {/* Selected glow stripe */}
        {selected && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: 2, background: 'var(--accent)', zIndex: 12,
          }} />
        )}

        {/* ── AI Processing badge — pulsing yellow bar at bottom ── */}
        {aiProcessing && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'rgba(0,0,0,0.82)',
            backdropFilter: 'blur(4px)',
            padding: '4px 8px',
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 10, fontWeight: 600,
            color: '#facc15',
            fontFamily: 'JetBrains Mono, monospace',
            zIndex: 15,
            animation: 'clipPulse 1.6s ease-in-out infinite',
          }}>
            <span style={{ display: 'inline-block', animation: 'clipSpin 1.2s linear infinite' }}>
              ⚙️
            </span>
            AI Processing…
          </div>
        )}

        {/* ── AI Replaced badge — solid green bar at bottom ── */}
        {aiReplaced && !aiProcessing && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(90deg, #15803d, #16a34a)',
            padding: '4px 8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            fontSize: 10, fontWeight: 700,
            color: '#ffffff',
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.04em',
            zIndex: 15,
          }}>
            ✨ AI REPLACED
          </div>
        )}

      </div>

      {/* ── Name row ── */}
      <div style={{
        padding: '8px 10px',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: aiProcessing
            ? '#facc15'                                    // yellow dot while processing
            : aiReplaced
              ? '#22c55e'                                  // green dot after AI replaced
              : selected
                ? 'var(--accent)'                         // blue dot when selected
                : 'var(--muted)',                         // grey dot otherwise
          flexShrink: 0,
          transition: 'background 0.3s',
          boxShadow: aiProcessing ? '0 0 6px #facc15' : aiReplaced ? '0 0 6px #22c55e' : 'none',
        }} />
        <span style={{
          fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
          color: 'var(--text)', whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis', flex: 1,
        }}>
          {data.name || 'Untitled'}
        </span>
      </div>

      {/* ── React Flow Handles ── */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 10, height: 10,
          background: 'var(--surface2)',
          border: '2px solid var(--border)',
          borderRadius: '50%', left: -6,
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 10, height: 10,
          background: 'var(--accent)',
          border: '2px solid var(--surface)',
          borderRadius: '50%', right: -6,
        }}
      />

      {/* ── Keyframes ── */}
      <style>{`
        @keyframes clipPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.55; }
        }
        @keyframes clipSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default memo(ClipNode)