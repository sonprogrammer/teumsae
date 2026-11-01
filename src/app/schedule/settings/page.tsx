import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import SettingsNavigation from '@/components/settings-navigation'
import SignOutButton from '@/components/sign-out-button'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: '설정 | 틈새',
  description: '틈새에서 사용할 일정 추천과 알림을 설정합니다'
}

export default async function ScheduleSettingsPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) redirect('/auth')
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || typeof data?.claims?.sub !== 'string') redirect('/auth')

  return <main className="real-schedule-shell">
    <header className="real-schedule-header"><Link href="/schedule" className="real-schedule-brand"><Image src="/teumsae-logo.png" alt="" width={48} height={40} priority /><span>틈새<small>TEUMSAE</small></span></Link><div className="real-header-actions"><Link className="real-sample-link" href="/schedule"><svg aria-hidden="true" viewBox="0 0 20 20"><path d="M3 9.2 10 3l7 6.2v7.3a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5V9.2Z"/><path d="M7.5 17v-5h5v5"/></svg><span>내 일정</span></Link><SignOutButton /></div></header>
    <section className="real-schedule-content availability-page-content">
      <div className="availability-page-heading"><p className="eyebrow">SETTINGS</p><h1>설정</h1><p>틈새에서 사용할 일정 추천과 알림을 관리해요.</p></div>
      <SettingsNavigation userId={data.claims.sub} />
    </section>
  </main>
}
