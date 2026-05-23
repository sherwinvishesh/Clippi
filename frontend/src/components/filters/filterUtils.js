/**
 * filterUtils.js
 * Defines 20 cinematic filter presets and a CSS filter builder
 * that supports per-filter intensity (0–100%).
 */

// ─── Default state ────────────────────────────────────────────────────────────

export const DEFAULT_FILTER_EDITS = () => ({
  filterId:  'none',   // id of the selected filter
  intensity: 100,      // 0–100 (100 = full effect)
  lutName:   null,     // filename if a .cube LUT was imported
})

// ─── Filter catalogue (20 presets + LUT import) ───────────────────────────────

export const FILTERS = [
  // ── Identity ──────────────────────────────────────────────────
  {
    id:              'none',
    label:           'None',
    category:        'basic',
    previewGradient: 'linear-gradient(135deg,#2a3a52,#3e5068)',
    params:          {},
  },

  // ── Classic ───────────────────────────────────────────────────
  {
    id:              'bw',
    label:           'B&W',
    category:        'classic',
    previewGradient: 'linear-gradient(135deg,#1a1a1a,#888,#333)',
    params:          { grayscale: 1 },
  },
  {
    id:              'noir',
    label:           'Noir',
    category:        'classic',
    previewGradient: 'linear-gradient(135deg,#000,#3a3a3a,#111)',
    params:          { grayscale: 1, contrast: 1.55, brightness: 0.78 },
  },
  {
    id:              'silver',
    label:           'Silver',
    category:        'classic',
    previewGradient: 'linear-gradient(135deg,#8a9ba8,#c4ced6,#6e8494)',
    params:          { grayscale: 0.85, brightness: 1.1, contrast: 0.9 },
  },

  // ── Tone ──────────────────────────────────────────────────────
  {
    id:              'warm',
    label:           'Warm',
    category:        'tone',
    previewGradient: 'linear-gradient(135deg,#c0622a,#e8903a,#f5b862)',
    params:          { sepia: 0.3, saturate: 1.2, brightness: 1.06 },
  },
  {
    id:              'cool',
    label:           'Cool',
    category:        'tone',
    previewGradient: 'linear-gradient(135deg,#1a4b7a,#3d7db5,#6ba8d9)',
    params:          { hueRotate: 22, saturate: 1.1, brightness: 1.03 },
  },
  {
    id:              'golden',
    label:           'Golden Hour',
    category:        'tone',
    previewGradient: 'linear-gradient(135deg,#b8610a,#f4a820,#ffd147)',
    params:          { sepia: 0.42, hueRotate: -12, saturate: 1.45, brightness: 1.08 },
  },
  {
    id:              'cold',
    label:           'Cold Morning',
    category:        'tone',
    previewGradient: 'linear-gradient(135deg,#7aa7c7,#b2d8f0,#4f8db5)',
    params:          { hueRotate: -28, saturate: 0.62, brightness: 1.07, contrast: 0.94 },
  },
  {
    id:              'sunset',
    label:           'Sunset',
    category:        'tone',
    previewGradient: 'linear-gradient(135deg,#cc4010,#f76e2e,#ffa820)',
    params:          { sepia: 0.48, hueRotate: -22, saturate: 1.58, brightness: 1.07 },
  },

  // ── Film ──────────────────────────────────────────────────────
  {
    id:              'vintage',
    label:           'Vintage',
    category:        'film',
    previewGradient: 'linear-gradient(135deg,#8b5e0a,#c8920e,#e2b045)',
    params:          { sepia: 0.55, contrast: 1.08, brightness: 0.96, saturate: 0.78 },
  },
  {
    id:              'cinema',
    label:           'Cinema',
    category:        'film',
    previewGradient: 'linear-gradient(135deg,#0c1424,#1a2a42,#0f2048)',
    params:          { contrast: 1.28, saturate: 0.82, brightness: 0.90 },
  },
  {
    id:              'bleach',
    label:           'Bleach Bypass',
    category:        'film',
    previewGradient: 'linear-gradient(135deg,#4a4a38,#8a8a68,#606050)',
    params:          { saturate: 0.42, contrast: 1.58, brightness: 0.87 },
  },
  {
    id:              'kodak',
    label:           'Kodak',
    category:        'film',
    previewGradient: 'linear-gradient(135deg,#d4a010,#f0c83a,#e8b820)',
    params:          { sepia: 0.22, saturate: 1.2, contrast: 1.06, brightness: 1.04 },
  },
  {
    id:              'fuji',
    label:           'Fuji',
    category:        'film',
    previewGradient: 'linear-gradient(135deg,#3a7a28,#58a83a,#8ac860)',
    params:          { hueRotate: 10, saturate: 1.1, contrast: 1.07, brightness: 0.97 },
  },

  // ── Mood ──────────────────────────────────────────────────────
  {
    id:              'fade',
    label:           'Fade',
    category:        'mood',
    previewGradient: 'linear-gradient(135deg,#8a9ab2,#b8c8dc,#9aaec4)',
    params:          { brightness: 1.18, contrast: 0.80, saturate: 0.72 },
  },
  {
    id:              'matte',
    label:           'Matte',
    category:        'mood',
    previewGradient: 'linear-gradient(135deg,#6a6258,#9c9080,#787068)',
    params:          { contrast: 0.86, brightness: 1.09, saturate: 0.68, sepia: 0.1 },
  },
  {
    id:              'dreamy',
    label:           'Dreamy',
    category:        'mood',
    previewGradient: 'linear-gradient(135deg,#c8a0e8,#e0c8f8,#b090d8)',
    params:          { brightness: 1.20, saturate: 0.86, contrast: 0.86, blur: 0.5 },
  },

  // ── Creative ──────────────────────────────────────────────────
  {
    id:              'vivid',
    label:           'Vivid',
    category:        'creative',
    previewGradient: 'linear-gradient(135deg,#d020d0,#ff4400,#00d4ff)',
    params:          { saturate: 1.75, contrast: 1.12 },
  },
  {
    id:              'teal',
    label:           'Teal & Orange',
    category:        'creative',
    previewGradient: 'linear-gradient(135deg,#0d9488,#2dd4bf,#f97316)',
    params:          { hueRotate: 14, saturate: 1.48, contrast: 1.12 },
  },
  {
    id:              'cross',
    label:           'Cross Process',
    category:        'creative',
    previewGradient: 'linear-gradient(135deg,#e82020,#f0b000,#0090e0)',
    params:          { saturate: 1.92, hueRotate: 20, contrast: 1.22, brightness: 1.06 },
  },
  {
    id:              'drama',
    label:           'Drama',
    category:        'creative',
    previewGradient: 'linear-gradient(135deg,#3a0820,#7a1848,#200830)',
    params:          { contrast: 1.48, saturate: 1.28, brightness: 0.83 },
  },

  // ── LUT ───────────────────────────────────────────────────────
  {
    id:              'lut',
    label:           'Import LUT',
    category:        'lut',
    previewGradient: 'linear-gradient(135deg,#1e2d47,#334155)',
    isLUT:           true,
    params:          {},
  },
]

