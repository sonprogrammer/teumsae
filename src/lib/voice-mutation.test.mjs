import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const migration = readFileSync(new URL('../../supabase/migrations/202610310002_voice_event_mutations.sql', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/speech-transcribe/route.ts', import.meta.url), 'utf8')
const assistantPanel = readFileSync(new URL('../components/assistant-panel.tsx', import.meta.url), 'utf8')
const creationMigration = readFileSync(new URL('../../supabase/migrations/202610300001_event_proposals.sql', import.meta.url), 'utf8')
const migrations = readdirSync(new URL('../../supabase/migrations/', import.meta.url)).sort().map(file => readFileSync(new URL('../../supabase/migrations/' + file, import.meta.url), 'utf8'))
const changeProposalMigration = migrations.filter(source => source.includes('create or replace function public.create_event_change_proposal')).at(-1) ?? ''
const changeProposalFunction = changeProposalMigration.match(/create or replace function public\.create_event_change_proposal\([\s\S]*?\n\$\$;/i)?.[0] ?? ''
const createProposalFunction = creationMigration.match(/create or replace function public\.create_event_proposal\([\s\S]*?\n\$\$;/i)?.[0] ?? ''
const confirmProposalFunction = migration.match(/create or replace function public\.confirm_event_proposal\([\s\S]*?\n\$\$;/i)?.[0] ?? ''
const assistantTools = readFileSync(new URL('./assistant-tools.ts', import.meta.url), 'utf8')

test('voice transcription requires an authenticated owner and usage quota before contacting Groq', () => {
  assert.ok(route.indexOf('supabase.auth.getClaims()') < route.indexOf('api.groq.com/openai/v1/audio/transcriptions'))
  assert.ok(route.indexOf("supabase.rpc('consume_speech_request')") < route.indexOf('api.groq.com/openai/v1/audio/transcriptions'))
  assert.match(route, /GROQ_API_KEY/)
  assert.doesNotMatch(route, /NEXT_PUBLIC_GROQ_API_KEY/)
})

test('stops continuous listening when speech or chat reaches its minute limit', () => {
  assert.match(assistantPanel, /response\.status === 429[\s\S]*?stopVoiceSession\(false\)/)
  assert.match(assistantPanel, /\['AI_USAGE_LIMIT', 'GROQ_SHARED_LIMIT', 'MODEL_RATE_LIMIT'\]\.includes\(payload\.code \?\? ''\)[\s\S]*?stopVoiceSession\(false\)/)
})

test('uses event details only for synthesized speech', () => {
  assert.match(assistantPanel, /speak\(speechResponse\(payload\.response, payload\.cards\), voiceSessionId\)/)
})

test('cancels in-flight voice transcription and chat requests when voice stops', () => {
  assert.match(assistantPanel, /const voiceRequestControllerRef = useRef<AbortController \| null>\(null\)/)
  assert.match(assistantPanel, /voiceRequestControllerRef\.current\?\.abort\(\)/)
  assert.match(assistantPanel, /fetch\('\/api\/speech-transcribe',[\s\S]*?signal: controller\.signal/)
  assert.match(assistantPanel, /sendMessage\(transcript, true, sessionId, controller\.signal\)/)
  assert.match(assistantPanel, /if \(signal\?\.aborted\) \{[\s\S]*?setOptimisticTranscript\(null\)/)
  assert.match(route, /AbortSignal\.any\(\[request\.signal, AbortSignal\.timeout\(15000\)\]\)/)
})

test('propagates chat request cancellation to in-flight model and tool calls', () => {
  const chatRoute = readFileSync(new URL('../app/api/chat/route.ts', import.meta.url), 'utf8')
  assert.match(chatRoute, /request\.signal\.addEventListener\('abort', abortFromClient/)
  assert.match(chatRoute, /signal: controller\.signal/)
  assert.match(chatRoute, /request\.signal\.removeEventListener\('abort', abortFromClient\)/)
  assert.match(chatRoute, /if \(controller\.signal\.aborted\) requestFailure = \{ code: 'AI_TIMEOUT'/)
  assert.ok(chatRoute.indexOf("if (controller.signal.aborted) requestFailure") < chatRoute.indexOf('const nextMessages ='))
})

test('voice mutation proposals are owner scoped and reject stale versions before mutation', () => {
  assert.match(migration, /security definer[\s\S]*?v_owner_id uuid := auth\.uid\(\)/)
  assert.match(migration, /where event\.id = p_event_id and event\.owner_id = v_owner_id/)
  assert.match(migration, /v_event\.version <> p_expected_version/)
  assert.match(migration, /v_event\.version <> v_proposal\.expected_event_version/)
  assert.match(migration, /where id = v_proposal\.target_event_id and owner_id = v_owner_id/)
  assert.match(migration, /grant execute on function public\.create_event_change_proposal[\s\S]*to authenticated/)
  assert.doesNotMatch(migration, /\bas\s+window\b|\bwindow\./i)
})

test('prevents a conflicting update proposal before it can create a confirmation card', () => {
  const normalizedFunction = changeProposalFunction.replace(/\s+/g, ' ')
  const conflictQuery = normalizedFunction.indexOf('event.id <> v_event.id and event.starts_at < v_ends_at and event.ends_at > v_starts_at')
  const proposalInsert = normalizedFunction.indexOf('insert into public.event_proposals')
  assert.ok(conflictQuery >= 0)
  assert.ok(conflictQuery < proposalInsert)
  assert.match(normalizedFunction, /v_seconds < 900/)
  assert.doesNotMatch(normalizedFunction, /v_seconds not between 900 and 14400/)
  assert.match(changeProposalFunction, /jsonb_build_object\('status', 'conflict'/)
  assert.match(assistantTools, /if \(result\.status === 'conflict'\)[\s\S]*?EVENT_CONFLICT/)
  assert.doesNotMatch(changeProposalMigration, /\bas\s+window\b|\bwindow\./i)
  assert.match(confirmProposalFunction, /event\.id <> v_proposal\.target_event_id and event\.starts_at < v_proposal\.ends_at and event\.ends_at > v_proposal\.starts_at/)
})

test('prevents a conflicting event creation proposal before it can create a confirmation card', () => {
  const normalizedFunction = createProposalFunction.replace(/\s+/g, ' ')
  const conflictCheck = normalizedFunction.indexOf('if pg_catalog.jsonb_array_length(v_conflicts) > 0')
  const proposalInsert = normalizedFunction.indexOf('insert into public.event_proposals')
  assert.ok(conflictCheck >= 0)
  assert.ok(conflictCheck < proposalInsert)
  assert.match(normalizedFunction, /return pg_catalog\.jsonb_build_object\('status', 'conflict'/)
  const conflictResponse = assistantTools.indexOf("if (result.status !== 'pending' && result.status !== 'confirmed')")
  const createCard = assistantTools.indexOf("const card: AssistantCard = { type: 'proposal'", conflictResponse)
  assert.ok(conflictResponse >= 0)
  assert.ok(createCard > conflictResponse)
})
