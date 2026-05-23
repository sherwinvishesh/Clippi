import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Scissors, ArrowLeft, GitBranch, Film } from 'lucide-react'
import useClippiStore from '../store/useClippiStore'
import useHydrateClips from '../store/useHydrateClips'
import ChatPanel  from '../components/ChatPanel'
import CanvasArea from '../components/CanvasArea'
import EditorArea from '../components/EditorArea'
import { useState } from "react";      
import ExportModal from "../components/ExportModal";

export default function Editor() {
  const navigate          = useNavigate()
  const { view, setView } = useClippiStore()
  useHydrateClips()   // reconcile persisted store with backend on every mount
  const [showExport, setShowExport] = useState(false);


  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg)',
      overflow: 'hidden',
    }}>

      {/* ── Top bar ── */}
      <div style={{
        height: 52,
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        background: 'var(--surface)',
        flexShrink: 0,
        position: 'relative',   // needed so the centred toggle can be absolute
      }}>

        {/* Left: back + logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/')} style={iconBtn} title="Back to home">
            <ArrowLeft size={16} color="var(--muted)" />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Scissors size={16} color="var(--accent)" />
            <span style={{
              fontFamily: 'Syne, sans-serif',
              fontWeight: 700,
              fontSize: 16,
              letterSpacing: '-0.5px',
            }}>
              clippi
            </span>
          </div>
        </div>

        {/* Centre: Canvas / Editor toggle — absolutely positioned */}
        <div style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 3,
          gap: 2,
        }}>
          {[
            { id: 'canvas', label: 'Canvas', Icon: GitBranch },
            { id: 'editor', label: 'Editor', Icon: Film },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 14px',
                borderRadius: 7,
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'JetBrains Mono, monospace',
                background: view === id ? 'var(--surface2)' : 'transparent',
                color:      view === id ? 'var(--text)'    : 'var(--muted)',
                transition: 'all 0.15s',
              }}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* Right: export button */}
<button
  onClick={() => setShowExport(true)}
  style={{
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'JetBrains Mono, monospace',
    fontWeight: 600,
    background: 'var(--accent)',
    color: '#fff',
  }}
>
  <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
  Export
</button>
      </div>

      {/* ── Main body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left: main workspace */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <motion.div
            key={view}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            style={{ height: '100%' }}
          >
            {view === 'canvas' ? <CanvasArea /> : <EditorArea />}
          </motion.div>
        </div>

        {/* Right: chat — always visible */}
        <div style={{
          width: 340,
          flexShrink: 0,
          borderLeft: '1px solid var(--border)',
          overflow: 'hidden',
        }}>
          <ChatPanel />
        </div>
      </div>
      {showExport && <ExportModal onClose={() => setShowExport(false)} />}

    </div>
  )
}

const iconBtn = {
  width: 32,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 8,
  cursor: 'pointer',
}