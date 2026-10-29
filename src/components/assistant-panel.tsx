'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { AssistantCard } from '@/lib/assistant-tools'

type ToolCallLog = { name: string; status: 'success' | 'failed'; durationMs: number }
type ChatMessage = { role: 'user' | 'assistant'; content: string; cards?: AssistantCard[]; toolCalls?: ToolCallLog[]; model?: string; totalTokens?: number; error?: boolean }
type ChatResponse = { response: string; conversationId: string; version: number; cards: AssistantCard[]; toolCalls: ToolCallLog[]; model: string; usage: { totalTokens: number } }
type ChatError = { code?: string; message?: string; response?: string; cards?: AssistantCard[]; toolCalls?: ToolCallLog[]; model?: string; usage?: { totalTokens: number } }

function dateLabel(date: string) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(date + 'T00:00:00.000Z'))
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function Card({ card, onChoose }: { card: AssistantCard; onChoose: (message: string) => void }) {
  if (card.type === 'events') return <section className="chat-result-card" aria-label="일정 조회 결과"><div className="chat-card-heading"><strong>일정 조회</strong><span>{dateLabel(card.startDate)}{card.endDate !== card.startDate ? ' – ' + dateLabel(card.endDate) : ''}</span></div>{card.events.length ? <ul className="chat-event-results">{card.events.map(event => <li key={event.id}><span>{timeLabel(event.starts_at)}–{timeLabel(event.ends_at)}</span><strong>{event.title}</strong>{event.note && <small>{event.note}</small>}</li>)}</ul> : <p className="chat-card-empty">조회한 기간에 등록된 일정이 없어요.</p>}</section>
  const result = card.result
  if (result.mode === 'candidates') return <section className="chat-result-card" aria-label="빈 시간 후보"><div className="chat-card-heading"><strong>빈 시간 후보</strong><span>{dateLabel(card.startDate)}{card.endDate !== card.startDate ? ' – ' + dateLabel(card.endDate) : ''}</span></div>{result.candidates.length ? <div className="chat-candidate-list">{result.candidates.map((candidate, index) => <button type="button" key={candidate.date + candidate.start} onClick={() => onChoose(`${index + 1}번째 후보를 선택했어요. 날짜와 시간을 다시 확인해줘.`)}><span>{index + 1}</span><strong>{dateLabel(candidate.date)}</strong><time>{candidate.start} – {candidate.end}</time></button>)}</div> : <p className="chat-card-empty">조건에 맞는 빈 시간이 없어요. 날짜나 시간을 바꿔 검색해 보세요.</p>}</section>
  return <section className="chat-result-card" aria-label="빈 시간 결과"><div className="chat-card-heading"><strong>빈 시간 확인</strong><span>{dateLabel(card.startDate)}{card.endDate !== card.startDate ? ' – ' + dateLabel(card.endDate) : ''}</span></div>{result.intervals.length ? <ul className="chat-event-results">{result.intervals.map(interval => <li key={interval.date + interval.start}><span>{dateLabel(interval.date)}</span><strong>{interval.start} – {interval.end}</strong></li>)}</ul> : <p className="chat-card-empty">조건에 맞는 빈 시간이 없어요. 날짜나 시간을 바꿔 검색해 보세요.</p>}</section>
}

