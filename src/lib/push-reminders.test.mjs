import assert from 'node:assert/strict'
import { createECDH } from 'node:crypto'
import test from 'node:test'
import webpush from 'web-push'
import { createReminderNotification, diagnoseVapidRequest, parsePushSubscription, parseReminderSettings } from './push-reminders.mjs'
import * as pushReminderUtils from './push-reminders.mjs'
import { readFile, readdir } from 'node:fs/promises'

const validSubscription = {
  endpoint: 'https://push.example.test/send/token',
  keys: { p256dh: 'BK3P0k3y', auth: 's3cr3tAB' }
}

test('accepts only explicit reminder settings and supported lead times', () => {
  assert.deepEqual(parseReminderSettings({ enabled: true, minutesBefore: 15 }), { ok: true, value: { enabled: true, minutesBefore: 15 } })
  assert.deepEqual(parseReminderSettings({ enabled: false, minutesBefore: 60 }), { ok: true, value: { enabled: false, minutesBefore: 60 } })
  assert.equal(parseReminderSettings({ enabled: 'true', minutesBefore: 15 }).ok, false)
  assert.equal(parseReminderSettings({ enabled: true, minutesBefore: 7 }).ok, false)
})

test('accepts valid HTTPS push subscriptions and rejects unsafe or malformed endpoints', () => {
  assert.deepEqual(parsePushSubscription(validSubscription), { ok: true, value: validSubscription })
  assert.equal(parsePushSubscription({ ...validSubscription, endpoint: 'http://push.example.test/send' }).ok, false)
  assert.equal(parsePushSubscription({ ...validSubscription, endpoint: 'https://user:pass@push.example.test/send' }).ok, false)
  assert.equal(parsePushSubscription({ ...validSubscription, keys: { p256dh: '', auth: 's3cr3t' } }).ok, false)
})

test('keeps notification text private and opens the matching Korea date', () => {
  const payload = createReminderNotification({ title: '비공개 회의 제목', startsAt: '2026-11-01T01:00:00.000Z', minutesBefore: 15 })
  assert.deepEqual(payload, { title: '틈새 일정 알림', body: '15분 후 일정이 시작돼요.', url: '/schedule?date=2026-11-01' })
  assert.equal(JSON.stringify(payload).includes('비공개 회의 제목'), false)
})

test('migration scopes subscriptions to owners and claims deliveries idempotently', async () => {
  const migration = await readFile(new URL('../../supabase/migrations/202610310001_push_reminders.sql', import.meta.url), 'utf8')
  assert.match(migration, /alter table public\.push_subscriptions enable row level security/i)
  assert.match(migration, /auth\.uid\(\)\)\s*=\s*owner_id/i)
  assert.match(migration, /unique\s*\(event_id, subscription_id, reminder_at\)/i)
  assert.match(migration, /for update(?: of [a-z_]+)? skip locked/i)
  assert.doesNotMatch(migration, /\bas\s+window\b|\bwindow\./i)
})

test('push delivery RPCs accept both legacy and current Supabase JWT role claims', async () => {
  const directory = new URL('../../supabase/migrations/', import.meta.url)
  const files = await readdir(directory)
  const migrations = await Promise.all(files.filter(file => /push_reminder/i.test(file)).sort().map(file => readFile(new URL(file, directory), 'utf8')))
  const sql = migrations.join('\n')
  const claimFunction = [...sql.matchAll(/create or replace function public\.claim_event_reminder_deliveries[\s\S]*?\n\$\$;/gi)].at(-1)?.[0]
  const completeFunction = [...sql.matchAll(/create or replace function public\.complete_event_reminder_delivery[\s\S]*?\n\$\$;/gi)].at(-1)?.[0]
  assert.ok(claimFunction)
  assert.ok(completeFunction)
  for (const functionSql of [claimFunction, completeFunction]) {
    assert.match(functionSql, /current_setting\('request\.jwt\.claim\.role', true\)/)
    assert.match(functionSql, /current_setting\('request\.jwt\.claims', true\)/)
    assert.match(functionSql, /->> 'role'/)
    assert.match(functionSql, /service_role_required/)
  }
})

