const CACHE_NAME = 'apex-v2'
const PRECACHE = ['/', '/index.html']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(PRECACHE)))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  if (e.request.url.includes('/api/')) return
  if (e.request.url.includes('/socket.io/')) return
  if (e.request.url.includes('localhost:3000')) return
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const clone = res.clone()
        caches.open(CACHE_NAME).then((c) => c.put(e.request, clone))
        return res
      })
      .catch(() => caches.match(e.request).then(cached => cached || new Response('', { status: 503, statusText: 'Offline' })))
  )
})
