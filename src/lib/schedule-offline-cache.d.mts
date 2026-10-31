export type ScheduleCacheStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & Partial<Pick<Storage, 'key' | 'length'>> & { keys?: () => string[] }
export type CachedScheduleEvent = { id: string; title: string; note: string | null; starts_at: string; ends_at: string; version: number }
export function createScheduleCacheKey(userId: string, from: string, to: string): string | null
export function saveScheduleCache(storage: ScheduleCacheStorage | null, userId: string, from: string, to: string, events: CachedScheduleEvent[], savedAt?: number): boolean
export function readScheduleCache(storage: ScheduleCacheStorage | null, userId: string, from: string, to: string, now?: number): { events: CachedScheduleEvent[]; savedAt: number } | null
export function clearScheduleCache(storage: ScheduleCacheStorage | null, userId: string): void
export function clearAllScheduleCache(storage: ScheduleCacheStorage | null): void
