import type { EventView } from '@/lib/events'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'

export async function fetchEvents({ from, to, signal }: { from: string; to: string; signal: AbortSignal }): Promise<EventView[]> {
  const { data, error } = await createBrowserSupabaseClient()
    .from('events')
    .select('id, title, note, starts_at, ends_at, version')
    .gte('starts_at', from)
    .lt('starts_at', to)
    .order('starts_at')
    .abortSignal(signal)
  if (error) throw error
  return data as EventView[]
}
