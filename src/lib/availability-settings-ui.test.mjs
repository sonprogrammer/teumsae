import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const settings = await readFile(new URL('../components/availability-settings.tsx', import.meta.url), 'utf8')
const navigation = await readFile(new URL('../components/settings-navigation.tsx', import.meta.url), 'utf8').catch(() => '')

test('lets weekly availability save without requiring a vacation date', () => {
  const exceptionForm = settings.match(/<div className="availability-exception-form">([\s\S]*?)<\/div>/)?.[1]
  assert.ok(exceptionForm)
  assert.doesNotMatch(exceptionForm, /\brequired\b/)
  assert.match(settings, /function addException\(\)[\s\S]*?parseScheduleAvailability/)
})

test('provides separate weekly, unavailable-date and reminder categories', () => {
  assert.match(navigation, /aria-label="설정 항목"/)
  assert.match(navigation, /요일별 가능 시간/)
  assert.match(navigation, /일정 불가일/)
  assert.match(navigation, /알림/)
  assert.match(navigation, /AvailabilitySettings userId=\{userId\} mode="weekly"/)
  assert.match(navigation, /AvailabilitySettings userId=\{userId\} mode="exceptions"/)
  assert.match(navigation, /PushReminderSettings/)
  assert.match(navigation, /settings-empty-state/)
})

test('starts with no selected settings category', () => {
  assert.match(navigation, /useState<SettingsCategory \| null>\(null\)/)
  assert.match(navigation, /aria-current=\{selectedCategory === id \? 'page' : undefined\}/)
  assert.match(navigation, /setSelectedCategory\(null\); setDetailOpen\(false\)/)
})

test('puts the settings-list control left of the detail title without an English kicker', () => {
  assert.doesNotMatch(navigation, /SCHEDULE PREFERENCES/)
  assert.match(navigation, /settings-back-button/)
  assert.match(navigation, /settings-back-button[\s\S]*?<h2/)
  assert.match(navigation, /설정 목록으로 돌아가기/)
})

test('saves weekly hours and unavailable dates independently while preserving the other settings', () => {
  assert.match(settings, /mode: 'weekly' \| 'exceptions'/)
  assert.match(settings, /mode === 'weekly' \? \{ weekly, exceptions: initial\.exceptions \} : \{ weekly: initial\.weekly, exceptions \}/)
  assert.match(settings, /mode === 'weekly' && <section[^>]*weekly-availability-title/)
  assert.match(settings, /mode === 'exceptions' && <section[^>]*availability-exceptions-title/)
  assert.match(settings, /저장 중…/)
})
