'use client'

import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react'
import Image from 'next/image'
import ReactMarkdown from 'react-markdown'
import { Mic, MicOff, Square, Volume2, VolumeX } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { eventQueryKeys } from '@/lib/event-query-keys'
import { resolveProposalMutation, type EventProposalState } from '@/lib/event-proposals'
import type { AssistantCard } from '@/lib/assistant-tools'
import { assistantConversationQueryKeys, formatTranscriptDateKey, formatTranscriptDay, formatTranscriptTime, type AssistantTranscriptMessage } from '@/lib/assistant-transcript'
import { parseTranscription, resolveVoiceActivity, speechResponse, speechText } from '@/lib/voice-input.mjs'

type ChatMessage = AssistantTranscriptMessage
type RecentConversation = { id: string; version: number; messages: ChatMessage[] }
type RecentConversationResponse = { conversation: RecentConversation | null }
type ChatResponse = { response: string; answerSource: 'model' | 'server_fallback' | 'tool_summary'; conversationId: string; version: number; cards: AssistantCard[]; messages: ChatMessage[] }
type ChatError = { code?: string; message?: string; response?: string; cards?: AssistantCard[]; conversationId?: string; version?: number }

const assistantGreeting: ChatMessage = { role: 'assistant', content: '일정 조회와 빈 시간 검색을 도와드려요. 등록 전에 날짜와 시간을 확인 카드로 보여드릴게요.' }
const assistantGreetingMessages: ChatMessage[] = [assistantGreeting]

async function fetchRecentConversation(): Promise<RecentConversationResponse> {
  const response = await fetch('/api/chat', { cache: 'no-store' })
  if (!response.ok) throw new Error('최근 대화를 불러오지 못했어요.')
  return await response.json() as RecentConversationResponse
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(date + 'T00:00:00.000Z'))
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function ConflictList({ conflicts }: { conflicts: Extract<AssistantCard, { type: 'availability' }>['conflicts'] }) {
  if (!conflicts.length) return null
  return <ul className="chat-conflict-list">{conflicts.map((event, index) => <li key={event.date + event.startTime + index}><span>{dateLabel(event.date)} {event.startTime}–{event.endTime}</span><strong>{event.title}</strong></li>)}</ul>
}

function AvailabilityEmptyState() {
  return <div className="chat-card-empty-state"><p className="chat-card-empty">요청한 조건에 맞는 빈 시간이 없어요.</p><p className="chat-card-empty-hint">일정 가능 시간 설정이 비어 있거나 해당 날짜가 불가일로 설정됐는지 확인해 주세요.</p></div>
}

function MessageBody({ message }: { message: ChatMessage }) {
  if (message.role === 'user') return <p>{message.content}</p>
  return <div className="assistant-live-markdown"><ReactMarkdown components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a> }}>{message.content}</ReactMarkdown></div>
}

function proposalDateTime(value: string) {
  const date = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(value))
  const time = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value))
  return { date, time }
}

const proposalStateLabels: Record<EventProposalState, string> = { pending: '등록 전 · 확인 필요', confirmed: '일정에 추가됨', cancelled: '등록되지 않음 · 제안 취소', expired: '등록되지 않음 · 확인 만료', conflict: '등록되지 않음 · 시간 충돌', stale: '등록되지 않음 · 가능 시간 변경', missing: '등록 상태 확인 필요', recreated: '새 등록 확인을 만들었어요' }

