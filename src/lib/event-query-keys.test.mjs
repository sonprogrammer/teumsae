import assert from 'node:assert/strict'
import test from 'node:test'
import { eventQueryKeys } from './event-query-keys.ts'

test('separates event cache by user and requested period', () => {
  const firstUser = eventQueryKeys.range('user-1', '2026-10-26', '2026-11-02')
  assert.deepEqual(firstUser, ['events', 'user-1', '2026-10-26', '2026-11-02'])
  assert.notDeepEqual(firstUser, eventQueryKeys.range('user-2', '2026-10-26', '2026-11-02'))
  assert.notDeepEqual(firstUser, eventQueryKeys.range('user-1', '2026-11-02', '2026-11-09'))
})
