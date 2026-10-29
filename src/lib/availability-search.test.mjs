import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_SCHEDULE_AVAILABILITY, parseAvailabilitySearchRequest, searchAvailability } from './availability.ts'

const beforeToday = new Date('2026-10-29T00:00:00.000Z')

test('accepts search ranges longer than a week and validates times and duration', () => {
  assert.equal(parseAvailabilitySearchRequest({ startDate: '2026-10-29', endDate: '2026-11-04', startTime: '09:00', endTime: '18:00', durationMinutes: 60 }, beforeToday).ok, true)
  const longerRange = parseAvailabilitySearchRequest({ startDate: '2026-10-29', endDate: '2026-11-05' }, beforeToday)
  assert.equal(longerRange.ok, true)
  if (longerRange.ok) {
    const result = searchAvailability({ request: longerRange.value, schedule: DEFAULT_SCHEDULE_AVAILABILITY, events: [], now: beforeToday })
    assert.equal(result.mode, 'intervals')
    if (result.mode === 'intervals') assert.equal(result.intervals.length, 8)
  }
  assert.equal(parseAvailabilitySearchRequest({ startDate: '2026-10-29', endDate: '2027-10-29' }, beforeToday).ok, true)
  assert.equal(parseAvailabilitySearchRequest({ startDate: '2026-10-29', endDate: '2027-10-30' }, beforeToday).ok, false)
  assert.equal(parseAvailabilitySearchRequest({ startDate: '2026-10-29', startTime: '09:10', endTime: '18:00' }, beforeToday).ok, false)
  assert.equal(parseAvailabilitySearchRequest({ startDate: '2026-10-29', durationMinutes: 50 }, beforeToday).ok, false)
})

test('clips today to the next quarter hour and returns three ordered candidates with hasMore', () => {
  const parsed = parseAvailabilitySearchRequest({ startDate: '2026-10-29', startTime: '09:00', endTime: '18:00', durationMinutes: 60 }, new Date('2026-10-29T01:07:00.000Z'))
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const result = searchAvailability({ request: parsed.value, schedule: DEFAULT_SCHEDULE_AVAILABILITY, events: [{ starts_at: '2026-10-29T01:30:00.000Z', ends_at: '2026-10-29T02:30:00.000Z' }], now: new Date('2026-10-29T01:07:00.000Z') })
  assert.deepEqual(result, {
    mode: 'candidates',
    candidates: [
      { date: '2026-10-29', start: '11:30', end: '12:30' },
      { date: '2026-10-29', start: '12:30', end: '13:30' },
      { date: '2026-10-29', start: '13:30', end: '14:30' }
    ],
    hasMore: true
  })
})

test('returns no candidates when the requested time has already passed today', () => {
  const now = new Date('2026-10-29T01:07:00.000Z')
  const parsed = parseAvailabilitySearchRequest({ startDate: '2026-10-29', startTime: '09:00', endTime: '10:00', durationMinutes: 15 }, now)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.deepEqual(searchAvailability({ request: parsed.value, schedule: DEFAULT_SCHEDULE_AVAILABILITY, events: [], now }), { mode: 'candidates', candidates: [], hasMore: false })
})

test('returns continuous free intervals when duration is omitted', () => {
  const parsed = parseAvailabilitySearchRequest({ startDate: '2026-10-29', startTime: '09:00', endTime: '12:00' }, beforeToday)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const result = searchAvailability({ request: parsed.value, schedule: DEFAULT_SCHEDULE_AVAILABILITY, events: [{ starts_at: '2026-10-29T01:00:00.000Z', ends_at: '2026-10-29T01:30:00.000Z' }], now: beforeToday })
  assert.deepEqual(result, {
    mode: 'intervals',
    intervals: [
      { date: '2026-10-29', start: '09:00', end: '10:00' },
      { date: '2026-10-29', start: '10:30', end: '12:00' }
    ]
  })
})

