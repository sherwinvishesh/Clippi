import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_COLOR_EDITS } from '../components/color/colorUtils'
import { DEFAULT_FILTER_EDITS } from '../components/filters/filterUtils'
import { DEFAULT_TEXT_OVERLAY } from '../components/text/textUtils'

export const DEFAULT_EDITS = () => ({
  trim: null,
  crop: null,
  rotation: 0,
  flipH: false,
  flipV: false,
  speed: 1,
})

const useClippiStore = create(
  persist(
    (set, get) => ({

      // ── VIEW ──────────────────────────────────────────────────────────
      view: 'canvas',
      setView: (view) => set({ view }),

      // ── CLIPS ─────────────────────────────────────────────────────────
      clips: [],

      addClip: (clip) =>
        set((s) => ({
          clips: [
            ...s.clips,
            {
              markers:      [],
              refreshKey:   0,
              edits:        DEFAULT_EDITS(),
              savedEdits:   null,
              colorEdits:   DEFAULT_COLOR_EDITS(),
              filterEdits:  DEFAULT_FILTER_EDITS(),
              textOverlays: [],
              captions:     [],          // [{start, end, text}]
              audioEffects: [],          // [{id, kind, label, ...}]
              visualEffects:[],          // [{id, kind, label, ...}]
              // ── Visual AI fields ──────────────────────────────────────
              aiProcessing: false,       // true while a background job is running
              aiReplaced:   false,       // true once video has been replaced by AI
              aiEffect:     null,        // e.g. "blur_background"
              aiJobId:      null,        // job ID for polling
              aiVideoUrl:   null,        // URL of the AI-processed video
              ...clip,
            },
          ],
        })),

      removeClip: (id) =>
        set((s) => ({
          clips: s.clips.filter((c) => c.id !== id),
          nodes: s.nodes.filter((n) => n.id !== id),
          edges: s.edges.filter((e) => e.source !== id && e.target !== id),
        })),

      updateClip: (id, patch) =>
        set((s) => ({
          clips: s.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),

      clearClips: () => set({
        clips: [], nodes: [], edges: [], activeClipId: null, view: 'canvas'
      }),

      refreshClipVideo: (id) =>
        set((s) => ({
          clips: s.clips.map((c) =>
            c.id === id ? { ...c, refreshKey: (c.refreshKey || 0) + 1 } : c,
          ),
        })),

      // ── EDIT OPERATIONS ───────────────────────────────────────────────

      updateClipEdits: (id, patch) =>
        set((s) => ({
          clips: s.clips.map((c) =>
            c.id === id ? { ...c, edits: { ...(c.edits || DEFAULT_EDITS()), ...patch } } : c,
          ),
        })),

      saveClipEdits: (id) =>
        set((s) => ({
          clips: s.clips.map((c) =>
            c.id === id ? { ...c, savedEdits: { ...(c.edits || DEFAULT_EDITS()) } } : c,
          ),
        })),

      revertToSaved: (id) =>
        set((s) => ({
          clips: s.clips.map((c) =>
            c.id === id ? { ...c, edits: c.savedEdits ? { ...c.savedEdits } : DEFAULT_EDITS() } : c,
          ),
        })),

      revertClipEdits: (id) =>
        set((s) => ({
          clips: s.clips.map((c) =>
            c.id === id ? { ...c, edits: DEFAULT_EDITS(), savedEdits: null } : c,
          ),
        })),

      // ── COLOR EDIT OPERATIONS ──────────────────────────────────────────

      updateClipColorEdits: (id, newColorEdits) =>
        set((s) => ({
          clips: s.clips.map((c) =>
            c.id === id ? { ...c, colorEdits: newColorEdits } : c,
          ),
        })),

      resetClipColorEdits: (id) =>
        set((s) => ({
          clips: s.clips.map((c) =>
            c.id === id ? { ...c, colorEdits: DEFAULT_COLOR_EDITS() } : c,
          ),
        })),

      // ── FILTER EDIT OPERATIONS ─────────────────────────────────────────

      updateClipFilterEdits: (id, newFilterEdits) =>
        set((s) => ({
          clips: s.clips.map((c) =>
            c.id === id ? { ...c, filterEdits: newFilterEdits } : c,
          ),
        })),

      resetClipFilterEdits: (id) =>
        set((s) => ({
          clips: s.clips.map((c) =>
            c.id === id ? { ...c, filterEdits: DEFAULT_FILTER_EDITS() } : c,
          ),
        })),

      // ── TEXT OVERLAY OPERATIONS ────────────────────────────────────────

      addTextOverlay: (clipId, partialOverlay = {}) =>
        set((s) => ({
          clips: s.clips.map((c) => {
            if (c.id !== clipId) return c
            const count = (c.textOverlays || []).length
            const overlay = { ...DEFAULT_TEXT_OVERLAY(c.duration ?? 10, count), ...partialOverlay, _colorIndex: count }
            return { ...c, textOverlays: [...(c.textOverlays || []), overlay] }
          }),
        })),

      updateTextOverlay: (clipId, overlayId, patch) =>
        set((s) => ({
          clips: s.clips.map((c) =>
            c.id !== clipId ? c : {
              ...c,
              textOverlays: (c.textOverlays || []).map((o) =>
                o.id !== overlayId ? o : { ...o, ...patch }
              ),
            }
          ),
        })),

      removeTextOverlay: (clipId, overlayId) =>
        set((s) => ({
          clips: s.clips.map((c) =>
            c.id !== clipId ? c : {
              ...c,
              textOverlays: (c.textOverlays || []).filter((o) => o.id !== overlayId),
            }
          ),
        })),

      duplicateTextOverlay: (clipId, overlayId) =>
        set((s) => ({
          clips: s.clips.map((c) => {
            if (c.id !== clipId) return c
            const overlays = c.textOverlays || []
            const orig = overlays.find((o) => o.id === overlayId)
            if (!orig) return c
            const dup = { ...orig, id: crypto.randomUUID(), startTime: orig.startTime + 0.2, endTime: orig.endTime + 0.2, _colorIndex: overlays.length }
            return { ...c, textOverlays: [...overlays, dup] }
          }),
        })),

      // ── AUDIO OPERATIONS ──────────────────────────────────────────────

      addAudioEffect: (clipId, effect) =>
        set((s) => ({
          clips: s.clips.map((c) =>
            c.id !== clipId ? c : {
              ...c,
              audioEffects: [...(c.audioEffects || []), effect],
            }
          ),
        })),

      clearAudioEffects: (clipId) =>
        set((s) => ({
          clips: s.clips.map((c) =>
            c.id !== clipId ? c : { ...c, audioEffects: [] }
          ),
        })),

      // ── VISUAL EFFECTS OPERATIONS ─────────────────────────────────────

      addVisualEffect: (clipId, effect) =>
        set((s) => ({
          clips: s.clips.map((c) =>
            c.id !== clipId ? c : {
              ...c,
              visualEffects: [...(c.visualEffects || []), effect],
            }
          ),
        })),

      clearVisualEffects: (clipId) =>
        set((s) => ({
          clips: s.clips.map((c) =>
            c.id !== clipId ? c : { ...c, visualEffects: [] }
          ),
        })),

      // ── CAPTIONS ──────────────────────────────────────────────────────

      setClipCaptions: (clipId, captions) =>
        set((s) => ({
          clips: s.clips.map((c) =>
            c.id !== clipId ? c : { ...c, captions: captions || [] }
          ),
        })),

      clearClipCaptions: (clipId) =>
        set((s) => ({
          clips: s.clips.map((c) =>
            c.id !== clipId ? c : { ...c, captions: [] }
          ),
        })),

      // ── VISUAL AI JOB TRACKING (NEW) ──────────────────────────────────

      /**
       * Called when the backend fires a background Visual AI job.
       * Shows the "⚙️ AI Processing…" badge on the clip card.
       */
      setClipAIProcessing: (clipId, jobId) =>
        set((s) => ({
          clips: s.clips.map((c) =>
            c.id !== clipId ? c : {
              ...c,
              aiProcessing: true,
              aiJobId:      jobId,
              aiReplaced:   false,   // reset in case of re-run
            }
          ),
        })),

      /**
       * Called when the polling finds a completed job.
       * Replaces the video URL, bumps refreshKey to force re-fetch,
       * and shows the "✨ AI Replaced" badge.
       */
      setClipAIReplaced: (clipId, newVideoUrl, effectApplied) =>
        set((s) => ({
          clips: s.clips.map((c) =>
            c.id !== clipId ? c : {
              ...c,
              aiProcessing: false,
              aiReplaced:   true,
              aiEffect:     effectApplied,
              aiJobId:      null,
              // Increment refreshKey so EditorArea's clipSrc URL changes,
              // which changes the <video key={clipSrc}> and forces a remount.
              refreshKey:   (c.refreshKey || 0) + 1,
              // Store the processed URL; clipSrc in EditorArea will prefer this.
              aiVideoUrl:   newVideoUrl,
            }
          ),
        })),

      /**
       * Called when the AI job fails.
       * Clears the processing state so the UI stops spinning.
       */
      setClipAIFailed: (clipId) =>
        set((s) => ({
          clips: s.clips.map((c) =>
            c.id !== clipId ? c : {
              ...c,
              aiProcessing: false,
              aiJobId:      null,
            }
          ),
        })),

      // ── MARKERS ───────────────────────────────────────────────────────

      setClipMarkers: (id, markers) =>
        set((s) => ({
          clips: s.clips.map((c) => (c.id === id ? { ...c, markers } : c)),
        })),

      addClipMarker: (id, marker) =>
        set((s) => ({
          clips: s.clips.map((c) =>
            c.id === id ? { ...c, markers: [...(c.markers || []), { id: crypto.randomUUID(), ...marker }] } : c,
          ),
        })),

      // ── ACTIVE CLIP ───────────────────────────────────────────────────
      activeClipId: null,
      setActiveClip: (id) => set({ activeClipId: id, view: 'editor' }),
      getActiveClip: () => get().clips.find((c) => c.id === get().activeClipId) ?? null,

      // ── REACT FLOW ────────────────────────────────────────────────────
      nodes: [],
      edges: [],
      setNodes: (nodes) => set({ nodes }),
      setEdges: (edges) => set({ edges }),
      addNode: (node) => set((s) => ({ nodes: [...s.nodes, node] })),
      addEdge: (edge) => set((s) => ({ edges: [...s.edges, edge] })),

      // ── CHAT ──────────────────────────────────────────────────────────
      messages: [
        { id: 'welcome', role: 'assistant', text: "Hey! I'm your Clippi AI. Upload some clips and tell me what you want to create.", timestamp: Date.now() },
      ],
      addMessage: (msg) =>
        set((s) => ({
          messages: [...s.messages, { id: crypto.randomUUID(), timestamp: Date.now(), ...msg }],
        })),
      clearMessages: () => set({ messages: [] }),

      // ── UPLOAD ────────────────────────────────────────────────────────
      uploading: false,
      uploadProgress: 0,
      setUploading: (v) => set({ uploading: v }),
      setUploadProgress: (p) => set({ uploadProgress: p }),
    }),
    {
      name: 'clippi-store',
      partialize: (state) => ({
        clips:       state.clips,
        nodes:       state.nodes,
        edges:       state.edges,
        activeClipId:state.activeClipId,
        view:        state.view,
      }),
    },
  ),
)

export default useClippiStore