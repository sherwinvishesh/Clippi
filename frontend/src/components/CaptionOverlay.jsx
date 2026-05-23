import React from 'react'

/**
 * CaptionOverlay
 * Renders the active caption as a subtitle at the bottom of the video.
 * Props:
 *  - captions:    [{start, end, text}]
 *  - currentTime: number (seconds)
 *  - videoRect:   {width, height} — bounding box of the rendered <video> element
 */
export default function CaptionOverlay({ captions = [], currentTime = 0, videoRect = {} }) {
  const activeCaption = captions.find(
    (c) => currentTime >= c.start && currentTime <= c.end
  )

  if (!activeCaption) return null

  const videoHeight = videoRect?.height || 400
  const fontSize    = Math.max(14, videoHeight * 0.046) // ~4.6% of video height

  return (
    <div
      style={{
        position:      'absolute',
        bottom:        '8%',
        left:          '50%',
        transform:     'translateX(-50%)',
        zIndex:        18,
        pointerEvents: 'none',
        width:         '90%',
        display:       'flex',
        justifyContent:'center',
      }}
    >
      <div
        style={{
          background:   'rgba(0, 0, 0, 0.75)',
          borderRadius: 6,
          padding:      '6px 14px',
          textAlign:    'center',
          maxWidth:     '100%',
        }}
      >
        <span
          style={{
            fontFamily: "'Noto Sans', Arial, sans-serif",
            fontSize,
            fontWeight:  600,
            color:       '#ffffff',
            lineHeight:  1.35,
            textShadow:  '0 1px 4px rgba(0,0,0,0.9)',
            whiteSpace:  'pre-wrap',
            wordBreak:   'break-word',
            display:     'block',
          }}
        >
          {activeCaption.text}
        </span>
      </div>
    </div>
  )
}