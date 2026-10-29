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
