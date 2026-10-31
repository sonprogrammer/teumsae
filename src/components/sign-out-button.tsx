'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { useScheduleUiStore } from '@/stores/schedule-ui-store'

export default function SignOutButton() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const resetScheduleUi = useScheduleUiStore(state => state.reset)
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
      queryClient.clear()
      resetScheduleUi()
      router.replace('/auth')
      router.refresh()
    } catch {
      setMessage('로그아웃하지 못했어요. 다시 시도해 주세요.')
    } finally {
      setPending(false)
    }
  }

  return <div><button type="button" className="sign-out-button" onClick={signOut} disabled={pending}><svg aria-hidden="true" viewBox="0 0 20 20"><path d="M8 3H4.5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1H8"/><path d="M11 6l4 4-4 4M15 10H7"/></svg><span>{pending ? '로그아웃 중...' : '로그아웃'}</span></button>{message && <p role="alert">{message}</p>}</div>
}
