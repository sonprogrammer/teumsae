import { redirect } from 'next/navigation'
import ScheduleDemo from '@/components/schedule-demo'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function Home() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.auth.getClaims()
    if (!error && typeof data?.claims?.sub === 'string') redirect('/schedule')
  }

  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())

  return <ScheduleDemo today={today} />
}
