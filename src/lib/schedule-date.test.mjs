import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultEndTime, defaultEventTimes, endTimeOptions, quarterHourOptions, startTimeOptions, visibleCalendarDates } from './calendar-grid.ts'

test('builds Monday-first week dates around the selected date', () => {
  assert.deepEqual(visibleCalendarDates('2026-11-01', 'week'), [
    '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'
  ])
})

test('uses a complete month grid that includes the selected day', () => {
  const dates = visibleCalendarDates('2026-10-28', 'month')
  assert.equal(dates[0], '2026-09-28')
  assert.equal(dates.at(-1), '2026-11-01')
  assert.ok(dates.includes('2026-10-28'))
})

test('chooses the next quarter hour for today and a morning default for a future day', () => {
  assert.deepEqual(defaultEventTimes('2026-10-28', new Date('2026-10-28T01:07:00.000Z')), {
    date: '2026-10-28',
    startsAt: '2026-10-28T10:15',
    endsAt: '2026-10-28T11:15'
  })
  assert.deepEqual(defaultEventTimes('2026-10-30', new Date('2026-10-28T01:07:00.000Z')), {
    date: '2026-10-30',
    startsAt: '2026-10-30T09:00',
    endsAt: '2026-10-30T10:00'
  })
})

test('moves the default to the next date when today has no future quarter left', () => {
  assert.deepEqual(defaultEventTimes('2026-10-28', new Date('2026-10-28T14:00:00.000Z')), {
    date: '2026-10-29',
    startsAt: '2026-10-29T09:00',
    endsAt: '2026-10-29T10:00'
  })
})

test('provides quarter-hour time choices and same-day valid end times', () => {
  const options = quarterHourOptions()
  assert.equal(options.length, 96)
  assert.equal(options[0], '00:00')
  assert.equal(options.at(-1), '23:45')
  assert.equal(startTimeOptions().at(-1), '23:30')
  assert.deepEqual(endTimeOptions('23:30'), ['23:45'])
  assert.deepEqual(endTimeOptions('23:45'), [])
  assert.equal(endTimeOptions('09:00').at(-1), '23:45')
  assert.equal(defaultEndTime('09:00'), '10:00')
  assert.equal(defaultEndTime('23:30'), '23:45')
  assert.equal(defaultEndTime('23:45'), '')
})
