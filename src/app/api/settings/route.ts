import { NextResponse } from 'next/server'
import { parseScheduleAvailability, type ScheduleAvailability } from '@/lib/availability'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const privateHeaders = { 'Cache-Control': 'private, no-store' }

async function authenticatedSupabase() {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || typeof data?.claims?.sub !== 'string') return null
  return supabase
}

function toScheduleAvailability(value: unknown): ScheduleAvailability | null {
  if (!value || typeof value !== 'object') return null
  const result = value as Record<string, unknown>
  if (result.timezone !== 'Asia/Seoul' || typeof result.version !== 'number' || !Number.isSafeInteger(result.version) || result.version < 1) return null
  const parsed = parseScheduleAvailability(result)
  if (!parsed.ok || parsed.value.exceptions.some(exception => typeof exception.id !== 'string' || !exception.id)) return null
  return { timezone: 'Asia/Seoul', version: result.version, ...parsed.value } as ScheduleAvailability
}

export async function GET() {
  const supabase = await authenticatedSupabase()
  if (!supabase) return NextResponse.json({ message: '로그인이 필요해요.' }, { status: 401, headers: privateHeaders })
  const { data, error } = await supabase.rpc('get_schedule_availability')
  if (error) return NextResponse.json({ message: '일정 가능 시간을 불러오지 못했어요.' }, { status: 500, headers: privateHeaders })
  const settings = toScheduleAvailability(data)
  if (!settings) return NextResponse.json({ message: '일정 가능 시간을 불러오지 못했어요.' }, { status: 500, headers: privateHeaders })
  return NextResponse.json(settings, { headers: privateHeaders })
}

export async function PATCH(request: Request) {
  const supabase = await authenticatedSupabase()
  if (!supabase) return NextResponse.json({ message: '로그인이 필요해요.' }, { status: 401, headers: privateHeaders })
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: '일정 가능 시간 정보를 확인해 주세요.' }, { status: 400, headers: privateHeaders })
  }
  if (!body || typeof body !== 'object') return NextResponse.json({ message: '일정 가능 시간 정보를 확인해 주세요.' }, { status: 400, headers: privateHeaders })
  const input = body as Record<string, unknown>
  const version = input.version
  const parsed = parseScheduleAvailability(input)
  if (!parsed.ok || typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) {
    return NextResponse.json({ message: parsed.ok ? '최신 일정 가능 시간을 다시 불러와 주세요.' : parsed.message }, { status: 400, headers: privateHeaders })
  }

  const { data, error } = await supabase.rpc('update_schedule_availability', {
    p_expected_version: version,
    p_weekly: parsed.value.weekly,
    p_exceptions: parsed.value.exceptions.map(({ startDate, endDate, label }) => ({ startDate, endDate, label }))
  })
  if (error) {
    const status = error.code === '40001' ? 409 : error.code === '22023' || error.code === '23P01' ? 400 : error.code === '42501' ? 401 : 500
    const message = error.code === '40001' ? '다른 화면에서 설정이 바뀌었어요. 최신 설정을 다시 불러와 주세요.' : status === 400 ? '요일별 시간이나 일정 불가 날짜를 확인해 주세요.' : '일정 가능 시간을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'
    return NextResponse.json({ message }, { status, headers: privateHeaders })
  }
  const settings = toScheduleAvailability(data)
  if (!settings) return NextResponse.json({ message: '일정 가능 시간을 저장하지 못했어요.' }, { status: 500, headers: privateHeaders })
  return NextResponse.json(settings, { headers: privateHeaders })
}
