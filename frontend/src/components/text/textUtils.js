/**
 * textUtils.js
 * Font definitions, animation catalogue, presets and default overlay factory
 * for the Clippi text overlay system.
 */

// ─── Fonts ────────────────────────────────────────────────────────────────────

export const FONT_OPTIONS = [
  { id: 'syne',        label: 'Syne',            family: "'Syne', sans-serif",             category: 'sans',    preview: 'Aa' },
  { id: 'montserrat',  label: 'Montserrat',       family: "'Montserrat', sans-serif",        category: 'sans',    preview: 'Aa' },
  { id: 'oswald',      label: 'Oswald',           family: "'Oswald', sans-serif",            category: 'sans',    preview: 'Aa' },
  { id: 'inter',       label: 'Inter',            family: "'Inter', sans-serif",             category: 'sans',    preview: 'Aa' },
  { id: 'roboto',      label: 'Roboto',           family: "'Roboto', sans-serif",            category: 'sans',    preview: 'Aa' },
  { id: 'playfair',    label: 'Playfair Display', family: "'Playfair Display', serif",       category: 'serif',   preview: 'Aa' },
  { id: 'merriweather',label: 'Merriweather',     family: "'Merriweather', serif",           category: 'serif',   preview: 'Aa' },
  { id: 'dancing',     label: 'Dancing Script',   family: "'Dancing Script', cursive",       category: 'script',  preview: 'Aa' },
  { id: 'pacifico',    label: 'Pacifico',         family: "'Pacifico', cursive",             category: 'script',  preview: 'Aa' },
  { id: 'bebas',       label: 'Bebas Neue',       family: "'Bebas Neue', cursive",           category: 'display', preview: 'AA' },
  { id: 'jetbrains',   label: 'JetBrains Mono',   family: "'JetBrains Mono', monospace",     category: 'mono',    preview: 'Aa' },
]

export const FONT_CATEGORIES = ['sans', 'serif', 'script', 'display', 'mono']

// ─── Animations ───────────────────────────────────────────────────────────────

export const TEXT_ANIMATIONS = [
  { id: 'none',          label: 'None',           cssName: null },
  { id: 'fade-in',       label: 'Fade In',        cssName: 'txtFadeIn' },
  { id: 'fade-in-up',    label: 'Rise Up',        cssName: 'txtFadeInUp' },
  { id: 'fade-in-down',  label: 'Drop In',        cssName: 'txtFadeInDown' },
  { id: 'slide-left',    label: 'Slide Left',     cssName: 'txtSlideLeft' },
  { id: 'slide-right',   label: 'Slide Right',    cssName: 'txtSlideRight' },
  { id: 'zoom-in',       label: 'Zoom In',        cssName: 'txtZoomIn' },
  { id: 'zoom-out',      label: 'Zoom Out',       cssName: 'txtZoomOut' },
  { id: 'bounce',        label: 'Bounce',         cssName: 'txtBounce' },
  { id: 'blur-in',       label: 'Blur In',        cssName: 'txtBlurIn' },
  { id: 'typewriter',    label: 'Typewriter',     cssName: null }, // handled in JS
]

export const TEXT_OUT_ANIMATIONS = [
  { id: 'none',          label: 'None',           cssName: null },
  { id: 'fade-out',      label: 'Fade Out',       cssName: 'txtFadeOut' },
  { id: 'fade-out-up',   label: 'Float Up',       cssName: 'txtFadeOutUp' },
  { id: 'slide-out-left',label: 'Slide Left',     cssName: 'txtSlideOutLeft' },
  { id: 'zoom-out-fade', label: 'Shrink Out',     cssName: 'txtZoomOutFade' },
]

// ─── CSS Keyframes string (injected once into <head>) ────────────────────────

export const TEXT_ANIMATION_CSS = `
  @keyframes txtFadeIn       { from{opacity:0}                   to{opacity:1} }
  @keyframes txtFadeInUp     { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
  @keyframes txtFadeInDown   { from{opacity:0;transform:translateY(-24px)} to{opacity:1;transform:translateY(0)} }
  @keyframes txtSlideLeft    { from{opacity:0;transform:translateX(-40px)} to{opacity:1;transform:translateX(0)} }
  @keyframes txtSlideRight   { from{opacity:0;transform:translateX(40px)}  to{opacity:1;transform:translateX(0)} }
  @keyframes txtZoomIn       { from{opacity:0;transform:scale(0.6)}        to{opacity:1;transform:scale(1)} }
  @keyframes txtZoomOut      { from{opacity:0;transform:scale(1.4)}        to{opacity:1;transform:scale(1)} }
  @keyframes txtBounce       { 0%{opacity:0;transform:translateY(-30px)} 60%{transform:translateY(6px)} 80%{transform:translateY(-3px)} 100%{opacity:1;transform:translateY(0)} }
  @keyframes txtBlurIn       { from{opacity:0;filter:blur(12px)}           to{opacity:1;filter:blur(0)} }
  @keyframes txtFadeOut      { from{opacity:1}                             to{opacity:0} }
  @keyframes txtFadeOutUp    { from{opacity:1;transform:translateY(0)}     to{opacity:0;transform:translateY(-24px)} }
  @keyframes txtSlideOutLeft { from{opacity:1;transform:translateX(0)}     to{opacity:0;transform:translateX(-40px)} }
  @keyframes txtZoomOutFade  { from{opacity:1;transform:scale(1)}          to{opacity:0;transform:scale(0.6)} }
`

