import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { unlockSpeechSynthesis } from './voice-input.mjs'

const assistantPanel = readFileSync(new URL('../components/assistant-panel.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

test('primes speech synthesis synchronously from controls that begin a voice reply', () => {
  assert.match(assistantPanel, /function submit\([\s\S]*?if \(speakReplies\) unlockSpeechSynthesis/)
  assert.match(assistantPanel, /async function startVoiceSession\(\) \{[\s\S]*?unlockSpeechSynthesis/)
  assert.match(assistantPanel, /setSpeakReplies\(next\)[\s\S]*?if \(next\) unlockSpeechSynthesis/)
})

test('sets all mobile text-entry controls to at least 16px to avoid browser input zoom', () => {
  const mobileStyles = styles.slice(styles.lastIndexOf('@media (max-width: 700px)'))
  assert.match(mobileStyles, /input:not\(\[type="hidden"\]\):not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="range"\]\):not\(\[type="button"\]\):not\(\[type="submit"\]\):not\(\[type="reset"\]\):not\(\[type="file"\]\), textarea, \.assistant-live-form textarea, \.real-event-form textarea, select, \.push-reminder-lead-time select \{ font-size: 16px; \}/)
})

test('unlocks speech in the current gesture with an inaudible Korean utterance', () => {
  const spoken = []
  class FakeUtterance {
    constructor(text) {
      this.text = text
      this.volume = 1
      this.lang = ''
    }
  }
  const synthesis = {
    cancel() { spoken.push('cancel') },
    speak(utterance) { spoken.push(utterance) }
  }

  assert.equal(unlockSpeechSynthesis(synthesis, FakeUtterance), true)
  assert.equal(spoken[0], 'cancel')
  assert.equal(spoken[1].text, ' ')
  assert.equal(spoken[1].volume, 0)
  assert.equal(spoken[1].lang, 'ko-KR')
  assert.equal(unlockSpeechSynthesis(undefined, FakeUtterance), false)
})
