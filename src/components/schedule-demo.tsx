'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { findSampleSlots, type SampleSlot } from '@/lib/sample-schedule'
import { monthGrid, shiftMonth } from '@/lib/calendar-grid'

type EventKind = 'teal' | 'coral' | 'lilac'
type SampleEvent = { id: string; date: string; start: string; end: string; title: string; kind: EventKind; note: string }
type PreviewMode = 'normal' | 'loading' | 'no-slots' | 'lookup-error' | 'save-error'
type CalendarView = 'week' | 'month'

const hours = Array.from({ length: 10 }, (_, index) => index + 9)
const weekdays = ['일', '월', '화', '수', '목', '금', '토']
const mondayFirstWeekdays = ['월', '화', '수', '목', '금', '토', '일']
const samplePrompt = '선택한 날 오후에 한 시간 비는 시간 찾아줘'

function dateFromISO(iso: string) {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function addDays(iso: string, days: number) {
  const date = dateFromISO(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function startOfWeek(iso: string) {
  return addDays(iso, -((dateFromISO(iso).getUTCDay() + 6) % 7))
}

function shortDate(iso: string) {
  const date = dateFromISO(iso)
  return (date.getUTCMonth() + 1) + '월 ' + date.getUTCDate() + '일'
}

function longDate(iso: string) {
  const date = dateFromISO(iso)
  return date.getUTCFullYear() + '년 ' + (date.getUTCMonth() + 1) + '월 ' + date.getUTCDate() + '일 (' + weekdays[date.getUTCDay()] + ')'
}

function minutes(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

function sampleEvents(today: string): SampleEvent[] {
  return [
    { id: 'event-1', date: addDays(today, -1), start: '09:30', end: '10:30', title: '주간 계획 정리', kind: 'lilac', note: '이번 주 우선순위 확인' },
    { id: 'event-2', date: today, start: '11:00', end: '12:00', title: '디자인 점검', kind: 'teal', note: '달력 화면 피드백' },
    { id: 'event-3', date: today, start: '13:00', end: '14:00', title: '점심 약속', kind: 'coral', note: '친구와 점심' },
    { id: 'event-4', date: addDays(today, 1), start: '10:00', end: '11:00', title: '포트폴리오 작업', kind: 'teal', note: '프로젝트 소개 정리' },
    { id: 'event-5', date: addDays(today, 1), start: '16:00', end: '17:00', title: '운동', kind: 'coral', note: '가볍게 몸 움직이기' },
    { id: 'event-6', date: addDays(today, 2), start: '13:00', end: '14:30', title: '프로젝트 리뷰', kind: 'lilac', note: '이번 주 진행 상황' },
    { id: 'event-7', date: addDays(today, 3), start: '15:00', end: '16:00', title: '스터디', kind: 'teal', note: '함께 공부하는 시간' }
  ]
}

export default function ScheduleDemo({ today }: { today: string }) {
  const firstDate = addDays(today, 1)
  const [events, setEvents] = useState<SampleEvent[]>(() => sampleEvents(today))
  const [selectedDate, setSelectedDate] = useState(firstDate)
  const [calendarView, setCalendarView] = useState<CalendarView>('week')
  const [candidateDate, setCandidateDate] = useState(firstDate)
  const [candidates, setCandidates] = useState<SampleSlot[]>(() => findSampleSlots(sampleEvents(today), firstDate))
  const [awaitingSearch, setAwaitingSearch] = useState(false)
  const [selectedCandidate, setSelectedCandidate] = useState<number | null>(1)
  const [prompt, setPrompt] = useState(samplePrompt)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('normal')
  const [isSearching, setIsSearching] = useState(false)
  const [message, setMessage] = useState('')
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const openButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const weekStart = startOfWeek(selectedDate)
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  const monthDays = monthGrid(selectedDate)
  const selectedMonth = selectedDate.slice(0, 7)
  const dayEvents = events.filter(event => event.date === selectedDate).sort((a, b) => a.start.localeCompare(b.start))
  const selectedSlot = selectedCandidate === null ? null : candidates[selectedCandidate]
  const displayMode = isSearching ? 'loading' : previewMode

  useEffect(() => {
    if (!isPanelOpen) return
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsPanelOpen(false)
        openButtonRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [isPanelOpen])

  function selectDate(date: string) {
    setSelectedDate(date)
    setMessage('')
    if (date !== candidateDate) {
      setCandidateDate(date)
      setCandidates([])
      setSelectedCandidate(null)
      setAwaitingSearch(true)
    }
  }

  function trapPanelFocus(event: React.KeyboardEvent<HTMLElement>) {
    if (!isPanelOpen || event.key !== 'Tab') return
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select')
    if (!focusable?.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function moveCalendar(offset: number) {
    selectDate(calendarView === 'week' ? addDays(weekStart, offset * 7) : shiftMonth(selectedDate, offset))
  }

  function goToday() {
    selectDate(today)
  }

  function openPanel() {
    setIsPanelOpen(true)
    window.setTimeout(() => inputRef.current?.focus(), 50)
  }

  function closePanel() {
    setIsPanelOpen(false)
    openButtonRef.current?.focus()
  }

  function searchSample(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSearching) return
    if (prompt.trim() !== samplePrompt) {
      setMessage('현재는 예시 문장만 실행할 수 있어요. 아래 예시를 눌러주세요.')
      return
    }
    setMessage('')
    setSelectedCandidate(null)
    setIsSearching(true)
    window.setTimeout(() => {
      setCandidateDate(selectedDate)
      setCandidates(findSampleSlots(events, selectedDate))
      setAwaitingSearch(false)
      setIsSearching(false)
    }, 500)
  }

  function confirmSample() {
    if (!selectedSlot) return
    if (previewMode === 'save-error') {
      setMessage('샘플 저장 실패 상태입니다. 후보와 확인 카드는 그대로 유지됩니다.')
      return
    }
    const event: SampleEvent = {
      id: 'sample-' + Date.now(),
      date: candidateDate,
      start: selectedSlot.start,
      end: selectedSlot.end,
      title: '집중 작업 시간',
      kind: 'teal',
      note: '샘플 화면에만 추가된 일정'
    }
    setEvents(current => [...current, event])
    setSelectedDate(candidateDate)
    setSelectedCandidate(null)
    setCandidates([])
    setAwaitingSearch(true)
    setMessage('샘플 일정이 화면에 추가됐어요. DB에는 저장되지 않으며 새로고침하면 초기화됩니다.')
  }

  return (
    <main className="app-shell">
      <header className="site-header">
        <div className="brand" aria-label="틈새">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>틈새<span className="brand-latin">TEUMSAE</span></span>
        </div>
        <div className="header-right">
          <span className="demo-pill"><span className="status-dot" /> 샘플 데이터</span>
          <span className="header-note">Asia/Seoul 기준</span>
        </div>
      </header>

      <div className="content-wrap">
        <section className="page-intro" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">YOUR TIME, WITH ROOM TO BREATHE</p>
            <h1 id="page-title">일정 사이, 나만의 <em>틈새</em>를 찾다.</h1>
            <p className="intro-copy">일정을 살펴보고, 여유로운 시간을 골라보세요. 지금은 흐름을 체험하는 샘플 화면입니다.</p>
          </div>
          <div className="intro-badge"><span aria-hidden="true">✦</span><span>일정 속 빈 시간을<br /><strong>함께 찾아볼까요?</strong></span></div>
        </section>

        <div className="workspace-grid">
          <div className="schedule-column">
            <section className="calendar-card" aria-labelledby="calendar-title">
              <div className="calendar-toolbar">
                <div><p className="section-kicker">MY CALENDAR</p><h2 id="calendar-title">나의 일정</h2></div>
                <div className="calendar-controls">
                  <div className="view-switch" role="group" aria-label="달력 보기">
                    <button className={calendarView === 'week' ? 'is-active' : ''} onClick={() => setCalendarView('week')} aria-pressed={calendarView === 'week'}>주간</button>
                    <button className={calendarView === 'month' ? 'is-active' : ''} onClick={() => setCalendarView('month')} aria-pressed={calendarView === 'month'}>월간</button>
                  </div>
                  <button className="today-button" onClick={goToday}>오늘</button>
                  <button className="icon-button" onClick={() => moveCalendar(-1)} aria-label={calendarView === 'week' ? '이전 주' : '이전 달'}>‹</button>
                  <button className="icon-button" onClick={() => moveCalendar(1)} aria-label={calendarView === 'week' ? '다음 주' : '다음 달'}>›</button>
                </div>
              </div>
              <div className="week-caption"><strong>{calendarView === 'week' ? shortDate(weekStart) + ' – ' + shortDate(addDays(weekStart, 6)) : selectedDate.slice(0, 4) + '년 ' + Number(selectedDate.slice(5, 7)) + '월'}</strong><span>날짜를 선택하면 하루를 자세히 볼 수 있어요</span></div>
              {calendarView === 'week' ? <><div className="calendar-desktop">
                <div className="calendar-head">
                  <span className="time-head">GMT+9</span>
                  {days.map(date => {
                    const day = dateFromISO(date)
                    return <button key={date} className={'day-head' + (date === selectedDate ? ' is-selected' : '') + (date === today ? ' is-today' : '')} onClick={() => selectDate(date)} aria-pressed={date === selectedDate}>
                      <span>{weekdays[day.getUTCDay()]}</span><strong>{day.getUTCDate()}</strong>
                    </button>
                  })}
                </div>
                <div className="calendar-body">
                  <div className="time-gutter">{hours.map(hour => <span key={hour} style={{ top: (hour - 9) * 56 }}>{String(hour).padStart(2, '0')}:00</span>)}</div>
                  {days.map(date => <div key={date} className={'day-track' + (date === selectedDate ? ' is-selected' : '')}>
                    {events.filter(event => event.date === date).map(event => <button key={event.id} className={'event-block event-' + event.kind} style={{ top: (minutes(event.start) - 540) / 60 * 56 + 3, height: Math.max((minutes(event.end) - minutes(event.start)) / 60 * 56 - 6, 42) }} onClick={() => selectDate(date)} title={event.title + ' · ' + event.start + '–' + event.end}>
                      <strong>{event.title}</strong><span>{event.start}–{event.end}</span>
                    </button>)}
                    {date === candidateDate && selectedSlot && displayMode === 'normal' && <div className="candidate-preview" style={{ top: (minutes(selectedSlot.start) - 540) / 60 * 56 + 3, height: 50 }}><span>✦ 선택한 틈새</span><strong>{selectedSlot.start}–{selectedSlot.end}</strong></div>}
                  </div>)}
                </div>
              </div>
              <div className="mobile-week-strip" aria-label="날짜 선택">
                {days.map(date => {
                  const day = dateFromISO(date)
                  const count = events.filter(event => event.date === date).length
                  return <button key={date} className={'mobile-day' + (date === selectedDate ? ' is-selected' : '')} onClick={() => selectDate(date)} aria-pressed={date === selectedDate}>
                    <span>{weekdays[day.getUTCDay()]}</span><strong>{day.getUTCDate()}</strong><i className={count ? 'has-events' : ''} />
                  </button>
                })}
              </div>
              </> : <div className="month-view" aria-label="월간 달력">
                <div className="month-weekdays">{mondayFirstWeekdays.map(day => <span key={day}>{day}</span>)}</div>
                <div className="month-grid">{monthDays.map(date => {
                  const dateEvents = events.filter(event => event.date === date)
                  const isOutside = date.slice(0, 7) !== selectedMonth
                  const hasCandidate = date === candidateDate && selectedSlot && displayMode === 'normal'
                  return <button key={date} className={'month-day' + (isOutside ? ' is-outside' : '') + (date === selectedDate ? ' is-selected' : '') + (date === today ? ' is-today' : '') + (hasCandidate ? ' has-candidate' : '')} onClick={() => selectDate(date)} aria-label={longDate(date) + ', 일정 ' + dateEvents.length + '개'} aria-pressed={date === selectedDate}>
                    <span className="month-date">{dateFromISO(date).getUTCDate()}</span>
                    <span className="month-event-list">{dateEvents.slice(0, 2).map(event => <span key={event.id} className={'month-event month-event-' + event.kind}>{event.title}</span>)}{dateEvents.length > 2 && <span className="month-more">+{dateEvents.length - 2}개 더</span>}</span>
                    <span className="month-mobile-markers" aria-hidden="true">{dateEvents.slice(0, 3).map(event => <i key={event.id} className={'month-marker-' + event.kind} />)}{dateEvents.length > 3 && <small>+{dateEvents.length - 3}</small>}</span>
                  </button>
                })}</div>
              </div>}
              <div className="calendar-foot"><span className="legend-dot legend-teal" /> 일정 <span className="legend-dot legend-coral" /> 개인 시간 <span className="legend-outline" /> 선택한 빈 시간</div>
            </section>

            <section className="day-card" aria-labelledby="day-title">
              <div className="day-heading"><div><p className="section-kicker">DAY AT A GLANCE</p><h2 id="day-title">{longDate(selectedDate)}</h2></div><span className="event-count">일정 {dayEvents.length}개</span></div>
              {dayEvents.length ? <ol className="event-list">{dayEvents.map(event => <li key={event.id} className="event-row">
                <div className="event-time"><strong>{event.start}</strong><span>{event.end}</span></div>
                <span className={'event-rail event-rail-' + event.kind} />
                <div className="event-detail"><strong>{event.title}</strong><span>{event.note}</span></div>
                {event.id.startsWith('sample-') && <span className="new-tag">방금 추가</span>}
              </li>)}</ol> : <div className="empty-day"><span className="empty-sun" aria-hidden="true">☀</span><strong>아직 일정이 없는 날이에요</strong><span>여유로운 하루를 즐기거나, 틈새에서 빈 시간을 찾아보세요.</span></div>}
            </section>
          </div>

          <aside ref={panelRef} onKeyDown={trapPanelFocus} className={'assistant-panel' + (isPanelOpen ? ' is-open' : '')} role="dialog" aria-modal={isPanelOpen ? 'true' : undefined} aria-label="틈새 샘플 대화">
            <div className="assistant-head">
              <div className="assistant-avatar" aria-hidden="true">✦</div>
              <div><strong>틈새에게 물어보기</strong><span>일정 사이의 가능성을 발견해요</span></div>
              <button className="panel-close" onClick={closePanel} aria-label="패널 닫기">×</button>
            </div>
            <div className="assistant-scroll">
              <div className="connection-note"><span className="status-dot" /> 샘플 대화 · 실제 AI 연결 전</div>
              <div className="chat-bubble bubble-user">{samplePrompt}</div>
              <div className="chat-bubble bubble-assistant"><span className="bubble-sparkle">✦</span><p><strong>{longDate(candidateDate)}</strong> {awaitingSearch ? '샘플 일정을 확인할 준비가 됐어요. 아래 예시 요청을 보내주세요.' : '일정을 살펴봤어요. 오후 1시간을 위한 샘플 후보를 골라보세요.'}</p></div>
              {displayMode === 'loading' ? <div className="state-card"><span className="loading-spinner" /><strong>빈 시간을 찾는 중...</strong><p>샘플 조회 상태를 보여주고 있어요.</p></div> : displayMode === 'lookup-error' ? <div className="state-card state-error"><span aria-hidden="true">!</span><strong>일정을 불러오지 못했어요</strong><p>조회 실패 상태의 예시입니다. 기존 일정은 그대로 유지돼요.</p><button onClick={() => setPreviewMode('normal')}>다시 보기</button></div> : displayMode === 'no-slots' ? <div className="state-card"><span aria-hidden="true">⌁</span><strong>조건에 맞는 시간이 없어요</strong><p>빈 시간 없음 상태를 미리 보고 있어요. 실제 샘플 일정 계산 결과와는 별개입니다.</p></div> : awaitingSearch ? <div className="state-card"><span aria-hidden="true">✦</span><strong>선택한 날의 빈 시간을 찾아볼까요?</strong><p>아래 예시 요청을 보내면 샘플 일정 기준으로 후보를 보여드려요.</p></div> : candidates.length === 0 ? <div className="state-card"><span aria-hidden="true">⌁</span><strong>조건에 맞는 시간이 없어요</strong><p>선택한 날짜의 오후에는 한 시간짜리 틈새가 없어요. 다른 날짜를 선택해 보세요.</p></div> : <>
                <div className="results-heading"><span>추천 빈 시간</span><span>{candidates.length}개 후보</span></div>
                <div className="candidate-list">{candidates.map((slot, index) => <button key={candidateDate + '-' + slot.start} className={'candidate-card' + (selectedCandidate === index ? ' is-selected' : '')} onClick={() => { setSelectedCandidate(index); setMessage('') }} aria-pressed={selectedCandidate === index}>
                  <span className="candidate-number">0{index + 1}</span><span className="candidate-text"><strong>{shortDate(candidateDate)} {slot.start}–{slot.end}</strong><small>1시간 · 등록된 샘플 일정 기준</small></span><span className="candidate-arrow">↗</span>
                </button>)}</div>
                {selectedSlot && <div className="confirm-card"><div className="confirm-top"><span className="confirm-icon">✓</span><strong>이 시간으로 등록할까요?</strong></div><div className="confirm-details"><span>일정</span><strong>집중 작업 시간</strong><span>날짜</span><strong>{longDate(candidateDate)}</strong><span>시간</span><strong>{selectedSlot.start} – {selectedSlot.end}</strong></div><button className="confirm-button" onClick={confirmSample}>샘플 일정 등록하기 <span>→</span></button><p>확인하면 이 화면에만 반영됩니다. DB에는 저장되지 않아요.</p></div>}
              </>}
              {message && <p className={'inline-message' + (message.startsWith('샘플 일정이') ? ' is-success' : '')} role="status">{message}</p>}
              <div className="preview-controls"><label htmlFor="preview-mode">화면 상태 미리보기</label><select id="preview-mode" value={previewMode} onChange={event => { setPreviewMode(event.target.value as PreviewMode); setMessage('') }}><option value="normal">기본 흐름</option><option value="loading">로딩</option><option value="no-slots">빈 시간 없음</option><option value="lookup-error">조회 실패</option><option value="save-error">저장 실패</option></select></div>
            </div>
            <div className="composer-area"><p>예시 요청을 선택하거나 그대로 보내보세요</p><button className="prompt-chip" onClick={() => { setPrompt(samplePrompt); inputRef.current?.focus() }}>✦ {samplePrompt}</button><form className="composer" onSubmit={searchSample}><input ref={inputRef} aria-label="샘플 요청 입력" value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="어떤 시간이 필요하세요?" /><button type="submit" aria-label="샘플 요청 보내기" disabled={isSearching}>↑</button></form><span className="composer-disclaimer">샘플 데모 · 실제 AI와 일정 저장 기능은 연결되지 않았습니다</span></div>
          </aside>
        </div>
      </div>
      {isPanelOpen && <button className="mobile-overlay" onClick={closePanel} aria-label="대화 패널 닫기" />}
      <button ref={openButtonRef} className="mobile-float" onClick={openPanel}><span className="float-sparkle">✦</span><span>틈새에게 물어보기</span><span className="float-arrow">↑</span></button>
    </main>
  )
}