function Card({ card, onChoose, selectedCandidateId, onProposalAction, onProposalRetry, proposalPending, proposalNotice }: { card: AssistantCard; onChoose: (candidateId: string) => void; selectedCandidateId: string | null; onProposalAction: (card: Extract<AssistantCard, { type: 'proposal' }>, action: 'confirm' | 'cancel') => void; onProposalRetry: (card: Extract<AssistantCard, { type: 'proposal' }>) => void; proposalPending: boolean; proposalNotice?: string }) {
  const [visibleCandidateCount, setVisibleCandidateCount] = useState(3)
  if (card.type === 'events') return <section className="chat-result-card" aria-label="일정 조회 결과"><div className="chat-card-heading"><strong>일정 조회</strong><span>{dateLabel(card.startDate)}{card.endDate !== card.startDate ? ' – ' + dateLabel(card.endDate) : ''}</span></div>{card.events.length ? <ul className="chat-event-results">{card.events.map(event => <li key={event.id}><span>{timeLabel(event.starts_at)}–{timeLabel(event.ends_at)}</span><strong>{event.title}</strong>{event.note && <small>{event.note}</small>}</li>)}</ul> : <p className="chat-card-empty">조회한 기간에 등록된 일정이 없어요.</p>}</section>
  if (card.type === 'proposal') {
    const starts = proposalDateTime(card.startsAt)
    const ends = proposalDateTime(card.endsAt)
    const action = card.action ?? 'create'
    const isDelete = action === 'delete'
    const canAct = card.state === 'pending' && !proposalPending
    const canRetry = action === 'create' && ['cancelled', 'expired', 'conflict', 'stale'].includes(card.state)
    const heading = action === 'create' ? '일정 등록 확인' : action === 'update' ? '일정 변경 확인' : '일정 삭제 확인'
    const pendingMessage = action === 'create' ? '아직 저장되지 않았어요.' : action === 'update' ? '일정은 아직 변경되지 않았어요.' : '일정은 아직 삭제되지 않았어요.'
    const confirmedMessage = action === 'create' ? '실제 일정에 추가됐어요.' : action === 'update' ? '일정을 변경했어요.' : '일정을 삭제했어요.'
    const confirmLabel = action === 'create' ? '이 일정으로 등록' : action === 'update' ? '변경 내용 적용' : '일정 삭제'
    const stateLabel = card.state === 'confirmed' ? action === 'create' ? '일정에 추가됨' : action === 'update' ? '변경 완료' : '삭제 완료' : proposalStateLabels[card.state]
    return <section className={'chat-result-card chat-proposal-card is-' + card.state} aria-label={heading}><div className="chat-card-heading"><strong>{heading}</strong><span>{stateLabel}</span></div>{action === 'update' && card.previousTitle && <div className="chat-proposal-previous"><small>현재 일정</small><strong>{card.previousTitle}</strong>{card.previousStartsAt && card.previousEndsAt && <time>{proposalDateTime(card.previousStartsAt).date} · {proposalDateTime(card.previousStartsAt).time}–{proposalDateTime(card.previousEndsAt).time}</time>}</div>}<div className="chat-proposal-details"><small>{action === 'update' ? '변경할 내용' : isDelete ? '삭제할 일정' : ''}</small><strong>{card.title}</strong>{card.note && <p>{card.note}</p>}<time>{starts.date} · {starts.time}–{ends.time}</time></div>{card.state === 'pending' && <p className="chat-card-empty">{pendingMessage} {action === 'delete' ? '삭제하려면 아래 버튼을 눌러 주세요.' : '아래 확인 버튼을 눌러야 반영돼요.'}</p>}{card.state === 'confirmed' && <p className="chat-proposal-confirmed" role="status">{confirmedMessage}</p>}{canRetry && <><p className="chat-card-empty">이 제안은 실제 일정에 등록되지 않았어요.</p><button type="button" className="chat-proposal-retry" disabled={proposalPending} onClick={() => onProposalRetry(card)}>{proposalPending ? '새 확인을 준비 중…' : '이 내용으로 다시 제안'}</button></>}{card.state === 'missing' && <p className="chat-proposal-notice" role="status">처리 상태를 확인할 수 없어요. 달력에서 일정을 확인해 주세요.</p>}{proposalNotice && <p className="chat-proposal-notice" role="status">{proposalNotice}</p>}{card.state === 'pending' && <div className="chat-proposal-actions"><button type="button" className="chat-proposal-cancel" disabled={!canAct} onClick={() => onProposalAction(card, 'cancel')}>취소</button><button type="button" className={'chat-proposal-confirm' + (isDelete ? ' is-danger' : '')} disabled={!canAct} onClick={() => onProposalAction(card, 'confirm')}>{proposalPending ? '처리 중…' : confirmLabel}</button></div>}</section>
  }
  const result = card.result
  if (result.mode === 'candidates') {
    const visibleCandidates = result.candidates.slice(0, visibleCandidateCount)
    return (
      <section className="chat-result-card" aria-label="빈 시간 후보">
        <div className="chat-card-heading"><strong>빈 시간 후보</strong><span>{dateLabel(card.startDate)}{card.endDate !== card.startDate ? ' – ' + dateLabel(card.endDate) : ''}</span></div>
        {result.candidates.length ? (
          <>
            <div className="chat-candidate-list">
              {visibleCandidates.map((candidate, index) => {
                const candidateId = card.candidateIds[index]
                const selected = candidateId === selectedCandidateId
                return <button type="button" key={candidate.date + candidate.start} aria-pressed={selected} disabled={!candidateId} onClick={() => candidateId && onChoose(candidateId)}><span>{index + 1}</span><strong>{dateLabel(candidate.date)}</strong><time>{candidate.start} – {candidate.end}</time><small>{selected ? '선택됨 · 다음 메시지에서 등록 요청' : '선택'}</small></button>
              })}
            </div>
            {visibleCandidateCount < result.candidates.length && <button type="button" className="chat-candidate-more" onClick={() => setVisibleCandidateCount(current => current + 3)}>후보 {Math.min(3, result.candidates.length - visibleCandidateCount)}개 더 보기</button>}
            {visibleCandidateCount >= result.candidates.length && result.hasMore && <p className="chat-card-empty-hint">후보 12개를 표시했어요. 더 찾으려면 검색 날짜나 조건을 좁혀 주세요.</p>}
          </>
        ) : (
          <>
            <AvailabilityEmptyState />
            <ConflictList conflicts={card.conflicts} />
          </>
        )}
      </section>
    )
  }
  return <section className="chat-result-card" aria-label="빈 시간 결과"><div className="chat-card-heading"><strong>빈 시간 확인</strong><span>{dateLabel(card.startDate)}{card.endDate !== card.startDate ? ' – ' + dateLabel(card.endDate) : ''}</span></div>{result.intervals.length ? <ul className="chat-event-results">{result.intervals.map(interval => <li key={interval.date + interval.start}><span>{dateLabel(interval.date)}</span><strong>{interval.start} – {interval.end}</strong></li>)}</ul> : <><AvailabilityEmptyState /><ConflictList conflicts={card.conflicts} /></>}</section>
}

