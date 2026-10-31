import { NextResponse } from 'next/server'
import { parsePushSubscription } from '@/lib/push-reminders.mjs'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const privateHeaders = { 'Cache-Control': 'private, no-store' }

async function getAuthenticatedClient() {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (error || typeof userId !== 'string') return null
  return { supabase, userId }
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedClient()
  if (!auth) return NextResponse.json({ message: '로그인이 필요해요.' }, { status: 401, headers: privateHeaders })
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ message: '이 기기의 푸시 구독 정보를 확인해 주세요.' }, { status: 400, headers: privateHeaders }) }
  const parsed = parsePushSubscription(body)
  if (!parsed.ok) return NextResponse.json({ message: '이 기기의 푸시 구독 정보를 확인해 주세요.' }, { status: 400, headers: privateHeaders })
  const { error } = await auth.supabase.from('push_subscriptions').upsert({ owner_id: auth.userId, endpoint: parsed.value.endpoint, p256dh: parsed.value.keys.p256dh, auth_key: parsed.value.keys.auth, disabled_at: null, updated_at: new Date().toISOString() }, { onConflict: 'endpoint' })
  if (error) return NextResponse.json({ message: '알림 기기를 등록하지 못했어요.' }, { status: 500, headers: privateHeaders })
  return NextResponse.json({ saved: true }, { headers: privateHeaders })
}

export async function DELETE(request: Request) {
  const auth = await getAuthenticatedClient()
  if (!auth) return NextResponse.json({ message: '로그인이 필요해요.' }, { status: 401, headers: privateHeaders })
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ message: '알림 기기 정보를 확인해 주세요.' }, { status: 400, headers: privateHeaders }) }
  const endpoint = body && typeof body === 'object' ? (body as Record<string, unknown>).endpoint : null
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return NextResponse.json({ message: '알림 기기 정보를 확인해 주세요.' }, { status: 400, headers: privateHeaders })
  try {
    const url = new URL(endpoint)
    if (url.protocol !== 'https:' || url.username || url.password) return NextResponse.json({ message: '알림 기기 정보를 확인해 주세요.' }, { status: 400, headers: privateHeaders })
  } catch { return NextResponse.json({ message: '알림 기기 정보를 확인해 주세요.' }, { status: 400, headers: privateHeaders }) }
  const { error } = await auth.supabase.from('push_subscriptions').delete().eq('owner_id', auth.userId).eq('endpoint', endpoint)
  if (error) return NextResponse.json({ message: '알림 기기를 해제하지 못했어요.' }, { status: 500, headers: privateHeaders })
  return NextResponse.json({ removed: true }, { headers: privateHeaders })
}
