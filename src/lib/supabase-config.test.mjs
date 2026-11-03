import assert from 'node:assert/strict'
import test from 'node:test'
import { supabaseConfig, supabaseCookieOptions } from './supabase/config.ts'

test('reports missing public configuration without including values', () => {
  assert.throws(() => supabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'example-key' }), /^Error: Supabase public configuration is missing$/)
  assert.throws(() => supabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' }), /^Error: Supabase public configuration is missing$/)
})

test('returns the configured project URL and publishable key', () => {
  assert.deepEqual(supabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'example-key' }), {
    url: 'https://example.supabase.co',
    publishableKey: 'example-key'
  })
})

test('sets Secure only for production Supabase session cookies', () => {
  assert.deepEqual(supabaseCookieOptions('production'), { secure: true })
  assert.deepEqual(supabaseCookieOptions('development'), { secure: false })
  assert.deepEqual(supabaseCookieOptions('test'), { secure: false })
})

test('applies common cookie options to browser, server, and Proxy clients', async () => {
  const paths = ['./supabase/server.ts', './supabase/client.ts', './supabase/proxy.ts', '../app/auth/callback/route.ts']
  for (const path of paths) {
    const source = await (await import('node:fs/promises')).readFile(new URL(path, import.meta.url), 'utf8')
    assert.match(source, /cookieOptions:\s*supabaseCookieOptions\(\)/, path)
  }
})
