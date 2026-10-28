'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'

export default function SignOutButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')

  async function signOut() {
    if (pending) return
    setPending(true)
    setMessage('')
    try {
      const { error } = await createBrowserSupabaseClient().auth.signOut()
      if (error) {
        setMessage('로그아웃하지 못했어요. 다시 시도해 주세요.')
        return
      }
      router.replace('/auth')
      router.refresh()
    } catch {
      setMessage('로그아웃하지 못했어요. 다시 시도해 주세요.')
    } finally {
      setPending(false)
    }
  }

  return <div><button type="button" className="sign-out-button" onClick={signOut} disabled={pending}>{pending ? '로그아웃 중...' : '로그아웃'}</button>{message && <p role="alert">{message}</p>}</div>
}
