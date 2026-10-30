const categoryCounts = { lookup: 3, availability: 4, proposal: 4, ambiguity: 4 }
const toolInputKeys = ['startDate', 'endDate', 'startTime', 'endTime', 'durationMinutes', 'hasTitleFilter', 'proposalMode', 'hasEventTitle', 'invalidFields']
const toolOutputKeys = ['eventCount', 'candidateCount', 'intervalCount', 'conflictCount', 'proposalCreated', 'hasMore']

function dateKey(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function addDays(date, days) {
  const value = new Date(date + 'T00:00:00.000Z')
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function dayName(date) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'UTC', weekday: 'long' }).format(new Date(date + 'T00:00:00.000Z'))
}

function nextMonday(date) {
  const weekday = new Date(date + 'T00:00:00.000Z').getUTCDay()
  return addDays(date, weekday === 1 ? 7 : (8 - weekday) % 7)
}

export function buildAiEvaluationCases(now = new Date()) {
  const today = dateKey(now)
  const tomorrow = addDays(today, 1)
  const dayAfterTomorrow = addDays(today, 2)
  const thirdDay = addDays(today, 3)
  const fourthDay = addDays(today, 4)
  const fifthDay = addDays(today, 5)
  const monday = nextMonday(today)
  const rangeEnd = addDays(today, 400)
  const selectSecondCandidate = { message: '두 번째 후보에 운동 일정을 준비해줘', selectedCandidateIndex: 1 }
  const searchBeforeSelection = date => ({ message: `${date}에 1시간 빈 시간 찾아줘` })

  return [
    { id: 'lookup_today', category: 'lookup', turns: [{ message: '오늘 일정 확인해줘' }], requiredTools: ['listEvents'], expectedCards: ['events'], expectedInputs: [{ tool: 'listEvents', values: { startDate: today } }] },
    { id: 'lookup_tomorrow', category: 'lookup', turns: [{ message: '내일 일정 알려줘' }], requiredTools: ['listEvents'], expectedCards: ['events'], expectedInputs: [{ tool: 'listEvents', values: { startDate: tomorrow } }] },
    { id: 'lookup_date_range', category: 'lookup', turns: [{ message: `${dayName(tomorrow)}부터 ${dayName(dayAfterTomorrow)}까지 일정 조회해줘` }], requiredTools: ['listEvents'], expectedCards: ['events'], expectedInputs: [{ tool: 'listEvents', values: { startDate: tomorrow, endDate: dayAfterTomorrow } }] },
    { id: 'availability_all_gaps', category: 'availability', turns: [{ message: '내일 빈 시간 알려줘' }], requiredTools: ['findAvailability'], expectedCards: ['availability'], expectedInputs: [{ tool: 'findAvailability', values: { startDate: tomorrow }, absent: ['durationMinutes'] }] },
    { id: 'availability_one_hour', category: 'availability', turns: [{ message: '모레 1시간 빈 시간 찾아줘' }], requiredTools: ['findAvailability'], expectedCards: ['availability'], expectedInputs: [{ tool: 'findAvailability', values: { startDate: dayAfterTomorrow, durationMinutes: 60 } }] },
    { id: 'availability_afternoon', category: 'availability', turns: [{ message: `${monday} 오후 1시부터 6시 사이 90분 빈 시간 찾아줘` }], requiredTools: ['findAvailability'], expectedCards: ['availability'], expectedInputs: [{ tool: 'findAvailability', values: { startDate: monday, startTime: '13:00', endTime: '18:00', durationMinutes: 90 } }] },
    { id: 'availability_morning_range', category: 'availability', turns: [{ message: `${thirdDay} 오전 9시부터 오후 1시까지 30분 가능한 시간 찾아줘` }], requiredTools: ['findAvailability'], expectedCards: ['availability'], expectedInputs: [{ tool: 'findAvailability', values: { startDate: thirdDay, startTime: '09:00', endTime: '13:00', durationMinutes: 30 } }] },
    { id: 'proposal_second_candidate', category: 'proposal', turns: [searchBeforeSelection(tomorrow), selectSecondCandidate], requiredTools: ['findAvailability', 'prepareEvent'], expectedCards: ['availability', 'proposal'], expectedInputs: [{ tool: 'prepareEvent', values: { proposalMode: 'candidate', hasEventTitle: true } }], requirePendingProposal: true, forbidConfirmedProposal: true },
    { id: 'proposal_direct_time', category: 'proposal', turns: [{ message: `${fourthDay} 오후 6시부터 7시까지 운동 일정을 준비해줘` }], requiredTools: ['prepareEvent'], expectedCards: ['proposal'], expectedInputs: [{ tool: 'prepareEvent', values: { proposalMode: 'direct', hasEventTitle: true } }], expectedProposal: { date: fourthDay, startTime: '18:00', endTime: '19:00' }, requirePendingProposal: true, forbidConfirmedProposal: true },
    { id: 'context_lookup_and_availability', category: 'proposal', turns: [{ message: '내일 일정 확인하고 빈 시간도 찾아줘' }], requiredTools: ['listEvents', 'findAvailability'], expectedCards: ['events', 'availability'], forbidConfirmedProposal: true },
    { id: 'proposal_direct_override', category: 'proposal', turns: [searchBeforeSelection(dayAfterTomorrow), { message: `${fifthDay} 오후 7시부터 8시까지 운동을 준비해줘` }], requiredTools: ['findAvailability', 'prepareEvent'], expectedCards: ['availability', 'proposal'], expectedInputs: [{ tool: 'prepareEvent', values: { proposalMode: 'direct', hasEventTitle: true } }], expectedProposal: { date: fifthDay, startTime: '19:00', endTime: '20:00' }, requirePendingProposal: true, forbidConfirmedProposal: true },
    { id: 'ambiguous_missing_details', category: 'ambiguity', turns: [{ message: '일정 추가해줘' }], forbiddenTools: ['prepareEvent'], forbidConfirmedProposal: true },
    { id: 'ambiguous_recommendation', category: 'ambiguity', turns: [{ message: '운동하기 좋은 시간 추천해줘' }], forbiddenTools: ['prepareEvent'], forbidConfirmedProposal: true },
    { id: 'unsupported_flight_booking', category: 'ambiguity', turns: [{ message: '비행기표 예약해줘' }], forbiddenTools: ['prepareEvent'], forbidConfirmedProposal: true },
    { id: 'out_of_range_lookup', category: 'ambiguity', turns: [{ message: `오늘부터 ${rangeEnd}까지 일정 확인해줘` }], requiredTools: ['listEvents'], requireFailedTool: true, forbidConfirmedProposal: true }
  ]
}

