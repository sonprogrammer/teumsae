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

const maxTranscriptMessages = 50
const proposalStates = ['pending', 'confirmed', 'cancelled', 'expired', 'conflict', 'stale']

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
    return isDate(value.startDate) && isDate(value.endDate) && typeof value.hasMore === 'boolean' && Array.isArray(value.events) && value.events.length <= 100 && value.events.every(event => isRecord(event) && isText(event.id, 100) && isText(event.title, 300) && (event.note === null || isText(event.note, 1000)) && isText(event.starts_at, 50) && isText(event.ends_at, 50))
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
  if (value.type === 'proposal') return isText(value.id, 100) && isText(value.title, 300) && (value.note === null || isText(value.note, 1000)) && isText(value.startsAt, 50) && isText(value.endsAt, 50) && typeof value.settingsVersion === 'number' && Number.isSafeInteger(value.settingsVersion) && value.settingsVersion > 0 && isText(value.expiresAt, 50) && proposalStates.includes(String(value.state)) && (value.eventId === undefined || isText(value.eventId, 100))
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

export function appendAssistantTurn(messages: unknown, userContent: string, assistantMessage: Omit<AssistantTranscriptMessage, 'role' | 'createdAt'>, createdAt = new Date().toISOString()) {
  const current = parseAssistantTranscript(messages)
  return parseAssistantTranscript([...current, { role: 'user', content: userContent, createdAt }, { ...assistantMessage, role: 'assistant', createdAt }])
}

export function updateProposalState(messages: unknown, proposalId: string, state: TranscriptProposalState, eventId?: string) {
  return parseAssistantTranscript(messages).map(message => ({
    ...message,
    cards: message.cards?.map(card => card.type === 'proposal' && card.id === proposalId ? { ...card, state, ...(eventId ? { eventId } : {}) } : card)
  }))
}
