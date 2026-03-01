/**
 * Clippi — Landing Page
 * Drop this file into frontend/src/pages/Landing.jsx
 * No new dependencies needed — uses framer-motion + lucide-react (already installed)
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion'
import {
  Scissors, ArrowRight, Zap, Layers, Sparkles, Film,
  MessageSquare, Search, Wand2, ChevronRight, Play, Check,
} from 'lucide-react'
import useClippiStore from '../store/useClippiStore' // Added this
import api from '../api/client'

// ─── Typewriter ───────────────────────────────────────────────────────────────
const WORDS = ['edit', 'trim', 'grade', 'search', 'dub', 'focus', 'remix']

function Typewriter() {
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState('show')   // 'show' | 'hide'

  useEffect(() => {
    if (phase === 'show') {
      const t = setTimeout(() => setPhase('hide'), 1800)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => { setIdx((i) => (i + 1) % WORDS.length); setPhase('show') }, 400)
    return () => clearTimeout(t)
  }, [phase])

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <AnimatePresence mode="wait">
        <motion.span
          key={WORDS[idx]}
          initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -12, filter: 'blur(6px)' }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          style={{
            display: 'inline-block',
            background: 'linear-gradient(90deg, #3b82f6, #06b6d4)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {WORDS[idx]}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

// ─── Marquee ──────────────────────────────────────────────────────────────────
const MARQUEE_ITEMS = [
  '✦ Video RAG Search', '✦ AI Chat Editor', '✦ Color Grading',
  '✦ Cinematic Filters', '✦ Object Tracking', '✦ SAM 2 Segmentation',
  '✦ ElevenLabs Dubbing', '✦ Auto Captions', '✦ Background Removal',
  '✦ Node-Based Flow', '✦ FFmpeg Rendering', '✦ W&B Weave Tracing',
]

function Marquee() {
  return (
    <div style={{
      overflow: 'hidden',
      borderTop: '1px solid #1e2d47',
      borderBottom: '1px solid #1e2d47',
      background: '#080b10',
      padding: '13px 0',
      position: 'relative',
    }}>
      <div style={{
        display: 'flex',
        width: 'max-content',
        animation: 'marquee 32s linear infinite',
        gap: 0,
      }}>
        {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
          <span key={i} style={{
            fontSize: 12,
            fontFamily: 'JetBrains Mono, monospace',
            color: i % 3 === 0 ? '#3b82f6' : i % 3 === 1 ? '#06b6d4' : '#64748b',
            padding: '0 28px',
            whiteSpace: 'nowrap',
            letterSpacing: '0.06em',
            fontWeight: i % 2 === 0 ? 400 : 300,
          }}>
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── MeshBg ───────────────────────────────────────────────────────────────────
function MeshBg() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {/* Noise texture */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.04,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
      }} />
      {/* Grid */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.18,
        backgroundImage: `linear-gradient(#1e2d47 1px, transparent 1px), linear-gradient(90deg, #1e2d47 1px, transparent 1px)`,
        backgroundSize: '60px 60px',
      }} />
      {/* Gradient orb 1 */}
      <div style={{
        position: 'absolute', top: '-10%', left: '20%',
        width: 700, height: 700, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59,130,246,0.11) 0%, transparent 65%)',
        animation: 'pulse 8s ease-in-out infinite',
      }} />
      {/* Gradient orb 2 */}
      <div style={{
        position: 'absolute', top: '20%', right: '-5%',
        width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 65%)',
        animation: 'pulse 10s ease-in-out infinite reverse',
      }} />
      {/* Bottom glow */}
      <div style={{
        position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: 900, height: 300,
        background: 'radial-gradient(ellipse at bottom, rgba(59,130,246,0.07) 0%, transparent 70%)',
      }} />
    </div>
  )
}

