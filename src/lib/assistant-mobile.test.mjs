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

test('sets assistant input to at least 16px on mobile to avoid browser input zoom', () => {
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*?\.assistant-live-form textarea \{ font-size: 16px; \}/)
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
