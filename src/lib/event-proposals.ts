const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

export type PrepareEventInput = {
  title: string
  note: string | null
  searchId?: string
  candidateId?: string
  date?: string
  startTime?: string
  endTime?: string
}

export type EventCandidate = {
  id: string
  searchId: string
  date: string
  start: string
  end: string
  expiresAt: string
  settingsVersion: number
}

export type EventProposalPayload = {
  title: string
  note: string | null
  startsAt: string
  endsAt: string
  settingsVersion: number
  candidateId?: string
  searchId?: string
}

export type EventProposalResult = { ok: true; value: EventProposalPayload } | { ok: false; code: string; message: string }
export type EventProposalState = 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'conflict' | 'stale'

export function resolveProposalMutation(value: unknown, action: 'confirm' | 'cancel'): { ok: true; state: EventProposalState; eventId?: string; message: string } | { ok: false; state?: EventProposalState; message: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, message: '등록 제안 응답을 확인하지 못했어요.' }
  const result = value as Record<string, unknown>
  const state = result.status
  const allowedStates: EventProposalState[] = ['pending', 'confirmed', 'cancelled', 'expired', 'conflict', 'stale']
  if (typeof state !== 'string' || !allowedStates.includes(state as EventProposalState)) return { ok: false, message: typeof result.message === 'string' ? result.message : '등록 제안 상태를 확인하지 못했어요.' }
  if (action === 'confirm' && state !== 'confirmed') return { ok: false, state: state as EventProposalState, message: typeof result.message === 'string' ? result.message : '일정을 등록하지 못했어요.' }
  if (action === 'cancel' && state !== 'cancelled') return { ok: false, state: state as EventProposalState, message: typeof result.message === 'string' ? result.message : '등록 제안을 취소하지 못했어요.' }
  const event = result.event && typeof result.event === 'object' ? result.event as Record<string, unknown> : null
  return { ok: true, state: state as EventProposalState, ...(state === 'confirmed' && typeof event?.id === 'string' ? { eventId: event.id } : {}), message: typeof result.message === 'string' ? result.message : state === 'confirmed' ? '일정을 등록했어요.' : '등록 제안을 취소했어요.' }
}

export function parseEventCandidates(value: unknown): EventCandidate[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const candidate = item as Record<string, unknown>
    if (typeof candidate.id !== 'string' || !uuidPattern.test(candidate.id)
      || typeof candidate.searchId !== 'string' || !uuidPattern.test(candidate.searchId)
      || !validDate(candidate.date)
      || typeof candidate.start !== 'string' || !timePattern.test(candidate.start) || !validQuarterHour(candidate.start)
      || typeof candidate.end !== 'string' || !timePattern.test(candidate.end) || !validQuarterHour(candidate.end)
      || typeof candidate.expiresAt !== 'string' || !Number.isFinite(Date.parse(candidate.expiresAt))
      || typeof candidate.settingsVersion !== 'number' || !Number.isSafeInteger(candidate.settingsVersion) || candidate.settingsVersion < 1) return []
    return [candidate as EventCandidate]
  })
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !datePattern.test(value)) return false
  const date = new Date(value + 'T00:00:00.000Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function validQuarterHour(value: string) {
  return Number(value.slice(-2)) % 15 === 0
}

export function parsePrepareEventArguments(input: unknown): { ok: true; value: PrepareEventInput } | { ok: false; message: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, message: '일정 등록 정보를 확인해 주세요.' }
  const value = input as Record<string, unknown>
  const allowed = ['title', 'note', 'searchId', 'candidateId', 'date', 'startTime', 'endTime']
  if (Object.keys(value).some(key => !allowed.includes(key))) return { ok: false, message: '지원하지 않는 일정 등록 정보가 있어요.' }
  const title = typeof value.title === 'string' ? value.title.trim() : ''
  const note = value.note === undefined || value.note === null ? null : typeof value.note === 'string' ? value.note.trim() : false
  if (!title || title.length > 100 || note === false || (typeof note === 'string' && note.length > 500)) return { ok: false, message: '일정 제목이나 메모를 확인해 주세요.' }

  const hasCandidate = value.candidateId !== undefined || value.searchId !== undefined
  const hasDirectTime = value.date !== undefined || value.startTime !== undefined || value.endTime !== undefined
  if (hasCandidate && hasDirectTime) return { ok: false, message: '후보와 직접 입력 시간 중 하나만 지정해 주세요.' }
  if (hasCandidate) {
    if (typeof value.candidateId !== 'string' || !uuidPattern.test(value.candidateId) || typeof value.searchId !== 'string' || !uuidPattern.test(value.searchId)) return { ok: false, message: '선택한 빈 시간 후보를 확인해 주세요.' }
    return { ok: true, value: { title, note, candidateId: value.candidateId, searchId: value.searchId } }
  }
  if (!validDate(value.date) || typeof value.startTime !== 'string' || !timePattern.test(value.startTime) || !validQuarterHour(value.startTime) || typeof value.endTime !== 'string' || !timePattern.test(value.endTime) || !validQuarterHour(value.endTime)) return { ok: false, message: '날짜와 시작·종료 시간을 확인해 주세요.' }
  return { ok: true, value: { title, note, date: value.date, startTime: value.startTime, endTime: value.endTime } }
}

export function resolveEventProposal(input: PrepareEventInput, candidates: EventCandidate[], settingsVersion: number, now = new Date()): EventProposalResult {
  let date = input.date
  let startTime = input.startTime
  let endTime = input.endTime
  let candidate: EventCandidate | undefined
  if (input.candidateId && input.searchId) {
    candidate = candidates.find(item => item.id === input.candidateId && item.searchId === input.searchId)
    if (!candidate) return { ok: false, code: 'CANDIDATE_NOT_FOUND', message: '이 대화에서 선택할 수 있는 후보를 찾지 못했어요. 빈 시간을 다시 찾아주세요.' }
    if (Date.parse(candidate.expiresAt) <= now.getTime()) return { ok: false, code: 'CANDIDATE_EXPIRED', message: '빈 시간 후보가 만료됐어요. 다시 찾아주세요.' }
    if (candidate.settingsVersion !== settingsVersion) return { ok: false, code: 'STALE_AVAILABILITY', message: '일정 가능 시간이 바뀌었어요. 빈 시간을 다시 찾아주세요.' }
    date = candidate.date
    startTime = candidate.start
    endTime = candidate.end
  }
  if (!date || !startTime || !endTime) return { ok: false, code: 'INVALID_PROPOSAL', message: '일정 날짜와 시간을 확인해 주세요.' }

  const startsAt = Date.parse(`${date}T${startTime}:00+09:00`)
  const endsAt = Date.parse(`${date}T${endTime}:00+09:00`)
  const durationMinutes = (endsAt - startsAt) / 60000
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || startsAt < now.getTime()) return { ok: false, code: 'INVALID_EVENT_TIME', message: '지난 시각에는 일정을 제안할 수 없어요.' }
  if (durationMinutes < 15 || durationMinutes > 240 || durationMinutes % 15 !== 0) return { ok: false, code: 'INVALID_EVENT_TIME', message: '일정 시간은 15~240분 사이의 15분 단위로 입력해 주세요.' }
  return {
    ok: true,
    value: {
      title: input.title,
      note: input.note,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      settingsVersion,
      ...(candidate ? { candidateId: candidate.id, searchId: candidate.searchId } : {})
    }
  }
}
