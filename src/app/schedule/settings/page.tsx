import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import AvailabilitySettings from '@/components/availability-settings'
import SignOutButton from '@/components/sign-out-button'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: '일정 가능 시간 | 틈새',
  description: 'AI 일정 추천에 사용할 요일별 시간과 일정 불가 날짜를 설정합니다'
}

export default async function ScheduleSettingsPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) redirect('/auth')
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || typeof data?.claims?.sub !== 'string') redirect('/auth')

  return <main className="real-schedule-shell">
    <header className="real-schedule-header"><Link href="/schedule" className="real-schedule-brand">틈새 <small>TEUMSAE</small></Link><div className="real-header-actions"><Link className="real-sample-link" href="/schedule">내 일정</Link><SignOutButton /></div></header>
    <section className="real-schedule-content availability-page-content">
      <div className="availability-page-heading"><p className="eyebrow">SCHEDULE AVAILABILITY</p><h1>일정 가능 시간</h1><p>요일별로 시간을 정하고, 휴가나 개인 일정은 날짜 예외로 등록할 수 있어요.</p></div>
      <AvailabilitySettings userId={data.claims.sub} />
    </section>
  </main>
}
