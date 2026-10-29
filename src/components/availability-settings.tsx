'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { availabilityQueryKey, fetchScheduleAvailability, saveScheduleAvailability } from '@/lib/availability-query'
import { parseScheduleAvailability, type AvailabilityException, type AvailabilityWindow, type ScheduleAvailability, type WeekdayAvailability } from '@/lib/availability'

const weekdays = [
  { value: 1, label: '월요일' },
  { value: 2, label: '화요일' },
  { value: 3, label: '수요일' },
  { value: 4, label: '목요일' },
  { value: 5, label: '금요일' },
  { value: 6, label: '토요일' },
  { value: 7, label: '일요일' }
]

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function minutesToTime(value: number) {
  return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0')
}

function nextWindow(windows: AvailabilityWindow[]): AvailabilityWindow | null {
  const candidates = Array.from({ length: 92 }, (_, index) => 9 * 60 + index * 15)
  for (const start of candidates) {
    const end = start + 60
    if (end > 24 * 60) continue
    const overlaps = windows.some(window => timeToMinutes(window.start) < end && timeToMinutes(window.end) > start)
    if (!overlaps) return { start: minutesToTime(start), end: minutesToTime(end) }
  }
  for (let start = 0; start + 60 <= 9 * 60; start += 15) {
    const end = start + 60
    if (!windows.some(window => timeToMinutes(window.start) < end && timeToMinutes(window.end) > start)) {
      return { start: minutesToTime(start), end: minutesToTime(end) }
    }
  }
  return null
}

