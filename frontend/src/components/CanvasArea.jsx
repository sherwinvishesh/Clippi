import { useCallback, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Upload, Loader, GitBranch, Scissors, Trash2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import useClippiStore from '../store/useClippiStore'
import ClipNode       from './ClipNode'
import TransitionEdge from './TransitionEdge'
import api from '../api/client'

const NODE_TYPES = { clipNode: ClipNode }
const EDGE_TYPES = { transitionEdge: TransitionEdge }

function nextNodePosition(existingNodes) {
  const count = existingNodes.length
  const col   = count % 3
  const row   = Math.floor(count / 3)
  return { x: 80 + col * 260, y: 60 + row * 200 }
}

function CanvasInner() {
  const nodes    = useClippiStore((s) => s.nodes)
  const edges    = useClippiStore((s) => s.edges)
  const setNodes = useClippiStore((s) => s.setNodes)
  const setEdges = useClippiStore((s) => s.setEdges)
  const addClip  = useClippiStore((s) => s.addClip)
  const clearClips = useClippiStore((s) => s.clearClips)

  const [uploading,   setUploading]   = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const fileInputRef = useRef(null)

  const onNodesChange = useCallback(
    (changes) => setNodes(applyNodeChanges(changes, nodes)),
    [nodes, setNodes]
  )
  const onEdgesChange = useCallback(
    (changes) => setEdges(applyEdgeChanges(changes, edges)),
    [edges, setEdges]
  )
  const onConnect = useCallback(
    (params) =>
      setEdges(
        addEdge(
          { ...params, type: 'transitionEdge', data: { transition: 'cut' } },
          edges
        )
      ),
    [edges, setEdges]
  )

  const handleFiles = async (files) => {
    if (!files?.length) return
    setUploadError(null)

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('video/')) {
        setUploadError(`"${file.name}" is not a video file`)
        continue
      }
      setUploading(true)
      try {
        const form = new FormData()
        form.append('file', file)
        const { data } = await api.post('/clips/upload', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })

        addClip({
          id:            data.clip_id,
          name:          data.name,
          duration:      data.duration,
          thumbnail_url: data.thumbnail_url,
        })

        const currentNodes = useClippiStore.getState().nodes
        const position     = nextNodePosition(currentNodes)
        const newNode = {
          id:   data.clip_id,
          type: 'clipNode',
          position,
          data: {
            name:          data.name,
            duration:      data.duration,
            thumbnail_url: data.thumbnail_url,
          },
        }
        setNodes([...currentNodes, newNode])

      } catch (err) {
        setUploadError(err?.response?.data?.detail || err.message || 'Upload failed')
      } finally {
        setUploading(false)
      }
    }
  }

  const onFileChange = (e) => { handleFiles(e.target.files); e.target.value = '' }
  const onDrop       = useCallback((e) => { e.preventDefault(); handleFiles(e.dataTransfer.files) }, [])
  const onDragOver   = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>

      {/* ── Toolbar ── */}
      <div style={{
        height: 48,
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
        padding: '0 14px', gap: 10,
        flexShrink: 0, zIndex: 10,
      }}>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: uploading ? 'var(--surface2)' : 'var(--accent)',
            border: 'none', borderRadius: 8, padding: '6px 14px',
            cursor: uploading ? 'not-allowed' : 'pointer',
            fontSize: 12, fontFamily: 'JetBrains Mono, monospace',
            color: '#fff', transition: 'background 0.15s',
          }}
        >
          {uploading
            ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
            : <Upload size={13} />}
          {uploading ? 'Uploading…' : 'Upload Clip'}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          multiple
          onChange={onFileChange}
          style={{ display: 'none' }}
        />

        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          or drag & drop a video onto the canvas
        </span>

        {nodes.length > 0 && (
          <div style={{
            marginLeft: 'auto',
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 20, padding: '2px 10px',
            fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
            color: 'var(--muted)',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <Scissors size={10} color="var(--accent)" />
            {nodes.length} clip{nodes.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* ── Error toast ── */}
      <AnimatePresence>
        {uploadError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            onClick={() => setUploadError(null)}
            style={{
              position: 'absolute', top: 56, left: '50%',
              transform: 'translateX(-50%)',
              background: '#ef444420', border: '1px solid #ef4444',
              borderRadius: 8, padding: '6px 14px',
              fontSize: 12, color: '#ef4444',
              zIndex: 20, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            ⚠ {uploadError} — click to dismiss
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── React Flow canvas ── */}
      <div style={{ flex: 1, position: 'relative' }} onDrop={onDrop} onDragOver={onDragOver}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.2}
          maxZoom={2}
          defaultEdgeOptions={{ type: 'transitionEdge', data: { transition: 'cut' } }}
          style={{ background: 'var(--bg)' }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--border)" gap={28} size={1} variant="dots" />
          <Controls style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10, overflow: 'hidden',
          }} />
          <MiniMap
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
            }}
            nodeColor={() => 'var(--accent)'}
            maskColor="rgba(8,11,16,0.7)"
          />

          {/* Empty state */}
          {nodes.length === 0 && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 16, pointerEvents: 'none', zIndex: 4,
            }}>
              <div style={{
                width: 72, height: 72,
                border: '2px dashed var(--border)', borderRadius: 18,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <GitBranch size={28} color="var(--muted)" />
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontFamily: 'Syne, sans-serif', fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                  Clip Canvas
                </p>
                <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
                  Upload a video clip using the toolbar above<br />
                  or drag a file directly onto this canvas.
                </p>
              </div>
            </div>
          )}
        </ReactFlow>

        {/* ── Clear All Button (Floating Bottom Right) ── */}
        {nodes.length > 0 && (
          <button
            onClick={() => {
              if (confirm('Are you sure you want to clear the entire canvas? This will delete all clips and connections.')) {
                clearClips();
              }
            }}
            title="Clear all clips"
            style={{
              position: 'absolute',
              bottom: 20,
              right: 20,
              width: 42,
              height: 42,
              borderRadius: 12,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--muted)',
              zIndex: 100,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#ef4444';
              e.currentTarget.style.borderColor = '#ef444440';
              e.currentTarget.style.background = 'var(--surface2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--muted)';
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.background = 'var(--surface)';
            }}
          >
            <Trash2 size={20} />
          </button>
        )}
      </div>

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .react-flow__controls-button {
          background: var(--surface2) !important;
          border-color: var(--border) !important;
          fill: var(--muted) !important;
        }
        .react-flow__controls-button:hover { background: var(--surface) !important; }
      `}</style>
    </div>
  )
}

export default function CanvasArea() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  )
}