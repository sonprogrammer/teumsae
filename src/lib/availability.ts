export type AvailabilityWindow = { start: string; end: string }
export type WeekdayAvailability = { weekday: number; windows: AvailabilityWindow[] }
export type AvailabilityException = { id: string; startDate: string; endDate: string; label: string | null }
export type AvailabilityInput = { weekly: WeekdayAvailability[]; exceptions: Array<Omit<AvailabilityException, 'id'> & { id?: string }> }
export type ScheduleAvailability = AvailabilityInput & { timezone: 'Asia/Seoul'; version: number }
export type AvailabilityParseResult = { ok: true; value: AvailabilityInput } | { ok: false; message: string }

export const DEFAULT_SCHEDULE_AVAILABILITY: ScheduleAvailability = {
  timezone: 'Asia/Seoul',
  version: 1,
  weekly: Array.from({ length: 7 }, (_, index) => ({ weekday: index + 1, windows: [{ start: '09:00', end: '21:00' }] })),
  exceptions: []
}

function isQuarterHourTime(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false
  const [hour, minute] = value.split(':').map(Number)
  return hour >= 0 && hour < 24 && minute >= 0 && minute < 60 && minute % 15 === 0
}

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00.000Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function parseScheduleAvailability(input: unknown): AvailabilityParseResult {
  if (!input || typeof input !== 'object') return { ok: false, message: '일정 가능 시간 정보를 확인해 주세요.' }
  const value = input as Record<string, unknown>
  if (!Array.isArray(value.weekly) || value.weekly.length !== 7 || !Array.isArray(value.exceptions)) {
    return { ok: false, message: '월요일부터 일요일까지 설정을 모두 확인해 주세요.' }
  }

  const weekly: WeekdayAvailability[] = []
  const seenDays = new Set<number>()
  for (const day of value.weekly) {
    if (!day || typeof day !== 'object') return { ok: false, message: '요일별 설정을 확인해 주세요.' }
    const weekday = (day as Record<string, unknown>).weekday
    const windows = (day as Record<string, unknown>).windows
    if (typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 1 || weekday > 7 || seenDays.has(weekday) || !Array.isArray(windows)) {
      return { ok: false, message: '요일별 설정을 확인해 주세요.' }
    }
    seenDays.add(weekday)
    const parsedWindows: AvailabilityWindow[] = []
    for (const window of windows) {
      if (!window || typeof window !== 'object') return { ok: false, message: '가능 시간 구간을 확인해 주세요.' }
      const start = (window as Record<string, unknown>).start
      const end = (window as Record<string, unknown>).end
      if (!isQuarterHourTime(start) || !isQuarterHourTime(end) || start >= end) {
        return { ok: false, message: '가능 시간은 15분 단위로 시작보다 늦게 끝나야 해요.' }
      }
      parsedWindows.push({ start, end })
    }
    parsedWindows.sort((left, right) => left.start.localeCompare(right.start))
    if (parsedWindows.some((window, index) => index > 0 && window.start < parsedWindows[index - 1].end)) {
      return { ok: false, message: '같은 요일의 가능 시간 구간은 서로 겹칠 수 없어요.' }
    }
    weekly.push({ weekday, windows: parsedWindows })
  }
  if (seenDays.size !== 7) return { ok: false, message: '월요일부터 일요일까지 설정을 모두 확인해 주세요.' }

  const exceptions: AvailabilityInput['exceptions'] = []
  for (const exception of value.exceptions) {
    if (!exception || typeof exception !== 'object') return { ok: false, message: '일정 불가 날짜를 확인해 주세요.' }
    const item = exception as Record<string, unknown>
    const startDate = item.startDate
    const endDate = item.endDate
    const label = item.label === null || item.label === undefined ? null : item.label
    if (!isDate(startDate) || !isDate(endDate) || startDate > endDate || (label !== null && (typeof label !== 'string' || label.trim().length > 100))) {
      return { ok: false, message: '일정 불가 날짜와 이름을 확인해 주세요.' }
    }
    exceptions.push({ id: typeof item.id === 'string' ? item.id : undefined, startDate, endDate, label: typeof label === 'string' ? label.trim() || null : null })
  }
  exceptions.sort((left, right) => left.startDate.localeCompare(right.startDate))
  if (exceptions.some((exception, index) => index > 0 && exception.startDate <= exceptions[index - 1].endDate)) {
    return { ok: false, message: '일정 불가 날짜 구간은 서로 겹칠 수 없어요.' }
  }

  return { ok: true, value: { weekly: weekly.sort((left, right) => left.weekday - right.weekday), exceptions } }
}

