const supportedLeadTimes = new Set([5, 10, 15, 30, 60])

export function parseReminderSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.enabled !== 'boolean' || !supportedLeadTimes.has(value.minutesBefore)) return { ok: false }
  return { ok: true, value: { enabled: value.enabled, minutesBefore: value.minutesBefore } }
}

export function parsePushSubscription(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false }
  const endpoint = value.endpoint
  const keys = value.keys
  if (typeof endpoint !== 'string' || endpoint.length > 2048 || !keys || typeof keys !== 'object' || Array.isArray(keys)) return { ok: false }
  try {
    const parsedEndpoint = new URL(endpoint)
    if (parsedEndpoint.protocol !== 'https:' || !parsedEndpoint.hostname || parsedEndpoint.username || parsedEndpoint.password) return { ok: false }
  } catch {
    return { ok: false }
  }
  if (typeof keys.p256dh !== 'string' || !/^[A-Za-z0-9_-]{8,256}$/.test(keys.p256dh) || typeof keys.auth !== 'string' || !/^[A-Za-z0-9_-]{8,256}$/.test(keys.auth)) return { ok: false }
  return { ok: true, value: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } } }
}

export function createReminderNotification({ startsAt, minutesBefore }) {
  const instant = new Date(startsAt)
  if (!Number.isFinite(instant.getTime()) || !supportedLeadTimes.has(minutesBefore)) return null
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant)
  return { title: '틈새 일정 알림', body: minutesBefore + '분 후 일정이 시작돼요.', url: '/schedule?date=' + date }
}
