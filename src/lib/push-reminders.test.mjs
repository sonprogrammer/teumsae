import assert from 'node:assert/strict'
import test from 'node:test'
import { createReminderNotification, parsePushSubscription, parseReminderSettings } from './push-reminders.mjs'
import { readFile } from 'node:fs/promises'

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

test('protects dispatch with a constant-time secret check and keeps admin credentials server-only', async () => {
  const route = await readFile(new URL('../app/api/cron-event-reminders/route.ts', import.meta.url), 'utf8')
  const client = await readFile(new URL('../components/push-reminder-settings.tsx', import.meta.url), 'utf8')
  assert.match(route, /timingSafeEqual/)
  assert.match(route, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(route, /request\.headers\.get\(['"]authorization['"]\)/)
  assert.doesNotMatch(client, /SERVICE_ROLE_KEY|VAPID_PRIVATE_KEY|CRON_SECRET/)
})
