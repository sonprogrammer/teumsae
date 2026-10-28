import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import RealSchedule from '@/components/real-schedule'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: '내 일정 | 틈새',
  description: '로그인한 본인의 실제 일정'
}

function todayInKorea() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return fields.year + '-' + fields.month + '-' + fields.day
}

function isDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const timestamp = Date.parse(value + 'T00:00:00.000Z')
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
}

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string }> }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) redirect('/auth')
  const supabase = await createServerSupabaseClient()
  const { data: authData, error: authError } = await supabase.auth.getClaims()
  if (authError || typeof authData?.claims?.sub !== 'string') redirect('/auth')

  const params = await searchParams
  const today = todayInKorea()
  const selectedDate = isDate(params.date) ? params.date as string : today
  const view = params.view === 'month' ? 'month' : 'week'
  return <RealSchedule userId={authData.claims.sub} selectedDate={selectedDate} today={today} view={view} />
}