test('protects dispatch with a constant-time secret check and keeps admin credentials server-only', async () => {
  const route = await readFile(new URL('../app/api/cron-event-reminders/route.ts', import.meta.url), 'utf8')
  const client = await readFile(new URL('../components/push-reminder-settings.tsx', import.meta.url), 'utf8')
  assert.match(route, /timingSafeEqual/)
  assert.match(route, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(route, /request\.headers\.get\(['"]authorization['"]\)/)
  assert.doesNotMatch(client, /SERVICE_ROLE_KEY|VAPID_PRIVATE_KEY|CRON_SECRET/)
})

test('uses a controlled accessible switch for reminder enablement', async () => {
  const source = await readFile(new URL('../components/push-reminder-settings.tsx', import.meta.url), 'utf8')
  assert.match(source, /role="switch"/)
  assert.match(source, /aria-checked=\{settings\.enabled\}/)
  assert.match(source, /disabled=\{pending\}/)
  assert.match(source, /aria-busy=\{pending\}/)
  assert.match(source, /if \(!settings\.vapidPublicKey\) throw new Error\('푸시 알림 서버 설정이 아직 준비되지 않았어요\.'\)/)
})

test('claims reminder deliveries through the named unique constraint', async () => {
  const directory = new URL('../../supabase/migrations/', import.meta.url)
  const files = await readdir(directory)
  const migrations = await Promise.all(files.filter(file => /push_reminder/i.test(file)).sort().map(file => readFile(new URL(file, directory), 'utf8')))
  const sql = migrations.join('\n')
  const claimFunction = [...sql.matchAll(/create or replace function public\.claim_event_reminder_deliveries[\s\S]*?\n\$\$;/gi)].at(-1)?.[0]
  assert.ok(claimFunction)
  assert.match(claimFunction, /on conflict on constraint event_reminder_deliveries_unique do update/i)
  assert.doesNotMatch(claimFunction, /on conflict\s*\(\s*event_id\s*,\s*subscription_id\s*,\s*reminder_at\s*\)/i)
})

test('classifies provider rejection reasons without retaining their response text', () => {
  assert.equal(typeof pushReminderUtils.classifyPushDeliveryFailure, 'function')
  assert.equal(pushReminderUtils.classifyPushDeliveryFailure(403, 'BadJwtToken'), 'vapid_token_rejected')
  assert.equal(pushReminderUtils.classifyPushDeliveryFailure(403, 'The VAPID credentials in the authorization header do not correspond to the credentials used to create the subscriptions.'), 'vapid_key_mismatch')
  assert.equal(pushReminderUtils.classifyPushDeliveryFailure(403, 'Forbidden'), 'push_forbidden')
  assert.equal(pushReminderUtils.classifyPushDeliveryFailure(410, 'Gone'), 'subscription_expired')
  assert.equal(pushReminderUtils.classifyPushDeliveryFailure(403, 'BadJwtToken', { failureCode: 'vapid_audience_mismatch' }), 'vapid_audience_mismatch')
})

test('diagnoses the generated VAPID request without returning credentials or JWT values', () => {
  const ecdh = createECDH('prime256v1')
  const publicKey = ecdh.generateKeys(undefined, 'uncompressed').toString('base64url')
  const privateKey = ecdh.getPrivateKey().toString('base64url')
  const nowSeconds = 1_800_000_000
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = encode({ alg: 'ES256' }) + '.' + encode({ sub: 'https://teumsae-blush.vercel.app', aud: 'https://web.push.apple.com', exp: nowSeconds + 43_200 }) + '.signature'
  const diagnostic = diagnoseVapidRequest({
    authorization: 'vapid t=' + token + ', k=' + publicKey,
    endpoint: 'https://web.push.apple.com/push/device-token',
    publicKey,
    privateKey,
    subject: 'https://teumsae-blush.vercel.app',
    nowSeconds
  })

  assert.deepEqual(diagnostic, {
    failureCode: 'apple_bad_jwt_unexplained',
    keyPairMatches: true,
    requestKeyMatches: true,
    subjectValid: true,
    subjectMatches: true,
    audienceMatches: true,
    expiryValid: true
  })
  assert.equal(JSON.stringify(diagnostic).includes(privateKey), false)
  assert.equal(JSON.stringify(diagnostic).includes(token), false)
})

test('inspects the Authorization header generated by web-push for an Apple endpoint', () => {
  const vapidKeys = webpush.generateVAPIDKeys()
  const subject = 'https://teumsae-blush.vercel.app'
  webpush.setVapidDetails(subject, vapidKeys.publicKey, vapidKeys.privateKey)
  const request = webpush.generateRequestDetails({ endpoint: 'https://web.push.apple.com/push/device-token', keys: validSubscription.keys }, null, { TTL: 60 })
  const authorization = Object.entries(request.headers).find(([name]) => name.toLowerCase() === 'authorization')?.[1]
  assert.equal(typeof authorization, 'string')

  const diagnostic = diagnoseVapidRequest({ authorization, endpoint: 'https://web.push.apple.com/push/device-token', publicKey: vapidKeys.publicKey, privateKey: vapidKeys.privateKey, subject })
  assert.equal(diagnostic.failureCode, 'apple_bad_jwt_unexplained')
  assert.equal(diagnostic.audienceMatches, true)
})

test('identifies a VAPID private key mismatch without exposing key material', () => {
  const ecdh = createECDH('prime256v1')
  const publicKey = ecdh.generateKeys(undefined, 'uncompressed').toString('base64url')
  const other = createECDH('prime256v1')
  other.generateKeys(undefined, 'uncompressed')
  const nowSeconds = 1_800_000_000
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = encode({ alg: 'ES256' }) + '.' + encode({ sub: 'https://teumsae-blush.vercel.app', aud: 'https://web.push.apple.com', exp: nowSeconds + 43_200 }) + '.signature'
  const diagnostic = diagnoseVapidRequest({
    authorization: 'vapid t=' + token + ', k=' + publicKey,
    endpoint: 'https://web.push.apple.com/push/device-token',
    publicKey,
    privateKey: other.getPrivateKey().toString('base64url'),
    subject: 'https://teumsae-blush.vercel.app',
    nowSeconds
  })

  assert.equal(diagnostic.failureCode, 'vapid_key_pair_mismatch')
  assert.equal(diagnostic.keyPairMatches, false)
})

test('isolates an invalid subject, audience, or JWT expiry from an Apple BadJwtToken response', () => {
  const ecdh = createECDH('prime256v1')
  const publicKey = ecdh.generateKeys(undefined, 'uncompressed').toString('base64url')
  const privateKey = ecdh.getPrivateKey().toString('base64url')
  const nowSeconds = 1_800_000_000
  const subject = 'https://teumsae-blush.vercel.app'
  const endpoint = 'https://web.push.apple.com/push/device-token'
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const inspectClaims = claims => {
    const token = encode({ alg: 'ES256' }) + '.' + encode(claims) + '.signature'
    return diagnoseVapidRequest({ authorization: 'vapid t=' + token + ', k=' + publicKey, endpoint, publicKey, privateKey, subject, nowSeconds })
  }

  assert.equal(inspectClaims({ sub: 'https://wrong.example', aud: endpoint, exp: nowSeconds + 43_200 }).failureCode, 'vapid_subject_invalid')
  assert.equal(inspectClaims({ sub: subject, aud: 'https://wrong.example', exp: nowSeconds + 43_200 }).failureCode, 'vapid_audience_mismatch')
  assert.equal(inspectClaims({ sub: subject, aud: 'https://web.push.apple.com', exp: nowSeconds + 90_000 }).failureCode, 'vapid_expiration_invalid')
})
