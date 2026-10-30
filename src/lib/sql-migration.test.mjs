import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migrationUrl = new URL('../../supabase/migrations/202610300001_event_proposals.sql', import.meta.url)
const candidateLimitMigrationUrl = new URL('../../supabase/migrations/202610300003_availability_candidate_limit.sql', import.meta.url)
const chatTranscriptMigrationUrl = new URL('../../supabase/migrations/202610300004_chat_display_transcript.sql', import.meta.url)
const chatProposalStatusMigrationUrl = new URL('../../supabase/migrations/202610300005_chat_proposal_status.sql', import.meta.url)

test('event proposal migration does not use WINDOW as a SQL alias', () => {
  const sql = readFileSync(migrationUrl, 'utf8')
  assert.doesNotMatch(sql, /\bas\s+window\b|\bwindow\./i)
})

test('availability candidate storage accepts up to twelve candidates', () => {
  const sql = readFileSync(candidateLimitMigrationUrl, 'utf8')
  assert.match(sql, /jsonb_array_length\(p_candidates\) not between 1 and 12/i)
  assert.doesNotMatch(sql, /\bas\s+window\b|\bwindow\./i)
})

test('chat transcript migration stores user-visible messages as a JSON array', () => {
  const sql = readFileSync(chatTranscriptMigrationUrl, 'utf8')
  assert.match(sql, /add column display_messages jsonb not null default '\[\]'::jsonb/i)
  assert.match(sql, /jsonb_typeof\(display_messages\) = 'array'/i)
  assert.doesNotMatch(sql, /\bas\s+window\b|\bwindow\./i)
})

test('chat proposal status RPC is authenticated and owner-scoped', () => {
  const sql = readFileSync(chatProposalStatusMigrationUrl, 'utf8')
  assert.match(sql, /add column replaced_by_id uuid references public\.event_proposals\(id\) on delete cascade/i)
  assert.match(sql, /function public\.recreate_event_proposal\(/i)
  assert.match(sql, /where proposal\.id = p_source_proposal_id and proposal\.owner_id = v_owner_id\s+for update/i)
  assert.match(sql, /grant execute on function public\.recreate_event_proposal\(uuid, uuid, text, integer\) to authenticated/i)
  assert.match(sql, /function public\.get_event_proposal_states\(p_proposal_ids uuid\[\]\)/i)
  assert.match(sql, /auth\.uid\(\)/i)
  assert.match(sql, /proposal\.owner_id = v_owner_id/i)
  assert.match(sql, /proposal\.state = 'pending'/i)
  assert.match(sql, /proposal\.expires_at <= pg_catalog\.clock_timestamp\(\)/i)
  assert.match(sql, /replacement\.created_at/i)
  assert.match(sql, /left join public\.event_proposals as replacement/i)
  assert.match(sql, /grant execute on function public\.get_event_proposal_states\(uuid\[\]\) to authenticated/i)
  assert.match(sql, /proposal\.replaced_by_id/i)
  assert.doesNotMatch(sql, /grant execute on function public\.get_event_proposal_states\(uuid\[\]\) to (public|anon)/i)
  assert.doesNotMatch(sql, /\bas\s+window\b|\bwindow\./i)
})