export function availabilityWindowsForDate(date: string, schedule: Pick<ScheduleAvailability, 'weekly' | 'exceptions'>): AvailabilityWindow[] {
  if (!isDate(date) || schedule.exceptions.some(exception => date >= exception.startDate && date <= exception.endDate)) return []
  const dateValue = new Date(date + 'T00:00:00.000Z')
  const dayOfWeek = dateValue.getUTCDay() || 7
  return schedule.weekly.find(day => day.weekday === dayOfWeek)?.windows.map(window => ({ ...window })) ?? []
}

export type BusyInterval = { start: string; end: string }
export type AvailabilitySlot = { start: string; end: string }
export type AvailabilitySlotRequest = { start: string; end: string; durationMinutes: number }

function toMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function toTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function isTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

export function findAvailabilitySlots({ windows, events, request, limit }: { windows: AvailabilityWindow[]; events: BusyInterval[]; request: AvailabilitySlotRequest; limit: number }): AvailabilitySlot[] {
  if (!isTime(request.start) || !isTime(request.end) || request.start >= request.end || !Number.isInteger(request.durationMinutes) || request.durationMinutes <= 0 || request.durationMinutes % 15 !== 0 || !Number.isInteger(limit) || limit <= 0) return []

  const requestStart = toMinutes(request.start)
  const requestEnd = toMinutes(request.end)
  const duration = request.durationMinutes
  const busy = events
    .filter(event => isTime(event.start) && isTime(event.end) && event.start < event.end)
    .map(event => ({ start: toMinutes(event.start), end: toMinutes(event.end) }))
    .sort((left, right) => left.start - right.start)
  const slots: AvailabilitySlot[] = []

  for (const window of [...windows].sort((left, right) => left.start.localeCompare(right.start))) {
    if (!isTime(window.start) || !isTime(window.end) || window.start >= window.end) continue
    const windowStart = Math.max(requestStart, toMinutes(window.start))
    const windowEnd = Math.min(requestEnd, toMinutes(window.end))
    let start = Math.ceil(windowStart / 15) * 15

    while (start + duration <= windowEnd && slots.length < limit) {
      const end = start + duration
      const conflict = busy.find(event => event.start < end && event.end > start)
      if (conflict) {
        start = Math.ceil(Math.max(start + 15, conflict.end) / 15) * 15
        continue
      }
      slots.push({ start: toTime(start), end: toTime(end) })
      start = end
    }
    if (slots.length >= limit) break
  }

  return slots
}

const searchTimezone = 'Asia/Seoul'
const dayMinutes = 24 * 60
const maxEvents = 100
const maxCandidates = 3

export type AvailabilitySearchRequest = {
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  durationMinutes?: number
}

export type SearchEvent = { starts_at: string; ends_at: string }
export type SearchCandidate = { date: string; start: string; end: string }
export type SearchInterval = { date: string; start: string; end: string }
export type AvailabilitySearchResult =
  | { mode: 'candidates'; candidates: SearchCandidate[]; hasMore: boolean }
  | { mode: 'intervals'; intervals: SearchInterval[] }

export type AvailabilitySearchParseResult = { ok: true; value: AvailabilitySearchRequest } | { ok: false; message: string }

function isSearchDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00.000Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function isSearchTime(value: unknown, allowEndOfDay = false): value is string {
  return typeof value === 'string' && (allowEndOfDay && value === '24:00' || /^([01]\d|2[0-3]):[0-5]\d$/.test(value))
}

function isSearchQuarterHour(value: string) {
  return value === '24:00' || Number(value.slice(3)) % 15 === 0
}

