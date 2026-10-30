export type AssistantRequest = { message: string; conversationId: string | null; version: number | null; requestId: string; selectedCandidateId?: string }
export type AssistantRequestResult = { ok: true; value: AssistantRequest } | { ok: false; message: string }
export type AssistantToolName = 'listEvents' | 'findAvailability' | 'prepareEvent'
export const assistantCardConcisenessInstruction = '카드에 표시된 날짜와 시간은 답변에서 반복하지 마세요. 빈 시간 검색에 소요 시간이 명시되지 않으면 durationMinutes를 생략하고 설정 시간에서 기존 일정을 뺀 모든 구간을 찾으세요. 선택 후보가 있어도 사용자가 다른 시작·종료 시각을 명시하면 그 시간으로 prepareEvent를 호출하세요.'

export function parseAssistantRequest(input: unknown): AssistantRequestResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, message: '요청 내용을 확인해 주세요.' }
  const value = input as Record<string, unknown>
  if (typeof value.message !== 'string' || !value.message.trim() || value.message.trim().length > 1000) return { ok: false, message: '메시지는 1~1,000자로 입력해 주세요.' }
  const conversationId = value.conversationId === undefined || value.conversationId === null ? null : value.conversationId
  const version = value.version === undefined || value.version === null ? null : value.version
  const requestId = value.requestId
  if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) return { ok: false, message: '요청 정보를 확인해 주세요.' }
  if (conversationId !== null && (typeof conversationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conversationId))) return { ok: false, message: '대화 정보를 확인해 주세요.' }
  if (version !== null && (!Number.isSafeInteger(version) || Number(version) < 1)) return { ok: false, message: '대화 버전을 확인해 주세요.' }
  if ((conversationId === null) !== (version === null)) return { ok: false, message: '대화 정보를 다시 불러와 주세요.' }
  const selectedCandidateId = value.selectedCandidateId
  if (selectedCandidateId !== undefined && (typeof selectedCandidateId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(selectedCandidateId))) return { ok: false, message: '선택한 빈 시간 후보를 확인해 주세요.' }
  return { ok: true, value: { message: value.message.trim(), conversationId: conversationId as string | null, version: version as number | null, requestId, ...(typeof selectedCandidateId === 'string' ? { selectedCandidateId } : {}) } }
}

export function parseToolName(value: unknown): AssistantToolName | null {
  return value === 'listEvents' || value === 'findAvailability' || value === 'prepareEvent' ? value : null
}

export function parseToolArguments(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || value.length > 2000) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

export function isToolDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00.000Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function isToolTime(value: unknown, allowEndOfDay = false): value is string {
  return typeof value === 'string' && (allowEndOfDay && value === '24:00' || /^([01]\d|2[0-3]):[0-5]\d$/.test(value))
}

export function countInclusiveDays(startDate: string, endDate: string) {
  return (Date.parse(endDate + 'T00:00:00.000Z') - Date.parse(startDate + 'T00:00:00.000Z')) / 86400000 + 1
}

export function createToolLimitFallback(cardCount: number, toolStatuses: string[]): string | null {
  if (!Number.isSafeInteger(cardCount) || cardCount < 1 || !toolStatuses.length || toolStatuses.some(status => status !== 'success')) return null
  return '조회 결과는 위 카드에 표시했어요. 더 궁금한 점이 있으면 이어서 물어봐 주세요.'
}

export function createAvailabilityResultSummary(cards: unknown[], toolCalls: Array<{ name: string; status: string }>, message: string): string | null {
  if (cards.length !== 1 || toolCalls.length !== 1 || toolCalls[0].name !== 'findAvailability' || toolCalls[0].status !== 'success') return null
  if (/(그리고|또한|함께|같이|동시에|비교|고려|무리|다음\s*날|그\s*다음날|일정도|스케줄도|찾아주고|알려주고|추천|좋은\s*시간|가장|최적|등록|저장|추가|넣어|만들어)/u.test(message)) return null
  const card = cards[0]
  if (!card || typeof card !== 'object' || Array.isArray(card)) return null
  const result = (card as Record<string, unknown>).result
  if ((card as Record<string, unknown>).type !== 'availability' || !result || typeof result !== 'object' || Array.isArray(result)) return null
  const availability = result as Record<string, unknown>
  if (availability.mode === 'intervals' && Array.isArray(availability.intervals)) return availability.intervals.length ? '설정한 가능 시간과 일정을 반영한 빈 구간을 아래 카드에 표시했어요.' : '검색 결과를 아래 카드에 표시했어요.'
  if (availability.mode === 'candidates' && Array.isArray(availability.candidates)) return availability.candidates.length ? '요청한 시간 길이에 맞는 후보를 아래 카드에 표시했어요.' : '검색 결과를 아래 카드에 표시했어요.'
  return null
}

