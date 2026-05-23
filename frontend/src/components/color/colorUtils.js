/**
 * colorUtils.js
 * Utilities for the Clippi color correction system.
 * Converts color edit state → CSS filter string applied to <video>.
 */

// ─── Default state ────────────────────────────────────────────────────────────

export const DEFAULT_COLOR_EDITS = () => ({
  // ── Basic ──────────────────────────────────────────────
  exposure:    0,   // -100 → +100
  contrast:    0,   // -100 → +100
  highlights:  0,   // -100 → +100
  shadows:     0,   // -100 → +100
  whites:      0,   // -100 → +100
  blacks:      0,   // -100 → +100
  saturation:  0,   // -100 → +100
  vibrance:    0,   // -100 → +100
  temperature: 0,   // -100 (cool/blue) → +100 (warm/orange)
  tint:        0,   // -100 (green) → +100 (magenta)
  sharpness:   0,   // 0 → 100

  // ── Vignette ───────────────────────────────────────────
  vignette:        0,   // 0 → 100
  vignetteFeather: 50,  // 0 → 100

  // ── Curves (control points [in, out] 0-255) ────────────
  curves: {
    master: [[0, 0], [255, 255]],
    r:      [[0, 0], [255, 255]],
    g:      [[0, 0], [255, 255]],
    b:      [[0, 0], [255, 255]],
  },

  // ── HSL per colour range ────────────────────────────────
  hsl: {
    red:     { hue: 0, saturation: 0, luminance: 0 },
    orange:  { hue: 0, saturation: 0, luminance: 0 },
    yellow:  { hue: 0, saturation: 0, luminance: 0 },
    green:   { hue: 0, saturation: 0, luminance: 0 },
    aqua:    { hue: 0, saturation: 0, luminance: 0 },
    blue:    { hue: 0, saturation: 0, luminance: 0 },
    purple:  { hue: 0, saturation: 0, luminance: 0 },
    magenta: { hue: 0, saturation: 0, luminance: 0 },
  },

  // ── Colour wheels (x/y −1…1 offset from center) ────────
  wheels: {
    lift:  { x: 0, y: 0 },   // shadows
    gamma: { x: 0, y: 0 },   // midtones
    gain:  { x: 0, y: 0 },   // highlights
  },
})

// ─── CSS filter builder ───────────────────────────────────────────────────────

/**
 * Build a CSS `filter` string from a color-edit state object.
 * CSS filters are applied in the order declared — ordering matters.
 */
export function buildCSSFilter(ce) {
  if (!ce) return ''

  const {
    exposure    = 0,
    contrast    = 0,
    highlights  = 0,
    shadows     = 0,
    whites      = 0,
    blacks      = 0,
    saturation  = 0,
    vibrance    = 0,
    temperature = 0,
    tint        = 0,
    wheels      = {},
    curves      = {},
    hsl         = {},
  } = ce

  // ── Brightness (exposure + tonal boosts) ──────────────
  const brightness = Math.max(
    0.05,
    1
    + exposure    * 0.02
    + highlights  * 0.004
    + whites      * 0.003
  )

  // ── Contrast (contrast + shadow/black adjustments) ────
  const contrastVal = Math.max(
    0.1,
    1
    + contrast * 0.012
    - shadows  * 0.003
    - blacks   * 0.002
  )

  // ── Saturate (saturation + vibrance) ──────────────────
  //    vibrance is a gentler version of saturation
  const saturateVal = Math.max(0, 1 + saturation * 0.01 + vibrance * 0.006)

  // ── Temperature → hue-rotate + sepia ─────────────────
  //    warm  (+100) = orange/gold cast  → slight sepia
  //    cool  (-100) = blue cast         → negative sepia is not a CSS function
  //    We approximate cool with a negative hue-rotate toward blue.
  const warmth      = Math.max(0, Math.min(0.45, temperature * 0.0045))
  const hueFromTemp = temperature > 0 ? 0 : temperature * 0.08   // cool shift

  // ── Tint → hue-rotate (green–magenta axis is ~120° apart) ──
  const hueFromTint = tint * 0.04

  // ── Wheels (gamma/midtone wheel dominates overall hue) ──
  const gamma = wheels.gamma ?? { x: 0, y: 0 }
  const gain  = wheels.gain  ?? { x: 0, y: 0 }
  const lift  = wheels.lift  ?? { x: 0, y: 0 }
  const wheelHueGamma = Math.atan2(gamma.y, gamma.x) * (180 / Math.PI)
  const wheelDistGamma = Math.sqrt(gamma.x ** 2 + gamma.y ** 2)
  const wheelHueLift  = Math.atan2(lift.y,  lift.x)  * (180 / Math.PI)
  const wheelDistLift = Math.sqrt(lift.x  ** 2 + lift.y  ** 2)
  const hueFromWheels = wheelHueGamma * wheelDistGamma * 0.15
                       + wheelHueLift  * wheelDistLift  * 0.08

  // ── HSL aggregate saturation boost ────────────────────
  const hslSatBoost = Object.values(hsl ?? {})
    .reduce((acc, r) => acc + (r.saturation || 0), 0) * 0.003

  const totalSaturate = Math.max(0, saturateVal + hslSatBoost)
  const totalHue      = hueFromTemp + hueFromTint + hueFromWheels

  // ── Assemble ───────────────────────────────────────────
  const parts = [
    `brightness(${brightness.toFixed(4)})`,
    `contrast(${contrastVal.toFixed(4)})`,
    `saturate(${totalSaturate.toFixed(4)})`,
  ]

  if (Math.abs(totalHue) > 0.05)  parts.push(`hue-rotate(${totalHue.toFixed(2)}deg)`)
  if (warmth > 0.005)             parts.push(`sepia(${warmth.toFixed(4)})`)

  // ── Gain wheel → brightness boost for highlights ──────
  const gainDist = Math.sqrt(gain.x ** 2 + gain.y ** 2)
  if (gainDist > 0.01) {
    const gainBrightness = 1 + gainDist * 0.12
    parts.push(`brightness(${gainBrightness.toFixed(4)})`)
  }

  return parts.join(' ')
}

