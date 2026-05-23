import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Bot, User, Loader } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import useClippiStore from '../store/useClippiStore'
import { applyActions } from './applyActions'

export default function ChatPanel() {
  const [messages,   setMessages]   = useState([{
    id:   'welcome',
    role: 'assistant',
    text: "Ready to edit! Ask me to trim, rotate, add filters — or try audio tools like captions, dubbing, sound effects, background music, and more.",
  }])
  const [input,      setInput]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [processing, setProcessing] = useState(null) // e.g. "Generating sound effect…"
  const [history,    setHistory]    = useState([])

  const bottomRef         = useRef(null)
  const abortRef          = useRef(null)
  const pollingIntervalRef = useRef(null)

  // ── Scroll to bottom whenever messages change ──────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, processing])

  // ── Polling helpers ────────────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), [stopPolling])

  const startPollingJob = useCallback((jobId, clipId) => {
    stopPolling()

    // Add a live-updating progress message to the chat
    const processingMsgId = `ai-job-${Date.now()}`
    setMessages(prev => [
      ...prev,
      {
        id:           processingMsgId,
        role:         'assistant',
        text:         '⚙️ Visual AI is starting up…',   // <-- use `text` not `content`
        isProcessing: true,
      },
    ])

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`/api/jobs/${jobId}`)
        const data = await res.json()

        // Update the progress text live
        setMessages(prev =>
          prev.map(m =>
            m.id === processingMsgId
              ? { ...m, text: `⚙️ ${data.progress || 'Processing…'}` }
              : m
          )
        )

        if (data.status === 'complete') {
          stopPolling()

          // Apply the result actions (replaceClipVideo) to the store
          if (data.result?.actions) {
            const currentStore = useClippiStore.getState()
            applyActions(data.result.actions, currentStore)
          }

          // Replace the progress message with a success message
          setMessages(prev =>
            prev.map(m =>
              m.id === processingMsgId
                ? {
                    ...m,
                    text:         '✅ Done! The video has been replaced with the AI-processed version.',
                    isProcessing: false,
                  }
                : m
            )
          )
        }

        if (data.status === 'failed') {
          stopPolling()

          // Mark clip as no longer processing in the store
          const currentStore = useClippiStore.getState()
          currentStore.setClipAIFailed(clipId)

          setMessages(prev =>
            prev.map(m =>
              m.id === processingMsgId
                ? {
                    ...m,
                    text:         `❌ Visual AI failed: ${data.error || 'Unknown error'}. Please try again.`,
                    isProcessing: false,
                  }
                : m
            )
          )
        }
      } catch (err) {
        console.error('Polling error:', err)
      }
    }, 3000) // poll every 3 seconds
  }, [stopPolling])

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: trimmed }])
    setInput('')
    setLoading(true)
    setProcessing(null)

    const state = useClippiStore.getState()

    // ── FIXED: include clip_id (the active clip) in the request body ──────────
    const body = {
      message:             trimmed,
      clip_id:             state.activeClipId,   // <-- NEW: tells backend which clip to process
      activeClipId:        state.activeClipId,
      clips:               state.clips,
      conversationHistory: history,
    }

    try {
      abortRef.current = new AbortController()
      const res  = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  abortRef.current.signal,
      })
      const data = await res.json()
      if (data.status === 'error') throw new Error(data.reply)

      // Show extended-wait notice if audio processing happened
      const isAudio = data.actions?.some(a =>
        ['addAudioEffect', 'setClipCaptions', 'refreshClipVideo'].includes(a.type)
      )
      if (isAudio) {
        setProcessing('Processing audio with ElevenLabs…')
        await new Promise(r => setTimeout(r, 600))
      }

      // Add the assistant's reply text
      setMessages(prev => [...prev, {
        id:   (Date.now() + 1).toString(),
        role: 'assistant',
        text: data.reply,
      }])

      setHistory(prev => [
        ...prev,
        { role: 'user',      text: trimmed   },
        { role: 'assistant', text: data.reply },
      ].slice(-10))

      // ── FIXED: capture pollingInfo returned by applyActions ───────────────
      if (data.actions) {
        const pollingInfo = applyActions(data.actions, state)

        if (pollingInfo) {
          // Visual AI job started — begin polling in the background.
          // We re-enable the input immediately so the user can keep chatting.
          setLoading(false)
          setProcessing(null)
          startPollingJob(pollingInfo.jobId, pollingInfo.clipId)
          return // skip the finally block's setLoading(false) — already done
        }
      }

    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages(prev => [...prev, {
          id:   'err-' + Date.now(),
          role: 'assistant',
          text: `⚠️ ${err.message}`,
        }])
      }
    } finally {
      setLoading(false)
      setProcessing(null)
    }
  }, [loading, history, startPollingJob])

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const QUICK_ACTIONS = [
    { label: '🎵 Add Music',  msg: 'add upbeat background music'                             },
    { label: '🔇 Denoise',    msg: 'clean up the audio and remove background noise'           },
    { label: '💬 Captions',   msg: 'add captions to the video'                               },
    { label: '🎤 Voiceover',  msg: 'add an energetic voiceover that says "Check this out!"'  },
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>

      {/* ── Header ── */}
      <div style={{
        height: 52, borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 8,
        flexShrink: 0, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(10px)',
      }}>
        <div style={{
          width: 28, height: 28, background: 'var(--accent)',
          borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Bot size={14} color="#fff" />
        </div>
        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
          Clippi AI
        </span>
        <button
          onClick={() => { setMessages([]); setHistory([]) }}
          style={{
            marginLeft: 'auto', fontSize: 10, color: 'var(--muted)', fontWeight: 700,
            background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.06em',
          }}
        >
          RESET
        </button>
      </div>

      {/* ── Messages ── */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: 16,
        display: 'flex', flexDirection: 'column', gap: 12,
      }} className="scrollbar-hide">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                display: 'flex',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                gap: 8, alignItems: 'flex-start',
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 26, height: 26, flexShrink: 0, borderRadius: 7,
                background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface2)',
                border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {msg.role === 'user'
                  ? <User size={13} color="#fff" />
                  : <Bot  size={13} color="var(--accent)" />
                }
              </div>

              {/* Bubble */}
              <div style={{
                maxWidth: '80%',
                background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface2)',
                border: `1px solid ${msg.role === 'user' ? 'transparent' : 'var(--border)'}`,
                borderRadius: msg.role === 'user'
                  ? '12px 12px 2px 12px'
                  : '12px 12px 12px 2px',
                padding: '8px 12px', fontSize: 13, lineHeight: 1.5,
                color: msg.role === 'user' ? '#fff' : 'var(--text)',
                // Pulse animation for active AI processing messages
                animation: msg.isProcessing ? 'pulseBubble 2s ease-in-out infinite' : 'none',
              }}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code: ({ inline, children, ...props }) => (
                      <code style={{
                        background: 'rgba(0,0,0,0.2)', padding: '2px 4px',
                        borderRadius: 4, fontFamily: 'monospace', fontSize: '0.9em',
                      }} {...props}>{children}</code>
                    ),
                    p: ({ children }) => <p style={{ margin: 0 }}>{children}</p>,
                  }}
                >
                  {msg.text}
                </ReactMarkdown>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* ── Loading / Processing indicator ── */}
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}
          >
            <div style={{
              width: 26, height: 26, borderRadius: 7, flexShrink: 0,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bot size={13} color="var(--accent)" />
            </div>
            <div style={{
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: '12px 12px 12px 2px', padding: '10px 14px',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Loader
                  size={14}
                  color="var(--muted)"
                  style={{ animation: 'spin 1s linear infinite' }}
                />
                <span style={{
                  fontSize: 12, color: 'var(--muted)',
                  fontFamily: 'JetBrains Mono, monospace',
                }}>
                  {processing ?? 'Thinking…'}
                </span>
              </div>
              {processing && (
                <span style={{
                  fontSize: 10, color: '#64748b',
                  fontFamily: 'JetBrains Mono, monospace',
                }}>
                  Audio operations can take 15 s – 5 min depending on the feature.
                </span>
              )}
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Quick-action chips ── */}
      <div style={{ padding: '6px 12px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {QUICK_ACTIONS.map(({ label, msg }) => (
          <button
            key={label}
            onClick={() => sendMessage(msg)}
            disabled={loading}
            style={{
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 20, padding: '4px 10px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
              color: 'var(--muted)', opacity: loading ? 0.5 : 1,
              transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => {
              if (!loading) {
                e.currentTarget.style.borderColor = 'var(--accent)'
                e.currentTarget.style.color       = 'var(--accent)'
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.color       = 'var(--muted)'
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Input ── */}
      <div style={{
        padding: 12, borderTop: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ask clippi anything..."
            rows={1}
            style={{
              flex: 1, background: 'var(--surface2)',
              border: '1px solid var(--border)', borderRadius: 10,
              padding: '9px 12px', fontSize: 13, color: 'var(--text)',
              fontFamily: 'inherit', resize: 'none', outline: 'none',
              lineHeight: 1.5, maxHeight: 120,
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            style={{
              width: 38, height: 38,
              background: input.trim() && !loading ? 'var(--accent)' : 'var(--surface2)',
              border: '1px solid var(--border)', borderRadius: 10,
              cursor: input.trim() && !loading ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'all 0.15s', opacity: loading ? 0.5 : 1,
            }}
          >
            <Send size={15} color={input.trim() && !loading ? '#fff' : 'var(--muted)'} />
          </button>
        </div>
        <p style={{
          fontSize: 10, color: 'var(--muted)', textAlign: 'center', margin: 0,
          fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.05em',
        }}>
          ENTER TO SEND · SHIFT+ENTER FOR NEW LINE
        </p>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg) }
          to   { transform: rotate(360deg) }
        }
        @keyframes pulseBubble {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.65; }
        }
      `}</style>
    </div>
  )
}