function AvailabilityEditor({ userId, initial, onNotice }: { userId: string; initial: ScheduleAvailability; onNotice: (message: string, kind: 'success' | 'error' | '') => void }) {
  const queryClient = useQueryClient()
  const queryKey = availabilityQueryKey(userId)
  const [weekly, setWeekly] = useState(initial.weekly)
  const [exceptions, setExceptions] = useState(initial.exceptions)
  const [exceptionStart, setExceptionStart] = useState('')
  const [exceptionEnd, setExceptionEnd] = useState('')
  const [exceptionLabel, setExceptionLabel] = useState('')
  const [version, setVersion] = useState(initial.version)
  const saveMutation = useMutation({
    mutationFn: saveScheduleAvailability,
    onSuccess: settings => {
      queryClient.setQueryData(queryKey, settings)
      setWeekly(settings.weekly)
      setExceptions(settings.exceptions)
      setVersion(settings.version)
      onNotice('일정 가능 시간을 저장했어요.', 'success')
    },
    onError: error => {
      onNotice(error instanceof Error ? error.message : '설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.', 'error')
      if (error instanceof Error && error.message.includes('최신')) void queryClient.invalidateQueries({ queryKey })
    }
  })

  function updateDay(weekday: number, update: (day: WeekdayAvailability) => WeekdayAvailability) {
    setWeekly(current => current.map(day => day.weekday === weekday ? update(day) : day))
    onNotice('', '')
  }

  function toggleDay(weekday: number, enabled: boolean) {
    updateDay(weekday, day => ({ ...day, windows: enabled ? (day.windows.length ? day.windows : [{ start: '09:00', end: '21:00' }]) : [] }))
  }

  function updateWindow(weekday: number, index: number, update: Partial<AvailabilityWindow>) {
    updateDay(weekday, day => ({ ...day, windows: day.windows.map((window, windowIndex) => windowIndex === index ? { ...window, ...update } : window) }))
  }

  function addWindow(weekday: number) {
    updateDay(weekday, day => {
      const window = nextWindow(day.windows)
      return window ? { ...day, windows: [...day.windows, window].sort((left, right) => left.start.localeCompare(right.start)) } : day
    })
  }

  function removeWindow(weekday: number, index: number) {
    updateDay(weekday, day => ({ ...day, windows: day.windows.filter((_, windowIndex) => windowIndex !== index) }))
  }

  function addException() {
    onNotice('', '')
    const next = [...exceptions, { id: crypto.randomUUID(), startDate: exceptionStart, endDate: exceptionEnd, label: exceptionLabel.trim() || null }]
    const parsed = parseScheduleAvailability({ weekly, exceptions: next })
    if (!parsed.ok) {
      onNotice(parsed.message, 'error')
      return
    }
    setExceptions(parsed.value.exceptions as AvailabilityException[])
    setExceptionStart('')
    setExceptionEnd('')
    setExceptionLabel('')
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onNotice('', '')
    const parsed = parseScheduleAvailability({ weekly, exceptions })
    if (!parsed.ok) {
      onNotice(parsed.message, 'error')
      return
    }
    saveMutation.mutate({ ...parsed.value, version })
  }

  return <form className="availability-settings-form" onSubmit={save}>
    <section className="availability-settings-card" aria-labelledby="weekly-availability-title">
      <div className="availability-section-heading"><div><p className="section-kicker">WEEKLY SCHEDULE</p><h2 id="weekly-availability-title">요일별 가능 시간</h2><p>이 시간대 안에서 AI가 빈 시간을 추천해요.</p></div><span className="availability-timezone">한국 시간 · 15분 단위</span></div>
      <div className="availability-weekly-list">
        {weekdays.map(({ value, label }) => {
          const day = weekly.find(item => item.weekday === value) ?? { weekday: value, windows: [] }
          const enabled = day.windows.length > 0
          return <article className={'availability-day-card' + (enabled ? '' : ' is-disabled')} key={value}>
            <div className="availability-day-heading"><label><input type="checkbox" checked={enabled} onChange={event => toggleDay(value, event.target.checked)} /><strong>{label}</strong></label><span>{enabled ? day.windows.length + '개 시간대' : '추천 안 함'}</span></div>
            {enabled && <div className="availability-window-list">{day.windows.map((window, index) => <div className="availability-window-row" key={index}>
              <label><span className="sr-only">{label} {index + 1}번째 시간대 시작</span><input type="time" value={window.start} min="00:00" max="23:45" step={900} required onChange={event => updateWindow(value, index, { start: event.target.value })} /></label>
              <span aria-hidden="true">–</span>
              <label><span className="sr-only">{label} {index + 1}번째 시간대 종료</span><input type="time" value={window.end} min="00:15" max="23:45" step={900} required onChange={event => updateWindow(value, index, { end: event.target.value })} /></label>
              <button type="button" className="availability-remove-window" aria-label={label + ' ' + (index + 1) + '번째 시간대 삭제'} onClick={() => removeWindow(value, index)}>삭제</button>
            </div>)}</div>}
            {enabled && <button type="button" className="availability-add-window" onClick={() => addWindow(value)}>+ 시간대 추가</button>}
          </article>
        })}
      </div>
    </section>

    <section className="availability-settings-card" aria-labelledby="availability-exceptions-title">
      <div className="availability-section-heading"><div><p className="section-kicker">TIME OFF</p><h2 id="availability-exceptions-title">일정 불가일</h2><p>휴가나 개인 일정으로 하루 종일 추천을 받지 않을 날짜를 등록해요.</p></div></div>
      <div className="availability-exception-list">{exceptions.length ? exceptions.map(exception => <div className="availability-exception-row" key={exception.id}>
        <div><strong>{exception.label || '일정 불가'}</strong><span>{exception.startDate === exception.endDate ? exception.startDate : exception.startDate + ' – ' + exception.endDate}</span></div>
        <button type="button" className="availability-remove-window" aria-label={(exception.label || '일정 불가') + ' 삭제'} onClick={() => { setExceptions(current => current.filter(item => item.id !== exception.id)); onNotice('', '') }}>삭제</button>
      </div>) : <p className="availability-no-exceptions">등록된 휴가나 일정 불가일이 없어요.</p>}</div>
      <div className="availability-exception-form">
        <label>시작일<input type="date" value={exceptionStart} onChange={event => setExceptionStart(event.target.value)} /></label>
        <label>종료일<input type="date" value={exceptionEnd} min={exceptionStart || undefined} onChange={event => setExceptionEnd(event.target.value)} /></label>
        <label className="availability-exception-label">이름 <span>선택</span><input type="text" value={exceptionLabel} maxLength={100} placeholder="예: 휴가" onChange={event => setExceptionLabel(event.target.value)} /></label>
        <button type="button" className="real-secondary-button" onClick={addException}>불가일 추가</button>
      </div>
    </section>

    <p className="availability-settings-note">직접 일정은 가능 시간 밖에도 등록할 수 있어요. 이 설정은 AI 추천 범위에만 적용되고, 기존 일정은 바뀌지 않습니다.</p>
    <div className="availability-settings-actions"><Link className="real-secondary-button" href="/schedule">일정으로 돌아가기</Link><button type="submit" className="real-primary-button" disabled={saveMutation.isPending}>{saveMutation.isPending ? '저장 중…' : '설정 저장'}</button></div>
  </form>
}

export default function AvailabilitySettings({ userId }: { userId: string }) {
  const settingsQuery = useQuery({ queryKey: availabilityQueryKey(userId), queryFn: fetchScheduleAvailability })
  const [notice, setNotice] = useState<{ message: string; kind: 'success' | 'error' | '' }>({ message: '', kind: '' })
  if (settingsQuery.isPending) return <div className="availability-settings-state" role="status">일정 가능 시간을 불러오고 있어요.</div>
  if (settingsQuery.isError) return <div className="availability-settings-state is-error" role="alert"><p>{settingsQuery.error instanceof Error ? settingsQuery.error.message : '일정 가능 시간을 불러오지 못했어요.'}</p><button type="button" className="real-secondary-button" onClick={() => void settingsQuery.refetch()}>다시 불러오기</button></div>
  return <>
    <AvailabilityEditor key={settingsQuery.data.version} userId={userId} initial={settingsQuery.data} onNotice={(message, kind) => setNotice({ message, kind })} />
    {notice.message && <p className={'availability-settings-notice is-' + notice.kind} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.message}</p>}
  </>
}
