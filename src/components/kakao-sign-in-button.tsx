'use client'

import { useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'

export default function KakaoSignInButton() {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')

  async function signIn() {
    if (pending) return
    setPending(true)
    setMessage('')
    try {
      const { error } = await createBrowserSupabaseClient().auth.signInWithOAuth({
        provider: 'kakao',
        options: { redirectTo: new URL('/auth/callback', window.location.origin).toString() }
      })
      if (!error) return
    } catch {
      // The provider request may fail before navigation begins.
    }
    setMessage('카카오 로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.')
    setPending(false)
  }

  return <div className="auth-card">
    <p className="auth-card-kicker">PRIVATE SCHEDULE</p>
    <h2>내 일정 시작하기</h2>
    <p className="auth-card-copy">카카오 계정으로 로그인하고 나만의 일정 공간을 열어보세요.</p>
    <button type="button" className="kakao-sign-in" onClick={signIn} disabled={pending}>
      <span className="kakao-mark" aria-hidden="true" />
      {pending ? '카카오로 이동 중...' : '카카오로 시작하기'}
    </button>
    {message && <p className="auth-message" role="alert">{message}</p>}
    <p className="auth-note">실제 일정 조회·등록은 다음 단계에서 연결됩니다.</p>
  </div>
}
