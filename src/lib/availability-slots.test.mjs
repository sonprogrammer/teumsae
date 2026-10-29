import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_SCHEDULE_AVAILABILITY, availabilityWindowsForDate, findAvailabilitySlots } from './availability.ts'

test('intersects request time with availability and removes overlapping events', () => {
  assert.deepEqual(findAvailabilitySlots({
    windows: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '17:00' }],
    events: [{ start: '10:00', end: '10:30' }, { start: '14:00', end: '15:00' }],
    request: { start: '09:30', end: '16:00', durationMinutes: 60 },
    limit: 3
  }), [
    { start: '10:30', end: '11:30' },
    { start: '13:00', end: '14:00' },
    { start: '15:00', end: '16:00' }
  ])
})

test('uses half-open intervals so back-to-back events do not conflict', () => {
  assert.deepEqual(findAvailabilitySlots({
    windows: [{ start: '09:00', end: '11:00' }],
    events: [{ start: '09:00', end: '10:00' }],
    request: { start: '10:00', end: '11:00', durationMinutes: 60 },
    limit: 3
  }), [{ start: '10:00', end: '11:00' }])
})

test('returns no slots for an unavailable date and caps results at three', () => {
  const schedule = {
    ...DEFAULT_SCHEDULE_AVAILABILITY,
    exceptions: [{ id: 'holiday', startDate: '2026-10-28', endDate: '2026-10-28', label: '휴가' }]
  }
  assert.deepEqual(findAvailabilitySlots({
    windows: availabilityWindowsForDate('2026-10-28', schedule),
    events: [],
    request: { start: '09:00', end: '17:00', durationMinutes: 60 },
    limit: 3
  }), [])
  assert.equal(findAvailabilitySlots({
    windows: [{ start: '09:00', end: '17:00' }],
    events: [],
    request: { start: '09:00', end: '17:00', durationMinutes: 60 },
    limit: 3
  }).length, 3)
})