// ─── FeatureCard ──────────────────────────────────────────────────────────────
function FeatureCard({ icon: Icon, title, desc, accent, delay, preview }) {
  const [hovered, setHovered] = useState(false)
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? '#0e1420' : '#09101c',
        border: `1px solid ${hovered ? accent + '55' : '#1e2d47'}`,
        borderRadius: 16,
        padding: '28px 24px',
        cursor: 'default',
        transition: 'all 0.25s ease',
        boxShadow: hovered ? `0 0 40px ${accent}15` : 'none',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: 0,
        height: 2, borderRadius: '8px 8px 0 0',
        background: `linear-gradient(90deg, ${accent}, transparent)`,
        width: hovered ? '100%' : '30%',
        transition: 'width 0.4s ease',
      }} />

      {/* Icon */}
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: `${accent}18`,
        border: `1px solid ${accent}33`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 18,
        boxShadow: hovered ? `0 0 20px ${accent}30` : 'none',
        transition: 'box-shadow 0.25s',
      }}>
        <Icon size={20} color={accent} />
      </div>

      <div style={{
        fontSize: 15, fontFamily: 'Syne, sans-serif',
        fontWeight: 600, color: '#e2e8f0',
        marginBottom: 10, letterSpacing: '-0.2px',
      }}>
        {title}
      </div>
      <div style={{
        fontSize: 13, color: '#64748b',
        lineHeight: 1.65, fontFamily: 'JetBrains Mono, monospace',
        fontWeight: 300,
      }}>
        {desc}
      </div>

      {/* Preview code/UI snippet */}
      {preview && (
        <div style={{
          marginTop: 20, background: '#080b10',
          border: '1px solid #1e2d47', borderRadius: 8,
          padding: '10px 12px',
          fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
          color: '#475569', lineHeight: 1.7,
          opacity: hovered ? 1 : 0.5, transition: 'opacity 0.3s',
        }}>
          {preview}
        </div>
      )}
    </motion.div>
  )
}

// ─── StepCard ─────────────────────────────────────────────────────────────────
function StepCard({ number, title, desc, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, delay }}
      style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: 'linear-gradient(135deg, #3b82f618, #06b6d418)',
        border: '1px solid #3b82f633',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontFamily: 'JetBrains Mono, monospace',
        color: '#3b82f6', fontWeight: 600, flexShrink: 0,
      }}>
        {number.toString().padStart(2, '0')}
      </div>
      <div>
        <div style={{
          fontSize: 15, fontFamily: 'Syne, sans-serif',
          fontWeight: 600, color: '#e2e8f0', marginBottom: 6,
        }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.7, fontFamily: 'JetBrains Mono, monospace', fontWeight: 300 }}>
          {desc}
        </div>
      </div>
    </motion.div>
  )
}

// ─── StatPill ─────────────────────────────────────────────────────────────────
function StatPill({ val, label, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay }}
      style={{
        textAlign: 'center',
        padding: '28px 24px',
        background: '#0e1420',
        border: '1px solid #1e2d47',
        borderRadius: 16,
      }}
    >
      <div style={{
        fontSize: 'clamp(36px, 5vw, 56px)',
        fontFamily: 'Syne, sans-serif',
        fontWeight: 800,
        letterSpacing: '-2px',
        background: 'linear-gradient(90deg, #3b82f6, #06b6d4)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        lineHeight: 1,
        marginBottom: 8,
      }}>
        {val}
      </div>
      <div style={{ fontSize: 12, color: '#475569', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.08em' }}>
        {label}
      </div>
    </motion.div>
  )
}

