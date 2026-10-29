import type { ActivityHours, ActivityHoursInput } from '@/lib/events'

export const activityHoursQueryKey = (userId: string) => ['activity-hours', userId] as const

export class ActivityHoursRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

async function settingsResponse(response: Response): Promise<ActivityHours> {
  const body = await response.json()
  if (!response.ok) throw new ActivityHoursRequestError(typeof body?.message === 'string' ? body.message : '활동 시간 설정을 불러오지 못했어요.', response.status)
  return body as ActivityHours
}

export async function fetchActivityHours({ signal }: { signal: AbortSignal }): Promise<ActivityHours> {
  return settingsResponse(await fetch('/api/settings', { signal, cache: 'no-store' }))
}

export async function saveActivityHours(input: ActivityHoursInput & { version: number }): Promise<ActivityHours> {
  return settingsResponse(await fetch('/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    cache: 'no-store'
  }))
}
