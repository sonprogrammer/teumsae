import assert from 'node:assert/strict'
import test from 'node:test'
import { createQueryClient } from './query-client.ts'

test('uses bounded client cache defaults for schedule reads', () => {
  const queryClient = createQueryClient()
  const defaults = queryClient.getDefaultOptions().queries
  assert.equal(defaults.staleTime, 60000)
  assert.equal(defaults.gcTime, 600000)
  assert.equal(defaults.refetchOnWindowFocus, false)
  assert.equal(defaults.retry, 1)
  queryClient.clear()
})

test('reuses fresh query data and refetches after explicit invalidation', async () => {
  const queryClient = createQueryClient()
  const queryKey = ['events', 'user-1', '2026-10-26', '2026-11-02']
  let requestCount = 0
  const queryFn = async () => ++requestCount
  const options = { queryKey, queryFn }

  assert.equal(await queryClient.fetchQuery(options), 1)
  assert.equal(await queryClient.fetchQuery(options), 1)
  assert.equal(requestCount, 1)

  await queryClient.invalidateQueries({ queryKey: ['events', 'user-1'] })
  assert.equal(await queryClient.fetchQuery(options), 2)
  queryClient.clear()
})
