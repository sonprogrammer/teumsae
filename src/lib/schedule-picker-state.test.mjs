import assert from 'node:assert/strict'
import test from 'node:test'
import { toggleSchedulePicker } from './schedule-picker-state.ts'

test('opening a picker closes any other active picker', () => {
  assert.equal(toggleSchedulePicker('date', 'start'), 'start')
  assert.equal(toggleSchedulePicker('start', 'end'), 'end')
})

test('toggling the active picker closes it', () => {
  assert.equal(toggleSchedulePicker('date', 'date'), null)
})
