import { NextResponse } from 'next/server'
import { normalizeActivityTime, parseActivityHoursInput, type ActivityHours } from '@/lib/events'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const privateHeaders = { 'Cache-Control': 'private, no-store' }

async function authenticatedSupabase() {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || typeof data?.claims?.sub !== 'string') return null
  return supabase
}

function toActivityHours(row: Record<string, unknown>): ActivityHours | null {
  const parsed = parseActivityHoursInput({ dayStart: normalizeActivityTime(String(row.day_start)), dayEnd: normalizeActivityTime(String(row.day_end)) })
  if (!parsed.ok || typeof row.version !== 'number' || !Number.isSafeInteger(row.version) || row.timezone !== 'Asia/Seoul' || typeof row.updated_at !== 'string') return null
  return { ...parsed.value, timezone: 'Asia/Seoul', version: row.version, updatedAt: row.updated_at }
}

function settingsRow(data: unknown) {
  return Array.isArray(data) ? data[0] : data
}

export async function GET() {
  const supabase = await authenticatedSupabase()
  if (!supabase) return NextResponse.json({ message: '로그인이 필요해요.' }, { status: 401, headers: privateHeaders })
  const { data, error } = await supabase.rpc('get_activity_hours')
  if (error) return NextResponse.json({ message: '활동 시간 설정을 불러오지 못했어요.' }, { status: 500, headers: privateHeaders })
  const row = settingsRow(data)
  const settings = row && typeof row === 'object' ? toActivityHours(row as Record<string, unknown>) : null
  if (!settings) return NextResponse.json({ message: '활동 시간 설정을 불러오지 못했어요.' }, { status: 500, headers: privateHeaders })
  return NextResponse.json(settings, { headers: privateHeaders })
}

export async function PATCH(request: Request) {
  const supabase = await authenticatedSupabase()
  if (!supabase) return NextResponse.json({ message: '로그인이 필요해요.' }, { status: 401, headers: privateHeaders })
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: '활동 시간 정보를 확인해 주세요.' }, { status: 400, headers: privateHeaders })
  }
  if (!body || typeof body !== 'object') return NextResponse.json({ message: '활동 시간 정보를 확인해 주세요.' }, { status: 400, headers: privateHeaders })
  const input = body as Record<string, unknown>
  const parsed = parseActivityHoursInput(input)
  const version = input.version
  if (!parsed.ok || typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) {
    return NextResponse.json({ message: parsed.ok ? '최신 활동 시간 설정을 다시 불러와 주세요.' : parsed.message }, { status: 400, headers: privateHeaders })
  }

  const { data, error } = await supabase.rpc('update_activity_hours', {
    p_day_start: parsed.value.dayStart,
    p_day_end: parsed.value.dayEnd,
    p_expected_version: version
  })
  if (error) {
    const status = error.code === '40001' ? 409 : error.code === '22023' ? 400 : error.code === '42501' ? 401 : 500
    const message = error.code === '40001' ? '다른 화면에서 활동 시간이 바뀌었어요. 최신 설정을 불러와 다시 저장해 주세요.' : error.code === '22023' ? '활동 시작·종료 시간을 확인해 주세요.' : '활동 시간 설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'
    return NextResponse.json({ message }, { status, headers: privateHeaders })
  }
  const row = settingsRow(data)
  const settings = row && typeof row === 'object' ? toActivityHours(row as Record<string, unknown>) : null
  if (!settings) return NextResponse.json({ message: '활동 시간 설정을 저장하지 못했어요.' }, { status: 500, headers: privateHeaders })
  return NextResponse.json(settings, { headers: privateHeaders })
}
