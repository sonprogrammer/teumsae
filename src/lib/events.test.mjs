import assert from 'node:assert/strict'
import test from 'node:test'
import { eventMutationMessage, parseEventInput } from './events.ts'

const now = new Date('2026-10-27T00:00:00.000Z')

test('trims valid event text and normalizes explicit Korea times to UTC', () => {
  assert.deepEqual(parseEventInput({
    title: '  포트폴리오 작업  ',
    note: '  화면 정리  ',
    startsAt: '2026-10-28T10:00:00+09:00',
    endsAt: '2026-10-28T11:00:00+09:00'
  }, now), {
    ok: true,
    value: {
      title: '포트폴리오 작업',
      note: '화면 정리',
      startsAt: '2026-10-28T01:00:00.000Z',
      endsAt: '2026-10-28T02:00:00.000Z'
    }
  })
})

test('rejects blank or overlong titles and notes', () => {
  assert.equal(parseEventInput({ title: '   ', startsAt: '2026-10-28T10:00:00+09:00', endsAt: '2026-10-28T11:00:00+09:00' }, now).field, 'title')
  assert.equal(parseEventInput({ title: 'x'.repeat(101), startsAt: '2026-10-28T10:00:00+09:00', endsAt: '2026-10-28T11:00:00+09:00' }, now).field, 'title')
  assert.equal(parseEventInput({ title: '작업', note: 'x'.repeat(501), startsAt: '2026-10-28T10:00:00+09:00', endsAt: '2026-10-28T11:00:00+09:00' }, now).field, 'note')
})

test('interprets browser local values as Korea time and requires quarter-hour boundaries', () => {
  assert.deepEqual(parseEventInput({ title: '작업', startsAt: '2026-10-28T10:00', endsAt: '2026-10-28T11:00' }, now), {
    ok: true,
    value: { title: '작업', note: null, startsAt: '2026-10-28T01:00:00.000Z', endsAt: '2026-10-28T02:00:00.000Z' }
  })
  assert.equal(parseEventInput({ title: '작업', startsAt: '2026-10-28T10:10:00+09:00', endsAt: '2026-10-28T11:10:00+09:00' }, now).field, 'startsAt')
})

test('requires a 15 to 240 minute duration in 15 minute increments', () => {
  const input = { title: '작업', startsAt: '2026-10-28T10:00:00+09:00', endsAt: '2026-10-28T10:10:00+09:00' }
  assert.equal(parseEventInput(input, now).field, 'endsAt')
  assert.equal(parseEventInput({ ...input, endsAt: '2026-10-28T15:00:00+09:00' }, now).field, 'endsAt')
})

test('manual event validation allows times outside recommendation windows', () => {
  const hours = { dayStart: '09:00', dayEnd: '21:00' }
  assert.equal(parseEventInput({ title: '출근', startsAt: '2026-10-28T08:45', endsAt: '2026-10-28T09:45' }, now, { activityHours: hours }).ok, true)
  assert.equal(parseEventInput({ title: '야간 작업', startsAt: '2026-10-28T21:00', endsAt: '2026-10-28T22:00' }, now, { activityHours: hours }).ok, true)
})

test('rejects end before start, a different Korea date, and a past start', () => {
  assert.equal(parseEventInput({ title: '작업', startsAt: '2026-10-28T11:00:00+09:00', endsAt: '2026-10-28T10:00:00+09:00' }, now).field, 'endsAt')
  assert.equal(parseEventInput({ title: '작업', startsAt: '2026-10-28T23:00:00+09:00', endsAt: '2026-10-29T00:00:00+09:00' }, now).field, 'endsAt')
  assert.equal(parseEventInput({ title: '작업', startsAt: '2026-10-26T10:00:00+09:00', endsAt: '2026-10-26T11:00:00+09:00' }, now).field, 'startsAt')
  assert.equal(parseEventInput({ title: '작업', startsAt: '2026-10-26T10:00:00+09:00', endsAt: '2026-10-26T11:00:00+09:00' }, now, { allowPast: true }).ok, true)
})

test('rejects impossible calendar dates and out-of-range times', () => {
  for (const [startsAt, endsAt] of [['2026-11-31T10:00', '2026-11-31T11:00'], ['2026-11-01T25:00', '2026-11-01T26:00'], ['2026-11-01T10:60', '2026-11-01T11:00']]) {
    const result = parseEventInput({ title: 'Meeting', startsAt, endsAt }, now)
    assert.equal(result.ok, false)
    assert.equal(result.field, 'startsAt')
  }
})

test('maps database conflict, stale version, missing event and unknown failures safely', () => {
  assert.match(eventMutationMessage('23P01'), /겹쳐요/)
  assert.match(eventMutationMessage('40001'), /최신/)
  assert.match(eventMutationMessage('P0002'), /찾을 수/)
  assert.match(eventMutationMessage('XX000'), /저장하지 못/)
})
