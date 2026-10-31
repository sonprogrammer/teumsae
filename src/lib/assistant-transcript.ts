import type { AssistantCard } from '@/lib/assistant-tools'

export type AssistantTranscriptMessage = {
  role: 'user' | 'assistant'
  content: string
  cards?: AssistantCard[]
  answerSource?: 'model' | 'server_fallback' | 'tool_summary'
  error?: boolean
  createdAt?: string
}

export type TranscriptProposalState = Extract<AssistantCard, { type: 'proposal' }>['state']
export type ProposalStatusRecord = { proposal_id: string; state: Exclude<TranscriptProposalState, 'missing' | 'recreated'>; expires_at: string; event_id: string | null; replacement_id: string | null; title: string; note: string | null; starts_at: string; ends_at: string; settings_version: number; replacement_title: string | null; replacement_note: string | null; replacement_starts_at: string | null; replacement_ends_at: string | null; replacement_settings_version: number | null; replacement_expires_at: string | null; replacement_state: Exclude<TranscriptProposalState, 'missing' | 'recreated'> | null; replacement_event_id: string | null; replacement_created_at: string | null }

const maxTranscriptMessages = 50
const proposalStates = ['pending', 'confirmed', 'cancelled', 'expired', 'conflict', 'stale', 'missing', 'recreated']

