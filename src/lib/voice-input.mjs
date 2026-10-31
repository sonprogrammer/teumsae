export const maxVoiceUploadBytes = 20 * 1024 * 1024
export const voiceSilenceDurationMs = 2000
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

function eventDateForSpeech(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long' }).format(date)
}

function eventTimeForSpeech(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(date)
  const hour = Number(parts.find(part => part.type === 'hour')?.value)
  const minute = Number(parts.find(part => part.type === 'minute')?.value)
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
  return koreanTimeForSpeech(hour, minute)
}

export function speechResponse(value, cards = []) {
  const response = speechText(value)
  const events = Array.isArray(cards) ? cards.filter(card => card?.type === 'events').flatMap(card => Array.isArray(card.events) ? card.events : []) : []
  if (!events.length) return response
  const details = events.slice(0, 5).flatMap(event => {
    if (typeof event?.title !== 'string') return []
    const date = eventDateForSpeech(event.starts_at)
    const start = eventTimeForSpeech(event.starts_at)
    const end = eventTimeForSpeech(event.ends_at)
    if (!date || !start || !end || response.includes(start) && response.includes(end)) return []
    return [`${speechText(event.title)}, ${date} ${start}부터 ${end}까지`]
  })
  if (!details.length) return response
  const remainder = events.length > 5 ? ` 그 밖의 일정 ${events.length - 5}건은 화면에서 확인해 주세요.` : ''
  return speechText(`${response} ${details.join('. ')}.${remainder}`)
}
