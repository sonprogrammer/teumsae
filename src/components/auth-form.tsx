'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'

type AuthMode = 'sign-in' | 'sign-up'

export default function AuthForm() {
  const router = useRouter()
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setMessage('')
    try {
      const supabase = createBrowserSupabaseClient()
      if (mode === 'sign-up') {
        const { error } = await supabase.auth.signUp({ email: email.trim(), password })
        setMessage(error ? '가입 요청을 완료하지 못했어요. 입력을 확인하고 다시 시도해 주세요.' : '확인 메일을 보냈어요. 메일의 링크를 연 뒤 로그인해 주세요.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) setMessage('로그인에 실패했어요. 이메일과 비밀번호를 확인해 주세요.')
        else {
          router.replace('/schedule')
          router.refresh()
        }
      }
    } catch {
      setMessage('연결에 실패했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setPending(false)
    }
  }

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode)
    setPassword('')
    setMessage('')
  }

  return <div className="auth-card">
    <div className="auth-tabs" role="group" aria-label="계정 작업">
      <button type="button" className={mode === 'sign-in' ? 'is-active' : ''} onClick={() => changeMode('sign-in')} aria-pressed={mode === 'sign-in'}>로그인</button>
      <button type="button" className={mode === 'sign-up' ? 'is-active' : ''} onClick={() => changeMode('sign-up')} aria-pressed={mode === 'sign-up'}>회원가입</button>
    </div>
    <form className="auth-form" onSubmit={submit}>
      <label htmlFor="auth-email">이메일</label>
      <input id="auth-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com" disabled={pending} />
      <label htmlFor="auth-password">비밀번호</label>
      <input id="auth-password" type="password" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} required minLength={6} value={password} onChange={event => setPassword(event.target.value)} disabled={pending} />
      <button type="submit" className="auth-submit" disabled={pending}>{pending ? '처리 중...' : mode === 'sign-in' ? '로그인하기' : '확인 메일 받기'}</button>
      {message && <p className="auth-message" role="status">{message}</p>}
    </form>
    <p className="auth-note">가입 후 메일 확인을 마치면 개인 일정을 사용할 수 있어요.</p>
  </div>
}
