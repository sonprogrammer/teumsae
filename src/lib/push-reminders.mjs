const supportedLeadTimes = new Set([5, 10, 15, 30, 60])

export function getPushSupportState({ isIOS, isStandalone, hasNotification, hasServiceWorker, hasPushManager }) {
  const missing = []
  if (!hasNotification) missing.push('notification')
  if (!hasServiceWorker) missing.push('serviceWorker')
  if (!hasPushManager) missing.push('push')
  const supported = !((isIOS && !isStandalone) || missing.length)
  return { supported, reason: isIOS && !isStandalone ? 'install' : missing.length ? 'unsupported' : null, missing, isIOS, isStandalone, hasNotification, hasServiceWorker, hasPushManager }
}

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

export function createReminderNotification({ title, startsAt, minutesBefore }) {
  const instant = new Date(startsAt)
  if (!Number.isFinite(instant.getTime()) || !supportedLeadTimes.has(minutesBefore)) return null
  const eventTitle = typeof title === 'string' ? title.trim().replace(/\s+/g, ' ') : ''
  if (!eventTitle) return null
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant)
  return { title: '틈새 일정 알림', body: '“' + eventTitle + '” 일정이 ' + minutesBefore + '분 후 시작돼요.', url: '/schedule?date=' + date }
}

export function classifyPushDeliveryFailure(statusCode, responseBody = '', vapidDiagnostic = null) {
  const normalizedBody = typeof responseBody === 'string' ? responseBody.toLowerCase() : ''
  if (statusCode === 404 || statusCode === 410) return 'subscription_expired'
  if (statusCode === 429) return 'push_rate_limited'
  if (statusCode >= 500) return 'push_service_error'
  if ((statusCode === 401 || statusCode === 403) && /badjwttoken|invalid jwt|invalid providertoken/.test(normalizedBody)) return vapidDiagnostic?.failureCode || 'vapid_token_rejected'
  if ((statusCode === 401 || statusCode === 403) && /vapid.{0,100}credentials.{0,160}(do not correspond|used to create)|credentials.{0,100}used to create.{0,100}subscription/.test(normalizedBody)) return 'vapid_key_mismatch'
  if (statusCode === 401 || statusCode === 403) return 'push_forbidden'
  return 'push_delivery_failed'
}
