import test from 'node:test'
import assert from 'node:assert/strict'
import { maxVoiceUploadBytes, parseTranscription, resolveVoiceActivity, speechText, validateVoiceUpload, voiceSilenceDurationMs } from './voice-input.mjs'

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

test('ends a voice turn after silence following speech but ignores initial silence', () => {
  assert.equal(resolveVoiceActivity({ rms: 0.001, hasSpeech: false, lastSpeechAt: null, now: 2000 }).shouldSubmit, false)
  const speech = resolveVoiceActivity({ rms: 0.08, hasSpeech: false, lastSpeechAt: null, now: 2000 })
  assert.deepEqual(speech, { hasSpeech: true, lastSpeechAt: 2000, shouldSubmit: false })
  assert.equal(resolveVoiceActivity({ rms: 0.001, ...speech, now: 2000 + voiceSilenceDurationMs - 1 }).shouldSubmit, false)
  assert.equal(resolveVoiceActivity({ rms: 0.001, ...speech, now: 2000 + voiceSilenceDurationMs }).shouldSubmit, true)
})
