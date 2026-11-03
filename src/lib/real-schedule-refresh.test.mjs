import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('refreshes stale schedule data on focus and offers a range refresh control', async () => {
  const source = await readFile(new URL('../components/real-schedule.tsx', import.meta.url), 'utf8')
  assert.match(source, /refetchOnWindowFocus: 'always'/)
  assert.match(source, /dataUpdatedAt/)
  assert.match(source, /eventsQuery\.refetch\(\)/)
  assert.match(source, /disabled=\{eventsQuery\.isFetching/)
  assert.match(source, /최근 확인/)
  assert.match(source, /aria-label=\{eventsQuery\.isFetching \? '일정 확인 중' : '일정 새로고침'\}/)
})

test('keeps the last checked label and refresh control usable on narrow screens', async () => {
  const stylesheet = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8')
  assert.match(stylesheet, /\.real-calendar-refresh[^{]*\{[^}]*display: flex/)
  assert.match(stylesheet, /\.real-calendar-refresh-button[^{]*\{[^}]*width: 40px[^}]*height: 40px/)
  assert.match(stylesheet, /@media \(max-width: 480px\)[\s\S]*?\.real-period-caption[^{]*\{[^}]*flex-direction: column/)
})
