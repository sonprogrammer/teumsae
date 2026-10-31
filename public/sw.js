const CACHE_NAME = 'teumsae-shell-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(['/offline.html', '/offline.js'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('teumsae-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()))
    return
  }
  const path = new URL(request.url).pathname
  if (!path.startsWith('/_next/static/') && path !== '/teumsae-logo.png' && path !== '/teumsaeAI.png') return
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) void caches.open(CACHE_NAME).then(async cache => {
      await cache.put(request, response.clone())
      const keys = await cache.keys()
      await Promise.all(keys.slice(0, Math.max(0, keys.length - 100)).map(key => cache.delete(key)))
    })
    return response
  })))
})

self.addEventListener('push', event => {
  let payload = {}
  try { payload = event.data ? event.data.json() : {} } catch {}
  const title = typeof payload.title === 'string' ? payload.title.slice(0, 80) : '틈새 일정 알림'
  const body = typeof payload.body === 'string' ? payload.body.slice(0, 160) : '일정이 곧 시작돼요.'
  const target = typeof payload.url === 'string' && (payload.url === '/schedule' || payload.url.startsWith('/schedule?')) ? payload.url : '/schedule'
  event.waitUntil(self.registration.showNotification(title, { body, icon: '/icon', badge: '/icon', data: { url: target } }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  let target = '/schedule'
  try {
    const candidate = new URL(event.notification.data?.url || '/schedule', self.location.origin)
    if (candidate.origin === self.location.origin && (candidate.pathname === '/schedule' || candidate.pathname.startsWith('/schedule/'))) target = candidate.href
  } catch {}
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const existing = clients.find(client => new URL(client.url).origin === self.location.origin)
    if (existing) {
      await existing.navigate(target)
      return existing.focus()
    }
    return self.clients.openWindow(target)
  }))
})
