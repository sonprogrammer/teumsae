import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(new URL('../../supabase/migrations/202611030001_ai_model_request_limits.sql', import.meta.url), 'utf8')
const chatRoute = readFileSync(new URL('../app/api/chat/route.ts', import.meta.url), 'utf8')

test('keeps the account prompt limit separate from the shared Groq request limits', () => {
  assert.match(migration, /coalesce\(minute_count, 0\) >= 10/)
  assert.match(migration, /coalesce\(minute_count, 0\) >= 30/)
  assert.match(migration, /coalesce\(day_count, 0\) >= 1000/)
  assert.match(migration, /grant execute on function public\.consume_groq_model_request\(\) to service_role/)
  assert.match(migration, /grant execute on function public\.record_groq_model_usage\(integer, timestamptz, timestamptz\) to service_role/)
  assert.doesNotMatch(migration, /\bas\s+window\b|\bwindow\./i)
})

test('reserves each provider request before fetch and records returned token usage', () => {
  assert.ok(chatRoute.indexOf("usageAdmin.rpc('consume_groq_model_request')") < chatRoute.indexOf('fetch(modelUrl'))
  assert.match(chatRoute, /usageAdmin\.rpc\('record_groq_model_usage'/)
  assert.match(chatRoute, /getRetryAfterSeconds\(response\.headers\.get\('retry-after'\)\)/)
})

test('hides a prior event lookup card after creating an update or delete proposal', () => {
  assert.match(chatRoute, /if \(result\.card\.type === 'proposal'[\s\S]*?cards\[index\]\.type === 'events'[\s\S]*?cards\.splice\(index, 1\)/)
  assert.match(chatRoute, /createMutationProposalSummary\(mutationProposal\)/)
  assert.match(chatRoute, /createEventListSummary\(cards, toolLog, parsed\.value\.message\)/)
})
