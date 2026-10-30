import assert from 'node:assert/strict'
import test from 'node:test'
import { countInclusiveDays, createToolLimitFallback, formatKoreaDateTime, getKoreaToday, isToolDate, isToolTime, parseAssistantRequest, parseToolArguments, parseToolName, summarizeAssistantEvents, summarizeAssistantConflicts, summarizeAssistantToolInput, summarizeAssistantToolOutput, validateAssistantToolArguments } from './assistant-chat.ts'

test('accepts a new chat message and trims surrounding whitespace', () => {
  const requestId = '10000000-0000-4000-8000-000000000001'
  assert.deepEqual(parseAssistantRequest({ message: '  내 일정 알려줘  ', requestId }), { ok: true, value: { message: '내 일정 알려줘', conversationId: null, version: null, requestId } })
})

test('rejects empty, oversized, and incomplete conversation requests', () => {
  const requestId = '10000000-0000-4000-8000-000000000001'
  assert.equal(parseAssistantRequest({ message: ' ', requestId }).ok, false)
  assert.equal(parseAssistantRequest({ message: 'a'.repeat(1001), requestId }).ok, false)
  assert.equal(parseAssistantRequest({ message: '다음 일정', requestId, conversationId: '00000000-0000-4000-8000-000000000001' }).ok, false)
  assert.equal(parseAssistantRequest({ message: '다음 일정' }).ok, false)
})

test('allows only the supported schedule tools', () => {
  assert.equal(parseToolName('listEvents'), 'listEvents')
  assert.equal(parseToolName('findAvailability'), 'findAvailability')
  assert.equal(parseToolName('prepareEvent'), 'prepareEvent')
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
  assert.equal(validateAssistantToolArguments('findAvailability', { startDate: '2026-10-30', durationMinutes: 180 }).ok, true)
  assert.equal(validateAssistantToolArguments('findAvailability', { startDate: '2026-10-30', durationMinutes: 3 }).ok, false)
  assert.equal(validateAssistantToolArguments('prepareEvent', { title: '운동', date: '2026-11-02', startTime: '10:00', endTime: '11:00' }).ok, true)
  assert.equal(validateAssistantToolArguments('prepareEvent', { title: '운동', candidateId: '10000000-0000-4000-8000-000000000001', searchId: '20000000-0000-4000-8000-000000000002' }).ok, true)
  assert.equal(validateAssistantToolArguments('prepareEvent', { title: '운동', candidateId: 'other-user', searchId: '20000000-0000-4000-8000-000000000002' }).ok, false)
})

test('uses Seoul local date for natural language reference context', () => {
  assert.equal(getKoreaToday(new Date('2026-10-29T15:30:00.000Z')), '2026-10-30')
})

test('converts UTC timestamps to Korean date and time before sending them to the model', () => {
  assert.deepEqual(formatKoreaDateTime('2026-10-29T15:30:00.000Z'), { date: '2026-10-30', time: '00:30' })
  assert.deepEqual(formatKoreaDateTime('2026-11-02T00:00:00.000Z'), { date: '2026-11-02', time: '09:00' })
})

test('keeps a compact Korean-time event result for follow-up questions', () => {
  const events = Array.from({ length: 22 }, (_, index) => ({ title: '일정 ' + index, starts_at: '2026-11-02T00:00:00.000Z', ends_at: '2026-11-02T01:00:00.000Z' }))
  const summary = summarizeAssistantEvents(events)
  assert.equal(summary.events.length, 20)
  assert.equal(summary.events[0].date, '2026-11-02')
  assert.equal(summary.events[0].startTime, '09:00')
  assert.equal(summary.events[0].endTime, '10:00')
  assert.equal(summary.hasMore, true)
})

test('returns only Korean-time events that overlap the requested availability window', () => {
  const conflicts = summarizeAssistantConflicts([
    { title: '아침 미팅', starts_at: '2026-10-31T00:00:00.000Z', ends_at: '2026-10-31T01:00:00.000Z' },
    { title: '점심 일정', starts_at: '2026-10-31T03:00:00.000Z', ends_at: '2026-10-31T04:00:00.000Z' }
  ], { startDate: '2026-10-31', endDate: '2026-10-31', startTime: '08:00', endTime: '10:00' })
  assert.deepEqual(conflicts, [{ title: '아침 미팅', date: '2026-10-31', startTime: '09:00', endDate: '2026-10-31', endTime: '10:00' }])
})

test('summarizes tool inputs without exposing title search text', () => {
  assert.deepEqual(summarizeAssistantToolInput('findAvailability', { startDate: '2026-10-31', endDate: '2026-10-31', startTime: '09:00', endTime: '12:00', durationMinutes: 120 }), { startDate: '2026-10-31', endDate: '2026-10-31', startTime: '09:00', endTime: '12:00', durationMinutes: 120 })
  assert.deepEqual(summarizeAssistantToolInput('listEvents', { startDate: '2026-10-31', query: '민감한 제목' }), { startDate: '2026-10-31', hasTitleFilter: true })
})

test('summarizes tool result counts without exposing event details', () => {
  assert.deepEqual(summarizeAssistantToolOutput({ type: 'events', events: [{ title: '비공개 일정' }], hasMore: false }), { eventCount: 1, hasMore: false })
  assert.deepEqual(summarizeAssistantToolOutput({ type: 'availability', result: { mode: 'candidates', candidates: [{ date: '2026-10-31', start: '10:00', end: '12:00' }], hasMore: false }, conflicts: [{ title: '비공개 일정' }] }), { candidateCount: 1, hasMore: false, conflictCount: 1 })
  assert.deepEqual(summarizeAssistantToolOutput({ type: 'proposal', state: 'pending', title: '비공개 일정' }), { proposalCreated: true })
  assert.deepEqual(summarizeAssistantToolInput('prepareEvent', { title: '비공개 일정', candidateId: '10000000-0000-4000-8000-000000000001' }), { hasEventTitle: true, proposalMode: 'candidate' })
})

test('returns a clearly identified server fallback only when tool results are successful', () => {
  assert.equal(createToolLimitFallback(2, ['success', 'success']), '조회 결과는 위 카드에 표시했어요. 더 궁금한 점이 있으면 이어서 물어봐 주세요.')
  assert.equal(createToolLimitFallback(2, ['success', 'failed']), null)
  assert.equal(createToolLimitFallback(0, ['success']), null)
})
