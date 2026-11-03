import assert from 'node:assert/strict'
import test from 'node:test'
import { formatScheduleUpdatedAt } from './schedule-refresh-status.mjs'

test('shows when the schedule has not been checked yet', () => {
  assert.equal(formatScheduleUpdatedAt(null), '확인 전')
})

test('formats the last successful schedule update in Korea time', () => {
  assert.equal(formatScheduleUpdatedAt(Date.parse('2026-11-03T15:30:00.000Z')), '11월 4일 00:30')
})
