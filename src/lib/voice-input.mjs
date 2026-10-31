export const maxVoiceUploadBytes = 20 * 1024 * 1024
export const voiceSilenceDurationMs = 1300
export const voiceActivityThreshold = 0.025
export const allowedVoiceMimeTypes = new Set(['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg'])

export function resolveVoiceActivity({ rms, hasSpeech, lastSpeechAt, now }) {
  const detectedSpeech = Number.isFinite(rms) && rms >= voiceActivityThreshold
  const nextHasSpeech = hasSpeech || detectedSpeech
  const nextLastSpeechAt = detectedSpeech ? now : lastSpeechAt
  return { hasSpeech: nextHasSpeech, lastSpeechAt: nextLastSpeechAt, shouldSubmit: nextHasSpeech && nextLastSpeechAt !== null && now - nextLastSpeechAt >= voiceSilenceDurationMs }
}

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

function koreanDateForSpeech(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  const weekday = new Intl.DateTimeFormat('ko-KR', { timeZone: 'UTC', weekday: 'long' }).format(date)
  return `${year}년 ${month}월 ${day}일 ${weekday}`
}

function koreanTimeForSpeech(hour, minute) {
  const period = hour < 12 ? '오전' : '오후'
  const displayHour = hour % 12 || 12
  return `${period} ${displayHour}시${minute === 0 ? '' : ` ${minute}분`}`
}

function naturalizeKoreanDateTime(value) {
  const separator = '[-‐‑‒–—]'
  const time = '((?:[01]?\\d|2[0-3])):([0-5]\\d)'
  const dateTimeRange = new RegExp(`(\\d{4})${separator}(\\d{1,2})${separator}(\\d{1,2})\\s+${time}\\s*${separator}\\s*${time}`, 'gu')
  let spoken = value.replace(dateTimeRange, (_, year, month, day, startHour, startMinute, endHour, endMinute) => {
    const date = koreanDateForSpeech(Number(year), Number(month), Number(day))
    if (!date) return _
    return `${date} ${koreanTimeForSpeech(Number(startHour), Number(startMinute))}부터 ${koreanTimeForSpeech(Number(endHour), Number(endMinute))}까지`
  })
  const datePattern = new RegExp(`(\\d{4})${separator}(\\d{1,2})${separator}(\\d{1,2})`, 'gu')
  spoken = spoken.replace(datePattern, (match, year, month, day) => koreanDateForSpeech(Number(year), Number(month), Number(day)) ?? match)
  const timeRange = new RegExp(`${time}\\s*[-‐‑‒–—~〜～]\\s*${time}`, 'gu')
  spoken = spoken.replace(timeRange, (_, startHour, startMinute, endHour, endMinute) => `${koreanTimeForSpeech(Number(startHour), Number(startMinute))}부터 ${koreanTimeForSpeech(Number(endHour), Number(endMinute))}까지`)
  const singleTime = new RegExp(`(^|[^\\d:])${time}(?![\\d:])`, 'gu')
  return spoken.replace(singleTime, (_, prefix, hour, minute) => `${prefix}${koreanTimeForSpeech(Number(hour), Number(minute))}`)
}

export function speechText(value) {
  return naturalizeKoreanDateTime(value).replace(/```[\s\S]*?```/g, ' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[`*_>#]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200)
}
