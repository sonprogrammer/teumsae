import { NextResponse } from 'next/server'
import { parseAvailabilitySearchRequest, parseScheduleAvailability, searchAvailability, type ScheduleAvailability } from '@/lib/availability'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const privateHeaders = { 'Cache-Control': 'private, no-store' }

function addDays(date: string, amount: number) {
  const value = new Date(date + 'T00:00:00.000Z')
  value.setUTCDate(value.getUTCDate() + amount)
  return value.toISOString().slice(0, 10)
}

function toUtcMidnightKorea(date: string) {
  return new Date(date + 'T00:00:00+09:00').toISOString()
}

function toScheduleAvailability(value: unknown): ScheduleAvailability | null {
  if (!value || typeof value !== 'object') return null
  const result = value as Record<string, unknown>
  if (result.timezone !== 'Asia/Seoul' || typeof result.version !== 'number' || !Number.isSafeInteger(result.version) || result.version < 1) return null
  const parsed = parseScheduleAvailability(result)
  if (!parsed.ok || parsed.value.exceptions.some(exception => typeof exception.id !== 'string' || !exception.id)) return null
  return { timezone: 'Asia/Seoul', version: result.version, ...parsed.value } as ScheduleAvailability
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: authData, error: authError } = await supabase.auth.getClaims()
  const userId = authData?.claims?.sub
  if (authError || typeof userId !== 'string') {
    return NextResponse.json({ code: 'AUTH_REQUIRED', message: '로그인이 필요해요.' }, { status: 401, headers: privateHeaders })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ code: 'INVALID_REQUEST', message: '빈 시간 검색 조건을 확인해 주세요.' }, { status: 400, headers: privateHeaders })
  }
  const parsed = parseAvailabilitySearchRequest(body)
  if (!parsed.ok) return NextResponse.json({ code: 'INVALID_REQUEST', message: parsed.message }, { status: 400, headers: privateHeaders })

  const { data: rawSchedule, error: availabilityError } = await supabase.rpc('get_schedule_availability')
  if (availabilityError) {
    return NextResponse.json({ code: 'AVAILABILITY_LOOKUP_FAILED', message: '일정 가능 시간을 불러오지 못했어요.' }, { status: 500, headers: privateHeaders })
  }
  const schedule = toScheduleAvailability(rawSchedule)
  if (!schedule) {
    return NextResponse.json({ code: 'AVAILABILITY_LOOKUP_FAILED', message: '일정 가능 시간을 불러오지 못했어요.' }, { status: 500, headers: privateHeaders })
  }

  const rangeStart = toUtcMidnightKorea(parsed.value.startDate)
  const rangeEnd = toUtcMidnightKorea(addDays(parsed.value.endDate, 1))
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('starts_at, ends_at')
    .eq('owner_id', userId)
    .lt('starts_at', rangeEnd)
    .gt('ends_at', rangeStart)
    .order('starts_at')
    .limit(101)
  if (eventsError) {
    return NextResponse.json({ code: 'EVENT_LOOKUP_FAILED', message: '일정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' }, { status: 500, headers: privateHeaders })
  }
  if (events.length > 100) {
    return NextResponse.json({ code: 'EVENT_LIMIT_EXCEEDED', message: '조회할 일정이 많아요. 검색 기간을 줄여 주세요.' }, { status: 422, headers: privateHeaders })
  }

  try {
    const result = searchAvailability({ request: parsed.value, schedule, events, now: new Date() })
    return NextResponse.json({ timezone: 'Asia/Seoul', ...result }, { headers: privateHeaders })
  } catch {
    return NextResponse.json({ code: 'AVAILABILITY_SEARCH_FAILED', message: '빈 시간을 계산하지 못했어요. 잠시 후 다시 시도해 주세요.' }, { status: 500, headers: privateHeaders })
  }
}