export function validateAiEvaluationCases(cases) {
  if (!Array.isArray(cases) || cases.length !== 15) return { ok: false, reason: 'invalid_case_count' }
  const seen = new Set()
  for (const item of cases) {
    if (!item || typeof item.id !== 'string' || seen.has(item.id)) return { ok: false, reason: 'duplicate_case_id' }
    if (!Object.hasOwn(categoryCounts, item.category) || !Array.isArray(item.turns) || item.turns.length === 0 || item.turns.some(turn => typeof turn.message !== 'string' || !turn.message.trim())) return { ok: false, reason: 'invalid_case_shape' }
    seen.add(item.id)
  }
  for (const [category, count] of Object.entries(categoryCounts)) {
    if (cases.filter(item => item.category === category).length !== count) return { ok: false, reason: 'invalid_category_counts' }
  }
  return { ok: true }
}

function selectKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]))
}

export function sanitizeAiEvaluationResult(value) {
  const toolCalls = Array.isArray(value.toolCalls) ? value.toolCalls.map(call => ({
    name: typeof call?.name === 'string' ? call.name : 'unknown',
    status: call?.status === 'success' ? 'success' : 'failed',
    ...(Number.isSafeInteger(call?.durationMs) ? { durationMs: call.durationMs } : {}),
    input: selectKeys(call?.input, toolInputKeys),
    ...(call?.output ? { output: selectKeys(call.output, toolOutputKeys) } : {}),
    ...(typeof call?.errorCode === 'string' && /^[A-Z0-9_]{1,64}$/.test(call.errorCode) ? { errorCode: call.errorCode } : {})
  })) : []
  const cards = Array.isArray(value.cards) ? value.cards : []
  return {
    id: value.id,
    category: value.category,
    ...(typeof value.model === 'string' ? { model: value.model } : {}),
    ...(value.answerSource === 'model' || value.answerSource === 'server_fallback' || value.answerSource === 'tool_summary' ? { answerSource: value.answerSource } : {}),
    ...(Number.isSafeInteger(value.usage?.totalTokens) ? { totalTokens: value.usage.totalTokens } : {}),
    toolCalls,
    cardTypes: cards.flatMap(card => typeof card?.type === 'string' ? [card.type] : []),
    proposalStates: cards.flatMap(card => card?.type === 'proposal' && typeof card.state === 'string' ? [card.state] : [])
  }
}
