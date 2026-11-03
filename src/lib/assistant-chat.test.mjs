import assert from 'node:assert/strict'
import test from 'node:test'
import { assistantCardConcisenessInstruction, countInclusiveDays, createAvailabilityResultSummary, createEventListSummary, createMutationProposalSummary, createToolLimitFallback, formatKoreaDateTime, formatRetryDelay, getKoreaToday, getRetryAfterSeconds, isToolDate, isToolTime, normalizeAvailabilityToolArguments, parseAssistantRequest, parseToolArguments, parseToolName, resolveMutationTarget, resolveRelativeDateToolArguments, shouldForceAvailabilityTool, summarizeAssistantEvents, summarizeAssistantConflicts, summarizeAssistantToolInput, summarizeAssistantToolOutput, validateAssistantToolArguments } from './assistant-chat.ts'

test('accepts a new chat message and trims surrounding whitespace', () => {
  const requestId = '10000000-0000-4000-8000-000000000001'
  assert.deepEqual(parseAssistantRequest({ message: '  내 일정 알려줘  ', requestId }), { ok: true, value: { message: '내 일정 알려줘', conversationId: null, version: null, requestId } })
})

test('accepts a selected candidate ID and rejects malformed IDs', () => {
  const requestId = '10000000-0000-4000-8000-000000000001'
  const selectedCandidateId = '30000000-0000-4000-8000-000000000003'
  assert.deepEqual(parseAssistantRequest({ message: '운동으로 등록해줘', requestId, selectedCandidateId }), { ok: true, value: { message: '운동으로 등록해줘', conversationId: null, version: null, requestId, selectedCandidateId } })
  assert.equal(parseAssistantRequest({ message: '운동으로 등록해줘', requestId, selectedCandidateId: 'not-a-uuid' }).ok, false)
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
  assert.equal(parseToolName('prepareEventUpdate'), 'prepareEventUpdate')
  assert.equal(parseToolName('prepareEventDelete'), 'prepareEventDelete')
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
  assert.equal(validateAssistantToolArguments('findAvailability', { startDate: '2026-10-30', durationMinutes: 300 }).ok, true)
  assert.equal(validateAssistantToolArguments('findAvailability', { startDate: '2026-10-30', durationMinutes: 3 }).ok, false)
  assert.equal(validateAssistantToolArguments('prepareEvent', { title: '운동', date: '2026-11-02', startTime: '10:00', endTime: '11:00' }).ok, true)
  assert.equal(validateAssistantToolArguments('prepareEvent', { title: '운동', candidateId: '10000000-0000-4000-8000-000000000001', searchId: '20000000-0000-4000-8000-000000000002' }).ok, true)
  assert.equal(validateAssistantToolArguments('prepareEvent', { title: '운동', candidateId: 'other-user', searchId: '20000000-0000-4000-8000-000000000002' }).ok, false)
  assert.equal(validateAssistantToolArguments('prepareEventUpdate', { startDate: '2026-11-02', query: '운동', title: '운동', date: '2026-11-02', startTime: '10:00', endTime: '11:00' }).ok, true)
  assert.equal(validateAssistantToolArguments('prepareEventUpdate', { startDate: '2026-11-02', ownerId: 'other-user', title: '운동' }).ok, false)
  assert.equal(validateAssistantToolArguments('prepareEventDelete', { startDate: '2026-11-02', query: '운동' }).ok, true)
  assert.equal(validateAssistantToolArguments('prepareEventDelete', { startDate: '2026-11-02' }).ok, true)
})

test('validates event mutation selectors without requiring a separate listEvents tool call', () => {
  assert.deepEqual(validateAssistantToolArguments('prepareEventUpdate', { startDate: '2026-11-04', query: '운동', startTime: '19:00', endTime: '20:00', date: '2026-11-04' }), { ok: true, startDate: '2026-11-04', endDate: '2026-11-04', query: '운동', date: '2026-11-04', startTime: '19:00', endTime: '20:00' })
  assert.deepEqual(validateAssistantToolArguments('prepareEventDelete', { startDate: '2026-11-04', query: '운동' }), { ok: true, startDate: '2026-11-04', endDate: '2026-11-04', query: '운동' })
  assert.equal(validateAssistantToolArguments('prepareEventDelete', { startDate: '2026-11-04', ownerId: 'another-user' }).ok, false)
})

