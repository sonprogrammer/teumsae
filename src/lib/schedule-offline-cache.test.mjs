import assert from 'node:assert/strict'
import test from 'node:test'
import { clearAllScheduleCache, clearScheduleCache, createScheduleCacheKey, readScheduleCache, saveScheduleCache } from './schedule-offline-cache.mjs'

function createStorage() {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
    keys: () => [...values.keys()],
    get length() { return values.size }
  }
}

const events = [{ id: 'event-1', title: '회의', note: null, starts_at: '2026-11-01T00:00:00.000Z', ends_at: '2026-11-01T01:00:00.000Z', version: 1 }]

test('partitions cached schedules by owner and requested period', () => {
  assert.notEqual(createScheduleCacheKey('user-a', 'from', 'to'), createScheduleCacheKey('user-b', 'from', 'to'))
  assert.notEqual(createScheduleCacheKey('user-a', 'from', 'to'), createScheduleCacheKey('user-a', 'next', 'to'))
})

test('restores a fresh owner-scoped schedule snapshot', () => {
  const storage = createStorage()
  saveScheduleCache(storage, 'user-a', 'from', 'to', events, 1000)
  assert.deepEqual(readScheduleCache(storage, 'user-a', 'from', 'to', 2000), { events, savedAt: 1000 })
  assert.equal(readScheduleCache(storage, 'user-b', 'from', 'to', 2000), null)
})

test('ignores expired or malformed schedule snapshots', () => {
  const storage = createStorage()
  saveScheduleCache(storage, 'user-a', 'from', 'to', events, 1000)
  assert.equal(readScheduleCache(storage, 'user-a', 'from', 'to', 1000 + 7 * 24 * 60 * 60 * 1000 + 1), null)
  storage.setItem(createScheduleCacheKey('user-a', 'other', 'to'), '{')
  assert.equal(readScheduleCache(storage, 'user-a', 'other', 'to', 2000), null)
})

test('clears only the signed-out user schedule snapshots', () => {
  const storage = createStorage()
  saveScheduleCache(storage, 'user-a', 'from', 'to', events, 1000)
  saveScheduleCache(storage, 'user-b', 'from', 'to', events, 1000)
  clearScheduleCache(storage, 'user-a')
  assert.equal(readScheduleCache(storage, 'user-a', 'from', 'to', 2000), null)
  assert.deepEqual(readScheduleCache(storage, 'user-b', 'from', 'to', 2000), { events, savedAt: 1000 })
})

test('clears all schedule snapshots and the offline identity marker', () => {
  const storage = createStorage()
  saveScheduleCache(storage, 'user-a', 'from', 'to', events, 1000)
  storage.setItem('teumsae:offline-user', 'user-a')
  storage.setItem('other-app:data', 'keep')
  clearAllScheduleCache(storage)
  assert.equal(readScheduleCache(storage, 'user-a', 'from', 'to', 2000), null)
  assert.equal(storage.getItem('teumsae:offline-user'), null)
  assert.equal(storage.getItem('other-app:data'), 'keep')
})
