export const maxVoiceUploadBytes = 20 * 1024 * 1024
export const allowedVoiceMimeTypes = new Set(['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg'])

export function validateVoiceUpload({ size, type }) {
  if (!Number.isSafeInteger(size) || size < 1 || size > maxVoiceUploadBytes) return { ok: false, code: 'INVALID_AUDIO_SIZE' }
  if (typeof type !== 'string' || !allowedVoiceMimeTypes.has(type.toLowerCase().split(';', 1)[0].trim())) return { ok: false, code: 'UNSUPPORTED_AUDIO_TYPE' }
  return { ok: true }
}

export function parseTranscription(value) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length > 0 && text.length <= 1000 ? text : null
}

export function speechText(value) {
  return value.replace(/```[\s\S]*?```/g, ' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[`*_>#]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200)
}