test('resolves a mutation only when the owner-scoped lookup has exactly one matching event', () => {
  const events = [
    { id: 'one', title: '저녁 운동', starts_at: '2026-11-04T10:00:00.000Z', ends_at: '2026-11-04T11:00:00.000Z', version: 2 },
    { id: 'two', title: '저녁 운동', starts_at: '2026-11-04T12:00:00.000Z', ends_at: '2026-11-04T13:00:00.000Z', version: 1 }
  ]
  assert.deepEqual(resolveMutationTarget(events.slice(0, 1), '운동'), { kind: 'unique', event: events[0] })
  assert.deepEqual(resolveMutationTarget(events, '운동'), { kind: 'ambiguous', events })
  assert.deepEqual(resolveMutationTarget(events, '회의'), { kind: 'not_found' })
})

test('uses a server summary for a single mutation proposal instead of another model request', () => {
  assert.equal(createMutationProposalSummary({ type: 'proposal', action: 'update' }), '일정 변경 확인을 아래 카드에 준비했어요. 확인 버튼을 눌러야 반영돼요.')
  assert.equal(createMutationProposalSummary({ type: 'proposal', action: 'delete' }), '일정 삭제 확인을 아래 카드에 준비했어요. 확인 버튼을 눌러야 삭제돼요.')
  assert.equal(createMutationProposalSummary({ type: 'proposal', action: 'create' }), null)
})

test('uses a server summary for a direct schedule query and keeps analytical questions for the model', () => {
  const toolCalls = [{ name: 'listEvents', status: 'success' }]
  assert.equal(createEventListSummary([{ type: 'events', events: [{ title: '운동' }] }], toolCalls, '내일 스케줄 뭐 있어?'), '등록된 일정은 아래 카드에서 확인할 수 있어요.')
  assert.equal(createEventListSummary([{ type: 'events', events: [] }], toolCalls, '내일 스케줄 확인해줘'), '해당 기간에 등록된 일정이 없어요.')
  assert.equal(createEventListSummary([{ type: 'events', events: [{ title: '운동' }] }], toolCalls, '내일 일정이 많아서 무리일까?'), null)
})

test('parses Groq retry-after values as seconds or HTTP dates', () => {
  assert.equal(getRetryAfterSeconds('7', Date.parse('2026-11-03T10:00:00.000Z')), 7)
  assert.equal(getRetryAfterSeconds('Tue, 03 Nov 2026 10:00:09 GMT', Date.parse('2026-11-03T10:00:00.000Z')), 9)
  assert.equal(getRetryAfterSeconds('invalid', Date.parse('2026-11-03T10:00:00.000Z')), null)
  assert.equal(formatRetryDelay(20), '20초')
  assert.equal(formatRetryDelay(61), '2분')
  assert.equal(formatRetryDelay(3600), '1시간')
})

test('uses Seoul local date for natural language reference context', () => {
  assert.equal(getKoreaToday(new Date('2026-10-29T15:30:00.000Z')), '2026-10-30')
})

test('resolves tomorrow from the Seoul date across UTC midnight', () => {
  const now = new Date('2026-10-30T15:28:00.000Z')
  assert.deepEqual(resolveRelativeDateToolArguments({ startDate: '2026-10-31', endDate: '2026-10-31' }, '내일 일정 확인해줘', now), { startDate: '2026-11-01', endDate: '2026-11-01' })
  assert.deepEqual(resolveRelativeDateToolArguments({ date: '2026-10-31' }, '내일 운동 등록 준비해줘', now), { date: '2026-11-01' })
  assert.deepEqual(resolveRelativeDateToolArguments({ startDate: '2026-10-31', endDate: '2026-11-02' }, '내일부터 3일간 일정 확인해줘', now), { startDate: '2026-11-01', endDate: '2026-11-03' })
})