// ─── Category config ──────────────────────────────────────────────────────────

export const FILTER_CATEGORIES = [
  { id: 'all',      label: 'All'      },
  { id: 'classic',  label: 'Classic'  },
  { id: 'tone',     label: 'Tone'     },
  { id: 'film',     label: 'Film'     },
  { id: 'mood',     label: 'Mood'     },
  { id: 'creative', label: 'Creative' },
]

// ─── CSS filter builder ───────────────────────────────────────────────────────

/**
 * Build a CSS `filter` string for a given filterId + intensity.
 * Each CSS function is linearly interpolated between the identity value (t=0)
 * and the preset's full value (t=1) using the intensity percentage.
 */
export function buildFilterCSS(filterId, intensity = 100) {
  if (!filterId || filterId === 'none' || filterId === 'lut') return ''
  const filter = FILTERS.find(f => f.id === filterId)
  if (!filter) return ''
  const t     = Math.max(0, Math.min(100, intensity)) / 100
  const p     = filter.params
  const parts = []

  if (p.grayscale  !== undefined) parts.push(`grayscale(${(p.grayscale  * t).toFixed(4)})`)
  if (p.sepia      !== undefined) parts.push(`sepia(${(p.sepia      * t).toFixed(4)})`)
  if (p.brightness !== undefined) parts.push(`brightness(${(1 + (p.brightness - 1) * t).toFixed(4)})`)
  if (p.contrast   !== undefined) parts.push(`contrast(${(1  + (p.contrast   - 1) * t).toFixed(4)})`)
  if (p.saturate   !== undefined) parts.push(`saturate(${(1  + (p.saturate   - 1) * t).toFixed(4)})`)
  if (p.hueRotate  !== undefined) parts.push(`hue-rotate(${(p.hueRotate * t).toFixed(2)}deg)`)
  if (p.blur       !== undefined) parts.push(`blur(${(p.blur * t).toFixed(3)}px)`)

  return parts.join(' ')
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True when a non-trivial filter is active */
export function hasFilterApplied(fe) {
  if (!fe) return false
  return !!fe.filterId && fe.filterId !== 'none'
}

/** Friendly label for a filter ID */
export function filterLabel(filterId) {
  return FILTERS.find(f => f.id === filterId)?.label ?? filterId
}