// ─── Vignette CSS ─────────────────────────────────────────────────────────────

/**
 * Returns the CSS background for the vignette overlay div.
 * The overlay sits on top of the video with pointer-events:none.
 */
export function buildVignetteStyle(ce) {
  if (!ce || !ce.vignette) return null

  const amount  = ce.vignette        / 100   // 0…1
  const feather = ce.vignetteFeather / 100   // 0…1
  if (amount < 0.01) return null

  // Transparent zone: inner (feather-controlled) to opaque black at edge
  const transparentStop = Math.max(5, Math.round((1 - amount * 0.85) * feather * 100))
  const alpha = (amount * 0.9).toFixed(2)

  return {
    position:    'absolute',
    inset:       0,
    background:  `radial-gradient(ellipse at center, transparent ${transparentStop}%, rgba(0,0,0,${alpha}) 100%)`,
    pointerEvents: 'none',
    zIndex:      8,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** True when any colour edit is non-default */
export function hasColorEdits(ce) {
  if (!ce) return false
  const {
    exposure=0, contrast=0, highlights=0, shadows=0, whites=0, blacks=0,
    saturation=0, vibrance=0, temperature=0, tint=0, sharpness=0, vignette=0,
    wheels={}, hsl={},
  } = ce

  if ([exposure, contrast, highlights, shadows, whites, blacks,
       saturation, vibrance, temperature, tint, sharpness, vignette]
    .some(v => v !== 0)) return true

  const w = Object.values(wheels)
  if (w.some(wh => wh.x !== 0 || wh.y !== 0)) return true

  const h = Object.values(hsl)
  if (h.some(r => r.hue !== 0 || r.saturation !== 0 || r.luminance !== 0)) return true

  return false
}

/** Compare two color edit objects for equality */
export function colorEditsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Format a slider value for display (e.g. "+34", "-12", "0") */
export function fmtVal(v) {
  if (v === 0) return '0'
  return v > 0 ? `+${v}` : `${v}`
}

/**
 * Spline interpolation for curves: given an array of [x,y] control points
 * sorted by x, return the y for a given x using monotone cubic interpolation.
 */
export function curveEval(points, x) {
  if (!points || points.length < 2) return x
  const xs = points.map(p => p[0])
  const ys = points.map(p => p[1])
  const n  = xs.length

  if (x <= xs[0])      return ys[0]
  if (x >= xs[n - 1])  return ys[n - 1]

  let i = 0
  while (i < n - 2 && xs[i + 1] < x) i++
  const t = (x - xs[i]) / (xs[i + 1] - xs[i])
  // simple linear interpolation — good enough for display
  return ys[i] + t * (ys[i + 1] - ys[i])
}