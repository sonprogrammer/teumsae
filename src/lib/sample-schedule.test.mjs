import assert from 'node:assert/strict'
import test from 'node:test'
import { findSampleSlots } from './sample-schedule.ts'

test('finds non-overlapping one-hour slots around existing events', () => {
  const events = [
    { date: '2026-10-28', start: '14:00', end: '15:00' },
    { date: '2026-10-28', start: '16:00', end: '17:00' }
  ]
  assert.deepEqual(findSampleSlots(events, '2026-10-28'), [
    { start: '13:00', end: '14:00' },
    { start: '15:00', end: '16:00' },
    { start: '17:00', end: '18:00' }
  ])
})

test('returns no candidates when the afternoon is occupied', () => {
  const events = [{ date: '2026-10-28', start: '13:00', end: '18:00' }]
  assert.deepEqual(findSampleSlots(events, '2026-10-28'), [])
})

test('ignores events on other days and caps candidates at three', () => {
  const events = [{ date: '2026-10-29', start: '13:00', end: '18:00' }]
  assert.deepEqual(findSampleSlots(events, '2026-10-28'), [
    { start: '13:00', end: '14:00' },
    { start: '14:00', end: '15:00' },
    { start: '15:00', end: '16:00' }
  ])
})
