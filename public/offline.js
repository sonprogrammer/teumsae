const list = document.getElementById('cached-events')
const activeUser = localStorage.getItem('teumsae:offline-user')
const prefix = activeUser ? 'teumsae:schedule-cache:v1:' + encodeURIComponent(activeUser) + ':' : ''
const eventsById = new Map()

if (prefix) {
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (!key || !key.startsWith(prefix)) continue
    try {
      const snapshot = JSON.parse(localStorage.getItem(key) || 'null')
      if (!snapshot || snapshot.userId !== activeUser || !Array.isArray(snapshot.events) || !Number.isFinite(snapshot.savedAt) || snapshot.savedAt > Date.now() || Date.now() - snapshot.savedAt > 7 * 24 * 60 * 60 * 1000) continue
      for (const event of snapshot.events) {
        if (!event || typeof event.id !== 'string' || typeof event.starts_at !== 'string' || typeof event.ends_at !== 'string' || !Number.isFinite(Date.parse(event.starts_at)) || !Number.isFinite(Date.parse(event.ends_at))) continue
        eventsById.set(event.id, event)
      }
    } catch {}
  }
}

list.replaceChildren()
const events = [...eventsById.values()].sort((left, right) => left.starts_at.localeCompare(right.starts_at)).slice(0, 50)
if (!activeUser || !events.length) {
  const empty = document.createElement('li')
  empty.className = 'empty'
  empty.textContent = activeUser ? '오프라인에서 확인할 저장된 일정이 없어요.' : '로그인 후 불러온 일정만 오프라인에서 확인할 수 있어요.'
  list.append(empty)
} else {
  const dateFormatter = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short' })
  const timeFormatter = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  for (const event of events) {
    const item = document.createElement('li')
    const time = document.createElement('time')
    const title = document.createElement('strong')
    const startsAt = new Date(event.starts_at)
    const endsAt = new Date(event.ends_at)
    time.textContent = dateFormatter.format(startsAt) + ' · ' + timeFormatter.format(startsAt) + '–' + timeFormatter.format(endsAt)
    title.textContent = typeof event.title === 'string' ? event.title : '제목 없는 일정'
    item.append(time, title)
    list.append(item)
  }
}
