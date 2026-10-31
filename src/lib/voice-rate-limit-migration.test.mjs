import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(new URL('../../supabase/migrations/202610310003_voice_transcription_rate_limit.sql', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/speech-transcribe/route.ts', import.meta.url), 'utf8')

test('voice transcription has its own bounded per-minute limit separate from AI turns', () => {
  assert.match(migration, /scope in \('user_minute', 'user_speech_minute'\)/i)
  assert.match(migration, /function public\.consume_speech_request\(\)/i)
  assert.match(migration, /coalesce\(minute_count,\s*0\)\s*>=\s*3/i)
  assert.doesNotMatch(migration, /\bwindow\b/i)
  assert.match(route, /supabase\.rpc\('consume_speech_request'\)/)
  assert.match(route, /분당 음성 인식 한도를 초과했어요/)
})
