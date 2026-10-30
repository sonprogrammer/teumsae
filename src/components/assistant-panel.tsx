'use client'

import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react'
import Image from 'next/image'
import ReactMarkdown from 'react-markdown'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { eventQueryKeys } from '@/lib/event-query-keys'
import { resolveProposalMutation, type EventProposalState } from '@/lib/event-proposals'
import type { AssistantCard } from '@/lib/assistant-tools'
import { assistantConversationQueryKeys, formatTranscriptDateKey, formatTranscriptDay, formatTranscriptTime, type AssistantTranscriptMessage } from '@/lib/assistant-transcript'

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
    const canAct = card.state === 'pending' && !proposalPending
    const canRetry = ['cancelled', 'expired', 'conflict', 'stale'].includes(card.state)
    return <section className={'chat-result-card chat-proposal-card is-' + card.state} aria-label="일정 등록 확인"><div className="chat-card-heading"><strong>일정 등록 확인</strong><span>{proposalStateLabels[card.state]}</span></div><div className="chat-proposal-details"><strong>{card.title}</strong>{card.note && <p>{card.note}</p>}<time>{starts.date} · {starts.time}–{ends.time}</time></div>{card.state === 'pending' && <p className="chat-card-empty">아직 저장되지 않았어요. 아래 확인 버튼을 눌러야 실제 일정이 돼요.</p>}{card.state === 'confirmed' && <p className="chat-proposal-confirmed" role="status">실제 일정에 추가됐어요.</p>}{canRetry && <><p className="chat-card-empty">이 제안은 실제 일정에 등록되지 않았어요.</p><button type="button" className="chat-proposal-retry" disabled={proposalPending} onClick={() => onProposalRetry(card)}>{proposalPending ? '새 확인을 준비 중…' : '이 내용으로 다시 제안'}</button></>}{card.state === 'missing' && <p className="chat-proposal-notice" role="status">등록 상태를 확인할 수 없어요. 달력에서 일정을 확인해 주세요.</p>}{proposalNotice && <p className="chat-proposal-notice" role="status">{proposalNotice}</p>}{card.state === 'pending' && <div className="chat-proposal-actions"><button type="button" className="chat-proposal-cancel" disabled={!canAct} onClick={() => onProposalAction(card, 'cancel')}>취소</button><button type="button" className="chat-proposal-confirm" disabled={!canAct} onClick={() => onProposalAction(card, 'confirm')}>{proposalPending ? '처리 중…' : '이 일정으로 등록'}</button></div>}</section>
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
  const retryRequest = useRef<{ message: string; selectedCandidateId: string | null; id: string } | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const conversation = recentConversationQuery.data?.conversation ?? null
  const messages = optimisticTranscript?.userId === userId ? optimisticTranscript.messages : conversation?.messages.length ? conversation.messages : assistantGreetingMessages
  const selectedCandidateId = candidateSelection.userId === userId ? candidateSelection.candidateId : null

  function updateMessages(updater: (previous: ChatMessage[]) => ChatMessage[]) {
    setOptimisticTranscript(current => current?.userId === userId ? { userId, messages: updater(current.messages) } : current)
    queryClient.setQueryData<RecentConversationResponse>(assistantConversationQueryKeys.recent(userId), current => current?.conversation ? { conversation: { ...current.conversation, messages: updater(current.conversation.messages) } } : current)
  }

  function closePanel() {
    setOpen(false)
    requestAnimationFrame(() => launcherRef.current?.focus())
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, pending])

  useEffect(() => {
    if (!open) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        requestAnimationFrame(() => launcherRef.current?.focus())
      }
    }
    function closeOnOutsideClick(event: PointerEvent) {
      const target = event.target
      if (target instanceof Node && !panelRef.current?.contains(target) && !launcherRef.current?.contains(target)) {
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

  async function sendMessage(message: string) {
    const trimmed = message.trim()
    if (!trimmed || pending || recentConversationQuery.isPending || recentConversationQuery.isError) return
    const requestId = retryRequest.current?.message === trimmed && retryRequest.current.selectedCandidateId === selectedCandidateId ? retryRequest.current.id : crypto.randomUUID()
    retryRequest.current = { message: trimmed, selectedCandidateId, id: requestId }
    const messagesWithUserTurn = [...messages, { role: 'user' as const, content: trimmed, createdAt: new Date().toISOString() }]
    setOptimisticTranscript({ userId, messages: messagesWithUserTurn })
    setInput('')
    setPending(true)
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: trimmed, conversationId: conversation?.id ?? null, version: conversation?.version ?? null, requestId, ...(selectedCandidateId ? { selectedCandidateId } : {}) }) })
      const payload = await response.json() as ChatResponse & ChatError
      if (!response.ok) {
        setInput(trimmed)
        if (payload.conversationId && typeof payload.version === 'number') queryClient.setQueryData<RecentConversationResponse>(assistantConversationQueryKeys.recent(userId), current => ({ conversation: { id: payload.conversationId!, version: payload.version!, messages: current?.conversation?.messages ?? [] } }))
        if (payload.code === 'CONVERSATION_EXPIRED' || payload.code === 'CONVERSATION_NOT_FOUND' || payload.code === 'CONVERSATION_CONFLICT') {
          queryClient.setQueryData<RecentConversationResponse>(assistantConversationQueryKeys.recent(userId), { conversation: null })
          setCandidateSelection({ userId, candidateId: null })
          setOptimisticTranscript({ userId, messages: [...messagesWithUserTurn, { role: 'assistant', content: '대화가 만료되었거나 다른 요청에서 변경되어 새 대화로 전환했어요. 이전 후보는 이어지지 않으니 질문을 다시 보내 주세요.', createdAt: new Date().toISOString() }] })
          return
        }
        if (payload.code === 'CANDIDATE_NOT_FOUND' || payload.code === 'CANDIDATE_EXPIRED' || payload.code === 'STALE_AVAILABILITY') setCandidateSelection({ userId, candidateId: null })
        setOptimisticTranscript({ userId, messages: [...messagesWithUserTurn, { role: 'assistant', content: payload.response ? `${payload.message || '대화 상태를 저장하지 못했어요.'}\n\n${payload.response}` : payload.message || '요청을 처리하지 못했어요. 다시 시도해 주세요.', cards: payload.cards, error: true, createdAt: new Date().toISOString() }] })
        return
      }
      retryRequest.current = null
      queryClient.setQueryData<RecentConversationResponse>(assistantConversationQueryKeys.recent(userId), { conversation: { id: payload.conversationId, version: payload.version, messages: payload.messages } })
      setOptimisticTranscript(null)
      if (payload.cards.length) setCandidateSelection({ userId, candidateId: null })
    } catch {
      setInput(trimmed)
      setOptimisticTranscript({ userId, messages: [...messagesWithUserTurn, { role: 'assistant', content: '서버와 연결하지 못했어요. 잠시 후 다시 시도해 주세요.', error: true, createdAt: new Date().toISOString() }] })
    } finally {
      setPending(false)
    }
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
      setProposalNotices(previous => ({ ...previous, [card.id]: result.message }))
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
      <div className="assistant-live-header"><span className="assistant-live-avatar" aria-hidden="true">✦</span><div><strong>틈새 AI 도우미</strong><small>등록 전에 내용을 확인하고 직접 저장할 수 있어요</small></div><button type="button" className="assistant-live-close" aria-label="AI 도우미 닫기" onClick={closePanel}>×</button></div>
      <div className="assistant-live-messages" aria-live="polite">{recentConversationQuery.isPending ? <p className="assistant-live-history-status" role="status">최근 대화를 불러오는 중…</p> : recentConversationQuery.isError ? <p className="assistant-live-history-status" role="status">최근 대화를 불러오지 못했어요. <button type="button" onClick={() => void recentConversationQuery.refetch()}>다시 시도</button></p> : messages.map((message, index) => {
        const previousMessage = messages[index - 1]
        const showDateDivider = Boolean(message.createdAt && (!previousMessage?.createdAt || formatTranscriptDateKey(message.createdAt) !== formatTranscriptDateKey(previousMessage.createdAt)))
        return <Fragment key={message.createdAt + '-' + index}>{showDateDivider && <div className="assistant-live-date-divider"><span>{formatTranscriptDay(message.createdAt!)}</span></div>}<article className={'assistant-live-message is-' + message.role + (message.error ? ' is-error' : '')}><MessageBody message={message} />{message.answerSource === 'server_fallback' && <small className="assistant-live-fallback-note">서버 고정 안내 · AI 최종 문구는 생성되지 않았어요.</small>}{message.cards?.map((card, cardIndex) => <Card key={cardIndex} card={card} onChoose={candidateId => setCandidateSelection(current => ({ userId, candidateId: current.userId === userId && current.candidateId === candidateId ? null : candidateId }))} selectedCandidateId={selectedCandidateId} onProposalAction={(proposal, action) => void mutateProposal(proposal, action)} onProposalRetry={proposal => void recreateProposal(proposal)} proposalPending={card.type === 'proposal' && Boolean(proposalActions[card.id])} proposalNotice={card.type === 'proposal' ? proposalNotices[card.id] : undefined} />)}{message.createdAt && <time className="assistant-live-message-time" dateTime={message.createdAt}>{formatTranscriptTime(message.createdAt)}</time>}{/*
        개발 검증용 실행 기록: AI가 실제로 호출한 도구, 전달한 검색 조건, 결과 건수를 확인합니다.
        일반 사용자 화면에는 노출하지 않습니다. 필요하면 진단 타입과 표시 함수를 복원한 뒤 이 영역을 활성화하세요.
        {message.model || message.toolCalls?.length ? <details className="assistant-live-log"><summary>실행 기록 · 실제 호출 결과</summary>{message.model && <p>모델 {message.model} · {message.totalTokens ?? 0} tokens</p>}<ul>{message.toolCalls?.map((tool, toolIndex) => <li key={toolIndex}><div className="assistant-live-log-heading"><span>{tool.name}</span><small>{tool.status === 'success' ? '성공' : '실패'} · {tool.durationMs}ms</small></div><div className="assistant-live-log-details"><span>입력 · {toolInputLabel(tool)}</span><span>결과 · {toolOutputLabel(tool)}</span></div></li>)}</ul></details> : null}
      */}</article></Fragment>
      })}{pending && <p className="assistant-live-pending" role="status">일정 정보를 확인하고 있어요…</p>}<div ref={endRef} /></div>
      <form className="assistant-live-form" onSubmit={submit}><label className="sr-only" htmlFor="assistant-live-input">일정 질문</label><textarea id="assistant-live-input" ref={inputRef} value={input} onChange={event => setInput(event.target.value)} maxLength={1000} placeholder="예: 다음 주 월요일 오후 한 시간 비는 때 찾아줘" rows={2} disabled={pending || recentConversationQuery.isPending || recentConversationQuery.isError} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} /><button type="submit" disabled={pending || recentConversationQuery.isPending || recentConversationQuery.isError || !input.trim()} aria-label="질문 보내기">{pending ? '…' : '↑'}</button></form>
    </aside>
    <button type="button" className={'assistant-live-backdrop' + (open ? ' is-open' : '')} aria-label="AI 도우미 닫기" aria-hidden={!open} tabIndex={open ? 0 : -1} onClick={closePanel} />
    <button type="button" ref={launcherRef} className="assistant-live-launcher" aria-controls="assistant-live-panel" aria-expanded={open} onClick={() => { setOpen(true); window.setTimeout(() => inputRef.current?.focus(), 220) }}><Image src="/teumsaeAI.png" alt="" width={2172} height={724} /> AI에게 물어보기</button>
  </>
}
