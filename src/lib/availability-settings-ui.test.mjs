import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const settings = await readFile(new URL('../components/availability-settings.tsx', import.meta.url), 'utf8')

test('lets weekly availability save without requiring a vacation date', () => {
  const exceptionForm = settings.match(/<div className="availability-exception-form">([\s\S]*?)<\/div>/)?.[1]
  assert.ok(exceptionForm)
  assert.doesNotMatch(exceptionForm, /\brequired\b/)
  assert.match(settings, /function addException\(\)[\s\S]*?parseScheduleAvailability/)
})
