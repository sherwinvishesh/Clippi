/**
 * applyActions.js
 * Translates action objects from /api/chat into useClippiStore calls.
 *
 * Returns: { jobId, clipId } if a Visual AI job was started, otherwise null.
 */
export function applyActions(actions, store) {
  if (!actions || actions.length === 0) return null;

  let pollingInfo = null;

  for (const action of actions) {
    try {
      const result = handleAction(action, store);
      // handleAction returns polling info for visualJobStarted — capture it
      if (result?.needsPolling) {
        pollingInfo = result;
      }
    } catch (err) {
      console.error('[applyActions] Failed to apply action:', action, err);
    }
  }

  return pollingInfo; // null for all normal actions, { jobId, clipId } for AI jobs
}

function handleAction(action, store) {
  const { type, clipId } = action;

  switch (type) {

    // ── View navigation ──────────────────────────────────────────────────────
    case 'setView': {
      const { view } = action;
      if (!view) break;
      const viewMap = {
        editor:  'editor',
        canvas:  'canvas',
        library: 'canvas',
        home:    'canvas',
      };
      const mapped = viewMap[view] ?? view;
      store.setView(mapped);
      break;
    }

    // ── Select a clip ────────────────────────────────────────────────────────
    case 'setActiveClip': {
      if (!clipId) break;
      store.setActiveClip(clipId);
      break;
    }

    // ── Geometric / basic edits ──────────────────────────────────────────────
    case 'updateClipEdits': {
      const { patch } = action;
      if (!clipId || !patch) break;
      store.updateClipEdits(clipId, patch);
      break;
    }
    case 'revertClipEdits': {
      if (!clipId) break;
      store.revertClipEdits(clipId);
      break;
    }
    case 'revertToSaved': {
      if (!clipId) break;
      store.revertToSaved(clipId);
      break;
    }
    case 'saveClipEdits': {
      if (!clipId) break;
      store.saveClipEdits(clipId);
      break;
    }

    // ── Color edits ──────────────────────────────────────────────────────────
    case 'updateClipColorEdits': {
      const { colorPatch } = action;
      if (!clipId || !colorPatch) break;
      const clip     = store.clips.find(c => c.id === clipId);
      const existing = clip?.colorEdits ?? {};
      store.updateClipColorEdits(clipId, { ...existing, ...colorPatch });
      break;
    }
    case 'resetClipColorEdits': {
      if (!clipId) break;
      store.resetClipColorEdits(clipId);
      break;
    }

    // ── Filter edits ─────────────────────────────────────────────────────────
    case 'updateClipFilterEdits': {
      const { filterEdits } = action;
      if (!clipId || !filterEdits) break;
      store.updateClipFilterEdits(clipId, filterEdits);
      break;
    }
    case 'resetClipFilterEdits': {
      if (!clipId) break;
      store.resetClipFilterEdits(clipId);
      break;
    }

    // ── Text overlays ─────────────────────────────────────────────────────────
    case 'addTextOverlay': {
      const { overlay } = action;
      if (!clipId || !overlay) break;
      store.addTextOverlay(clipId, overlay);
      break;
    }
    case 'updateTextOverlay': {
      const { overlayId, patch } = action;
      if (!clipId || !overlayId || !patch) break;
      store.updateTextOverlay(clipId, overlayId, patch);
      break;
    }
    case 'removeTextOverlay': {
      const { overlayId } = action;
      if (!clipId || !overlayId) break;
      store.removeTextOverlay(clipId, overlayId);
      break;
    }
    case 'duplicateTextOverlay': {
      const { overlayId } = action;
      if (!clipId || !overlayId) break;
      store.duplicateTextOverlay(clipId, overlayId);
      break;
    }

    // ── Audio / video refresh ─────────────────────────────────────────────────
    case 'refreshClipVideo': {
      if (!clipId) break;
      store.refreshClipVideo(clipId);
      break;
    }
    case 'addAudioEffect': {
      if (!clipId || !action.effect) break;
      store.addAudioEffect(clipId, action.effect);
      break;
    }
    case 'setClipCaptions': {
      if (!clipId) break;
      store.setClipCaptions(clipId, action.captions || []);
      break;
    }

    // ── Visual effects ────────────────────────────────────────────────────────
    case 'addVisualEffect': {
      if (!clipId || !action.effect) break;
      store.addVisualEffect(clipId, action.effect);
      break;
    }

    // ── Visual AI job actions (NEW) ───────────────────────────────────────────

    // Backend fires a background job and returns this immediately.
    // We tell the store the clip is processing, then return polling info
    // so ChatPanel knows to start polling /api/jobs/{jobId}.
    case 'visualJobStarted': {
      if (!action.clipId || !action.jobId) break;
      store.setClipAIProcessing(action.clipId, action.jobId);
      // Return value is captured by applyActions() and passed to startPollingJob()
      return { needsPolling: true, jobId: action.jobId, clipId: action.clipId };
    }

    // Polling completed — replace the video and mark clip as AI-replaced.
    case 'replaceClipVideo': {
      if (!action.clipId) break;
      store.setClipAIReplaced(action.clipId, action.newVideoUrl, action.effectApplied);
      break;
    }

    default:
      console.warn('[applyActions] Unknown action type:', type, action);
  }

  return null; // no polling needed for normal actions
}