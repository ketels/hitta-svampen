/* Serviceworker: gör appen startbar utan täckning.
   Externa data (kartrutor, höjdkakel, väder) cachas av appen själv i
   IndexedDB — här bryr vi oss bara om appskalet. */

const CACHE = 'hitta-svampen-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const n of await caches.keys()) if (n !== CACHE) await caches.delete(n)
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

      // Sidnavigering: färskt om möjligt, annars det senast sparade skalet.
      if (e.request.mode === 'navigate') {
        try {
          const svar = await fetch(e.request)
          void cache.put('/', svar.clone())
          return svar
        } catch {
          return (await cache.match('/')) ?? Response.error()
        }
      }

      const sparad = await cache.match(e.request)
      if (sparad) return sparad
      try {
        const svar = await fetch(e.request)
        if (svar.ok) void cache.put(e.request, svar.clone())
        return svar
      } catch {
        return Response.error()
      }
    })(),
  )
})