export function normalizeAvailabilityToolArguments(args: Record<string, unknown>, message: string) {
  const normalized = { ...args }
  const durationSpecified = /(?:\d+\s*(?:시간|분)|(?:한|두|세|네|다섯|여섯|일|이|삼|사|오)\s*시간)(?:\s*반)?/u.test(message)
  const timeRangeSpecified = /(?:오전|아침|오후|저녁|밤|새벽|\d{1,2}\s*시(?!간)|\d{1,2}:\d{2})/u.test(message)
  if (!durationSpecified) delete normalized.durationMinutes
  if (!timeRangeSpecified) {
    delete normalized.startTime
    delete normalized.endTime
  }
  return normalized
}

export function shouldForceAvailabilityTool(message: string) {
  if (!/(?:빈\s*시간|가능한?\s*시간)/u.test(message)) return false
  return !/(?:그리고|또한|함께|같이|동시에|고려|무리|다음\s*날|일정.*(?:확인|조회|알려)|스케줄.*(?:확인|조회|알려)|찾아주고|알려주고|등록|저장|추가|넣어|만들어)/u.test(message)
}

export function validateAssistantToolArguments(name: AssistantToolName, args: Record<string, unknown>) {
  if (name === 'prepareEvent') {
    const allowedArgs = ['title', 'note', 'searchId', 'candidateId', 'date', 'startTime', 'endTime']
    if (Object.keys(args).some(key => !allowedArgs.includes(key))) return { ok: false as const, message: '지원하지 않는 일정 등록 정보가 있어요.' }
    const title = typeof args.title === 'string' ? args.title.trim() : ''
    const note = args.note === undefined || args.note === null ? null : typeof args.note === 'string' ? args.note.trim() : false
    if (!title || title.length > 100 || note === false || (typeof note === 'string' && note.length > 500)) return { ok: false as const, message: '일정 제목이나 메모를 확인해 주세요.' }
    const hasCandidate = args.candidateId !== undefined || args.searchId !== undefined
    const hasDirectTime = args.date !== undefined || args.startTime !== undefined || args.endTime !== undefined
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (hasCandidate && (hasDirectTime || typeof args.candidateId !== 'string' || !uuid.test(args.candidateId) || typeof args.searchId !== 'string' || !uuid.test(args.searchId))) return { ok: false as const, message: '선택한 빈 시간 후보를 확인해 주세요.' }
    if (!hasCandidate && (!isToolDate(args.date) || !isToolTime(args.startTime) || !isToolTime(args.endTime) || Number(args.startTime.slice(-2)) % 15 !== 0 || Number(args.endTime.slice(-2)) % 15 !== 0)) return { ok: false as const, message: '날짜와 시작·종료 시간을 확인해 주세요.' }
    return { ok: true as const, startDate: hasCandidate ? undefined : args.date as string, endDate: hasCandidate ? undefined : args.date as string, proposal: { title, note, ...(hasCandidate ? { searchId: args.searchId as string, candidateId: args.candidateId as string } : { date: args.date as string, startTime: args.startTime as string, endTime: args.endTime as string }) } }
  }
  const allowedArgs = name === 'listEvents' ? ['startDate', 'endDate', 'query'] : ['startDate', 'endDate', 'startTime', 'endTime', 'durationMinutes']
  if (Object.keys(args).some(key => !allowedArgs.includes(key))) return { ok: false as const, message: '지원하지 않는 조회 조건이 포함되어 있어요.' }
  const startDate = args.startDate
  const endDate = args.endDate ?? startDate
  if (!isToolDate(startDate) || !isToolDate(endDate) || startDate > endDate) return { ok: false as const, message: '조회 날짜 범위를 확인해 주세요.' }
  if (countInclusiveDays(startDate, endDate) > 366) return { ok: false as const, message: '한 번에 조회할 수 있는 기간은 최대 366일이에요.' }
  if (name === 'listEvents' && args.query !== undefined && (typeof args.query !== 'string' || args.query.trim().length > 100)) return { ok: false as const, message: '일정 제목 검색어를 확인해 주세요.' }
  if (name === 'findAvailability') {
    if (args.startTime !== undefined && !isToolTime(args.startTime)) return { ok: false as const, message: '검색 시작 시간을 확인해 주세요.' }
    if (args.endTime !== undefined && !isToolTime(args.endTime, true)) return { ok: false as const, message: '검색 종료 시간을 확인해 주세요.' }
    if ((args.startTime === undefined) !== (args.endTime === undefined)) return { ok: false as const, message: '검색 시간 범위의 시작과 종료를 모두 입력해 주세요.' }
    if (args.durationMinutes !== undefined && (!Number.isInteger(args.durationMinutes) || Number(args.durationMinutes) < 15 || Number(args.durationMinutes) > 240 || Number(args.durationMinutes) % 15 !== 0)) return { ok: false as const, message: '소요 시간은 15~240분 사이의 15분 단위로 입력해 주세요.' }
  }
  return { ok: true as const, startDate, endDate }
}

