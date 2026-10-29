import type { ScheduleAvailability, AvailabilityInput } from '@/lib/availability'

export const availabilityQueryKey = (userId: string) => ['schedule-availability', userId] as const

async function availabilityResponse(response: Response): Promise<ScheduleAvailability> {
  const body = await response.json()
  if (!response.ok) throw new Error(typeof body?.message === 'string' ? body.message : '일정 가능 시간을 불러오지 못했어요.')
  return body as ScheduleAvailability
}

export async function fetchScheduleAvailability({ signal }: { signal: AbortSignal }): Promise<ScheduleAvailability> {
  return availabilityResponse(await fetch('/api/settings', { signal, cache: 'no-store' }))
}

export async function saveScheduleAvailability(input: AvailabilityInput & { version: number }): Promise<ScheduleAvailability> {
  return availabilityResponse(await fetch('/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    cache: 'no-store'
  }))
}
