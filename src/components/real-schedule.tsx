'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useActionState, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createEventAction, deleteEventAction, updateEventAction } from '@/app/schedule/actions'
import type { EventActionState, EventView } from '@/lib/events'
import { eventQueryKeys } from '@/lib/event-query-keys'
import { fetchEvents } from '@/lib/events-query'
import { toggleSchedulePicker, type ActiveSchedulePicker, type SchedulePicker } from '@/lib/schedule-picker-state'
import { defaultEndTime, defaultEventTimes, endTimeOptions, monthGrid, shiftMonth, startTimeOptions, visibleCalendarDates, type CalendarView } from '@/lib/calendar-grid'
import SignOutButton from '@/components/sign-out-button'
import { useScheduleUiStore } from '@/stores/schedule-ui-store'
import AssistantPanel from '@/components/assistant-panel'
import { readScheduleCache, saveScheduleCache } from '@/lib/schedule-offline-cache.mjs'

const initialActionState: EventActionState = { status: 'idle', message: '' }
const weekdays = ['월', '화', '수', '목', '금', '토', '일']

function browserScheduleCache(userId: string, from: string, to: string) {
  if (typeof window === 'undefined') return null
  try { return readScheduleCache(window.localStorage, userId, from, to) } catch { return null }
}

function addDays(date: string, amount: number) {
  const value = new Date(date + 'T00:00:00.000Z')
  value.setUTCDate(value.getUTCDate() + amount)
  return value.toISOString().slice(0, 10)
}

function koreanDate(date: string, options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' }) {
  return new Intl.DateTimeFormat('ko-KR', { ...options, timeZone: 'UTC' }).format(new Date(date + 'T00:00:00.000Z'))
}

function koreaDateKey(value: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(value))
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return fields.year + '-' + fields.month + '-' + fields.day
}

function localDateTime(value: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(value))
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return fields.year + '-' + fields.month + '-' + fields.day + 'T' + fields.hour + ':' + fields.minute
}

function eventTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value))
}

function periodLabel(dates: string[], view: CalendarView) {
  if (view === 'month') return koreanDate(dates[Math.floor(dates.length / 2)], { year: 'numeric', month: 'long' })
  return koreanDate(dates[0]) + ' – ' + koreanDate(dates[dates.length - 1], { month: 'long', day: 'numeric', year: 'numeric' })
}

function localDate(value: string) {
  return value.slice(0, 10)
}

function localTime(value: string) {
  return value.slice(11, 16)
}

