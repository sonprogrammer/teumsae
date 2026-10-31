import test from 'node:test'
import assert from 'node:assert/strict'
import { maxVoiceUploadBytes, parseTranscription, resolveVoiceActivity, speechResponse, speechText, validateVoiceUpload, voiceSilenceDurationMs } from './voice-input.mjs'

test('accepts supported audio and rejects empty, oversized, or unsupported uploads', () => {
  assert.deepEqual(validateVoiceUpload({ size: 100, type: 'audio/webm;codecs=opus' }), { ok: true })
  assert.equal(validateVoiceUpload({ size: 0, type: 'audio/webm' }).ok, false)
  assert.equal(validateVoiceUpload({ size: maxVoiceUploadBytes + 1, type: 'audio/webm' }).ok, false)
  assert.equal(validateVoiceUpload({ size: 10, type: 'application/octet-stream' }).ok, false)
})

test('accepts only bounded, nonempty transcription text', () => {
  assert.equal(parseTranscription('  내일 일정 알려줘  '), '내일 일정 알려줘')
  assert.equal(parseTranscription(' '), null)
  assert.equal(parseTranscription('a'.repeat(1001)), null)
})

test('removes markdown syntax before speech synthesis', () => {
  assert.equal(speechText('**안녕하세요** [일정 보기](https://example.com)'), '안녕하세요 일정 보기')
})

test('reads ISO dates and 24-hour time ranges as natural Korean speech', () => {
  assert.equal(speechText('2026‑11‑01 11:00‑14:00'), '2026년 11월 1일 일요일 오전 11시부터 오후 2시까지')
  assert.equal(speechText('일정은 2026-11-01 09:30–11:00입니다'), '일정은 2026년 11월 1일 일요일 오전 9시 30분부터 오전 11시까지입니다')
  assert.equal(speechText('오후 2시 2026-11-01 14:00'), '오후 2시 2026년 11월 1일 일요일 오후 2시')
})

test('adds schedule dates and times to spoken replies without changing text replies', () => {
  const cards = [{ type: 'events', events: [{ title: '팀 회의', starts_at: '2026-11-01T00:00:00.000Z', ends_at: '2026-11-01T01:30:00.000Z' }] }]
  assert.equal(speechResponse('내일 일정이 있어요.', cards), '내일 일정이 있어요. 팀 회의, 11월 1일 일요일 오전 9시부터 오전 10시 30분까지.')
  assert.equal(speechResponse('내일 일정이 있어요.'), '내일 일정이 있어요.')
})

test('ends a voice turn after silence following speech but ignores initial silence', () => {
  assert.equal(resolveVoiceActivity({ rms: 0.001, hasSpeech: false, lastSpeechAt: null, now: 2000 }).shouldSubmit, false)
  const speech = resolveVoiceActivity({ rms: 0.08, hasSpeech: false, lastSpeechAt: null, now: 2000 })
  assert.deepEqual(speech, { hasSpeech: true, lastSpeechAt: 2000, shouldSubmit: false })
  assert.equal(resolveVoiceActivity({ rms: 0.001, ...speech, now: 2000 + voiceSilenceDurationMs - 1 }).shouldSubmit, false)
  assert.equal(resolveVoiceActivity({ rms: 0.001, ...speech, now: 2000 + voiceSilenceDurationMs }).shouldSubmit, true)
})
