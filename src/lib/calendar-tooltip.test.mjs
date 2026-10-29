import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const demo = await readFile(new URL('../components/schedule-demo.tsx', import.meta.url), 'utf8')
const schedule = await readFile(new URL('../components/real-schedule.tsx', import.meta.url), 'utf8')
const stylesheet = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8')

test('exposes complete schedule details to custom tooltips in sample and signed-in calendars', () => {
  assert.match(demo, /data-tooltip=\{event\.title/)
  assert.match(schedule, /className="real-calendar-event"[^>]*data-tooltip=/)
  assert.match(stylesheet, /\.event-block::after \{[^}]*content: attr\(data-tooltip\)/)
  assert.match(stylesheet, /\.real-calendar-event::after \{[^}]*content: attr\(data-tooltip\)/)
  assert.match(stylesheet, /\.real-calendar-event::after \{[^}]*bottom: calc\(100% \+ 8px\)/)
})