export function getKoreaToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return fields.year + '-' + fields.month + '-' + fields.day
}

export function formatKoreaDateTime(value: string): { date: string; time: string } | null {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]))
  if (!fields.year || !fields.month || !fields.day || !fields.hour || !fields.minute) return null
  return { date: `${fields.year}-${fields.month}-${fields.day}`, time: `${fields.hour}:${fields.minute}` }
}

export function summarizeAssistantEvents(events: Array<{ title: string; starts_at: string; ends_at: string }>, limit = 20) {
  return {
    events: events.slice(0, limit).flatMap(event => {
      const start = formatKoreaDateTime(event.starts_at)
      const end = formatKoreaDateTime(event.ends_at)
      return start && end ? [{ title: event.title, date: start.date, startTime: start.time, endDate: end.date, endTime: end.time }] : []
    }),
    hasMore: events.length > limit
  }
}

export function summarizeAssistantConflicts(events: Array<{ title: string; starts_at: string; ends_at: string }>, range: { startDate: string; endDate: string; startTime: string; endTime: string }) {
  const rangeStart = `${range.startDate}T${range.startTime}`
  const rangeEnd = `${range.endDate}T${range.endTime}`
  return events.flatMap(event => {
    const start = formatKoreaDateTime(event.starts_at)
    const end = formatKoreaDateTime(event.ends_at)
    if (!start || !end || `${start.date}T${start.time}` >= rangeEnd || `${end.date}T${end.time}` <= rangeStart) return []
    return [{ title: event.title, date: start.date, startTime: start.time, endDate: end.date, endTime: end.time }]
  })
}

export type AssistantToolInputSummary = { startDate?: string; endDate?: string; startTime?: string; endTime?: string; durationMinutes?: number; hasTitleFilter?: boolean; proposalMode?: 'candidate' | 'direct'; hasEventTitle?: boolean; invalidFields?: string[] }
export type AssistantToolOutputSummary = { eventCount?: number; candidateCount?: number; intervalCount?: number; conflictCount?: number; proposalCreated?: boolean; hasMore?: boolean }
export type AssistantToolCallLog = { name: AssistantToolName; status: 'success' | 'failed'; durationMs: number; input: AssistantToolInputSummary; output?: AssistantToolOutputSummary; errorCode?: string }

export function summarizeAssistantToolInput(name: AssistantToolName, args: Record<string, unknown>): AssistantToolInputSummary {
  const summary: AssistantToolInputSummary = {}
  const invalidFields: string[] = []
  if (args.startDate !== undefined) {
    if (isToolDate(args.startDate)) summary.startDate = args.startDate
    else invalidFields.push('startDate')
  }
  if (args.endDate !== undefined) {
    if (isToolDate(args.endDate)) summary.endDate = args.endDate
    else invalidFields.push('endDate')
  }
  if (args.startTime !== undefined) {
    if (isToolTime(args.startTime)) summary.startTime = args.startTime
    else invalidFields.push('startTime')
  }
  if (args.endTime !== undefined) {
    if (isToolTime(args.endTime, true)) summary.endTime = args.endTime
    else invalidFields.push('endTime')
  }
  if (args.durationMinutes !== undefined) {
    if (Number.isInteger(args.durationMinutes) && Number(args.durationMinutes) >= 15 && Number(args.durationMinutes) <= 240 && Number(args.durationMinutes) % 15 === 0) summary.durationMinutes = Number(args.durationMinutes)
    else invalidFields.push('durationMinutes')
  }
  if (name === 'listEvents' && args.query !== undefined) summary.hasTitleFilter = typeof args.query === 'string' && args.query.trim().length > 0
  if (name === 'prepareEvent') {
    summary.hasEventTitle = typeof args.title === 'string' && args.title.trim().length > 0
    summary.proposalMode = typeof args.candidateId === 'string' ? 'candidate' : 'direct'
  }
  if (invalidFields.length) summary.invalidFields = invalidFields
  return summary
}

export function summarizeAssistantToolOutput(card: unknown): AssistantToolOutputSummary {
  if (!card || typeof card !== 'object') return {}
  const value = card as Record<string, unknown>
  if (value.type === 'proposal') return { proposalCreated: value.state === 'pending' }
  if (value.type === 'events' && Array.isArray(value.events)) return { eventCount: value.events.length, hasMore: value.hasMore === true }
  if (value.type !== 'availability' || !value.result || typeof value.result !== 'object') return {}
  const result = value.result as Record<string, unknown>
  if (result.mode === 'candidates' && Array.isArray(result.candidates)) return { candidateCount: result.candidates.length, hasMore: result.hasMore === true, conflictCount: Array.isArray(value.conflicts) ? value.conflicts.length : 0 }
  if (result.mode === 'intervals' && Array.isArray(result.intervals)) return { intervalCount: result.intervals.length, conflictCount: Array.isArray(value.conflicts) ? value.conflicts.length : 0 }
  return {}
}
