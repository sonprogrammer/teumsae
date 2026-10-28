import assert from 'node:assert/strict'
import test from 'node:test'
import { supabaseConfig } from './supabase/config.ts'

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
