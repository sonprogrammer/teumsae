import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_ACTIVITY_HOURS, eventWithinActivityHours, parseActivityHoursInput } from './events.ts'

test('uses the documented default activity range', () => {
  assert.deepEqual(DEFAULT_ACTIVITY_HOURS, { dayStart: '09:00', dayEnd: '21:00', timezone: 'Asia/Seoul', version: 1, updatedAt: null })
})

test('accepts same-day quarter-hour activity ranges', () => {
  assert.deepEqual(parseActivityHoursInput({ dayStart: '08:15', dayEnd: '23:45' }), { ok: true, value: { dayStart: '08:15', dayEnd: '23:45' } })
})

test('rejects malformed, off-grid, equal, and reversed activity ranges', () => {
  for (const input of [{ dayStart: '9:00', dayEnd: '21:00' }, { dayStart: '09:10', dayEnd: '21:00' }, { dayStart: '21:00', dayEnd: '09:00' }, { dayStart: '09:00', dayEnd: '09:00' }, { dayStart: '23:45', dayEnd: '24:00' }]) {
    assert.equal(parseActivityHoursInput(input).ok, false)
  }
})

test('checks both event boundaries against configured Korea activity hours', () => {
  const hours = { dayStart: '09:00', dayEnd: '21:00' }
  assert.equal(eventWithinActivityHours('2026-10-30T09:00:00+09:00', '2026-10-30T10:00:00+09:00', hours), true)
  assert.equal(eventWithinActivityHours('2026-10-30T08:45:00+09:00', '2026-10-30T09:45:00+09:00', hours), false)
  assert.equal(eventWithinActivityHours('2026-10-30T20:15:00+09:00', '2026-10-30T21:15:00+09:00', hours), false)
})