// ─── Floating UI Mock ─────────────────────────────────────────────────────────
function FloatingUI() {
  const [activeNode, setActiveNode] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setActiveNode(n => (n + 1) % 3), 2200)
    return () => clearInterval(t)
  }, [])

  const nodes = [
    { x: 60, y: 30, label: 'intro.mp4', color: '#3b82f6' },
    { x: 240, y: 80, label: 'demo.mp4', color: '#06b6d4' },
    { x: 140, y: 160, label: 'outro.mp4', color: '#8b5cf6' },
  ]

  return (
    <div style={{
      width: '100%', height: 240,
      background: '#080b10',
      border: '1px solid #1e2d47',
      borderRadius: 16,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Toolbar */}
      <div style={{
        height: 36, background: '#0e1420',
        borderBottom: '1px solid #1e2d47',
        display: 'flex', alignItems: 'center',
        padding: '0 12px', gap: 6,
      }}>
        {['#ef4444', '#f59e0b', '#22c55e'].map((c, i) => (
          <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: c, opacity: 0.7 }} />
        ))}
        <span style={{ marginLeft: 8, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#475569' }}>
          clip-canvas.flow
        </span>
      </div>
      {/* Canvas area */}
      <div style={{ position: 'relative', height: 204 }}>
        {/* Connections */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <line x1="120" y1="62" x2="260" y2="100" stroke="#1e2d47" strokeWidth="1.5" strokeDasharray="4 3" />
          <line x1="260" y1="110" x2="175" y2="172" stroke="#1e2d47" strokeWidth="1.5" strokeDasharray="4 3" />
        </svg>
        {/* Nodes */}
        {nodes.map((n, i) => (
          <motion.div
            key={i}
            animate={{ borderColor: activeNode === i ? n.color : '#1e2d47', boxShadow: activeNode === i ? `0 0 16px ${n.color}44` : 'none' }}
            transition={{ duration: 0.4 }}
            style={{
              position: 'absolute',
              left: n.x, top: n.y,
              background: '#0e1420',
              border: '1px solid #1e2d47',
              borderRadius: 8,
              padding: '5px 10px',
              fontSize: 9,
              fontFamily: 'JetBrains Mono, monospace',
              color: activeNode === i ? n.color : '#475569',
              display: 'flex', alignItems: 'center', gap: 5,
              transition: 'color 0.4s',
            }}
          >
            <Film size={9} color={activeNode === i ? n.color : '#475569'} />
            {n.label}
          </motion.div>
        ))}
        {/* Chat bubble */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: [0, 1, 1, 0], x: [20, 0, 0, -10] }}
          transition={{ duration: 3, repeat: Infinity, delay: 1 }}
          style={{
            position: 'absolute', right: 16, bottom: 20,
            background: '#0e1420', border: '1px solid #3b82f633',
            borderRadius: 8, padding: '7px 12px',
            fontSize: 9, fontFamily: 'JetBrains Mono, monospace',
            color: '#3b82f6', maxWidth: 160,
          }}
        >
          <span style={{ color: '#475569' }}>✦ AI: </span>
          blur background, keep speaker at 2.4s
        </motion.div>
      </div>
    </div>
  )
}

// ─── VideoRagMock ──────────────────────────────────────────────────────────────
function VideoRagMock() {
  const [step, setStep] = useState(0)
  const STEPS = [
    { query: 'where is the rubix cube?', result: null },
    { query: 'where is the rubix cube?', result: 'Found at 3.1s → 5.4s' },
  ]
  useEffect(() => {
    const t = setInterval(() => setStep(s => (s + 1) % 3), 1800)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{
      background: '#080b10', border: '1px solid #1e2d47',
      borderRadius: 16, overflow: 'hidden',
    }}>
      {/* Fake video */}
      <div style={{
        height: 100, background: 'linear-gradient(135deg, #0a1628, #0f1e38)',
        position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Film size={28} color="#1e2d47" />
        {step >= 1 && (
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            style={{
              position: 'absolute', bottom: 0,
              left: '31%', width: '24%', height: 3,
              background: 'linear-gradient(90deg, #3b82f6, #06b6d4)',
              transformOrigin: 'left',
            }}
          />
        )}
        {step >= 1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              position: 'absolute', bottom: 6, left: '31%',
              background: 'rgba(59,130,246,0.9)', borderRadius: 4,
              padding: '2px 7px', fontSize: 8,
              fontFamily: 'JetBrains Mono, monospace', color: '#fff',
            }}
          >
            3.1s – 5.4s
          </motion.div>
        )}
      </div>
      {/* Search bar */}
      <div style={{ padding: 12, borderTop: '1px solid #1e2d47' }}>
        <div style={{
          background: '#0e1420', border: '1px solid #1e2d47',
          borderRadius: 8, padding: '7px 12px',
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
        }}>
          <Search size={11} color="#3b82f6" />
          <span style={{ color: '#e2e8f0', flex: 1 }}>where is the rubix cube?</span>
          {step >= 1 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              style={{
                fontSize: 8, color: '#22c55e',
                background: '#22c55e18', border: '1px solid #22c55e33',
                borderRadius: 3, padding: '1px 6px',
              }}
            >
              ✓ found
            </motion.div>
          )}
        </div>
        {step >= 1 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            style={{
              marginTop: 8, fontSize: 9,
              fontFamily: 'JetBrains Mono, monospace',
              color: '#06b6d4',
            }}
          >
            → Jumping to 3.1s · confidence: high
          </motion.div>
        )}
      </div>
    </div>
  )
}

