import assert from 'node:assert/strict'
import test from 'node:test'
import { countInclusiveDays, getKoreaToday, isToolDate, isToolTime, parseAssistantRequest, parseToolArguments, parseToolName, validateAssistantToolArguments } from './assistant-chat.ts'

test('accepts a new chat message and trims surrounding whitespace', () => {
  assert.deepEqual(parseAssistantRequest({ message: '  내 일정 알려줘  ' }), { ok: true, value: { message: '내 일정 알려줘', conversationId: null, version: null } })
})

test('rejects empty, oversized, and incomplete conversation requests', () => {
  assert.equal(parseAssistantRequest({ message: ' ' }).ok, false)
  assert.equal(parseAssistantRequest({ message: 'a'.repeat(1001) }).ok, false)
  assert.equal(parseAssistantRequest({ message: '다음 일정', conversationId: '00000000-0000-4000-8000-000000000001' }).ok, false)
})

test('allows only the two read-only schedule tools', () => {
  assert.equal(parseToolName('listEvents'), 'listEvents')
  assert.equal(parseToolName('findAvailability'), 'findAvailability')
  assert.equal(parseToolName('prepareEvent'), null)
})

test('rejects malformed or non-object model tool arguments', () => {
  assert.equal(parseToolArguments('{bad json'), null)
  assert.equal(parseToolArguments('[]'), null)
  assert.deepEqual(parseToolArguments('{"startDate":"2026-10-30"}'), { startDate: '2026-10-30' })
})

test('validates real calendar dates, time ranges and inclusive lookup length', () => {
  assert.equal(isToolDate('2026-02-29'), false)
  assert.equal(isToolDate('2026-10-30'), true)
  assert.equal(isToolTime('24:00', true), true)
  assert.equal(isToolTime('24:00'), false)
  assert.equal(countInclusiveDays('2026-10-29', '2026-11-04'), 7)
})

test('validates the model input separately for event and availability tools', () => {
  assert.equal(validateAssistantToolArguments('listEvents', { startDate: '2026-10-30', endDate: '2026-11-05' }).ok, true)
  assert.equal(validateAssistantToolArguments('listEvents', { startDate: '2026-10-30', endDate: '2027-10-30' }).ok, true)
  assert.equal(validateAssistantToolArguments('listEvents', { startDate: '2026-10-30', endDate: '2027-10-31' }).ok, false)
  assert.equal(validateAssistantToolArguments('listEvents', { startDate: '2026-10-30', ownerId: 'other-user' }).ok, false)
  assert.equal(validateAssistantToolArguments('findAvailability', { startDate: '2026-10-30', startTime: '09:00' }).ok, false)
  assert.equal(validateAssistantToolArguments('findAvailability', { startDate: '2026-10-30', durationMinutes: 50 }).ok, false)
  assert.equal(validateAssistantToolArguments('findAvailability', { startDate: '2026-10-30', durationMinutes: 60 }).ok, true)
})

test('uses Seoul local date for natural language reference context', () => {
  assert.equal(getKoreaToday(new Date('2026-10-29T15:30:00.000Z')), '2026-10-30')
})