// ─── Colour palette for quick pick ────────────────────────────────────────────

export const QUICK_COLORS = [
  '#ffffff', '#000000', '#e2e8f0', '#94a3b8',
  '#3b82f6', '#06b6d4', '#8b5cf6', '#ec4899',
  '#f59e0b', '#22c55e', '#ef4444', '#f97316',
  '#fcd34d', '#a78bfa', '#34d399', '#fb7185',
]

// ─── Presets ──────────────────────────────────────────────────────────────────

export const TEXT_PRESETS = [
  {
    id: 'big-title',
    label: 'Big Title',
    defaults: {
      text:         'BIG TITLE',
      fontFamily:   "'Syne', sans-serif",
      fontSize:     18,
      bold:         true,
      color:        '#ffffff',
      letterSpacing:4,
      animation:    'fade-in',
      y:            45,
      textShadow:   true,
    },
  },
  {
    id: 'subtitle',
    label: 'Subtitle',
    defaults: {
      text:         'Your subtitle here',
      fontFamily:   "'Montserrat', sans-serif",
      fontSize:     12,
      bold:         false,
      color:        '#e2e8f0',
      letterSpacing:1,
      animation:    'fade-in-up',
      y:            57,
    },
  },
  {
    id: 'lower-third',
    label: 'Lower Third',
    defaults: {
      text:         'Speaker Name',
      fontFamily:   "'Oswald', sans-serif",
      fontSize:     10,
      bold:         false,
      color:        '#ffffff',
      letterSpacing:2,
      animation:    'slide-left',
      y:            78,
      x:            20,
      align:        'left',
      hasBackground:true,
      backgroundColor:'#3b82f6',
      backgroundOpacity:90,
    },
  },
  {
    id: 'caption',
    label: 'Caption',
    defaults: {
      text:         'Caption text goes here',
      fontFamily:   "'Inter', sans-serif",
      fontSize:     9,
      bold:         false,
      color:        '#ffffff',
      animation:    'fade-in-up',
      y:            85,
      hasBackground:true,
      backgroundColor:'#000000',
      backgroundOpacity:65,
    },
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    defaults: {
      text:         'A FILM BY YOU',
      fontFamily:   "'Bebas Neue', cursive",
      fontSize:     14,
      bold:         false,
      color:        '#ffffff',
      letterSpacing:12,
      animation:    'blur-in',
      y:            50,
    },
  },
  {
    id: 'handwritten',
    label: 'Handwritten',
    defaults: {
      text:         'Something special',
      fontFamily:   "'Dancing Script', cursive",
      fontSize:     13,
      bold:         false,
      color:        '#fcd34d',
      animation:    'fade-in',
      y:            50,
    },
  },
]

// ─── Default overlay factory ──────────────────────────────────────────────────

export const DEFAULT_TEXT_OVERLAY = (clipDuration = 10, count = 0) => ({
  id:                  crypto.randomUUID(),
  text:                'Type here',
  fontFamily:          "'Syne', sans-serif",
  fontSize:            14,
  color:               '#ffffff',
  bold:                false,
  italic:              false,
  underline:           false,
  align:               'center',     // 'left' | 'center' | 'right'
  x:                   50,           // % from left
  y:                   50,           // % from top
  width:               80,           // % of video width
  startTime:           0,
  endTime:             Math.min(clipDuration, 5),
  animation:           'fade-in',
  animationDuration:   0.5,
  outAnimation:        'none',
  outAnimationDuration:0.3,
  hasBackground:       false,
  backgroundColor:     '#000000',
  backgroundOpacity:   60,
  borderRadius:        6,
  padding:             10,
  letterSpacing:       0,
  lineHeight:          1.2,
  textShadow:          false,
  shadowColor:         '#000000',
  shadowBlur:          8,
  shadowX:             2,
  shadowY:             2,
  opacity:             100,
  color2:              null,         // gradient end color (null = solid)
  _colorIndex:         count,        // for timeline color
})

// ─── Timeline colours per overlay ────────────────────────────────────────────

export const OVERLAY_PALETTE = [
  '#ec4899', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#8b5cf6', '#f43f5e', '#14b8a6',
]

export const overlayColor = (idx) => OVERLAY_PALETTE[idx % OVERLAY_PALETTE.length]

// ─── Helper: is overlay visible at time t ────────────────────────────────────

export const isOverlayVisible = (overlay, t) =>
  t >= overlay.startTime && t <= overlay.endTime

// ─── Helper: build CSS text-shadow string ────────────────────────────────────

export const buildTextShadow = (ov) => {
  if (!ov.textShadow) return 'none'
  return `${ov.shadowX}px ${ov.shadowY}px ${ov.shadowBlur}px ${ov.shadowColor}`
}

// ─── Helper: animation info ───────────────────────────────────────────────────

export const getAnimInfo = (id) =>
  TEXT_ANIMATIONS.find(a => a.id === id) ?? TEXT_ANIMATIONS[0]

export const getOutAnimInfo = (id) =>
  TEXT_OUT_ANIMATIONS.find(a => a.id === id) ?? TEXT_OUT_ANIMATIONS[0]