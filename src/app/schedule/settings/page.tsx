import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import AvailabilitySettings from '@/components/availability-settings'
import PushReminderSettings from '@/components/push-reminder-settings'
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
    <header className="real-schedule-header"><Link href="/schedule" className="real-schedule-brand"><Image src="/teumsae-logo.png" alt="" width={48} height={40} priority /><span>틈새<small>TEUMSAE</small></span></Link><div className="real-header-actions"><Link className="real-sample-link" href="/schedule"><svg aria-hidden="true" viewBox="0 0 20 20"><path d="M3 9.2 10 3l7 6.2v7.3a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5V9.2Z"/><path d="M7.5 17v-5h5v5"/></svg><span>내 일정</span></Link><SignOutButton /></div></header>
    <section className="real-schedule-content availability-page-content">
      <div className="availability-page-heading"><p className="eyebrow">SCHEDULE AVAILABILITY</p><h1>일정 가능 시간</h1><p>요일별로 시간을 정하고, 휴가나 개인 일정은 날짜 예외로 등록할 수 있어요.</p></div>
      <AvailabilitySettings userId={data.claims.sub} />
      <PushReminderSettings userId={data.claims.sub} />
    </section>
  </main>
}
