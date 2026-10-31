import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const serviceWorker = await readFile(new URL('../../public/sw.js', import.meta.url), 'utf8')
const offlinePage = await readFile(new URL('../../public/offline.js', import.meta.url), 'utf8')
const manifest = await readFile(new URL('../app/manifest.ts', import.meta.url), 'utf8')
const appleIcon = await readFile(new URL('../app/apple-icon.tsx', import.meta.url), 'utf8')
const browserIcon = await readFile(new URL('../app/icon.tsx', import.meta.url), 'utf8')

test('provides install metadata and a high resolution app icon', () => {
  assert.match(manifest, /display:\s*'standalone'/)
  assert.match(manifest, /start_url:\s*'\/schedule'/)
  assert.match(manifest, /512x512/)
  assert.match(manifest, /src: '\/teumsae-app-icon\.png', sizes: '1254x1254', type: 'image\/png', purpose: 'any'/)
  assert.match(appleIcon, /'teumsae-app-icon\.png'/)
  assert.match(browserIcon, /'teumsae-app-icon\.png'/)
  assert.doesNotMatch(appleIcon + browserIcon, /'teumsae-logo\.png'/)
})

test('uses the offline page as a navigation fallback without caching private HTML or API responses', () => {
  assert.ok(serviceWorker.includes("cache.addAll(['/offline.html'"))
  assert.ok(serviceWorker.includes("request.mode === 'navigate'"))
  assert.match(serviceWorker, /caches\.match\(OFFLINE_URL\)/)
  assert.match(serviceWorker, /new URL\(request\.url\)\.origin !== self\.location\.origin/)
  assert.doesNotMatch(serviceWorker, /cache\.put\(request,\s*response\)/)
})

test('offline page only reveals the current signed-in user cache and renders event text safely', () => {
  assert.match(offlinePage, /teumsae:offline-user/)
  assert.match(offlinePage, /teumsae:schedule-cache:v1:/)
  assert.match(offlinePage, /textContent/)
  assert.doesNotMatch(offlinePage, /innerHTML/)
})
