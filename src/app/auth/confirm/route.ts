import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseConfig } from '@/lib/supabase/config'

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash')
  const type = request.nextUrl.searchParams.get('type')
  if (tokenHash && type === 'email') {
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
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
    if (!error) return response
  }
  const failure = NextResponse.redirect(new URL('/auth?status=confirmation-error', request.url))
  failure.headers.set('Cache-Control', 'private, no-store')
  return failure
}
