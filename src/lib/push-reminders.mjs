import { createECDH } from 'node:crypto'

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

export function diagnoseVapidRequest({ authorization, endpoint, publicKey, privateKey, subject, nowSeconds = Math.floor(Date.now() / 1000) }) {
  const result = {
    failureCode: 'vapid_request_unreadable',
    keyPairMatches: false,
    requestKeyMatches: false,
    subjectValid: false,
    subjectMatches: false,
    audienceMatches: false,
    expiryValid: false
  }

  try {
    const parsedEndpoint = new URL(endpoint)
    const authorizationMatch = /^vapid\s+t=([^,\s]+),\s*k=([^,\s]+)$/i.exec(authorization)
    if (parsedEndpoint.protocol !== 'https:' || !authorizationMatch) return result

    const [, token, requestPublicKey] = authorizationMatch
    const tokenParts = token.split('.')
    if (tokenParts.length !== 3) return result

    const claims = JSON.parse(Buffer.from(tokenParts[1], 'base64url').toString('utf8'))
    const ecdh = createECDH('prime256v1')
    ecdh.setPrivateKey(Buffer.from(privateKey, 'base64url'))
    const derivedPublicKey = ecdh.getPublicKey(undefined, 'uncompressed').toString('base64url')
    result.keyPairMatches = derivedPublicKey === publicKey
    result.requestKeyMatches = requestPublicKey === publicKey
    result.subjectValid = isValidVapidSubject(subject)
    result.subjectMatches = claims.sub === subject
    result.audienceMatches = claims.aud === parsedEndpoint.origin
    result.expiryValid = Number.isInteger(claims.exp) && claims.exp > nowSeconds && claims.exp <= nowSeconds + 86400

    if (!result.keyPairMatches) result.failureCode = 'vapid_key_pair_mismatch'
    else if (!result.requestKeyMatches) result.failureCode = 'vapid_request_key_mismatch'
    else if (!result.subjectValid || !result.subjectMatches) result.failureCode = 'vapid_subject_invalid'
    else if (!result.audienceMatches) result.failureCode = 'vapid_audience_mismatch'
    else if (!result.expiryValid) result.failureCode = 'vapid_expiration_invalid'
    else result.failureCode = 'apple_bad_jwt_unexplained'
  } catch {}

  return result
}

function isValidVapidSubject(subject) {
  if (typeof subject !== 'string' || subject.length === 0 || subject.trim() !== subject || /\s/.test(subject)) return false
  if (subject.startsWith('mailto:')) return /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject)
  try {
    const parsed = new URL(subject)
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && Boolean(parsed.hostname)
  } catch {
    return false
  }
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
