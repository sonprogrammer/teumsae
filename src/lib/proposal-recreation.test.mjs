import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_SCHEDULE_AVAILABILITY, isProposalRecoverable, validateProposalRecreation } from './availability.ts'

const card = { type: 'proposal', id: 'proposal-1', title: '운동', note: null, startsAt: '2026-10-31T01:00:00.000Z', endsAt: '2026-10-31T02:00:00.000Z', settingsVersion: 1, expiresAt: '2026-10-30T01:00:00.000Z', state: 'expired' }
const schedule = { ...DEFAULT_SCHEDULE_AVAILABILITY, version: 2 }

test('recreates only a pending-safe terminal proposal and uses current Seoul availability', () => {
  assert.equal(typeof validateProposalRecreation, 'function')
  const result = validateProposalRecreation(card, schedule, new Date('2026-10-30T02:00:00.000Z'))
  assert.deepEqual(result, { ok: true, date: '2026-10-31', startsAt: card.startsAt, endsAt: card.endsAt, settingsVersion: 2 })
  assert.equal(isProposalRecoverable('confirmed'), false)
  assert.equal(isProposalRecoverable('expired'), true)
})

test('recreates events longer than four hours when they fit within the same day and availability', () => {
  const longEvent = { ...card, startsAt: '2026-10-31T00:00:00.000Z', endsAt: '2026-10-31T05:00:00.000Z' }
  assert.equal(validateProposalRecreation(longEvent, schedule, new Date('2026-10-30T02:00:00.000Z')).ok, true)
})

test('refuses past, unavailable, malformed and still-pending proposal recreation', () => {
  assert.equal(validateProposalRecreation({ ...card, state: 'pending' }, schedule, new Date('2026-10-30T02:00:00.000Z')).reason, 'not_recoverable')
  assert.equal(validateProposalRecreation({ ...card, startsAt: '2026-10-29T01:00:00.000Z', endsAt: '2026-10-29T02:00:00.000Z' }, schedule, new Date('2026-10-30T02:00:00.000Z')).reason, 'past')
  const unavailableSchedule = { ...schedule, exceptions: [{ id: 'day-off', startDate: '2026-10-31', endDate: '2026-10-31', label: '휴일' }] }
  assert.equal(validateProposalRecreation(card, unavailableSchedule, new Date('2026-10-30T02:00:00.000Z')).reason, 'outside_availability')
  assert.equal(validateProposalRecreation(card, {}, new Date('2026-10-30T02:00:00.000Z')).reason, 'invalid_schedule')
})