test('keeps explicit dates and ambiguous multiple relative dates unchanged', () => {
  const now = new Date('2026-10-30T15:28:00.000Z')
  const args = { startDate: '2026-10-31', endDate: '2026-10-31' }
  assert.deepEqual(resolveRelativeDateToolArguments(args, '2026-10-31 일정 확인해줘', now), args)
  assert.deepEqual(resolveRelativeDateToolArguments(args, '오늘 일정 확인하고 내일 빈 시간도 찾아줘', now), args)
  assert.deepEqual(resolveRelativeDateToolArguments(args, '내일 일정 확인하고 그 다음날 빈 시간도 찾아줘', now), args)
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
  assert.deepEqual(summarizeAssistantToolInput('findAvailability', { startDate: '2026-10-31', durationMinutes: 300 }), { startDate: '2026-10-31', durationMinutes: 300 })
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

test('uses a short server response when a single availability card contains the complete result', () => {
  const cards = [{ type: 'availability', result: { mode: 'candidates', candidates: [{ date: '2026-10-31', start: '10:00', end: '12:00' }] } }]
  const toolCalls = [{ name: 'findAvailability', status: 'success' }]
  const intervalCards = [{ type: 'availability', result: { mode: 'intervals', intervals: [{ date: '2026-10-31', start: '09:00', end: '12:00' }, { date: '2026-10-31', start: '13:00', end: '21:00' }] } }]
  assert.equal(createAvailabilityResultSummary(cards, toolCalls, '내일 빈 시간 찾아줘'), '요청한 시간 길이에 맞는 후보를 아래 카드에 표시했어요.')
  assert.equal(createAvailabilityResultSummary(intervalCards, toolCalls, '내일 빈 시간 알려줘'), '설정한 가능 시간과 일정을 반영한 빈 구간을 아래 카드에 표시했어요.')
  assert.equal(createAvailabilityResultSummary([...cards, { type: 'events' }], toolCalls, '내일 빈 시간 찾아줘'), null)
  assert.equal(createAvailabilityResultSummary(cards, [{ name: 'findAvailability', status: 'success' }, { name: 'listEvents', status: 'success' }], '내일 빈 시간 찾아줘'), null)
  assert.equal(createAvailabilityResultSummary(intervalCards, toolCalls, '빈 시간 찾아주고 다음 날 일정도 고려해줘'), null)
  assert.equal(createAvailabilityResultSummary(intervalCards, toolCalls, '내일 운동하기 좋은 시간 추천해줘'), null)
  assert.equal(createAvailabilityResultSummary(intervalCards, toolCalls, '빈 시간 찾아서 운동 일정으로 등록해줘'), null)
})

test('asks the AI to avoid repeating dates and times already shown in cards', () => {
  assert.match(assistantCardConcisenessInstruction, /카드에 표시된 날짜와 시간은 답변에서 반복하지 마세요/)
  assert.match(assistantCardConcisenessInstruction, /durationMinutes를 생략하고 설정 시간에서 기존 일정을 뺀 모든 구간을 찾으세요/)
  assert.match(assistantCardConcisenessInstruction, /선택 후보가 있어도 사용자가 다른 시작·종료 시각을 명시하면 그 시간으로 prepareEvent를 호출하세요/)
})

test('removes an AI-assumed duration but keeps a duration explicitly stated by the user', () => {
  assert.deepEqual(normalizeAvailabilityToolArguments({ startDate: '2026-10-31', startTime: '09:00', endTime: '12:00', durationMinutes: 60 }, '내일 빈 시간 알려줘'), { startDate: '2026-10-31' })
  assert.deepEqual(normalizeAvailabilityToolArguments({ startDate: '2026-10-31', startTime: '09:00', endTime: '12:00', durationMinutes: 90 }, '내일 오전 1시간 반 빈 시간 찾아줘'), { startDate: '2026-10-31', startTime: '09:00', endTime: '12:00', durationMinutes: 90 })
  assert.deepEqual(normalizeAvailabilityToolArguments({ startDate: '2026-10-31', startTime: '09:00', endTime: '12:00', durationMinutes: 120 }, '내일 2시간 가능한 때 찾아줘'), { startDate: '2026-10-31', durationMinutes: 120 })
})

test('forces the availability tool for a simple request but leaves compound requests to tool selection', () => {
  assert.equal(shouldForceAvailabilityTool('내일 빈 시간 알려줘'), true)
  assert.equal(shouldForceAvailabilityTool('내일 오후 2시간 가능한 시간 찾아줘'), true)
  assert.equal(shouldForceAvailabilityTool('내일 일정 확인하고 빈 시간 알려줘'), false)
  assert.equal(shouldForceAvailabilityTool('내일 운동하기 좋은 시간 추천해줘'), false)
  assert.equal(shouldForceAvailabilityTool('내일 일정 알려줘'), false)
})