function searchTimeToMinutes(value: string) {
  if (value === '24:00') return dayMinutes
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

function searchMinutesToTime(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

function koreaParts(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: searchTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(value)
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return {
    date: `${fields.year}-${fields.month}-${fields.day}`,
    minutes: Number(fields.hour) * 60 + Number(fields.minute) + Number(fields.second) / 60 + value.getUTCMilliseconds() / 60000
  }
}

function addSearchDays(value: string, amount: number) {
  const date = new Date(value + 'T00:00:00.000Z')
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

function searchDayCount(startDate: string, endDate: string) {
  return (Date.parse(endDate + 'T00:00:00.000Z') - Date.parse(startDate + 'T00:00:00.000Z')) / 86400000 + 1
}

export function parseAvailabilitySearchRequest(input: unknown, now = new Date()): AvailabilitySearchParseResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, message: '빈 시간 검색 조건을 확인해 주세요.' }
  const value = input as Record<string, unknown>
  const startDate = value.startDate
  const endDate = value.endDate ?? startDate
  const hasStartTime = value.startTime !== undefined
  const hasEndTime = value.endTime !== undefined
  const startTime = hasStartTime ? value.startTime : '00:00'
  const endTime = hasEndTime ? value.endTime : '24:00'
  const durationMinutes = value.durationMinutes
  const today = koreaParts(now).date

  if (!isSearchDate(startDate) || !isSearchDate(endDate) || startDate > endDate || startDate < today) {
    return { ok: false, message: '오늘부터의 올바른 날짜 범위를 입력해 주세요.' }
  }
  if (hasStartTime !== hasEndTime || !isSearchTime(startTime) || !isSearchTime(endTime, true) || !isSearchQuarterHour(startTime) || !isSearchQuarterHour(endTime) || searchTimeToMinutes(startTime) >= searchTimeToMinutes(endTime)) {
    return { ok: false, message: '검색 시간은 15분 단위의 올바른 시간 범위로 입력해 주세요.' }
  }
  if (durationMinutes !== undefined && durationMinutes !== null && (!Number.isInteger(durationMinutes) || Number(durationMinutes) < 15 || Number(durationMinutes) > 240 || Number(durationMinutes) % 15 !== 0)) {
    return { ok: false, message: '소요 시간은 15~240분 사이의 15분 단위로 입력해 주세요.' }
  }

  return {
    ok: true,
    value: {
      startDate,
      endDate,
      startTime,
      endTime,
      ...(durationMinutes === undefined || durationMinutes === null ? {} : { durationMinutes: Number(durationMinutes) })
    }
  }
}

function searchEventTime(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: searchTimezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return { date: koreaParts(date).date, minutes: Number(fields.hour) * 60 + Number(fields.minute) }
}

function groupSearchBusyIntervals(events: SearchEvent[]) {
  const grouped = new Map<string, Array<{ start: number; end: number }>>()
  for (const event of events) {
    const start = searchEventTime(event.starts_at)
    const end = searchEventTime(event.ends_at)
    if (!start || !end || start.date !== end.date || start.minutes >= end.minutes) throw new Error('INVALID_EVENT_INTERVAL')
    const intervals = grouped.get(start.date) ?? []
    intervals.push({ start: start.minutes, end: end.minutes })
    grouped.set(start.date, intervals)
  }
  for (const intervals of grouped.values()) intervals.sort((left, right) => left.start - right.start)
  return grouped
}

function findFreeIntervals(start: number, end: number, busy: Array<{ start: number; end: number }>) {
  const result: Array<{ start: number; end: number }> = []
  let cursor = start
  for (const event of busy) {
    if (event.end <= cursor) continue
    if (event.start >= end) break
    if (event.start > cursor) result.push({ start: cursor, end: Math.min(event.start, end) })
    cursor = Math.max(cursor, event.end)
    if (cursor >= end) break
  }
  if (cursor < end) result.push({ start: cursor, end })
  return result.filter(interval => interval.start < interval.end)
}

export function searchAvailability({ request, schedule, events, now = new Date() }: { request: AvailabilitySearchRequest; schedule: ScheduleAvailability; events: SearchEvent[]; now?: Date }): AvailabilitySearchResult {
  if (events.length > maxEvents) throw new Error('AVAILABILITY_EVENT_LIMIT')
  const today = koreaParts(now).date
  const nowMinutes = koreaParts(now).minutes
  const busyByDate = groupSearchBusyIntervals(events)
  const candidates: SearchCandidate[] = []
  const intervals: SearchInterval[] = []
  let hasMore = false

  for (let offset = 0; offset < searchDayCount(request.startDate, request.endDate); offset += 1) {
    const date = addSearchDays(request.startDate, offset)
    const requestStart = Math.max(searchTimeToMinutes(request.startTime), date === today ? Math.ceil(nowMinutes / 15) * 15 : 0)
    const requestEnd = searchTimeToMinutes(request.endTime)
    if (requestStart >= requestEnd) continue
    const windows = availabilityWindowsForDate(date, schedule)
      .map(window => ({ start: Math.max(requestStart, searchTimeToMinutes(window.start)), end: Math.min(requestEnd, searchTimeToMinutes(window.end)) }))
      .filter(window => window.start < window.end)
    const busy = busyByDate.get(date) ?? []

    if (request.durationMinutes !== undefined) {
      for (const window of windows) {
        const found = findAvailabilitySlots({
          windows: [{ start: searchMinutesToTime(window.start), end: searchMinutesToTime(window.end) }],
          events: busy.map(event => ({ start: searchMinutesToTime(event.start), end: searchMinutesToTime(event.end) })),
          request: { start: searchMinutesToTime(window.start), end: searchMinutesToTime(window.end), durationMinutes: request.durationMinutes },
          limit: maxCandidates + 1 - candidates.length
        })
        for (const slot of found) {
          if (candidates.length < maxCandidates) candidates.push({ date, start: slot.start, end: slot.end })
          else hasMore = true
        }
        if (hasMore) break
      }
      if (hasMore) break
      continue
    }

    for (const window of windows) {
      intervals.push(...findFreeIntervals(window.start, window.end, busy).map(interval => ({ date, start: searchMinutesToTime(interval.start), end: searchMinutesToTime(interval.end) })))
    }
  }

  return request.durationMinutes === undefined ? { mode: 'intervals', intervals } : { mode: 'candidates', candidates, hasMore }
}
