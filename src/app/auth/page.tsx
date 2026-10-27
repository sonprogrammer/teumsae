import type { Metadata } from 'next'
import Link from 'next/link'
import AuthForm from '@/components/auth-form'

export const metadata: Metadata = {
  title: '계정 시작 | 틈새',
  description: '틈새 개인 일정 계정에 로그인하거나 가입합니다'
}

export default async function AuthPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  return <main className="auth-shell">
    <Link href="/" className="auth-back">← 샘플 화면으로</Link>
    <div className="auth-layout">
      <div className="auth-intro">
        <p className="eyebrow">YOUR TIME, YOUR SPACE</p>
        <h1>내 일정의 틈새를<br /><em>안전하게</em> 찾아요.</h1>
        <p>로그인하면 본인 계정의 일정만 관리할 수 있어요. 아직 실제 일정 기능은 준비 중이며 샘플 화면과 구분됩니다.</p>
      </div>
      {configured ? <div>{status === 'confirmation-error' && <p className="auth-alert" role="alert">메일 확인 링크가 유효하지 않거나 만료됐어요. 다시 가입을 시도해 주세요.</p>}<AuthForm /></div> : <div className="auth-card auth-unconfigured"><strong>계정 연결 준비 중</strong><p>Supabase 연결 설정이 완료되면 가입과 로그인을 사용할 수 있어요. 지금은 샘플 화면을 체험할 수 있습니다.</p><Link href="/">샘플 화면 보기 →</Link></div>}
    </div>
  </main>
}
