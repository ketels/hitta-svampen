/* Service worker: makes the app startable without coverage.
   External data (map tiles, elevation tiles, weather) is cached by the app
   itself in IndexedDB — here we only care about the app shell. */

const CACHE = 'hitta-svampen-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return

  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)

      // Page navigation: fresh if possible, otherwise the last saved shell.
      if (e.request.mode === 'navigate') {
        try {
          const res = await fetch(e.request)
          void cache.put('/', res.clone())
          return res
        } catch {
          return (await cache.match('/')) ?? Response.error()
        }
      }

      const saved = await cache.match(e.request)
      if (saved) return saved
      try {
        const res = await fetch(e.request)
        if (res.ok) void cache.put(e.request, res.clone())
        return res
      } catch {
        return Response.error()
      }
    })(),
  )
})
