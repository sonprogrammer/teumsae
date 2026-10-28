import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import SignOutButton from '@/components/sign-out-button'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: '내 일정 | 틈새',
  description: '로그인한 본인의 실제 일정 공간'
}

export default async function SchedulePage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) redirect('/auth')
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) redirect('/auth')

  return <main className="real-schedule-shell">
    <header className="real-schedule-header"><Link href="/" className="real-schedule-brand">틈새 <small>TEUMSAE</small></Link><SignOutButton /></header>
    <section className="real-schedule-content">
      <p className="eyebrow">MY PRIVATE SCHEDULE</p>
      <h1>내 일정</h1>
      <div className="real-empty-state"><span aria-hidden="true">✦</span><strong>계정 연결이 준비됐어요</strong><p>실제 일정 조회·등록은 다음 단계에서 연결됩니다. 지금 보이는 샘플 일정은 이 계정에 저장되지 않았어요.</p><Link href="/">샘플 화면 다시 보기 →</Link></div>
    </section>
  </main>
}
