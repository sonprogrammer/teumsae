import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const settings = await readFile(new URL('../components/availability-settings.tsx', import.meta.url), 'utf8')
const demo = await readFile(new URL('../components/schedule-demo.tsx', import.meta.url), 'utf8')
const stylesheet = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8')

test('lets weekly availability save without requiring a vacation date', () => {
  const exceptionForm = settings.match(/<div className="availability-exception-form">([\s\S]*?)<\/div>/)?.[1]
  assert.ok(exceptionForm)
  assert.doesNotMatch(exceptionForm, /\brequired\b/)
  assert.match(settings, /function addException\(\)[\s\S]*?parseScheduleAvailability/)
})

test('shows calendar event details in a project-styled custom tooltip', () => {
  assert.doesNotMatch(demo, /title=\{event\.title/)
  assert.match(demo, /data-tooltip=\{event\.title/)
  assert.match(stylesheet, /\.event-block::after[\s\S]*?content: attr\(data-tooltip\)/)
  assert.match(stylesheet, /\.event-block::after \{[^}]*bottom: calc\(100% \+ 8px\)/)
  assert.match(stylesheet, /\.event-block::before \{[^}]*transform: translateX\(-50%\) rotate\(45deg\)/)
})