export const assistantConversationQueryKeys = {
  recent: (userId: string) => ['assistant-conversation', userId, 'recent'] as const
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isText(value: unknown, maxLength = 10000): value is string {
  return typeof value === 'string' && value.length <= maxLength
}

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00.000Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function isTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function isAssistantCard(value: unknown): value is AssistantCard {
  if (!isRecord(value)) return false
  if (value.type === 'events') {
    return isDate(value.startDate) && isDate(value.endDate) && typeof value.hasMore === 'boolean' && Array.isArray(value.events) && value.events.length <= 100 && value.events.every(event => isRecord(event) && isText(event.id, 100) && isText(event.title, 300) && (event.note === null || isText(event.note, 1000)) && isText(event.starts_at, 50) && isText(event.ends_at, 50) && (event.version === undefined || Number.isSafeInteger(event.version) && Number(event.version) > 0))
  }
  if (value.type === 'availability') {
    if (!isDate(value.startDate) || !isDate(value.endDate) || !Array.isArray(value.candidateIds) || value.candidateIds.length > 12 || !value.candidateIds.every(id => isText(id, 100)) || !Array.isArray(value.conflicts) || value.conflicts.length > 100) return false
    if (value.searchId !== undefined && !isText(value.searchId, 100)) return false
    if (!value.conflicts.every(conflict => isRecord(conflict) && isText(conflict.title, 300) && isDate(conflict.date) && isTime(conflict.startTime) && isDate(conflict.endDate) && isTime(conflict.endTime))) return false
    if (!isRecord(value.result)) return false
    if (value.result.mode === 'candidates') return typeof value.result.hasMore === 'boolean' && Array.isArray(value.result.candidates) && value.result.candidates.length <= 12 && value.result.candidates.every(candidate => isRecord(candidate) && isDate(candidate.date) && isTime(candidate.start) && isTime(candidate.end))
    if (value.result.mode === 'intervals') return Array.isArray(value.result.intervals) && value.result.intervals.length <= 100 && value.result.intervals.every(interval => isRecord(interval) && isDate(interval.date) && isTime(interval.start) && isTime(interval.end))
    return false
  }
  if (value.type === 'proposal') return isText(value.id, 100) && isText(value.title, 300) && (value.note === null || isText(value.note, 1000)) && isText(value.startsAt, 50) && isText(value.endsAt, 50) && typeof value.settingsVersion === 'number' && Number.isSafeInteger(value.settingsVersion) && value.settingsVersion > 0 && isText(value.expiresAt, 50) && proposalStates.includes(String(value.state)) && (value.eventId === undefined || isText(value.eventId, 100)) && (value.replacedById === undefined || isText(value.replacedById, 100)) && (value.action === undefined || ['create', 'update', 'delete'].includes(String(value.action))) && (value.previousTitle === undefined || isText(value.previousTitle, 300)) && (value.previousNote === undefined || value.previousNote === null || isText(value.previousNote, 1000)) && (value.previousStartsAt === undefined || isText(value.previousStartsAt, 50)) && (value.previousEndsAt === undefined || isText(value.previousEndsAt, 50))
  return false
}

function parseMessage(value: unknown): AssistantTranscriptMessage | null {
  if (!isRecord(value) || (value.role !== 'user' && value.role !== 'assistant') || !isText(value.content)) return null
  if (value.answerSource !== undefined && value.answerSource !== 'model' && value.answerSource !== 'server_fallback' && value.answerSource !== 'tool_summary') return null
  if (value.error !== undefined && typeof value.error !== 'boolean') return null
  if (value.createdAt !== undefined && (!isText(value.createdAt, 50) || !Number.isFinite(Date.parse(value.createdAt)))) return null
  if (value.cards !== undefined && (!Array.isArray(value.cards) || value.cards.length > 20 || !value.cards.every(isAssistantCard))) return null
  return {
    role: value.role,
    content: value.content,
    ...(value.cards ? { cards: value.cards as AssistantCard[] } : {}),
    ...(value.answerSource ? { answerSource: value.answerSource } : {}),
    ...(value.error !== undefined ? { error: value.error } : {}),
    ...(value.createdAt ? { createdAt: value.createdAt } : {})
  }
}

export function parseAssistantTranscript(value: unknown): AssistantTranscriptMessage[] {
  if (!Array.isArray(value)) return []
  const messages = value.map(parseMessage)
  if (messages.some(message => message === null)) return []
  return (messages as AssistantTranscriptMessage[]).slice(-maxTranscriptMessages)
}

export function appendAssistantTurn(messages: unknown, userContent: string, assistantMessage: Omit<AssistantTranscriptMessage, 'role' | 'createdAt'>, createdAt: string | { user: string; assistant: string } = new Date().toISOString()) {
  const current = parseAssistantTranscript(messages)
  const userCreatedAt = typeof createdAt === 'string' ? createdAt : createdAt.user
  const assistantCreatedAt = typeof createdAt === 'string' ? createdAt : createdAt.assistant
  return parseAssistantTranscript([...current, { role: 'user', content: userContent, createdAt: userCreatedAt }, { ...assistantMessage, role: 'assistant', createdAt: assistantCreatedAt }])
}

export function appendAssistantTranscriptMessage(messages: unknown, message: AssistantTranscriptMessage) {
  const current = parseAssistantTranscript(messages)
  const cardIds = new Set(message.cards?.flatMap(card => card.type === 'proposal' ? [card.id] : []) ?? [])
  if (cardIds.size && current.some(item => item.cards?.some(card => card.type === 'proposal' && cardIds.has(card.id)))) return current
  return parseAssistantTranscript([...current, message])
}

export function markProposalRecreated(messages: unknown, proposalId: string, replacementProposalId: string) {
  return parseAssistantTranscript(messages).map(message => ({
    ...message,
    cards: message.cards?.map(card => card.type === 'proposal' && card.id === proposalId ? { ...card, state: 'recreated' as const, replacedById: replacementProposalId } : card)
  }))
}

export function updateProposalState(messages: unknown, proposalId: string, state: TranscriptProposalState, eventId?: string) {
  return parseAssistantTranscript(messages).map(message => ({
    ...message,
    cards: message.cards?.map(card => card.type === 'proposal' && card.id === proposalId ? { ...card, state, ...(eventId ? { eventId } : {}) } : card)
  }))
}

export function reconcileProposalStates(messages: unknown, rows: ProposalStatusRecord[], now = new Date().toISOString()) {
  const statuses = new Map(rows.map(row => [row.proposal_id, row]))
  const nowTime = Date.parse(now)
  const reconciled = parseAssistantTranscript(messages).map(message => ({
    ...message,
    cards: message.cards?.map(card => {
      if (card.type !== 'proposal') return card
      const row = statuses.get(card.id)
      if (row?.replacement_id) {
        const replacementId = row.replacement_id
        return { ...card, title: row.title, note: row.note, startsAt: row.starts_at, endsAt: row.ends_at, settingsVersion: row.settings_version, expiresAt: row.expires_at, state: 'recreated' as const, ...(replacementId ? { replacedById: replacementId } : {}) }
      }
      if (card.state === 'recreated' && card.replacedById) return card
      if (!row) return { ...card, state: 'missing' as const }
      const state = row.state === 'pending' && Date.parse(row.expires_at) <= nowTime ? 'expired' : row.state
      return { ...card, title: row.title, note: row.note, startsAt: row.starts_at, endsAt: row.ends_at, settingsVersion: row.settings_version, expiresAt: row.expires_at, state, ...(row.event_id ? { eventId: row.event_id } : {}) }
    })
  }))
  const visibleProposalIds = new Set(reconciled.flatMap(message => message.cards?.flatMap(card => card.type === 'proposal' ? [card.id] : []) ?? []))
  const recoveredReplacements = rows.flatMap(row => {
    if (!row.replacement_id || visibleProposalIds.has(row.replacement_id) || !row.replacement_title || !row.replacement_starts_at || !row.replacement_ends_at || !row.replacement_expires_at || !row.replacement_state || !row.replacement_created_at || !row.replacement_settings_version) return []
    const state = row.replacement_state === 'pending' && Date.parse(row.replacement_expires_at) <= nowTime ? 'expired' : row.replacement_state
    const card: AssistantCard = { type: 'proposal', id: row.replacement_id, title: row.replacement_title, note: row.replacement_note, startsAt: row.replacement_starts_at, endsAt: row.replacement_ends_at, settingsVersion: row.replacement_settings_version, expiresAt: row.replacement_expires_at, state, ...(row.replacement_event_id ? { eventId: row.replacement_event_id } : {}) }
    const content = state === 'pending' ? '이전 일정 내용으로 새 등록 확인을 만들었어요. 확인 버튼을 눌러야 실제 일정으로 저장돼요.' : state === 'confirmed' ? '이전 일정 내용으로 만든 등록 제안이 실제 일정으로 저장됐어요.' : '이전 일정 내용으로 만든 등록 제안의 현재 상태예요.'
    return [{ role: 'assistant' as const, content, createdAt: row.replacement_created_at, cards: [card] }]
  })
  return parseAssistantTranscript([...reconciled, ...recoveredReplacements])
}

export function formatTranscriptDateKey(value: string) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
}

export function formatTranscriptTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value))
}

export function formatTranscriptDay(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(value))
}
