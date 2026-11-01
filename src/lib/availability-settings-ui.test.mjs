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

test('provides separate settings categories and a mobile path back to the list', async () => {
  const navigation = await readFile(new URL('../components/settings-navigation.tsx', import.meta.url), 'utf8').catch(() => '')
  assert.match(navigation, /aria-label="설정 항목"/)
  assert.match(navigation, /일정 추천/)
  assert.match(navigation, /알림/)
  assert.match(navigation, /설정 목록으로 돌아가기/)
  assert.match(navigation, /AvailabilitySettings/)
  assert.match(navigation, /PushReminderSettings/)
  assert.match(navigation, /hidden=/)
})

test('keeps the last selected category highlighted when returning to the list', async () => {
  const navigation = await readFile(new URL('../components/settings-navigation.tsx', import.meta.url), 'utf8')
  assert.match(navigation, /useState<SettingsCategory>\('availability'\)/)
  assert.match(navigation, /setSelectedCategory\(id\)/)
  assert.match(navigation, /setDetailOpen\(false\)/)
})
