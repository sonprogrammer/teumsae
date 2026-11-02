import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('redirects signed-in visitors from the landing and sign-in pages to their schedule', async () => {
  const home = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8')
  const auth = await readFile(new URL('../app/auth/page.tsx', import.meta.url), 'utf8')
  for (const source of [home, auth]) {
    assert.match(source, /auth\.getClaims\(\)/)
    assert.match(source, /typeof data\?\.claims\?\.sub === 'string'/)
    assert.match(source, /redirect\(['"]\/schedule['"]\)/)
  }
})

test('refreshes Supabase sessions on both public entry routes and protected schedule routes', async () => {
  const proxy = await readFile(new URL('../proxy.ts', import.meta.url), 'utf8')
  assert.match(proxy, /matcher:\s*\[['"]\/['"],\s*['"]\/auth\/:path\*['"],\s*['"]\/schedule\/:path\*['"]\]/)
})

test('keeps the OAuth callback success destination on the schedule', async () => {
  const callback = await readFile(new URL('../app/auth/callback/route.ts', import.meta.url), 'utf8')
  assert.match(callback, /NextResponse\.redirect\(new URL\(['"]\/schedule['"], request\.url\)\)/)
})
