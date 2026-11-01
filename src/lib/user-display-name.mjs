export function resolveUserDisplayName(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return '내 계정'
  for (const key of ['name', 'full_name', 'nickname', 'preferred_username', 'user_name']) {
    const value = metadata[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return '내 계정'
}
