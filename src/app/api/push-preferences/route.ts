import { NextResponse } from 'next/server'
import { parseReminderSettings } from '@/lib/push-reminders.mjs'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const privateHeaders = { 'Cache-Control': 'private, no-store' }

async function getAuthenticatedClient() {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (error || typeof userId !== 'string') return null
  return { supabase, userId }
}

export async function GET() {
  const auth = await getAuthenticatedClient()
  if (!auth) return NextResponse.json({ message: '로그인이 필요해요.' }, { status: 401, headers: privateHeaders })
  const { data, error } = await auth.supabase.from('event_reminder_preferences').select('enabled, minutes_before').eq('owner_id', auth.userId).maybeSingle()
  if (error) return NextResponse.json({ message: '알림 설정을 불러오지 못했어요.' }, { status: 500, headers: privateHeaders })
  return NextResponse.json({ enabled: data?.enabled ?? false, minutesBefore: data?.minutes_before ?? 15, vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null }, { headers: privateHeaders })
}

export async function PATCH(request: Request) {
  const auth = await getAuthenticatedClient()
  if (!auth) return NextResponse.json({ message: '로그인이 필요해요.' }, { status: 401, headers: privateHeaders })
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ message: '알림 설정을 확인해 주세요.' }, { status: 400, headers: privateHeaders }) }
  const parsed = parseReminderSettings(body)
  if (!parsed.ok) return NextResponse.json({ message: '알림 시점을 확인해 주세요.' }, { status: 400, headers: privateHeaders })
  const { error } = await auth.supabase.from('event_reminder_preferences').upsert({ owner_id: auth.userId, enabled: parsed.value.enabled, minutes_before: parsed.value.minutesBefore, updated_at: new Date().toISOString() }, { onConflict: 'owner_id' })
  if (error) return NextResponse.json({ message: '알림 설정을 저장하지 못했어요.' }, { status: 500, headers: privateHeaders })
  return NextResponse.json({ ...parsed.value }, { headers: privateHeaders })
}
