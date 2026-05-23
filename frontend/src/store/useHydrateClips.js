/**
 * useHydrateClips
 *
 * On app startup, calls GET /api/clips to fetch every clip the backend
 * still has on disk. It then reconciles with the persisted Zustand store:
 *
 *   - Clips the backend knows about but the store doesn't  → added to store
 *   - Clips the store has but the backend no longer has    → removed from store
 *     (and their React Flow nodes + edges are pruned too)
 *
 * This means even if the user manually deletes a video file, the canvas
 * won't show a broken node on next load.
 */
import { useEffect } from 'react'
import useClippiStore from './useClippiStore'
import api from '../api/client'

export default function useHydrateClips() {
  const { clips, addClip, removeClip, nodes, edges, setNodes, setEdges } = useClippiStore()

  useEffect(() => {
    api.get('/clips')
      .then(({ data: serverClips }) => {
        const serverIds = new Set(serverClips.map((c) => c.clip_id))
        const localIds  = new Set(clips.map((c) => c.id))

        // Add clips the backend has that the store doesn't know about
        // (e.g. uploaded in a previous session before persistence was added)
        serverClips.forEach((sc) => {
          if (!localIds.has(sc.clip_id)) {
            addClip({
              id:            sc.clip_id,
              name:          sc.name,
              duration:      sc.duration,
              thumbnail_url: sc.thumbnail_url,
            })
          }
        })

        // Remove clips the store still references but the backend has lost
        const staleIds = clips
          .map((c) => c.id)
          .filter((id) => !serverIds.has(id))

        staleIds.forEach((id) => {
          removeClip(id)
        })

        // Also prune React Flow nodes and edges for deleted clips
        if (staleIds.length > 0) {
          const staleSet    = new Set(staleIds)
          const cleanNodes  = nodes.filter((n) => !staleSet.has(n.id))
          const cleanEdges  = edges.filter(
            (e) => !staleSet.has(e.source) && !staleSet.has(e.target)
          )
          setNodes(cleanNodes)
          setEdges(cleanEdges)
        }
      })
      .catch(() => {
        // Backend offline — leave existing persisted state as-is
      })
  }, []) // run once on mount
}