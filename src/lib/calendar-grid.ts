function dateFromISO(iso: string) {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function toISO(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function shiftMonth(iso: string, offset: number): string {
  const date = dateFromISO(iso)
  return toISO(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1)))
}

export function monthGrid(iso: string): string[] {
  const date = dateFromISO(iso)
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
  const mondayOffset = (first.getUTCDay() + 6) % 7
  first.setUTCDate(first.getUTCDate() - mondayOffset)
  const dates: string[] = []
  while (first <= last || first.getUTCDay() !== 1) {
    dates.push(toISO(first))
    first.setUTCDate(first.getUTCDate() + 1)
  }
  return dates
}

export type CalendarView = 'week' | 'month'

function minutesFromTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59 || minutes % 15 !== 0) return null
  return hours * 60 + minutes
}

function timeFromMinutes(minutes: number) {
  return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0')
}

export function quarterHourOptions() {
  return Array.from({ length: 96 }, (_, index) => timeFromMinutes(index * 15))
}

export function startTimeOptions() {
  return quarterHourOptions().slice(0, -1)
}

export function endTimeOptions(startTime: string) {
  const startMinutes = minutesFromTime(startTime)
  if (startMinutes === null) return []
  return quarterHourOptions().filter(time => {
    const minutes = minutesFromTime(time)
    return minutes !== null && minutes > startMinutes && minutes <= 23 * 60 + 45
  })
}

export function defaultEndTime(startTime: string) {
  const startMinutes = minutesFromTime(startTime)
  if (startMinutes === null || startMinutes >= 23 * 60 + 45) return ''
  return timeFromMinutes(Math.min(startMinutes + 60, 23 * 60 + 45))
}

function addDays(iso: string, days: number) {
  const date = dateFromISO(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return toISO(date)
}

function koreaParts(date: Date) {
  const values = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date)
  return Object.fromEntries(values.map(part => [part.type, part.value]))
}

export function visibleCalendarDates(selectedDate: string, view: CalendarView) {
  if (view === 'month') return monthGrid(selectedDate)
  const selected = dateFromISO(selectedDate)
  const mondayOffset = (selected.getUTCDay() + 6) % 7
  const monday = addDays(selectedDate, -mondayOffset)
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index))
}

export function defaultEventTimes(selectedDate: string, now = new Date()) {
  const parts = koreaParts(now)
  const today = parts.year + '-' + parts.month + '-' + parts.day
  let date = selectedDate < today ? today : selectedDate
  let startMinutes = 9 * 60

  if (date === today) {
    const currentMinute = Number(parts.hour) * 60 + Number(parts.minute) + (Number(parts.second) > 0 ? 1 : 0)
    startMinutes = Math.ceil(currentMinute / 15) * 15
    if (startMinutes > 22 * 60 + 45) {
      date = addDays(date, 1)
      startMinutes = 9 * 60
    }
  }

  const endMinutes = startMinutes + 60
  const formatTime = (minutes: number) => String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0')
  return {
    date,
    startsAt: date + 'T' + formatTime(startMinutes),
    endsAt: date + 'T' + formatTime(endMinutes)
  }
}
