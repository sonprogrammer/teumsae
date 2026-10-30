import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { appendAssistantTranscriptMessage, markProposalRecreated, parseAssistantTranscript, type AssistantTranscriptMessage } from '@/lib/assistant-transcript'
import { isProposalRecoverable, validateProposalRecreation } from '@/lib/availability'
import type { AssistantCard } from '@/lib/assistant-tools'

const privateHeaders = { 'Cache-Control': 'private, no-store' }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function response(status: string, message: string, httpStatus: number, details: Record<string, unknown> = {}) {
  return NextResponse.json({ status, message, ...details }, { status: httpStatus, headers: privateHeaders })
}

function asMessages(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is { role: 'user' | 'assistant'; content: string } => Boolean(item) && typeof item === 'object' && ((item as Record<string, unknown>).role === 'user' || (item as Record<string, unknown>).role === 'assistant') && typeof (item as Record<string, unknown>).content === 'string').slice(-8)
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: authData, error: authError } = await supabase.auth.getClaims()
  const userId = authData?.claims?.sub
  if (authError || typeof userId !== 'string') return response('unauthenticated', '로그인이 필요해요.', 401)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return response('invalid_request', '다시 제안할 일정을 확인해 주세요.', 400)
  }
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const sourceProposalId = input.proposalId
  const requestId = input.requestId
  if (typeof sourceProposalId !== 'string' || !uuidPattern.test(sourceProposalId) || typeof requestId !== 'string' || !uuidPattern.test(requestId)) return response('invalid_request', '등록 제안 정보를 확인해 주세요.', 400)

  const now = new Date()
  const { data: conversation, error: conversationError } = await supabase.from('conversations').select('id, version, messages, context, display_messages, expires_at').eq('owner_id', userId).gt('expires_at', now.toISOString()).contains('display_messages', [{ cards: [{ id: sourceProposalId }] }]).order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (conversationError) return response('conversation_lookup_failed', '대화 내용을 확인하지 못했어요.', 500)
  if (!conversation || typeof conversation.version !== 'number') return response('conversation_not_found', '최근 대화가 만료됐거나 찾을 수 없어요.', 404)
  const transcript = parseAssistantTranscript(conversation.display_messages)
  const sourceCard = transcript.flatMap(message => message.cards ?? []).find((card): card is Extract<AssistantCard, { type: 'proposal' }> => card.type === 'proposal' && card.id === sourceProposalId)
  if (!sourceCard) return response('proposal_not_found', '다시 제안할 일정을 찾을 수 없어요.', 404)

  const { data: proposalStatuses, error: proposalStatusError } = await supabase.rpc('get_event_proposal_states', { p_proposal_ids: [sourceProposalId] })
  if (proposalStatusError) return response('proposal_status_lookup_failed', '등록 상태를 확인하지 못했어요.', 500)
  const statusRow = Array.isArray(proposalStatuses) ? proposalStatuses.find(row => row.proposal_id === sourceProposalId) : undefined
  if (!statusRow) return response('proposal_not_found', '등록 상태를 확인할 수 없어 다시 제안하지 못했어요.', 404)
  const canonicalSourceCard = { ...sourceCard, title: statusRow.title, note: statusRow.note, startsAt: statusRow.starts_at, endsAt: statusRow.ends_at, settingsVersion: statusRow.settings_version, expiresAt: statusRow.expires_at }
  if (statusRow.state === 'confirmed') return response('already_registered', '이미 실제 일정으로 등록된 내용이에요.', 409)
  if (statusRow.state === 'pending' && Date.parse(statusRow.expires_at) > now.getTime()) return response('still_pending', '아직 등록 확인이 가능한 제안이에요. 기존 확인 버튼을 사용해 주세요.', 409)
  if (!isProposalRecoverable(statusRow.state as Extract<AssistantCard, { type: 'proposal' }>['state'])) return response('not_recoverable', '이 제안은 다시 만들 수 없는 상태예요.', 409)

  const { data: rawSchedule, error: scheduleError } = await supabase.rpc('get_schedule_availability')
  if (scheduleError) return response('availability_lookup_failed', '일정 가능 시간을 확인하지 못했어요.', 500)
  const currentSettingsVersion = rawSchedule && typeof rawSchedule === 'object' ? (rawSchedule as Record<string, unknown>).version : undefined
  let proposalDate: string
  let proposalStartsAt: string
  let proposalEndsAt: string
  let settingsVersion: number
  if (typeof statusRow.replacement_id === 'string') {
    const start = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(canonicalSourceCard.startsAt))
    proposalDate = start
    proposalStartsAt = canonicalSourceCard.startsAt
    proposalEndsAt = canonicalSourceCard.endsAt
    if (typeof currentSettingsVersion !== 'number' || !Number.isSafeInteger(currentSettingsVersion) || currentSettingsVersion < 1) return response('availability_lookup_failed', '일정 가능 시간을 확인하지 못했어요.', 500)
    settingsVersion = currentSettingsVersion
  } else {
    const validation = validateProposalRecreation({ ...canonicalSourceCard, state: statusRow.state as Extract<AssistantCard, { type: 'proposal' }>['state'] }, rawSchedule, now)
    if (!validation.ok) {
      const messages = {
        not_recoverable: '이미 등록됐거나 다시 제안할 수 없는 상태예요.',
        invalid_time: '일정 시간을 확인할 수 없어 다시 제안하지 못했어요.',
        past: '이미 지난 시간이라 다시 제안할 수 없어요. 새 시간을 검색해 주세요.',
        outside_availability: '현재 일정 가능 시간에 포함되지 않아요. 가능 시간 설정을 확인하거나 새 시간을 검색해 주세요.',
        invalid_schedule: '일정 가능 시간을 확인하지 못했어요. 설정을 다시 확인해 주세요.'
      }
      return response(validation.reason, messages[validation.reason], 409)
    }
    proposalDate = validation.date
    proposalStartsAt = validation.startsAt
    proposalEndsAt = validation.endsAt
    settingsVersion = validation.settingsVersion
  }

  const requestFingerprint = createHash('sha256').update(JSON.stringify({ sourceProposalId, title: canonicalSourceCard.title, note: canonicalSourceCard.note, startsAt: proposalStartsAt, endsAt: proposalEndsAt })).digest('hex')
  const { data: proposalData, error: proposalError } = await supabase.rpc('recreate_event_proposal', {
    p_source_proposal_id: sourceProposalId,
    p_request_id: requestId,
    p_request_fingerprint: requestFingerprint,
    p_settings_version: settingsVersion
  })
  if (proposalError) return response('proposal_create_failed', '새 등록 확인을 만들지 못했어요. 다시 시도해 주세요.', 500)
  const result = proposalData && typeof proposalData === 'object' ? proposalData as Record<string, unknown> : {}
  const proposal = result.proposal && typeof result.proposal === 'object' ? result.proposal as Record<string, unknown> : {}
  const validStates = ['pending', 'confirmed', 'cancelled', 'expired', 'conflict', 'stale']
  if (typeof result.status !== 'string' || !validStates.includes(result.status) || typeof proposal.id !== 'string' || typeof proposal.startsAt !== 'string' || typeof proposal.endsAt !== 'string' || typeof proposal.expiresAt !== 'string') {
    const reason = result.status === 'conflict' ? '다른 일정이 먼저 등록되어 시간이 겹쳐요. 새 빈 시간을 찾아주세요.' : result.status === 'stale' ? '일정 가능 시간이 바뀌었어요. 다시 확인해 주세요.' : '새 등록 확인을 만들지 못했어요. 다시 시도해 주세요.'
    return response(typeof result.status === 'string' ? result.status : 'proposal_create_failed', reason, 409)
  }

  const event = result.event && typeof result.event === 'object' ? result.event as Record<string, unknown> : null
  const proposalState = result.status as Extract<AssistantCard, { type: 'proposal' }>['state']
  const card: Extract<AssistantCard, { type: 'proposal' }> = { type: 'proposal', id: proposal.id, title: typeof proposal.title === 'string' ? proposal.title : canonicalSourceCard.title, note: typeof proposal.note === 'string' ? proposal.note : canonicalSourceCard.note, startsAt: proposal.startsAt, endsAt: proposal.endsAt, settingsVersion: typeof proposal.settingsVersion === 'number' ? proposal.settingsVersion : settingsVersion, expiresAt: proposal.expiresAt, state: proposalState, ...(typeof event?.id === 'string' ? { eventId: event.id } : {}) }
  const alreadyPersisted = transcript.some(message => message.cards?.some(item => item.type === 'proposal' && item.id === card.id))
  const assistantMessage: AssistantTranscriptMessage = { role: 'assistant', content: card.state === 'pending' ? '이전 일정 내용으로 새 등록 확인을 만들었어요. 확인 버튼을 눌러야 실제 일정으로 저장돼요.' : card.state === 'confirmed' ? '이전 일정 내용으로 만든 등록 제안이 이미 저장됐어요.' : '이전 일정 내용으로 만든 등록 제안의 현재 상태예요.', createdAt: now.toISOString(), cards: [card] }
  const transcriptWithRecreatedState = markProposalRecreated(transcript, sourceProposalId, card.id)
  const nextTranscript = alreadyPersisted ? transcriptWithRecreatedState : appendAssistantTranscriptMessage(transcriptWithRecreatedState, assistantMessage)
  const previousContext = conversation.context && typeof conversation.context === 'object' && !Array.isArray(conversation.context) ? conversation.context as Record<string, unknown> : {}
  const modelMessages = asMessages(conversation.messages)
  const nextModelMessages = alreadyPersisted ? modelMessages : [...modelMessages, { role: 'assistant' as const, content: card.state === 'pending' ? `새 일정 등록 제안이 준비됐지만 아직 저장되지 않았습니다: ${card.title}, ${proposalDate} ${proposalStartsAt.slice(11, 16)}–${proposalEndsAt.slice(11, 16)} (Asia/Seoul).` : `이 일정 등록 제안의 현재 상태는 ${card.state}입니다: ${card.title}, ${proposalDate}.` }].slice(-8)
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
  const { data: savedConversation, error: saveError } = await supabase.from('conversations').update({ messages: nextModelMessages, context: { ...previousContext, pendingProposalId: card.id, activeCandidates: [], selectedCandidate: null, lastProposalAt: now.toISOString() }, display_messages: nextTranscript, version: conversation.version + 1, expires_at: expiresAt, updated_at: now.toISOString() }).eq('id', conversation.id).eq('owner_id', userId).eq('version', conversation.version).select('id, version').maybeSingle()
  if (saveError) return response('conversation_save_failed', '새 확인은 준비했지만 대화에 저장하지 못했어요. 같은 버튼으로 다시 시도해 주세요.', 500, { proposal: card })
  if (!savedConversation) return response('conversation_conflict', '대화가 다른 요청에서 바뀌었어요. 같은 버튼을 다시 눌러 최신 상태를 확인해 주세요.', 409)
  return NextResponse.json({ conversationId: savedConversation.id, version: savedConversation.version, messages: nextTranscript, proposal: card }, { headers: privateHeaders })
}
