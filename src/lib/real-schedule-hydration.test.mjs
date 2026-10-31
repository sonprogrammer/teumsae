import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../components/real-schedule.tsx', import.meta.url), 'utf8')

test('restores browser schedule cache after hydration instead of using it as SSR initial data', () => {
  const queryOptions = source.slice(source.indexOf('const eventsQuery = useQuery'), source.indexOf('const events = eventsQuery.data'))
  assert.doesNotMatch(queryOptions, /initialData|browserScheduleCache/)
  assert.match(source, /if \(eventsQuery\.data !== undefined\) return\s+const cachedSchedule = browserScheduleCache\(userId, from, to\)/)
  assert.match(source, /queryClient\.setQueryData\(eventQueryKeys\.range\(userId, from, to\), cachedSchedule\.events, \{ updatedAt: cachedSchedule\.savedAt \}\)/)
})