export default function AssistantPanel({ userId }: { userId: string }) {
  const queryClient = useQueryClient()
  const recentConversationQuery = useQuery({ queryKey: assistantConversationQueryKeys.recent(userId), queryFn: fetchRecentConversation })
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [optimisticTranscript, setOptimisticTranscript] = useState<{ userId: string; messages: ChatMessage[] } | null>(null)
  const [candidateSelection, setCandidateSelection] = useState<{ userId: string; candidateId: string | null }>({ userId, candidateId: null })
  const [pending, setPending] = useState(false)
  const [proposalActions, setProposalActions] = useState<Record<string, boolean>>({})
  const [proposalNotices, setProposalNotices] = useState<Record<string, string>>({})
  const [proposalRetryIds, setProposalRetryIds] = useState<Record<string, string>>({})
  const [recording, setRecording] = useState(false)
  const [voiceSession, setVoiceSession] = useState(false)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [voiceNotice, setVoiceNotice] = useState('')
  const [speakReplies, setSpeakReplies] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const voiceSessionRef = useRef(false)
  const voiceSessionIdRef = useRef(0)
  const voiceStartAttemptRef = useRef(0)
  const recordingRef = useRef(false)
  const voiceBusyRef = useRef(false)
  const pendingRef = useRef(false)
  const speakingRef = useRef(false)
  const speakRepliesRef = useRef(false)
  const discardVoiceTurnRef = useRef(false)
  const voiceActivityRef = useRef({ hasSpeech: false, lastSpeechAt: null as number | null })
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const voiceFrameRef = useRef<number | null>(null)
  const resumeTimeoutRef = useRef<number | null>(null)
  const retryRequest = useRef<{ message: string; selectedCandidateId: string | null; id: string } | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const voiceRequestControllerRef = useRef<AbortController | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recordingTimeoutRef = useRef<number | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const conversation = recentConversationQuery.data?.conversation ?? null
  const messages = optimisticTranscript?.userId === userId ? optimisticTranscript.messages : conversation?.messages.length ? conversation.messages : assistantGreetingMessages
  const messagesRef = useRef(messages)
  const selectedCandidateId = candidateSelection.userId === userId ? candidateSelection.candidateId : null

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    pendingRef.current = pending
  }, [pending])

  useEffect(() => {
    speakRepliesRef.current = speakReplies
  }, [speakReplies])

  function updateMessages(updater: (previous: ChatMessage[]) => ChatMessage[]) {
    const nextMessages = updater(messagesRef.current)
    messagesRef.current = nextMessages
    setOptimisticTranscript({ userId, messages: nextMessages })
    queryClient.setQueryData<RecentConversationResponse>(assistantConversationQueryKeys.recent(userId), current => current?.conversation ? { conversation: { ...current.conversation, messages: nextMessages } } : current)
  }

  function closePanel() {
    stopVoiceSession(false)
    setOpen(false)
    requestAnimationFrame(() => launcherRef.current?.focus())
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, pending])

  useEffect(() => () => {
    voiceSessionRef.current = false
    voiceSessionIdRef.current += 1
    voiceStartAttemptRef.current += 1
    voiceRequestControllerRef.current?.abort()
    voiceRequestControllerRef.current = null
    if (recordingTimeoutRef.current !== null) window.clearTimeout(recordingTimeoutRef.current)
    if (resumeTimeoutRef.current !== null) window.clearTimeout(resumeTimeoutRef.current)
    if (voiceFrameRef.current !== null) window.cancelAnimationFrame(voiceFrameRef.current)
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    streamRef.current?.getTracks().forEach(track => track.stop())
    void audioContextRef.current?.close()
    window.speechSynthesis?.cancel()
  }, [])

  useEffect(() => {
    if (!open) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        stopVoiceSession(false)
        setOpen(false)
        requestAnimationFrame(() => launcherRef.current?.focus())
      }
    }
    function closeOnOutsideClick(event: PointerEvent) {
      const target = event.target
      if (target instanceof Node && !panelRef.current?.contains(target) && !launcherRef.current?.contains(target)) {
        stopVoiceSession(false)
        setOpen(false)
        requestAnimationFrame(() => launcherRef.current?.focus())
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('pointerdown', closeOnOutsideClick)
    }
  }, [open])

  async function sendMessage(message: string, speakAnswer = speakReplies, voiceSessionId?: number, signal?: AbortSignal) {
    const trimmed = message.trim()
    if (!trimmed || pendingRef.current || recentConversationQuery.isPending || recentConversationQuery.isError) return
    const currentConversation = queryClient.getQueryData<RecentConversationResponse>(assistantConversationQueryKeys.recent(userId))?.conversation ?? conversation
    const requestId = retryRequest.current?.message === trimmed && retryRequest.current.selectedCandidateId === selectedCandidateId ? retryRequest.current.id : crypto.randomUUID()
    retryRequest.current = { message: trimmed, selectedCandidateId, id: requestId }
    const messagesWithUserTurn = [...messagesRef.current, { role: 'user' as const, content: trimmed, createdAt: new Date().toISOString() }]
    messagesRef.current = messagesWithUserTurn
    setOptimisticTranscript({ userId, messages: messagesWithUserTurn })
    setInput('')
    pendingRef.current = true
    setPending(true)
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: trimmed, conversationId: currentConversation?.id ?? null, version: currentConversation?.version ?? null, requestId, ...(selectedCandidateId ? { selectedCandidateId } : {}) }), ...(signal ? { signal } : {}) })
      const payload = await response.json() as ChatResponse & ChatError
      if (!response.ok) {
        const shouldSpeak = speakAnswer && (voiceSessionId === undefined || voiceSessionRef.current && voiceSessionId === voiceSessionIdRef.current && speakRepliesRef.current)
        const voiceRateLimited = payload.code === 'AI_USAGE_LIMIT' && voiceSessionId !== undefined
        if (voiceRateLimited) {
          setVoiceNotice('분당 AI 질문 한도에 도달했어요. 잠시 후 음성 대화를 다시 시작해 주세요.')
          stopVoiceSession(false)
          if (shouldSpeak && payload.message) speak(payload.message)
        } else if (shouldSpeak && payload.message) speak(payload.message, voiceSessionId)
        setInput(trimmed)
        if (payload.conversationId && typeof payload.version === 'number') queryClient.setQueryData<RecentConversationResponse>(assistantConversationQueryKeys.recent(userId), current => ({ conversation: { id: payload.conversationId!, version: payload.version!, messages: current?.conversation?.messages ?? [] } }))
        if (payload.code === 'CONVERSATION_EXPIRED' || payload.code === 'CONVERSATION_NOT_FOUND' || payload.code === 'CONVERSATION_CONFLICT') {
          queryClient.setQueryData<RecentConversationResponse>(assistantConversationQueryKeys.recent(userId), { conversation: null })
          setCandidateSelection({ userId, candidateId: null })
          const nextMessages = [...messagesWithUserTurn, { role: 'assistant' as const, content: '대화가 만료되었거나 다른 요청에서 변경되어 새 대화로 전환했어요. 이전 후보는 이어지지 않으니 질문을 다시 보내 주세요.', createdAt: new Date().toISOString() }]
          messagesRef.current = nextMessages
          setOptimisticTranscript({ userId, messages: nextMessages })
          return
        }
        if (payload.code === 'CANDIDATE_NOT_FOUND' || payload.code === 'CANDIDATE_EXPIRED' || payload.code === 'STALE_AVAILABILITY') setCandidateSelection({ userId, candidateId: null })
        const nextMessages = [...messagesWithUserTurn, { role: 'assistant' as const, content: payload.response ? `${payload.message || '대화 상태를 저장하지 못했어요.'}\n\n${payload.response}` : payload.message || '요청을 처리하지 못했어요. 다시 시도해 주세요.', cards: payload.cards, error: true, createdAt: new Date().toISOString() }]
        messagesRef.current = nextMessages
        setOptimisticTranscript({ userId, messages: nextMessages })
        return
      }
      retryRequest.current = null
      const shouldSpeak = speakAnswer && (voiceSessionId === undefined || voiceSessionRef.current && voiceSessionId === voiceSessionIdRef.current && speakRepliesRef.current)
      if (shouldSpeak) speak(speechResponse(payload.response, payload.cards), voiceSessionId)
      messagesRef.current = payload.messages
      queryClient.setQueryData<RecentConversationResponse>(assistantConversationQueryKeys.recent(userId), { conversation: { id: payload.conversationId, version: payload.version, messages: payload.messages } })
      setOptimisticTranscript(null)
      if (payload.cards.length) setCandidateSelection({ userId, candidateId: null })
    } catch {
      if (signal?.aborted) {
        messagesRef.current = currentConversation?.messages ?? assistantGreetingMessages
        setOptimisticTranscript(null)
        return
      }
      setInput(trimmed)
      const nextMessages = [...messagesWithUserTurn, { role: 'assistant' as const, content: '서버와 연결하지 못했어요. 잠시 후 다시 시도해 주세요.', error: true, createdAt: new Date().toISOString() }]
      messagesRef.current = nextMessages
      setOptimisticTranscript({ userId, messages: nextMessages })
      if (speakAnswer && (voiceSessionId === undefined || voiceSessionRef.current && voiceSessionId === voiceSessionIdRef.current && speakRepliesRef.current)) speak('서버와 연결하지 못했어요. 잠시 후 다시 시도해 주세요.', voiceSessionId)
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }

  function speak(message: string, voiceSessionId?: number) {
    if (!('speechSynthesis' in window)) return false
    window.speechSynthesis.cancel()
    const text = speechText(message)
    if (!text) return false
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'ko-KR'
    utterance.rate = 1
    speakingRef.current = true
    setSpeaking(true)
    utterance.onstart = () => { speakingRef.current = true; setSpeaking(true) }
    utterance.onend = () => { speakingRef.current = false; setSpeaking(false); if (voiceSessionId !== undefined) resumeVoiceListening(voiceSessionId) }
    utterance.onerror = () => { speakingRef.current = false; setSpeaking(false); if (voiceSessionId !== undefined) resumeVoiceListening(voiceSessionId) }
    window.speechSynthesis.speak(utterance)
    return true
  }

  function resumeVoiceListening(sessionId: number) {
    if (resumeTimeoutRef.current !== null) window.clearTimeout(resumeTimeoutRef.current)
    resumeTimeoutRef.current = window.setTimeout(() => {
      resumeTimeoutRef.current = null
      if (!voiceSessionRef.current || sessionId !== voiceSessionIdRef.current || recordingRef.current || voiceBusyRef.current || pendingRef.current || speakingRef.current) return
      startRecordingTurn(sessionId)
    }, 350)
  }

  function monitorVoiceTurn(sessionId: number) {
    if (!voiceSessionRef.current || sessionId !== voiceSessionIdRef.current || !recordingRef.current) return
    const analyser = analyserRef.current
    const recorder = recorderRef.current
    if (!analyser || recorder?.state !== 'recording') return
    const samples = new Uint8Array(analyser.fftSize)
    analyser.getByteTimeDomainData(samples)
    const rms = Math.sqrt(samples.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / samples.length)
    const activity = resolveVoiceActivity({ ...voiceActivityRef.current, rms, now: Date.now() })
    voiceActivityRef.current = { hasSpeech: activity.hasSpeech, lastSpeechAt: activity.lastSpeechAt }
    if (activity.shouldSubmit) {
      setVoiceNotice('말씀을 확인했어요. AI가 답변을 준비하고 있어요…')
      recorder.stop()
      return
    }
    voiceFrameRef.current = window.requestAnimationFrame(() => monitorVoiceTurn(sessionId))
  }

  function startRecordingTurn(sessionId: number) {
    const stream = streamRef.current
    if (!stream || !voiceSessionRef.current || sessionId !== voiceSessionIdRef.current || recordingRef.current || voiceBusyRef.current || pendingRef.current || speakingRef.current) return
    const preferredType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type))
    const recorder = preferredType ? new MediaRecorder(stream, { mimeType: preferredType }) : new MediaRecorder(stream)
    const chunks: BlobPart[] = []
    recorderRef.current = recorder
    discardVoiceTurnRef.current = false
    voiceActivityRef.current = { hasSpeech: false, lastSpeechAt: null }
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
    recorder.onerror = () => setVoiceNotice('녹음 중 문제가 생겼어요. 다시 말씀해 주세요.')
    recorder.onstop = () => { void handleVoiceTurn(recorder, chunks, sessionId) }
    recorder.start()
    recordingRef.current = true
    setRecording(true)
    setVoiceNotice('듣고 있어요. 말씀을 마치면 자동으로 전송합니다.')
    recordingTimeoutRef.current = window.setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop()
    }, 60000)
    voiceFrameRef.current = window.requestAnimationFrame(() => monitorVoiceTurn(sessionId))
  }

  async function handleVoiceTurn(recorder: MediaRecorder, chunks: BlobPart[], sessionId: number) {
    if (recordingTimeoutRef.current !== null) window.clearTimeout(recordingTimeoutRef.current)
    recordingTimeoutRef.current = null
    if (voiceFrameRef.current !== null) window.cancelAnimationFrame(voiceFrameRef.current)
    voiceFrameRef.current = null
    recordingRef.current = false
    setRecording(false)
    if (recorderRef.current === recorder) recorderRef.current = null
    if (discardVoiceTurnRef.current || !voiceSessionRef.current || sessionId !== voiceSessionIdRef.current) {
      discardVoiceTurnRef.current = false
      return
    }
    if (!chunks.length || !voiceActivityRef.current.hasSpeech) {
      setVoiceNotice('듣고 있어요. 말씀을 마치면 자동으로 전송합니다.')
      resumeVoiceListening(sessionId)
      return
    }
    voiceBusyRef.current = true
    setVoiceBusy(true)
    setVoiceNotice('음성을 글로 바꾸고 있어요…')
    const controller = new AbortController()
    voiceRequestControllerRef.current = controller
    try {
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
      const form = new FormData()
      form.append('audio', blob, `voice.${blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm'}`)
      const response = await fetch('/api/speech-transcribe', { method: 'POST', body: form, signal: controller.signal })
      const payload = await response.json() as { text?: unknown; message?: string }
      if (!voiceSessionRef.current || sessionId !== voiceSessionIdRef.current) return
      if (response.status === 503) {
        setVoiceNotice('서버 음성 인식 설정이 없어 음성 대화를 시작할 수 없어요. 서버의 GROQ_API_KEY 설정을 확인해 주세요.')
        stopVoiceSession(false)
        return
      }
      if (response.status === 429) {
        setVoiceNotice(payload.message ?? '분당 음성 인식 한도에 도달했어요. 잠시 후 음성 대화를 다시 시작해 주세요.')
        stopVoiceSession(false)
        return
      }
      const transcript = response.ok ? parseTranscription(payload.text) : null
      if (!transcript) {
        setVoiceNotice(payload.message ?? '음성을 인식하지 못했어요. 다시 말씀해 주세요.')
        resumeVoiceListening(sessionId)
        return
      }
      await sendMessage(transcript, true, sessionId, controller.signal)
      if (voiceSessionRef.current && sessionId === voiceSessionIdRef.current && !speakingRef.current) resumeVoiceListening(sessionId)
    } catch {
      if (controller.signal.aborted) return
      if (voiceSessionRef.current && sessionId === voiceSessionIdRef.current) {
        setVoiceNotice('음성 요청을 완료하지 못했어요. 다시 말씀해 주세요.')
        resumeVoiceListening(sessionId)
      }
    } finally {
      if (voiceRequestControllerRef.current === controller) voiceRequestControllerRef.current = null
      voiceBusyRef.current = false
      setVoiceBusy(false)
      if (voiceSessionRef.current && sessionId === voiceSessionIdRef.current && !speakingRef.current) resumeVoiceListening(sessionId)
    }
  }

  async function startVoiceSession() {
    if (voiceSessionRef.current || voiceBusyRef.current || pendingRef.current) return
    if (!navigator.onLine) {
      setVoiceNotice('음성 대화는 인터넷 연결이 필요해요.')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined' || !('AudioContext' in window)) {
      setVoiceNotice('이 브라우저에서는 연속 음성 대화를 지원하지 않아요. 텍스트로 질문해 주세요.')
      return
    }
    setVoiceNotice('마이크 권한을 확인하고 있어요…')
    const startAttempt = ++voiceStartAttemptRef.current
    let stream: MediaStream | null = null
    let context: AudioContext | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      if (startAttempt !== voiceStartAttemptRef.current) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      context = new AudioContext()
      await context.resume()
      if (startAttempt !== voiceStartAttemptRef.current) {
        stream.getTracks().forEach(track => track.stop())
        void context.close()
        return
      }
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      context.createMediaStreamSource(stream).connect(analyser)
      const sessionId = voiceSessionIdRef.current + 1
      voiceSessionIdRef.current = sessionId
      voiceSessionRef.current = true
      streamRef.current = stream
      audioContextRef.current = context
      analyserRef.current = analyser
      speakRepliesRef.current = true
      setVoiceSession(true)
      setSpeakReplies(true)
      startRecordingTurn(sessionId)
    } catch {
      const isCurrentAttempt = startAttempt === voiceStartAttemptRef.current
      if (isCurrentAttempt && voiceSessionRef.current) stopVoiceSession(false)
      stream?.getTracks().forEach(track => track.stop())
      void context?.close()
      if (isCurrentAttempt) setVoiceNotice('마이크를 시작하지 못했어요. 권한과 브라우저 설정을 확인해 주세요.')
    }
  }

  function stopVoiceSession(showNotice = true) {
    voiceStartAttemptRef.current += 1
    voiceSessionRef.current = false
    voiceSessionIdRef.current += 1
    voiceRequestControllerRef.current?.abort()
    voiceRequestControllerRef.current = null
    if (voiceFrameRef.current !== null) window.cancelAnimationFrame(voiceFrameRef.current)
    voiceFrameRef.current = null
    if (resumeTimeoutRef.current !== null) window.clearTimeout(resumeTimeoutRef.current)
    resumeTimeoutRef.current = null
    if (recordingTimeoutRef.current !== null) window.clearTimeout(recordingTimeoutRef.current)
    recordingTimeoutRef.current = null
    const recorder = recorderRef.current
    if (recorder?.state === 'recording') {
      discardVoiceTurnRef.current = true
      recorder.stop()
    }
    recorderRef.current = null
    recordingRef.current = false
    setRecording(false)
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    analyserRef.current = null
    void audioContextRef.current?.close()
    audioContextRef.current = null
    window.speechSynthesis?.cancel()
    speakingRef.current = false
    setSpeaking(false)
    setVoiceSession(false)
    speakRepliesRef.current = false
    setSpeakReplies(false)
    if (showNotice) setVoiceNotice('음성 대화를 종료했어요.')
  }

  async function mutateProposal(card: Extract<AssistantCard, { type: 'proposal' }>, action: 'confirm' | 'cancel') {
    if (proposalActions[card.id]) return
    setProposalActions(previous => ({ ...previous, [card.id]: true }))
    setProposalNotices(previous => ({ ...previous, [card.id]: '' }))
    try {
      const response = await fetch(`/api/proposals/${card.id}/${action}`, { method: 'POST' })
      const payload = await response.json() as unknown
      const result = resolveProposalMutation(payload, action)
      if (!result.ok) {
        updateMessages(previous => previous.map(message => ({ ...message, cards: message.cards?.map(item => item.type === 'proposal' && item.id === card.id && result.state ? { ...item, state: result.state } : item) })))
        setProposalNotices(previous => ({ ...previous, [card.id]: result.message }))
        return
      }
      updateMessages(previous => previous.map(message => ({ ...message, cards: message.cards?.map(item => item.type === 'proposal' && item.id === card.id ? { ...item, state: result.state, ...(result.eventId ? { eventId: result.eventId } : {}) } : item) })))
      const actionLabel = card.action === 'delete' ? '일정 삭제' : card.action === 'update' ? '일정 변경' : '일정 등록'
      setProposalNotices(previous => ({ ...previous, [card.id]: action === 'cancel' ? '제안을 취소했어요. 기존 일정은 변경되지 않았어요.' : `${actionLabel}을 반영했어요.` }))
      if (action === 'confirm') await queryClient.invalidateQueries({ queryKey: eventQueryKeys.all(userId) })
    } catch {
      setProposalNotices(previous => ({ ...previous, [card.id]: '서버 응답을 확인하지 못했어요. 다시 눌러 현재 저장 상태를 확인해 주세요.' }))
    } finally {
      setProposalActions(previous => ({ ...previous, [card.id]: false }))
    }
  }

  async function recreateProposal(card: Extract<AssistantCard, { type: 'proposal' }>) {
    if (proposalActions[card.id]) return
    const requestId = proposalRetryIds[card.id] ?? crypto.randomUUID()
    setProposalRetryIds(previous => ({ ...previous, [card.id]: requestId }))
    setProposalActions(previous => ({ ...previous, [card.id]: true }))
    setProposalNotices(previous => ({ ...previous, [card.id]: '' }))
    try {
      const response = await fetch('/api/proposals/recreate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposalId: card.id, requestId }) })
      const payload = await response.json() as { conversationId?: string; version?: number; messages?: ChatMessage[]; status?: string; message?: string }
      if (!response.ok || !payload.conversationId || typeof payload.version !== 'number' || !payload.messages) {
        setProposalNotices(previous => ({ ...previous, [card.id]: payload.message ?? '새 등록 확인을 만들지 못했어요.' }))
        if (payload.status === 'already_registered' || payload.status === 'still_pending') await recentConversationQuery.refetch()
        return
      }
      queryClient.setQueryData<RecentConversationResponse>(assistantConversationQueryKeys.recent(userId), { conversation: { id: payload.conversationId, version: payload.version, messages: payload.messages } })
      setOptimisticTranscript(null)
      setProposalRetryIds(previous => { const next = { ...previous }; delete next[card.id]; return next })
      setCandidateSelection({ userId, candidateId: null })
    } catch {
      setProposalNotices(previous => ({ ...previous, [card.id]: '서버 응답을 확인하지 못했어요. 같은 버튼을 다시 눌러 상태를 확인해 주세요.' }))
    } finally {
      setProposalActions(previous => ({ ...previous, [card.id]: false }))
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendMessage(input)
  }

  return <>
    <aside id="assistant-live-panel" ref={panelRef} className={'assistant-live-panel' + (open ? ' is-open' : '')} aria-label="AI 일정 도우미">
      <div className="assistant-live-header"><span className="assistant-live-avatar" aria-hidden="true">✦</span><div><strong>틈새 AI 도우미</strong><small>{voiceSession ? '말이 끝나면 전송하고 답한 뒤 다시 들을게요' : '등록 전에 내용을 확인하고 직접 저장할 수 있어요'}</small></div><button type="button" className="assistant-live-close" aria-label="AI 도우미 닫기" onClick={closePanel}>×</button></div>
      <div className="assistant-live-messages" aria-live="polite">{recentConversationQuery.isPending ? <p className="assistant-live-history-status" role="status">최근 대화를 불러오는 중…</p> : recentConversationQuery.isError ? <p className="assistant-live-history-status" role="status">최근 대화를 불러오지 못했어요. <button type="button" onClick={() => void recentConversationQuery.refetch()}>다시 시도</button></p> : messages.map((message, index) => {
        const previousMessage = messages[index - 1]
        const showDateDivider = Boolean(message.createdAt && (!previousMessage?.createdAt || formatTranscriptDateKey(message.createdAt) !== formatTranscriptDateKey(previousMessage.createdAt)))
        return <Fragment key={message.createdAt + '-' + index}>{showDateDivider && <div className="assistant-live-date-divider"><span>{formatTranscriptDay(message.createdAt!)}</span></div>}<article className={'assistant-live-message is-' + message.role + (message.error ? ' is-error' : '')}><MessageBody message={message} />{message.answerSource === 'server_fallback' && <small className="assistant-live-fallback-note">서버 고정 안내 · AI 최종 문구는 생성되지 않았어요.</small>}{message.cards?.map((card, cardIndex) => <Card key={cardIndex} card={card} onChoose={candidateId => setCandidateSelection(current => ({ userId, candidateId: current.userId === userId && current.candidateId === candidateId ? null : candidateId }))} selectedCandidateId={selectedCandidateId} onProposalAction={(proposal, action) => void mutateProposal(proposal, action)} onProposalRetry={proposal => void recreateProposal(proposal)} proposalPending={card.type === 'proposal' && Boolean(proposalActions[card.id])} proposalNotice={card.type === 'proposal' ? proposalNotices[card.id] : undefined} />)}{message.createdAt && <time className="assistant-live-message-time" dateTime={message.createdAt}>{formatTranscriptTime(message.createdAt)}</time>}{/*
        개발 검증용 실행 기록: AI가 실제로 호출한 도구, 전달한 검색 조건, 결과 건수를 확인합니다.
        일반 사용자 화면에는 노출하지 않습니다. 필요하면 진단 타입과 표시 함수를 복원한 뒤 이 영역을 활성화하세요.
        {message.model || message.toolCalls?.length ? <details className="assistant-live-log"><summary>실행 기록 · 실제 호출 결과</summary>{message.model && <p>모델 {message.model} · {message.totalTokens ?? 0} tokens</p>}<ul>{message.toolCalls?.map((tool, toolIndex) => <li key={toolIndex}><div className="assistant-live-log-heading"><span>{tool.name}</span><small>{tool.status === 'success' ? '성공' : '실패'} · {tool.durationMs}ms</small></div><div className="assistant-live-log-details"><span>입력 · {toolInputLabel(tool)}</span><span>결과 · {toolOutputLabel(tool)}</span></div></li>)}</ul></details> : null}
      */}</article></Fragment>
      })}{pending && <p className="assistant-live-pending" role="status">일정 정보를 확인하고 있어요…</p>}<div ref={endRef} /></div>
      {voiceNotice && <p className="assistant-voice-notice" role="status">{voiceNotice}</p>}
      <form className="assistant-live-form" onSubmit={submit}>
        <label className="sr-only" htmlFor="assistant-live-input">일정 질문</label>
        <textarea id="assistant-live-input" ref={inputRef} value={input} onChange={event => setInput(event.target.value)} maxLength={1000} placeholder="예: 다음 주 월요일 오후 한 시간 비는 때 찾아줘" rows={2} disabled={pending || recentConversationQuery.isPending || recentConversationQuery.isError || voiceSession || voiceBusy} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} />
        <button type="button" className={'assistant-voice-button' + (recording ? ' is-recording' : voiceSession ? ' is-session-active' : '')} onClick={voiceSession ? () => stopVoiceSession() : () => void startVoiceSession()} disabled={!voiceSession && (pending || voiceBusy || recentConversationQuery.isPending || recentConversationQuery.isError)} aria-label={voiceSession ? '음성 대화 종료' : '음성 대화 시작'} title={voiceSession ? '음성 대화 종료' : '음성 대화 시작'}>{voiceSession ? <MicOff size={18} strokeWidth={2} aria-hidden="true" /> : <Mic size={18} strokeWidth={2} aria-hidden="true" />}</button>
        {speaking && <button type="button" className="assistant-voice-button" onClick={() => { window.speechSynthesis?.cancel(); speakingRef.current = false; setSpeaking(false); if (voiceSessionRef.current) resumeVoiceListening(voiceSessionIdRef.current) }} aria-label="음성 답변 중지" title="음성 답변 중지"><Square size={17} strokeWidth={2} aria-hidden="true" /></button>}
        <button type="button" className={'assistant-voice-button' + (speakReplies ? ' is-active' : '')} onClick={() => { const next = !speakReplies; speakRepliesRef.current = next; setSpeakReplies(next); if (!next) { window.speechSynthesis?.cancel(); speakingRef.current = false; setSpeaking(false); if (voiceSessionRef.current) resumeVoiceListening(voiceSessionIdRef.current) } }} aria-label={speakReplies ? '음성 답변 끄기' : '음성 답변 켜기'} title={speakReplies ? '음성 답변 끄기' : '음성 답변 켜기'}>{speakReplies ? <Volume2 size={18} strokeWidth={2} aria-hidden="true" /> : <VolumeX size={18} strokeWidth={2} aria-hidden="true" />}</button>
        <button type="submit" disabled={pending || recentConversationQuery.isPending || recentConversationQuery.isError || !input.trim()} aria-label="질문 보내기">{pending ? '…' : '↑'}</button>
      </form>
    </aside>
    <button type="button" className={'assistant-live-backdrop' + (open ? ' is-open' : '')} aria-label="AI 도우미 닫기" aria-hidden={!open} tabIndex={open ? 0 : -1} onClick={closePanel} />
    <button type="button" ref={launcherRef} className="assistant-live-launcher" aria-controls="assistant-live-panel" aria-expanded={open} onClick={() => { setOpen(true); window.setTimeout(() => inputRef.current?.focus(), 220) }}><Image src="/teumsaeAI.png" alt="" width={2172} height={724} /> AI에게 물어보기</button>
  </>
}