export default function AssistantPanel() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', content: '일정을 조회하거나 빈 시간을 찾아볼 수 있어요. 실제 AI 요청은 서버에서 처리되며, 이번 단계에서는 일정 등록을 하지 않아요.' }])
  const [conversation, setConversation] = useState<{ id: string; version: number } | null>(null)
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)

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
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])

  async function sendMessage(message: string) {
    const trimmed = message.trim()
    if (!trimmed || pending) return
    setMessages(previous => [...previous, { role: 'user', content: trimmed }])
    setInput('')
    setPending(true)
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: trimmed, conversationId: conversation?.id ?? null, version: conversation?.version ?? null }) })
      const payload = await response.json() as ChatResponse & ChatError
      if (!response.ok) {
        setInput(trimmed)
        if (payload.code === 'CONVERSATION_EXPIRED' || payload.code === 'CONVERSATION_NOT_FOUND' || payload.code === 'CONVERSATION_CONFLICT') {
          setConversation(null)
          setMessages([{ role: 'assistant', content: '대화가 만료되었거나 다른 요청에서 변경되어 새 대화로 전환했어요. 이전 후보는 이어지지 않으니 질문을 다시 보내 주세요.' }])
          return
        }
        setMessages(previous => [...previous, { role: 'assistant', content: payload.response ? `${payload.message || '대화 상태를 저장하지 못했어요.'}\n\n${payload.response}` : payload.message || '요청을 처리하지 못했어요. 다시 시도해 주세요.', cards: payload.cards, toolCalls: payload.toolCalls, model: payload.model, totalTokens: payload.usage?.totalTokens, error: true }])
        return
      }
      setConversation({ id: payload.conversationId, version: payload.version })
      setMessages(previous => [...previous, { role: 'assistant', content: payload.response, cards: payload.cards, toolCalls: payload.toolCalls, model: payload.model, totalTokens: payload.usage.totalTokens }])
    } catch {
      setInput(trimmed)
      setMessages(previous => [...previous, { role: 'assistant', content: '서버와 연결하지 못했어요. 잠시 후 다시 시도해 주세요.', error: true }])
    } finally {
      setPending(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendMessage(input)
  }

  return <>
    <aside id="assistant-live-panel" className={'assistant-live-panel' + (open ? ' is-open' : '')} aria-label="AI 일정 도우미">
      <div className="assistant-live-header"><span className="assistant-live-avatar" aria-hidden="true">✦</span><div><strong>틈새 AI 도우미</strong><small>실제 일정 조회 · 등록은 아직 지원하지 않아요</small></div><button type="button" className="assistant-live-close" aria-label="AI 도우미 닫기" onClick={() => { setOpen(false); requestAnimationFrame(() => launcherRef.current?.focus()) }}>×</button></div>
      <div className="assistant-live-messages" aria-live="polite">{messages.map((message, index) => <article className={'assistant-live-message is-' + message.role + (message.error ? ' is-error' : '')} key={index}><p>{message.content}</p>{message.cards?.map((card, cardIndex) => <Card key={cardIndex} card={card} onChoose={choice => void sendMessage(choice)} />)}{message.model || message.toolCalls?.length ? <details className="assistant-live-log"><summary>실행 기록 · 실제 호출 결과</summary>{message.model && <p>모델 {message.model} · {message.totalTokens ?? 0} tokens</p>}<ul>{message.toolCalls?.map((tool, toolIndex) => <li key={toolIndex}><span>{tool.name}</span><small>{tool.status === 'success' ? '성공' : '실패'} · {tool.durationMs}ms</small></li>)}</ul></details> : null}</article>)}{pending && <p className="assistant-live-pending" role="status">일정 정보를 확인하고 있어요…</p>}<div ref={endRef} /></div>
      <form className="assistant-live-form" onSubmit={submit}><label className="sr-only" htmlFor="assistant-live-input">일정 질문</label><textarea id="assistant-live-input" ref={inputRef} value={input} onChange={event => setInput(event.target.value)} maxLength={1000} placeholder="예: 다음 주 월요일 오후 한 시간 비는 때 찾아줘" rows={2} disabled={pending} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} /><button type="submit" disabled={pending || !input.trim()} aria-label="질문 보내기">{pending ? '…' : '↑'}</button></form>
    </aside>
    <button type="button" ref={launcherRef} className="assistant-live-launcher" aria-controls="assistant-live-panel" aria-expanded={open} onClick={() => { setOpen(true); window.setTimeout(() => inputRef.current?.focus(), 150) }}><span aria-hidden="true">✦</span> AI에게 물어보기</button>
  </>
}
