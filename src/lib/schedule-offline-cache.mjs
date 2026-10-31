const cachePrefix = 'teumsae:schedule-cache:v1:'
const maxAge = 7 * 24 * 60 * 60 * 1000

export function createScheduleCacheKey(userId, from, to) {
  if (!userId || !from || !to) return null
  return cachePrefix + [userId, from, to].map(value => encodeURIComponent(value)).join(':')
}

export function saveScheduleCache(storage, userId, from, to, events, savedAt = Date.now()) {
  const key = createScheduleCacheKey(userId, from, to)
  if (!storage || !key || !Array.isArray(events) || !Number.isFinite(savedAt)) return false
  try {
    storage.setItem(key, JSON.stringify({ version: 1, userId, from, to, savedAt, events }))
    return true
  } catch {
    return false
  }
}

export function readScheduleCache(storage, userId, from, to, now = Date.now()) {
  const key = createScheduleCacheKey(userId, from, to)
  if (!storage || !key || !Number.isFinite(now)) return null
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const snapshot = JSON.parse(raw)
    if (!snapshot || snapshot.version !== 1 || snapshot.userId !== userId || snapshot.from !== from || snapshot.to !== to || !Array.isArray(snapshot.events) || !Number.isFinite(snapshot.savedAt)) {
      storage.removeItem(key)
      return null
    }
    if (snapshot.savedAt > now || now - snapshot.savedAt > maxAge) {
      storage.removeItem(key)
      return null
    }
    return { events: snapshot.events, savedAt: snapshot.savedAt }
  } catch {
    try { storage.removeItem(key) } catch {}
    return null
  }
}

export function clearScheduleCache(storage, userId) {
  if (!storage || !userId) return
  const userPrefix = cachePrefix + encodeURIComponent(userId) + ':'
  try {
    const keys = typeof storage.keys === 'function'
      ? storage.keys()
      : Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean)
    for (const key of keys) if (key.startsWith(userPrefix)) storage.removeItem(key)
  } catch {}
}

export function clearAllScheduleCache(storage) {
  if (!storage) return
  try {
    const keys = typeof storage.keys === 'function'
      ? storage.keys()
      : Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean)
    for (const key of keys) if (key.startsWith(cachePrefix)) storage.removeItem(key)
    storage.removeItem('teumsae:offline-user')
  } catch {}
}