// ─── Chat UI Mock ─────────────────────────────────────────────────────────────
function ChatMock() {
  const msgs = [
    { role: 'user', text: 'blur background at 1:20, keep speaker sharp' },
    { role: 'ai', text: 'Running SAM 2 segmentation… background blurred ✓' },
    { role: 'user', text: 'add golden hour filter at 80% intensity' },
    { role: 'ai', text: 'Applied Golden Hour filter · intensity 80% ✓' },
  ]
  const [visible, setVisible] = useState(1)
  useEffect(() => {
    const t = setInterval(() => setVisible(v => Math.min(v + 1, msgs.length)), 1400)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{
      background: '#080b10', border: '1px solid #1e2d47',
      borderRadius: 16, overflow: 'hidden', height: 200,
    }}>
      <div style={{
        height: 34, background: '#0e1420', borderBottom: '1px solid #1e2d47',
        display: 'flex', alignItems: 'center', padding: '0 12px', gap: 7,
      }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
        <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#475569' }}>Clippi AI</span>
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
        {msgs.slice(0, visible).map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: m.role === 'user' ? 16 : -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '88%',
              background: m.role === 'user' ? '#3b82f6' : '#0e1420',
              border: m.role === 'ai' ? '1px solid #1e2d47' : 'none',
              borderRadius: m.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
              padding: '6px 10px',
              fontSize: 9, fontFamily: 'JetBrains Mono, monospace',
              color: m.role === 'user' ? '#fff' : '#94a3b8',
              lineHeight: 1.5,
            }}
          >
            {m.text}
          </motion.div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Landing Page ────────────────────────────────────────────────────────
export default function Landing() {
  const navigate = useNavigate()
  const [health, setHealth] = useState(null)
  const heroRef = useRef(null)
  const setView = useClippiStore((state) => state.setView)
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const heroOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0])
  const heroY = useTransform(scrollYProgress, [0, 0.6], [0, -60])

  useEffect(() => {
    api.get('/health').then(() => setHealth('ok')).catch(() => setHealth('error'))
  }, [])

  const handleStartEditing = () => {
    setView('canvas')
    navigate('/edit')
  }

  const FEATURES = [
    {
      icon: MessageSquare, title: 'AI Chat Editor', accent: '#3b82f6', delay: 0,
      desc: 'Describe your edits in plain English. Trim, recolor, blur, dub — the AI parses your intent and executes with Mistral function calling.',
      preview: '> "blur bg, keep speaker"\n→ SAM 2 mask · FFmpeg blend ✓',
    },
    {
      icon: Search, title: 'Video RAG Search', accent: '#06b6d4', delay: 0.08,
      desc: 'Ask "where is the rubix cube?" and jump straight to 3.1s. Pixtral indexes every frame on upload — semantic video search in real time.',
      preview: '> "where is the product demo?"\n→ timestamp: 1:24 · conf: 0.94',
    },
    {
      icon: Layers, title: 'Node-Based Flow', accent: '#8b5cf6', delay: 0.16,
      desc: 'Drag clips onto the canvas, connect them with edges. Click any edge for fade / wipe / dissolve transitions. Non-destructive by design.',
      preview: 'intro.mp4 → [fade] → hook.mp4\nhook.mp4  → [cut]  → cta.mp4',
    },
    {
      icon: Sparkles, title: 'Color Grading', accent: '#f59e0b', delay: 0.24,
      desc: 'Full DaVinci-style suite: Basics, Curves, HSL, Color Wheels, Vignette. Live CSS preview on video as you drag sliders.',
      preview: '◎ exposure  +18\n◎ golden-hr  80%\n◎ vignette   40%',
    },
    {
      icon: Wand2, title: 'Object-Aware Editing', accent: '#ec4899', delay: 0.32,
      desc: 'SAM 2 segmentation isolates any object in the frame. Blur background, spotlight, recolor, or zoom-track — applied per-frame.',
      preview: '→ mask: speaker (conf 0.97)\n→ background blur: σ=21px',
    },
    {
      icon: Film, title: '20 Cinematic Filters', accent: '#22c55e', delay: 0.40,
      desc: 'B&W, Noir, Teal & Orange, Kodak, Fuji, Cross Process, Cinema and more. Adjustable intensity 0–100% with LUT import support.',
      preview: '◈ Cinema · 100%\n◈ Teal & Orange · 80%\n◈ Import .cube LUT',
    },
  ]

  const STEPS = [
    { number: 1, title: 'Upload your clips', desc: 'Drag videos onto the canvas. Pixtral indexes every frame in the background for semantic search.', delay: 0 },
    { number: 2, title: 'Connect & order', desc: 'Build your story on the node canvas. Edges become transitions — pick cut, fade, wipe, or dissolve.', delay: 0.1 },
    { number: 3, title: 'Chat to edit', desc: 'Switch to Editor. Open the AI chat and describe your changes. Mistral routes to the right FFmpeg or ElevenLabs tool.', delay: 0.2 },
    { number: 4, title: 'Export', desc: 'Hit render. FFmpeg stitches every clip in canvas order with your transitions, edits, and audio into a final MP4.', delay: 0.3 },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#080b10', color: '#e2e8f0', overflowX: 'hidden' }}>

      {/* ─── NAV ─── */}
      <motion.nav
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
          height: 60,
          background: 'rgba(8,11,16,0.8)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(30,45,71,0.6)',
          display: 'flex', alignItems: 'center',
          padding: '0 40px',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'linear-gradient(135deg, #3b82f618, #06b6d418)',
            border: '1px solid #3b82f633',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Scissors size={14} color="#3b82f6" />
          </div>
          <span style={{
            fontFamily: 'Syne, sans-serif', fontWeight: 700,
            fontSize: 18, letterSpacing: '-0.5px',
          }}>
            clippi
          </span>
        </div>

        {/* Links */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Status dot */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#0e1420', border: '1px solid #1e2d47',
            borderRadius: 999, padding: '5px 12px',
            fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
            color: health === 'ok' ? '#22c55e' : health === 'error' ? '#ef4444' : '#64748b',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: health === 'ok' ? '#22c55e' : health === 'error' ? '#ef4444' : '#334155',
              boxShadow: health === 'ok' ? '0 0 8px #22c55e' : 'none',
            }} />
            {health === 'ok' ? 'live' : health === 'error' ? 'offline' : '...'}
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleStartEditing}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              background: '#3b82f6', border: 'none',
              borderRadius: 9, padding: '8px 18px',
              fontSize: 12, fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 500, color: '#fff', cursor: 'pointer',
              letterSpacing: '0.02em',
            }}
          >
            Open Editor
            <ArrowRight size={13} />
          </motion.button>
        </div>
      </motion.nav>

      {/* ─── HERO ─── */}
      <motion.section
        ref={heroRef}
        style={{ opacity: heroOpacity, y: heroY }}
        className="hero-section"
      >
        <div style={{
          minHeight: '100vh',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          position: 'relative', textAlign: 'center',
          padding: '120px 24px 80px',
        }}>
          <MeshBg />

          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(59,130,246,0.08)',
              border: '1px solid rgba(59,130,246,0.25)',
              borderRadius: 999, padding: '6px 16px',
              fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
              color: '#60a5fa', marginBottom: 40,
              letterSpacing: '0.06em',
            }}
          >
            <Zap size={10} fill="#60a5fa" />
            MISTRAL AI · PIXTRAL VISION · SAM 2 · ELEVENLABS
          </motion.div>

          {/* Main headline */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.6 }}
            style={{
              fontSize: 'clamp(52px, 9vw, 108px)',
              fontFamily: 'Syne, sans-serif',
              fontWeight: 800,
              letterSpacing: '-4px',
              lineHeight: 0.95,
              marginBottom: 32,
              position: 'relative', zIndex: 1,
            }}
          >
            <span style={{ display: 'block', color: '#e2e8f0' }}>
              talk to your
            </span>
            <span style={{ display: 'block', color: '#e2e8f0' }}>
              video editor.
            </span>
          </motion.div>

          {/* Subheadline with typewriter */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            style={{
              fontSize: 'clamp(16px, 2.5vw, 22px)',
              fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 300,
              color: '#475569',
              marginBottom: 52,
              lineHeight: 1.5,
              maxWidth: 560,
              position: 'relative', zIndex: 1,
            }}
          >
            type a message to&nbsp;<Typewriter />&nbsp;your clips.
            <br />
            <span style={{ fontSize: '0.75em', color: '#334155' }}>
              no timeline scrubbing. no menu diving.
            </span>
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65, duration: 0.5 }}
            style={{
              display: 'flex', gap: 12, flexWrap: 'wrap',
              justifyContent: 'center', position: 'relative', zIndex: 1,
            }}
          >
            <motion.button
              whileHover={{ scale: 1.03, boxShadow: '0 0 40px rgba(59,130,246,0.45)' }}
              whileTap={{ scale: 0.97 }}
              onClick={handleStartEditing}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: '#3b82f6', border: 'none',
                borderRadius: 12, padding: '14px 32px',
                fontSize: 15, fontFamily: 'JetBrains Mono, monospace',
                fontWeight: 500, color: '#fff', cursor: 'pointer',
                boxShadow: '0 0 32px rgba(59,130,246,0.3)',
                letterSpacing: '0.02em',
              }}
            >
              <Play size={15} fill="#fff" />
              Start Editing Free
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'transparent',
                border: '1px solid #1e2d47', borderRadius: 12,
                padding: '14px 24px',
                fontSize: 13, fontFamily: 'JetBrains Mono, monospace',
                color: '#64748b', cursor: 'pointer',
                letterSpacing: '0.02em',
              }}
            >
              View on GitHub
              <ChevronRight size={14} />
            </motion.button>
          </motion.div>

          {/* Scroll hint */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4 }}
            style={{
              position: 'absolute', bottom: 36,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            }}
          >
            <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#334155', letterSpacing: '0.1em' }}>
              SCROLL
            </div>
            <motion.div
              animate={{ y: [0, 6, 0] }}
              transition={{ duration: 1.6, repeat: Infinity }}
              style={{ width: 1, height: 28, background: 'linear-gradient(to bottom, #3b82f6, transparent)' }}
            />
          </motion.div>
        </div>
      </motion.section>

      {/* ─── MARQUEE ─── */}
      <Marquee />

      {/* ─── LIVE MOCKUPS ─── */}
      <section style={{ padding: 'clamp(60px,8vw,120px) clamp(20px,6vw,80px)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            style={{ textAlign: 'center', marginBottom: 64 }}
          >
            <div style={{
              fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
              color: '#3b82f6', letterSpacing: '0.15em', marginBottom: 16,
              textTransform: 'uppercase',
            }}>
              Product Preview
            </div>
            <h2 style={{
              fontFamily: 'Syne, sans-serif', fontWeight: 800,
              fontSize: 'clamp(32px, 5vw, 52px)', letterSpacing: '-2px',
              color: '#e2e8f0', lineHeight: 1.05,
            }}>
              three panels,<br />
              <span style={{
                background: 'linear-gradient(90deg, #3b82f6, #06b6d4)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
                infinite possibilities.
              </span>
            </h2>
          </motion.div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 24,
          }}>
            {/* Panel 1 */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0 }}
            >
              <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }} />
                <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#64748b', letterSpacing: '0.1em' }}>
                  CANVAS · NODE EDITOR
                </span>
              </div>
              <FloatingUI />
            </motion.div>

            {/* Panel 2 */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#06b6d4' }} />
                <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#64748b', letterSpacing: '0.1em' }}>
                  VIDEO RAG · SEMANTIC SEARCH
                </span>
              </div>
              <VideoRagMock />
            </motion.div>

            {/* Panel 3 */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#8b5cf6' }} />
                <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#64748b', letterSpacing: '0.1em' }}>
                  AI CHAT · NATURAL LANGUAGE
                </span>
              </div>
              <ChatMock />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── STATS ─── */}
      <section style={{
        padding: 'clamp(40px,6vw,80px) clamp(20px,6vw,80px)',
        background: 'linear-gradient(to right, #09101c, #080b10, #09101c)',
        borderTop: '1px solid #1e2d47', borderBottom: '1px solid #1e2d47',
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 20,
        }}>
          <StatPill val="48h"  label="HACKATHON BUILD"   delay={0} />
          <StatPill val="20+"  label="CINEMATIC FILTERS"  delay={0.08} />
          <StatPill val="12"   label="AI TOOLS EXPOSED"   delay={0.16} />
          <StatPill val="~2s"  label="FRAME INDEXING / CLIP" delay={0.24} />
        </div>
      </section>

      {/* ─── FEATURES GRID ─── */}
      <section style={{ padding: 'clamp(60px,8vw,120px) clamp(20px,6vw,80px)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            style={{ marginBottom: 64 }}
          >
            <div style={{
              fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
              color: '#06b6d4', letterSpacing: '0.15em', marginBottom: 16,
              textTransform: 'uppercase',
            }}>
              Feature Set
            </div>
            <h2 style={{
              fontFamily: 'Syne, sans-serif', fontWeight: 800,
              fontSize: 'clamp(32px,5vw,52px)', letterSpacing: '-2px',
              color: '#e2e8f0', lineHeight: 1.05, maxWidth: 560,
            }}>
              every tool a
              <br />
              <span style={{ color: '#334155' }}>
                pro editor needs.
              </span>
            </h2>
          </motion.div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 20,
          }}>
            {FEATURES.map((f, i) => <FeatureCard key={i} {...f} />)}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section style={{
        padding: 'clamp(60px,8vw,120px) clamp(20px,6vw,80px)',
        background: '#09101c',
        borderTop: '1px solid #1e2d47',
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80,
          alignItems: 'center',
        }}>
          {/* Left: text */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <div style={{
                fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
                color: '#8b5cf6', letterSpacing: '0.15em', marginBottom: 16,
                textTransform: 'uppercase',
              }}>
                How It Works
              </div>
              <h2 style={{
                fontFamily: 'Syne, sans-serif', fontWeight: 800,
                fontSize: 'clamp(28px, 4vw, 44px)', letterSpacing: '-1.5px',
                color: '#e2e8f0', lineHeight: 1.1, marginBottom: 48,
              }}>
                upload. connect.<br />chat. export.
              </h2>
            </motion.div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              {STEPS.map((s, i) => <StepCard key={i} {...s} />)}
            </div>
          </div>

          {/* Right: arch diagram */}
          <motion.div
            initial={{ opacity: 0, x: 32 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div style={{
              background: '#080b10', border: '1px solid #1e2d47',
              borderRadius: 20, padding: 28,
              fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
            }}>
              <div style={{ color: '#334155', marginBottom: 16, fontSize: 9, letterSpacing: '0.12em' }}>
                ARCHITECTURE
              </div>

              {[
                { label: 'React Frontend', sub: 'React Flow · Remotion · Framer Motion', color: '#3b82f6' },
                { label: 'FastAPI Backend', sub: 'Endpoints: upload · edit · search · render', color: '#06b6d4' },
                { label: 'Mistral AI Brain', sub: 'Function calling → tool router', color: '#8b5cf6' },
                { label: 'Pixtral Vision', sub: 'Frame indexing · Video RAG', color: '#a78bfa' },
                { label: 'FFmpeg Engine', sub: 'Trim · filter · stitch · export', color: '#f59e0b' },
                { label: 'ElevenLabs Audio', sub: 'Scribe · Dubbing · TTS v3 · Music', color: '#22c55e' },
                { label: 'SAM 2 Segment', sub: 'Per-frame object masking', color: '#ec4899' },
                { label: 'W&B Weave', sub: 'LLM + tool call tracing', color: '#64748b' },
              ].map((row, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 7,
                  marginBottom: 4,
                  background: '#09101c',
                  border: '1px solid #1e2d47',
                }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: row.color, flexShrink: 0,
                    boxShadow: `0 0 6px ${row.color}66`,
                  }} />
                  <span style={{ color: '#e2e8f0', flex: '0 0 auto', minWidth: 150 }}>
                    {row.label}
                  </span>
                  <span style={{ color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9 }}>
                    {row.sub}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── CTA SECTION ─── */}
      <section style={{
        padding: 'clamp(80px,10vw,160px) clamp(20px,6vw,80px)',
        textAlign: 'center', position: 'relative', overflow: 'hidden',
      }}>
        <MeshBg />

        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          style={{ position: 'relative', zIndex: 1 }}
        >
          <h2 style={{
            fontFamily: 'Syne, sans-serif', fontWeight: 800,
            fontSize: 'clamp(40px, 8vw, 88px)',
            letterSpacing: '-4px', lineHeight: 0.95,
            marginBottom: 32, color: '#e2e8f0',
          }}>
            your next video,
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #3b82f6 20%, #06b6d4 80%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              already editing itself.
            </span>
          </h2>

          <p style={{
            fontSize: 15, fontFamily: 'JetBrains Mono, monospace',
            color: '#475569', marginBottom: 52, maxWidth: 440,
            margin: '0 auto 52px', lineHeight: 1.6, fontWeight: 300,
          }}>
            Upload a clip. Chat with the AI. Ship in minutes. Built in 48 hours,
            ready for the world.
          </p>

          {/* Features checklist */}
          <div style={{
            display: 'inline-flex', flexDirection: 'column', gap: 10,
            marginBottom: 52, textAlign: 'left',
          }}>
            {[
              'No Premiere or DaVinci required',
              'Video search that actually understands content',
              'Object-aware editing with SAM 2',
              'ElevenLabs voices, captions, dubbing built in',
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  fontSize: 13, fontFamily: 'JetBrains Mono, monospace',
                  color: '#64748b',
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: '#3b82f618', border: '1px solid #3b82f633',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Check size={10} color="#3b82f6" />
                </div>
                {item}
              </motion.div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <motion.button
              whileHover={{ scale: 1.03, boxShadow: '0 0 50px rgba(59,130,246,0.5)' }}
              whileTap={{ scale: 0.97 }}
              onClick={handleStartEditing}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
                border: 'none', borderRadius: 14,
                padding: '16px 40px',
                fontSize: 16, fontFamily: 'JetBrains Mono, monospace',
                fontWeight: 600, color: '#fff', cursor: 'pointer',
                boxShadow: '0 0 40px rgba(59,130,246,0.35)',
                letterSpacing: '-0.2px',
              }}
            >
              Open the Editor
              <ArrowRight size={17} />
            </motion.button>
          </div>
        </motion.div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer style={{
        borderTop: '1px solid #1e2d47',
        padding: '28px 40px',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Scissors size={13} color="#3b82f6" />
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>clippi</span>
        </div>
        <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#334155' }}>
          BUILT WITH MISTRAL AI · PIXTRAL · SAM 2 · ELEVENLABS · FFMPEG
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: health === 'ok' ? '#22c55e' : '#334155',
            boxShadow: health === 'ok' ? '0 0 8px #22c55e' : 'none',
          }} />
          <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#334155' }}>
            API {health === 'ok' ? 'online' : 'offline'}
          </span>
        </div>
      </footer>

      {/* ─── GLOBAL STYLES ─── */}
      <style>{`
        @keyframes marquee {
          from { transform: translateX(0) }
          to   { transform: translateX(-50%) }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1);   opacity: 1 }
          50%       { transform: scale(1.08); opacity: 0.7 }
        }
        @media (max-width: 768px) {
          section > div[style*="grid-template-columns: 1fr 1fr"] {
            grid-template-columns: 1fr !important;
            gap: 48px !important;
          }
        }
      `}</style>
    </div>
  )
}