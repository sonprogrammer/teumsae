import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_SCHEDULE_AVAILABILITY, availabilityWindowsForDate, parseScheduleAvailability } from './availability.ts'

test('defaults every weekday to an editable 09:00–21:00 window', () => {
  assert.equal(DEFAULT_SCHEDULE_AVAILABILITY.weekly.length, 7)
  assert.deepEqual(DEFAULT_SCHEDULE_AVAILABILITY.weekly[0], { weekday: 1, windows: [{ start: '09:00', end: '21:00' }] })
  assert.deepEqual(DEFAULT_SCHEDULE_AVAILABILITY.weekly[6], { weekday: 7, windows: [{ start: '09:00', end: '21:00' }] })
})

test('accepts disabled weekdays and multiple non-overlapping quarter-hour windows', () => {
  const weekly = Array.from({ length: 7 }, (_, index) => ({ weekday: index + 1, windows: index === 0 ? [] : [{ start: '08:00', end: '09:00' }, { start: '18:00', end: '21:00' }] }))
  const result = parseScheduleAvailability({ weekly, exceptions: [] })
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.value.weekly[0].windows.length, 0)
})

test('rejects missing or duplicate weekdays and invalid or overlapping windows', () => {
  const weekly = DEFAULT_SCHEDULE_AVAILABILITY.weekly
  assert.equal(parseScheduleAvailability({ weekly: weekly.slice(1), exceptions: [] }).ok, false)
  assert.equal(parseScheduleAvailability({ weekly: [weekly[0], weekly[0], ...weekly.slice(2)], exceptions: [] }).ok, false)
  const overlap = weekly.map(day => day.weekday === 1 ? { ...day, windows: [{ start: '09:00', end: '12:00' }, { start: '11:45', end: '13:00' }] } : day)
  assert.equal(parseScheduleAvailability({ weekly: overlap, exceptions: [] }).ok, false)
  const offGrid = weekly.map(day => day.weekday === 1 ? { ...day, windows: [{ start: '09:10', end: '12:00' }] } : day)
  assert.equal(parseScheduleAvailability({ weekly: offGrid, exceptions: [] }).ok, false)
})

test('date exceptions are inclusive and override recurring weekday windows', () => {
  const schedule = {
    ...DEFAULT_SCHEDULE_AVAILABILITY,
    exceptions: [{ id: 'vacation', startDate: '2026-11-02', endDate: '2026-11-04', label: '휴가' }]
  }
  assert.deepEqual(availabilityWindowsForDate('2026-11-01', schedule), [{ start: '09:00', end: '21:00' }])
  assert.deepEqual(availabilityWindowsForDate('2026-11-02', schedule), [])
  assert.deepEqual(availabilityWindowsForDate('2026-11-04', schedule), [])
  assert.deepEqual(availabilityWindowsForDate('2026-11-05', schedule), [{ start: '09:00', end: '21:00' }])
})

test('maps Monday to one and Sunday to seven', () => {
  const schedule = {
    ...DEFAULT_SCHEDULE_AVAILABILITY,
    weekly: DEFAULT_SCHEDULE_AVAILABILITY.weekly.map(day => ({ ...day, windows: [{ start: String(day.weekday).padStart(2, '0') + ':00', end: String(day.weekday).padStart(2, '0') + ':15' }] }))
  }
  assert.deepEqual(availabilityWindowsForDate('2026-11-02', schedule), [{ start: '01:00', end: '01:15' }])
  assert.deepEqual(availabilityWindowsForDate('2026-11-01', schedule), [{ start: '07:00', end: '07:15' }])
})
