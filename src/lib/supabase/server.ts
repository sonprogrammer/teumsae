import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseConfig, supabaseCookieOptions } from './config'

export async function createServerSupabaseClient() {
  const { url, publishableKey } = supabaseConfig()
  const cookieStore = await cookies()
  return createServerClient(url, publishableKey, {
    cookieOptions: supabaseCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Server Components cannot write cookies. The Proxy refreshes sessions.
        }
      }
    }
  })
}
