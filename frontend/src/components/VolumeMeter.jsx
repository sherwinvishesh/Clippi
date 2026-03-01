// frontend/src/components/VolumeMeter.jsx
import React, { useEffect, useRef } from 'react';

export default function VolumeMeter({ videoRef }) {
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  const analyzerRef = useRef(null);
  const sourceRef = useRef(null);
  const audioCtxRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current) return;

    // 1. Setup Web Audio API
    const setupAudio = () => {
      if (audioCtxRef.current) return; // Prevent double setup

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContext();
      const analyzer = audioCtx.createAnalyser();
      analyzer.fftSize = 256; // High frequency resolution not needed for volume
      
      // Connect Video to Analyzer
      const source = audioCtx.createMediaElementSource(videoRef.current);
      source.connect(analyzer);
      analyzer.connect(audioCtx.destination);

      audioCtxRef.current = audioCtx;
      analyzerRef.current = analyzer;
      sourceRef.current = source;
    };

    // Browsers block AudioContext until a user gesture
    const handlePlay = () => {
      setupAudio();
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      draw();
    };

    const video = videoRef.current;
    video.addEventListener('play', handlePlay);

    // 2. Drawing Logic
    const draw = () => {
      if (!analyzerRef.current || !canvasRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const bufferLength = analyzerRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      analyzerRef.current.getByteFrequencyData(dataArray);

      // Calculate average volume (RMS-ish)
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      const volumeHeight = (average / 128) * canvas.height; // Normalize

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Background track
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Gradient for Green -> Yellow -> Red
      const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
      gradient.addColorStop(0, '#22c55e');   // Green
      gradient.addColorStop(0.6, '#eab308'); // Yellow
      gradient.addColorStop(0.9, '#ef4444'); // Red

      ctx.fillStyle = gradient;
      ctx.fillRect(0, canvas.height - volumeHeight, canvas.width, volumeHeight);

      requestRef.current = requestAnimationFrame(draw);
    };

    return () => {
      video.removeEventListener('play', handlePlay);
      cancelAnimationFrame(requestRef.current);
    };
  }, [videoRef]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 16 }}>
      <canvas 
        ref={canvasRef} 
        width={40} 
        height={12} 
        style={{ 
          borderRadius: 2, 
          border: '1px solid var(--border)',
          background: '#000' 
        }} 
      />
    </div>
  );
}