import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migrationUrl = new URL('../../supabase/migrations/202610300001_event_proposals.sql', import.meta.url)
const candidateLimitMigrationUrl = new URL('../../supabase/migrations/202610300003_availability_candidate_limit.sql', import.meta.url)

test('event proposal migration does not use WINDOW as a SQL alias', () => {
  const sql = readFileSync(migrationUrl, 'utf8')
  assert.doesNotMatch(sql, /\bas\s+window\b|\bwindow\./i)
})

test('availability candidate storage accepts up to twelve candidates', () => {
  const sql = readFileSync(candidateLimitMigrationUrl, 'utf8')
  assert.match(sql, /jsonb_array_length\(p_candidates\) not between 1 and 12/i)
  assert.doesNotMatch(sql, /\bas\s+window\b|\bwindow\./i)
})
