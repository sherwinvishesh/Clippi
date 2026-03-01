import api from './client'

// Upload a video file with optional upload progress callback
export const uploadVideo = (file, onProgress) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/video/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) =>
      onProgress && onProgress(Math.round((e.loaded / e.total) * 100)),
  })
}

// Trigger AI analysis on an uploaded video
export const analyzeVideo = (videoId) =>
  api.post(`/video/${videoId}/analyze`)

// Fetch the list of suggested clips for a video
export const getClips = (videoId) =>
  api.get(`/video/${videoId}/clips`)

// Export a specific clip with format options
export const exportClip = (clipId, options) =>
  api.post(`/clip/${clipId}/export`, options)