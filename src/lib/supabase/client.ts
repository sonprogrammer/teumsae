import { createBrowserClient } from '@supabase/ssr'
import { supabaseConfig } from './config'

export function createBrowserSupabaseClient() {
  const { url, publishableKey } = supabaseConfig()
  return createBrowserClient(url, publishableKey)
}