test('uses saved weekly windows and keeps 24:00 as a valid request end', () => {
  const schedule = {
    ...DEFAULT_SCHEDULE_AVAILABILITY,
    weekly: DEFAULT_SCHEDULE_AVAILABILITY.weekly.map(day => day.weekday === 4 ? { weekday: 4, windows: [{ start: '11:00', end: '12:00' }, { start: '23:00', end: '23:45' }] } : { ...day, windows: [] })
  }
  const parsed = parseAvailabilitySearchRequest({ startDate: '2026-10-29', startTime: '09:00', endTime: '24:00', durationMinutes: 60 }, beforeToday)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.deepEqual(searchAvailability({ request: parsed.value, schedule, events: [], now: beforeToday }), {
    mode: 'candidates',
    candidates: [{ date: '2026-10-29', start: '11:00', end: '12:00' }],
    hasMore: false
  })
  const endOfDay = parseAvailabilitySearchRequest({ startDate: '2026-10-29', startTime: '23:00', endTime: '24:00', durationMinutes: 45 }, beforeToday)
  assert.equal(endOfDay.ok, true)
  if (!endOfDay.ok) return
  assert.deepEqual(searchAvailability({ request: endOfDay.value, schedule, events: [], now: beforeToday }), {
    mode: 'candidates',
    candidates: [{ date: '2026-10-29', start: '23:00', end: '23:45' }],
    hasMore: false
  })
})

test('excludes partial event conflicts inside multiple saved windows', () => {
  const schedule = {
    ...DEFAULT_SCHEDULE_AVAILABILITY,
    weekly: DEFAULT_SCHEDULE_AVAILABILITY.weekly.map(day => day.weekday === 4 ? { weekday: 4, windows: [{ start: '11:00', end: '12:00' }, { start: '15:00', end: '17:00' }] } : { ...day, windows: [] })
  }
  const parsed = parseAvailabilitySearchRequest({ startDate: '2026-10-29', startTime: '09:00', endTime: '18:00', durationMinutes: 60 }, beforeToday)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.deepEqual(searchAvailability({
    request: parsed.value,
    schedule,
    events: [{ starts_at: '2026-10-29T06:30:00.000Z', ends_at: '2026-10-29T07:00:00.000Z' }],
    now: beforeToday
  }), {
    mode: 'candidates',
    candidates: [{ date: '2026-10-29', start: '11:00', end: '12:00' }, { date: '2026-10-29', start: '16:00', end: '17:00' }],
    hasMore: false
  })
})

test('applies availability exceptions and crosses month, year and weekday boundaries', () => {
  const schedule = {
    ...DEFAULT_SCHEDULE_AVAILABILITY,
    exceptions: [{ id: 'new-year', startDate: '2027-01-01', endDate: '2027-01-01', label: '휴가' }]
  }
  const parsed = parseAvailabilitySearchRequest({ startDate: '2026-12-31', endDate: '2027-01-06', startTime: '09:00', endTime: '11:00', durationMinutes: 60 }, beforeToday)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const result = searchAvailability({ request: parsed.value, schedule, events: [], now: beforeToday })
  assert.equal(result.mode, 'candidates')
  if (result.mode !== 'candidates') return
  assert.equal(result.candidates[0].date, '2026-12-31')
  assert.equal(result.candidates.some(candidate => candidate.date === '2027-01-01'), false)
  assert.equal(result.hasMore, true)
})

test('keeps candidates chronological across a week boundary and ignores adjacent dates', () => {
  const parsed = parseAvailabilitySearchRequest({ startDate: '2026-11-01', endDate: '2026-11-02', startTime: '13:00', endTime: '14:00', durationMinutes: 60 }, beforeToday)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const result = searchAvailability({
    request: parsed.value,
    schedule: DEFAULT_SCHEDULE_AVAILABILITY,
    events: [{ starts_at: '2026-10-31T04:00:00.000Z', ends_at: '2026-10-31T05:00:00.000Z' }],
    now: beforeToday
  })
  assert.deepEqual(result, { mode: 'candidates', candidates: [{ date: '2026-11-01', start: '13:00', end: '14:00' }, { date: '2026-11-02', start: '13:00', end: '14:00' }], hasMore: false })
})

test('refuses to calculate from more than one hundred events', () => {
  const parsed = parseAvailabilitySearchRequest({ startDate: '2026-10-29', durationMinutes: 60 }, beforeToday)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.throws(() => searchAvailability({ request: parsed.value, schedule: DEFAULT_SCHEDULE_AVAILABILITY, events: Array.from({ length: 101 }, () => ({ starts_at: '2026-10-29T01:00:00.000Z', ends_at: '2026-10-29T02:00:00.000Z' })), now: beforeToday }), { message: 'AVAILABILITY_EVENT_LIMIT' })
})
