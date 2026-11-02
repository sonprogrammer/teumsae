import { createECDH } from 'node:crypto'

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