function displayDate(value: string) {
  return koreanDate(value, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
}

function EventDatePicker({ value, today, onChange, invalid, open, setActivePicker }: { value: string; today: string; onChange: (date: string) => void; invalid: boolean; open: boolean; setActivePicker: Dispatch<SetStateAction<ActiveSchedulePicker>> }) {
  const [month, setMonth] = useState(value)
  const trigger = useRef<HTMLButtonElement>(null)
  const dates = monthGrid(month)

  useEffect(() => {
    if (!open) return
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setActivePicker(null)
      trigger.current?.focus()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [open, setActivePicker])

  function showPicker() {
    if (open) {
      setActivePicker(null)
      trigger.current?.focus()
      return
    }
    setMonth(value)
    setActivePicker(current => toggleSchedulePicker(current, 'date'))
  }

  function closePicker() {
    setActivePicker(null)
    trigger.current?.focus()
  }

  function chooseDate(date: string) {
    onChange(date)
    setActivePicker(null)
    trigger.current?.focus()
  }

  return <div className="real-date-field">
    <span className="real-control-label">날짜</span>
    <button ref={trigger} type="button" className="real-date-trigger" aria-label={'날짜 선택, ' + displayDate(value)} aria-haspopup="dialog" aria-expanded={open} data-invalid={invalid ? 'true' : undefined} onClick={showPicker}>
      <span className="real-date-icon" aria-hidden="true">▦</span><span className="real-date-trigger-value"><strong>{displayDate(value)}</strong><small>날짜 변경</small></span><span className="real-date-chevron" aria-hidden="true">⌄</span>
    </button>
    {open && <div className="real-date-popover" role="dialog" aria-label="날짜 선택">
      <div className="real-date-popover-heading"><button type="button" aria-label="이전 달" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button><strong>{koreanDate(month, { year: 'numeric', month: 'long' })}</strong><button type="button" aria-label="다음 달" onClick={() => setMonth(shiftMonth(month, 1))}>›</button><button className="real-picker-close" type="button" aria-label="날짜 선택 닫기" onClick={closePicker}>×</button></div>
      <div className="real-date-grid">
        {weekdays.map(day => <span className="real-date-weekday" key={day}>{day}</span>)}
        {dates.map(date => <button type="button" key={date} className={'real-date-day' + (date.slice(0, 7) !== month.slice(0, 7) ? ' is-outside' : '') + (date === value ? ' is-selected' : '') + (date === today ? ' is-today' : '')} aria-label={displayDate(date)} aria-pressed={date === value} onClick={() => chooseDate(date)}>{Number(date.slice(-2))}</button>)}
      </div>
      <button type="button" className="real-date-today" onClick={() => chooseDate(today)}>오늘 날짜 선택</button>
    </div>}
  </div>
}

function EventTimePicker({ label, value, options, invalid, align, picker, open, setActivePicker, onChange }: { label: string; value: string; options: string[]; invalid: boolean; align: 'left' | 'right'; picker: Exclude<SchedulePicker, 'date'>; open: boolean; setActivePicker: Dispatch<SetStateAction<ActiveSchedulePicker>>; onChange: (value: string) => void }) {
  const [hour, setHour] = useState(value.slice(0, 2))
  const trigger = useRef<HTMLButtonElement>(null)
  const hours = Array.from(new Set(options.map(time => time.slice(0, 2))))
  const minutes = options.filter(time => time.slice(0, 2) === hour).map(time => time.slice(3))

  useEffect(() => {
    if (!open) return
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setActivePicker(null)
      trigger.current?.focus()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [open, setActivePicker])

  function showPicker() {
    if (open) {
      setActivePicker(null)
      trigger.current?.focus()
      return
    }
    setHour(value.slice(0, 2))
    setActivePicker(current => toggleSchedulePicker(current, picker))
  }

  function closePicker() {
    setActivePicker(null)
    trigger.current?.focus()
  }

  function chooseMinute(minute: string) {
    onChange(hour + ':' + minute)
    setActivePicker(null)
    trigger.current?.focus()
  }

  return <div className={'real-time-field is-' + align}>
    <span className="real-control-label">{label}<small>15분 단위</small></span>
    <button ref={trigger} type="button" className="real-time-trigger" aria-label={label + ' 선택, ' + value} aria-haspopup="dialog" aria-expanded={open} data-invalid={invalid ? 'true' : undefined} onClick={showPicker}>
      <span>{value}</span><small>시간 변경</small><span className="real-time-chevron" aria-hidden="true">⌄</span>
    </button>
    {open && <div className="real-time-popover" role="dialog" aria-label={label + ' 선택'}>
      <div className="real-time-popover-heading"><strong>{label} 선택</strong><button className="real-picker-close" type="button" aria-label={label + ' 선택 닫기'} onClick={closePicker}>×</button></div>
      <div className="real-time-popover-section"><span>시</span><div className="real-time-hour-grid">{hours.map(option => <button type="button" key={option} className={hour === option ? 'is-selected' : ''} aria-pressed={hour === option} onClick={() => setHour(option)}>{option}</button>)}</div></div>
      <div className="real-time-popover-section"><span>분</span><div className="real-time-minute-grid">{minutes.map(minute => <button type="button" key={minute} className={value.slice(3) === minute && hour === value.slice(0, 2) ? 'is-selected' : ''} aria-pressed={value.slice(3) === minute && hour === value.slice(0, 2)} onClick={() => chooseMinute(minute)}>{minute}</button>)}</div></div>
    </div>}
  </div>
}

function EventForm({ event, selectedDate, today, userId, onCancel }: { event: EventView | null; selectedDate: string; today: string; userId: string; onCancel: () => void }) {
  const queryClient = useQueryClient()
  const [state, formAction, pending] = useActionState(event ? updateEventAction : createEventAction, initialActionState)
  const fallback = defaultEventTimes(selectedDate)
  const [title, setTitle] = useState(event?.title ?? '')
  const [note, setNote] = useState(event?.note ?? '')
  const [activePicker, setActivePicker] = useState<ActiveSchedulePicker>(null)
  const initialStartsAt = event ? localDateTime(event.starts_at) : fallback.startsAt
  const initialEndsAt = event ? localDateTime(event.ends_at) : fallback.endsAt
  const [date, setDate] = useState(localDate(initialStartsAt))
  const [startTime, setStartTime] = useState(localTime(initialStartsAt))
  const [endTime, setEndTime] = useState(localTime(initialEndsAt))
  const startOptions = startTimeOptions()
  const endOptions = endTimeOptions(startTime)
  const startsAt = date + 'T' + startTime
  const endsAt = date + 'T' + endTime

  function changeStartTime(value: string) {
    setStartTime(value)
    if (!endTimeOptions(value).includes(endTime)) setEndTime(defaultEndTime(value))
  }

  useEffect(() => {
    if (state.status !== 'success') return
    void queryClient.invalidateQueries({ queryKey: eventQueryKeys.all(userId) })
    onCancel()
  }, [onCancel, queryClient, state.status, userId])

  return <form className="real-event-form" action={formAction}>
    <div className="real-form-heading"><div><p className="section-kicker">{event ? 'EDIT EVENT' : 'NEW EVENT'}</p><h3>{event ? '일정 수정' : '새 일정 등록'}</h3></div><button className="real-icon-button" type="button" onClick={onCancel} aria-label="닫기">×</button></div>
    {event && <><input type="hidden" name="id" value={event.id} /><input type="hidden" name="version" value={event.version} /></>}
    <label>일정 이름<input name="title" required maxLength={100} value={title} onChange={e => setTitle(e.target.value)} aria-invalid={state.field === 'title'} autoFocus /></label>
    <label>메모 <span className="real-optional">선택</span><textarea name="note" maxLength={500} rows={2} value={note} onChange={e => setNote(e.target.value)} aria-invalid={state.field === 'note'} /></label>
    <div className="real-datetime-fields">
      <EventDatePicker value={date} today={today} onChange={setDate} invalid={state.field === 'startsAt' || state.field === 'endsAt'} open={activePicker === 'date'} setActivePicker={setActivePicker} />
      <input type="hidden" name="startsAt" value={startsAt} />
      <input type="hidden" name="endsAt" value={endsAt} />
      <EventTimePicker label="시작 시간" value={startTime} options={startOptions} invalid={state.field === 'startsAt'} align="left" picker="start" open={activePicker === 'start'} setActivePicker={setActivePicker} onChange={changeStartTime} />
      <EventTimePicker label="종료 시간" value={endTime} options={endOptions} invalid={state.field === 'endsAt'} align="right" picker="end" open={activePicker === 'end'} setActivePicker={setActivePicker} onChange={setEndTime} />
    </div>
    <p className="real-form-hint">15분 단위 · 15분~4시간 · 한국 시간</p>
    {state.message && <p className={state.status === 'success' ? 'real-action-success' : 'real-action-error'} role={state.status === 'success' ? 'status' : 'alert'}>{state.message}</p>}
    <div className="real-form-actions"><button type="button" className="real-secondary-button" onClick={onCancel}>취소</button><button type="submit" className="real-primary-button" disabled={pending}>{pending ? '저장 중...' : event ? '수정 저장' : '일정 저장'}</button></div>
  </form>
}

function DeleteEventButton({ event, userId }: { event: EventView; userId: string }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [showError, setShowError] = useState(false)
  const [state, formAction, pending] = useActionState(deleteEventAction, initialActionState)
  const confirmDialog = useRef<HTMLDialogElement>(null)
  const dialogOpen = confirming && state.status !== 'success'

  useEffect(() => {
    const dialog = confirmDialog.current
    if (!dialog) return
    if (dialogOpen && !dialog.open) dialog.showModal()
    if (!dialogOpen && dialog.open) dialog.close()
  }, [dialogOpen])

  useEffect(() => {
    if (state.status !== 'success') return
    void queryClient.invalidateQueries({ queryKey: eventQueryKeys.all(userId) })
  }, [queryClient, state.status, userId])

  const eventDate = koreaDateKey(event.starts_at)
  return <>
    <button type="button" className="real-text-button is-danger" aria-haspopup="dialog" disabled={state.status === 'success'} onClick={() => { setShowError(false); setConfirming(true) }}>{state.status === 'success' ? '삭제 완료' : '삭제'}</button>
    <dialog ref={confirmDialog} className="real-delete-dialog" role="alertdialog" aria-labelledby={'delete-title-' + event.id} aria-describedby={'delete-description-' + event.id} onClose={() => setConfirming(false)} onCancel={cancel => { if (pending) cancel.preventDefault() }} onClick={click => { const rect = confirmDialog.current?.getBoundingClientRect(); if (!pending && rect && (click.clientX < rect.left || click.clientX > rect.right || click.clientY < rect.top || click.clientY > rect.bottom)) confirmDialog.current?.close() }}>
      <Image src="/teumsae-delete.png" alt="" width={144} height={108} className="real-delete-illustration" />
      <h2 id={'delete-title-' + event.id}>이 일정을 삭제할까요?</h2>
      <p id={'delete-description-' + event.id} className="real-delete-dialog-description">삭제하면 일정 목록에서 사라지며, 다시 복구할 수 없어요.</p>
      <div className="real-delete-dialog-event"><strong>{event.title}</strong><span>{displayDate(eventDate)}</span><span>{eventTime(event.starts_at)} – {eventTime(event.ends_at)}</span></div>
      {state.status === 'error' && showError && !pending && <p className="real-delete-dialog-error" role="alert">{state.message}</p>}
      <form action={formAction} className="real-delete-dialog-actions" onSubmit={() => setShowError(false)}><input type="hidden" name="id" value={event.id} /><input type="hidden" name="version" value={event.version} /><button type="button" className="real-secondary-button" disabled={pending} autoFocus onClick={() => { setShowError(false); setConfirming(false) }}>취소</button><button type="submit" className="real-delete-confirm-button" disabled={pending}>{pending ? '삭제 중…' : '일정 삭제'}</button></form>
    </dialog>
  </>
}

function EventCard({ event, selectedDate, today, userId, readOnly }: { event: EventView; selectedDate: string; today: string; userId: string; readOnly: boolean }) {
  const eventEditor = useScheduleUiStore(state => state.eventEditor)
  const openEdit = useScheduleUiStore(state => state.openEdit)
  const closeEventEditor = useScheduleUiStore(state => state.closeEventEditor)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const detailsDialog = useRef<HTMLDialogElement>(null)
  const editing = eventEditor?.kind === 'edit' && eventEditor.eventId === event.id
  const dialogOpen = detailsOpen || editing
  useEffect(() => {
    const dialog = detailsDialog.current
    if (!dialog) return
    if (dialogOpen && !dialog.open) dialog.showModal()
    if (!dialogOpen && dialog.open) dialog.close()
  }, [dialogOpen])
  return <article className="real-event-card">
    <div className="real-event-time"><strong>{eventTime(event.starts_at)}</strong><span>{eventTime(event.ends_at)}</span></div>
    <div className="real-event-detail">
      <button type="button" className="real-event-detail-trigger" onClick={() => setDetailsOpen(true)} aria-label={event.title + ' 상세 보기'}><h3>{event.title}</h3>{event.note && <p>{event.note}</p>}</button>
      {!readOnly && <div className="real-event-actions"><button type="button" className="real-text-button" onClick={() => openEdit(event.id)}>수정</button><DeleteEventButton event={event} userId={userId} /></div>}
      <dialog ref={detailsDialog} className="real-event-dialog" aria-labelledby={'event-title-' + event.id} onClose={() => { setDetailsOpen(false); if (editing) closeEventEditor() }} onClick={event => { const rect = detailsDialog.current?.getBoundingClientRect(); if (rect && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) detailsDialog.current?.close() }}>
        <div className="real-event-dialog-grip" aria-hidden="true" />
        {editing && readOnly ? <p className="real-offline-dialog-note">오프라인에서는 일정을 수정할 수 없어요. 다시 연결해 주세요.</p> : editing ? <EventForm event={event} selectedDate={selectedDate} today={today} userId={userId} onCancel={closeEventEditor} /> : <>
          <header className="real-event-dialog-heading"><div><p className="section-kicker">SCHEDULE DETAIL</p><h2 id={'event-title-' + event.id}>{event.title}</h2></div><button type="button" className="real-icon-button" onClick={() => detailsDialog.current?.close()} aria-label="상세 닫기">×</button></header>
          <p className="real-event-dialog-date">{displayDate(selectedDate)}</p><p className="real-event-dialog-time">{eventTime(event.starts_at)} – {eventTime(event.ends_at)}</p>{event.note && <p className="real-event-dialog-note">{event.note}</p>}
          <div className="real-event-dialog-actions"><button type="button" className="real-secondary-button" onClick={() => detailsDialog.current?.close()}>닫기</button>{!readOnly && <button type="button" className="real-primary-button" onClick={() => { setDetailsOpen(false); openEdit(event.id) }}>일정 수정</button>}</div>
        </>}
      </dialog>
    </div>
  </article>
}

export default function RealSchedule({ userId, selectedDate, today, view }: { userId: string; selectedDate: string; today: string; view: CalendarView }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isOnline, setIsOnline] = useState(true)
  const dates = visibleCalendarDates(selectedDate, view)
  const from = dates[0] + 'T00:00:00+09:00'
  const last = new Date(dates[dates.length - 1] + 'T00:00:00.000Z')
  last.setUTCDate(last.getUTCDate() + 1)
  const to = last.toISOString().slice(0, 10) + 'T00:00:00+09:00'
  const eventsQuery = useQuery({
    queryKey: eventQueryKeys.range(userId, from, to),
    queryFn: ({ signal }) => fetchEvents({ from, to, signal })
  })
  const events = eventsQuery.data ?? []
  const eventEditor = useScheduleUiStore(state => state.eventEditor)
  const openCreate = useScheduleUiStore(state => state.openCreate)
  const closeEventEditor = useScheduleUiStore(state => state.closeEventEditor)
  const previousRoute = useRef(selectedDate + '|' + view)
  const isReadOnly = !isOnline || eventsQuery.isError
  const creating = !isReadOnly && eventEditor?.kind === 'create' && eventEditor.date === selectedDate
  const selectedEvents = events.filter(event => koreaDateKey(event.starts_at) === selectedDate).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const currentMonth = selectedDate.slice(0, 7)

  useEffect(() => {
    if (eventsQuery.data !== undefined) return
    const cachedSchedule = browserScheduleCache(userId, from, to)
    if (cachedSchedule) queryClient.setQueryData(eventQueryKeys.range(userId, from, to), cachedSchedule.events, { updatedAt: cachedSchedule.savedAt })
  }, [eventsQuery.data, from, queryClient, to, userId])

  useEffect(() => {
    function updateOnlineStatus() { setIsOnline(navigator.onLine) }
    updateOnlineStatus()
    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)
    return () => {
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
    }
  }, [])

  useEffect(() => {
    try { window.localStorage.setItem('teumsae:offline-user', userId) } catch {}
  }, [userId])

  useEffect(() => {
    if (!eventsQuery.isSuccess || !eventsQuery.isFetchedAfterMount) return
    try { saveScheduleCache(window.localStorage, userId, from, to, eventsQuery.data) } catch {}
  }, [eventsQuery.data, eventsQuery.isFetchedAfterMount, eventsQuery.isSuccess, from, to, userId])

  useEffect(() => {
    if (isReadOnly) closeEventEditor()
  }, [closeEventEditor, isReadOnly])

  useEffect(() => {
    const currentRoute = selectedDate + '|' + view
    if (previousRoute.current === currentRoute) return
    previousRoute.current = currentRoute
    closeEventEditor()
  }, [closeEventEditor, selectedDate, view])

  function navigate(date: string, nextView = view) {
    closeEventEditor()
    router.push('/schedule?view=' + nextView + '&date=' + date)
  }

  function changePeriod(direction: number) {
    navigate(view === 'month' ? shiftMonth(selectedDate, direction) : addDays(selectedDate, direction * 7))
  }

  return <main className="real-schedule-shell">
    <header className="real-schedule-header"><Link href="/" className="real-schedule-brand"><Image src="/teumsae-logo.png" alt="" width={48} height={40} priority /><span>틈새<small>TEUMSAE</small></span></Link><div className="real-header-actions"><Link className="real-sample-link" href="/"><svg aria-hidden="true" viewBox="0 0 20 20"><path d="M3 9.2 10 3l7 6.2v7.3a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5V9.2Z"/><path d="M7.5 17v-5h5v5"/></svg><span>샘플 화면</span></Link><SignOutButton /></div></header>
    <section className="real-schedule-content">
      <div className="real-page-heading"><div><p className="eyebrow">MY PRIVATE SCHEDULE</p><h1>내 일정</h1><p>내가 등록한 일정만 이곳에 표시돼요.</p></div><Link className="real-availability-link" href="/schedule/settings">일정 가능 시간 설정</Link></div>
      <div className="real-schedule-workspace">
        <section className="real-calendar-card" aria-label="일정 달력">
          <div className="real-calendar-toolbar"><div className="real-period-switch" role="group" aria-label="달력 보기"><button type="button" className={view === 'week' ? 'is-active' : ''} aria-pressed={view === 'week'} onClick={() => navigate(selectedDate, 'week')}>주</button><button type="button" className={view === 'month' ? 'is-active' : ''} aria-pressed={view === 'month'} onClick={() => navigate(selectedDate, 'month')}>월</button></div><div className="real-period-controls"><button type="button" className="real-period-arrow" aria-label="이전" onClick={() => changePeriod(-1)}>‹</button><button type="button" className="real-today-button" onClick={() => navigate(today)}>오늘</button><button type="button" className="real-period-arrow" aria-label="다음" onClick={() => changePeriod(1)}>›</button></div></div>
          <div className="real-period-caption"><strong>{periodLabel(dates, view)}</strong><span>{eventsQuery.isPending ? '불러오는 중…' : events.length + '개 일정'}</span></div>
          {isReadOnly && <p className="real-offline-status" role="status">{!isOnline ? '오프라인 · 최근 불러온 일정만 확인할 수 있어요. 변경은 연결 후 이용해 주세요.' : '일정을 새로 불러오지 못해 저장된 일정만 확인할 수 있어요.'}</p>}
          <div className={'real-calendar-grid ' + (view === 'month' ? 'is-month' : 'is-week')}>
            {weekdays.map(day => <div className="real-weekday" key={day}>{day}</div>)}
            {dates.map((date, index) => {
              const dateEvents = eventsQuery.isPending ? [] : events.filter(event => koreaDateKey(event.starts_at) === date)
              const selected = selectedDate === date
              const outsideMonth = view === 'month' && date.slice(0, 7) !== currentMonth
              const outerCell = (index >= dates.length - 7 ? ' is-last-row' : '') + (index % 7 === 0 ? ' is-first-column' : '') + (index % 7 === 6 ? ' is-last-column' : '')
              return <button type="button" key={date} className={'real-calendar-day' + outerCell + (selected ? ' is-selected' : '') + (date === today ? ' is-today' : '') + (outsideMonth ? ' is-outside' : '')} aria-pressed={selected} onClick={() => navigate(date)}>
                <span className="real-day-number">{Number(date.slice(-2))}</span>
                <span className="real-calendar-events">{eventsQuery.isPending ? <span className="real-calendar-skeleton" aria-hidden="true"><i /><i /></span> : <>{dateEvents.slice(0, view === 'week' ? 3 : 2).map(event => <span className="real-calendar-event" key={event.id} data-tooltip={eventTime(event.starts_at) + ' · ' + event.title}><span className="real-calendar-event-label">{eventTime(event.starts_at)} {event.title}</span></span>)}{dateEvents.length > (view === 'week' ? 3 : 2) && <span className="real-more-events">+{dateEvents.length - (view === 'week' ? 3 : 2)}개</span>}</>}</span>
              </button>
            })}
          </div>
        </section>
        <aside className="real-agenda-card" aria-label="선택한 날짜 일정">
          <div className="real-agenda-heading"><div><p className="section-kicker">SELECTED DAY</p><h2>{koreanDate(selectedDate, { month: 'long', day: 'numeric', weekday: 'long' })}</h2></div><button type="button" className="real-primary-button" onClick={() => openCreate(selectedDate)} disabled={isReadOnly}>＋ 일정</button></div>
          {eventsQuery.isPending ? <div className="real-agenda-skeleton" role="status" aria-label="일정을 불러오는 중"><span /><span /><span /></div> : eventsQuery.isError && !eventsQuery.data ? <div className="real-empty-agenda is-error" role="alert"><strong>일정을 불러오지 못했어요.</strong><p>잠시 후 다시 시도해 주세요.</p><button type="button" className="real-secondary-button" onClick={() => void eventsQuery.refetch()}>다시 불러오기</button></div> : <>
            {eventsQuery.isError && <p className="real-action-error" role="status">새 일정을 불러오지 못해 이전 목록을 표시하고 있어요. <button type="button" className="real-text-button" onClick={() => void eventsQuery.refetch()}>다시 시도</button></p>}
            {creating && <EventForm key={'new-' + selectedDate} event={null} selectedDate={selectedDate} today={today} userId={userId} onCancel={closeEventEditor} />}
            {selectedEvents.length ? <div className="real-event-list">{selectedEvents.map(event => <EventCard key={event.id} event={event} selectedDate={selectedDate} today={today} userId={userId} readOnly={isReadOnly} />)}</div> : !creating && <div className="real-empty-agenda"><span aria-hidden="true">✦</span><strong>이 날은 비어 있어요</strong><p>일정을 직접 등록해 보세요.</p><button type="button" className="real-secondary-button" onClick={() => openCreate(selectedDate)} disabled={isReadOnly}>일정 추가</button></div>}
          </>}
        </aside>
        <AssistantPanel userId={userId} />
      </div>
    </section>
  </main>
}
