import { createBrowserClient } from '@supabase/ssr'
import { supabaseConfig, supabaseCookieOptions } from './config'

export function createBrowserSupabaseClient() {
  const { url, publishableKey } = supabaseConfig()
  return createBrowserClient(url, publishableKey, { cookieOptions: supabaseCookieOptions() })
}
