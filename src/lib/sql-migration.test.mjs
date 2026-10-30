import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migrationUrl = new URL('../../supabase/migrations/202610300001_event_proposals.sql', import.meta.url)

test('event proposal migration does not use WINDOW as a SQL alias', () => {
  const sql = readFileSync(migrationUrl, 'utf8')
  assert.doesNotMatch(sql, /\bas\s+window\b|\bwindow\./i)
})
