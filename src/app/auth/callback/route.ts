import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseConfig } from '@/lib/supabase/config'

export async function GET(request: NextRequest) {
  const failure = NextResponse.redirect(new URL('/auth?status=kakao-error', request.url))
  failure.headers.set('Cache-Control', 'private, no-store')
  const code = request.nextUrl.searchParams.get('code')
  if (!code) return failure

  const { url, publishableKey } = supabaseConfig()
  const response = NextResponse.redirect(new URL('/schedule', request.url))
  response.headers.set('Cache-Control', 'private, no-store')
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value))
      }
    }
  })
  try {
    const flowId = request.nextUrl.searchParams.get('sb_flow_id')
    const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined)
    if (!error) return response
  } catch {
    // Invalid or expired codes return to the sign-in screen.
  }
  return failure
}
