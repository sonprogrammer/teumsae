export type EventInput = {
  title: unknown
  note?: unknown
  startsAt: unknown
  endsAt: unknown
}

export type EventRecordInput = {
  title: string
  note: string | null
  startsAt: string
  endsAt: string
}

export type EventInputResult =
  | { ok: true; value: EventRecordInput }
  | { ok: false; field: 'title' | 'note' | 'startsAt' | 'endsAt'; message: string }

export type EventActionState = {
  status: 'idle' | 'success' | 'error'
  message: string
  field?: 'title' | 'note' | 'startsAt' | 'endsAt'
}

export type ActivityHours = {
  dayStart: string
  dayEnd: string
  timezone: 'Asia/Seoul'
  version: number
  updatedAt: string | null
}

export type ActivityHoursInput = Pick<ActivityHours, 'dayStart' | 'dayEnd'>

export type ActivityHoursInputResult =
  | { ok: true; value: ActivityHoursInput }
  | { ok: false; message: string }

export const DEFAULT_ACTIVITY_HOURS: ActivityHours = {
  dayStart: '09:00',
  dayEnd: '21:00',
  timezone: 'Asia/Seoul',
  version: 1,
  updatedAt: null
}

function isQuarterHourTime(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false
  const [hour, minute] = value.split(':').map(Number)
  return hour >= 0 && hour < 24 && minute >= 0 && minute < 60 && minute % 15 === 0
}

export function parseActivityHoursInput(input: unknown): ActivityHoursInputResult {
  if (!input || typeof input !== 'object') return { ok: false, message: '활동 시간을 확인해 주세요.' }
  const value = input as Record<string, unknown>
  if (!isQuarterHourTime(value.dayStart) || !isQuarterHourTime(value.dayEnd)) {
    return { ok: false, message: '활동 시작·종료 시간은 15분 단위로 입력해 주세요.' }
  }
  if (value.dayStart >= value.dayEnd) return { ok: false, message: '활동 종료 시간은 시작 시간보다 늦어야 해요.' }
  return { ok: true, value: { dayStart: value.dayStart, dayEnd: value.dayEnd } }
}

function koreaDateTime(value: string) {
  const timestamp = new Date(value)
  if (!Number.isFinite(timestamp.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(timestamp)
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return { date: fields.year + '-' + fields.month + '-' + fields.day, time: fields.hour + ':' + fields.minute }
}

export function eventWithinActivityHours(startsAt: string, endsAt: string, hours: Pick<ActivityHours, 'dayStart' | 'dayEnd'>) {
  const start = koreaDateTime(startsAt)
  const end = koreaDateTime(endsAt)
  return Boolean(start && end && start.date === end.date && start.time >= hours.dayStart && end.time <= hours.dayEnd)
}

export function normalizeActivityTime(value: string) {
  return /^\d{2}:\d{2}:\d{2}$/.test(value) ? value.slice(0, 5) : value
}

export function eventMutationMessage(code: string, detail = '') {
  if (code === '22023' && detail === 'outside_activity_hours') return '설정한 활동 시간 밖에는 일정을 등록하거나 옮길 수 없어요. 활동 시간을 조정해 주세요.'
  if (code === '23P01') return '이 시간에는 다른 일정이 겹쳐요. 시간을 바꿔주세요.'
  if (code === '40001') return '다른 화면에서 일정이 변경됐어요. 최신 내용을 확인해 주세요.'
  if (code === 'P0002') return '일정을 찾을 수 없어요. 새로고침해 주세요.'
  if (code === '42501') return '로그인이 필요해요. 다시 로그인해 주세요.'
  if (code === '22023') return '입력한 일정 정보를 확인해 주세요.'
  return '일정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

function parseTimestamp(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? value + ':00+09:00' : value
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.exec(normalized)
  if (!match) return null
  const date = new Date(match[1] + 'T00:00:00.000Z')
  if (date.toISOString().slice(0, 10) !== match[1] || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] ?? 0) > 59) return null
  const milliseconds = Date.parse(normalized)
  return Number.isFinite(milliseconds) ? new Date(milliseconds) : null
}

function koreaDate(value: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(value)
}

function isQuarterHour(value: Date) {
  return value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0 && value.getTime() % 900000 === 0
}

export function parseEventInput(input: EventInput, now = new Date(), options: { allowPast?: boolean; activityHours?: ActivityHoursInput } = {}): EventInputResult {
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  if (!title || title.length > 100) return { ok: false, field: 'title', message: '일정 제목은 1~100자로 입력해 주세요.' }

  const note = typeof input.note === 'string' ? input.note.trim() : ''
  if (note.length > 500) return { ok: false, field: 'note', message: '메모는 500자 이하로 입력해 주세요.' }

  const startsAt = parseTimestamp(input.startsAt)
  if (!startsAt || !isQuarterHour(startsAt)) return { ok: false, field: 'startsAt', message: '시작 시각은 15분 단위로 입력해 주세요.' }
  const endsAt = parseTimestamp(input.endsAt)
  if (!endsAt || !isQuarterHour(endsAt)) return { ok: false, field: 'endsAt', message: '종료 시각은 15분 단위로 입력해 주세요.' }
  if (!options.allowPast && startsAt.getTime() < now.getTime()) return { ok: false, field: 'startsAt', message: '지난 시각에는 일정을 등록할 수 없어요.' }

  const durationMinutes = (endsAt.getTime() - startsAt.getTime()) / 60000
  if (durationMinutes < 15 || durationMinutes > 240 || durationMinutes % 15 !== 0 || koreaDate(startsAt) !== koreaDate(endsAt)) {
    return { ok: false, field: 'endsAt', message: '종료 시각은 같은 날짜의 시작 이후 15~240분으로 설정해 주세요.' }
  }
  if (options.activityHours && !eventWithinActivityHours(startsAt.toISOString(), endsAt.toISOString(), options.activityHours)) {
    const field = koreaTime(startsAt) < options.activityHours.dayStart ? 'startsAt' : 'endsAt'
    return { ok: false, field, message: '설정한 활동 시간 ' + options.activityHours.dayStart + '~' + options.activityHours.dayEnd + ' 안에서 입력해 주세요.' }
  }

  return {
    ok: true,
    value: {
      title,
      note: note || null,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString()
    }
  }
}

function koreaTime(value: Date) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value)
}

export type EventView = {
  id: string
  title: string
  note: string | null
  starts_at: string
  ends_at: string
  version: number
}
