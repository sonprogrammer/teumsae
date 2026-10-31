'use client'

import { useEffect } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { clearAllScheduleCache } from '@/lib/schedule-offline-cache.mjs'

export default function PwaRuntime() {
  useEffect(() => {
    const { data: { subscription } } = createBrowserSupabaseClient().auth.onAuthStateChange(event => {
      if (event !== 'SIGNED_OUT') return
      try { clearAllScheduleCache(window.localStorage) } catch {}
    })
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined)
    return () => subscription.unsubscribe()
  }, [])

  return null
}
