import assert from 'node:assert/strict'
import test from 'node:test'
import { monthGrid, shiftMonth } from './calendar-grid.ts'

test('February 2021 fills exactly four Monday-first weeks', () => {
  const dates = monthGrid('2021-02-14')
  assert.equal(dates.length, 28)
  assert.equal(dates[0], '2021-02-01')
  assert.equal(dates.at(-1), '2021-02-28')
})

test('October 2026 includes adjacent days in five complete weeks', () => {
  const dates = monthGrid('2026-10-15')
  assert.equal(dates.length, 35)
  assert.equal(dates[0], '2026-09-28')
  assert.equal(dates[3], '2026-10-01')
  assert.equal(dates.at(-1), '2026-11-01')
})

test('month navigation crosses years and selects the first day', () => {
  assert.equal(shiftMonth('2026-12-31', 1), '2027-01-01')
  assert.equal(shiftMonth('2027-01-15', -1), '2026-12-01')
})
