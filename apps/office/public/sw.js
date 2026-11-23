// Karibu Office service worker.
//
// Scope of offline support (spec §9): the pages a partner already opened stay
// readable with no signal, and the visit log queues on the phone (see
// src/components/VisitLogForm.tsx). Everything else needs a connection and
// says so. This is NOT an offline copy of the app.
const VERSION = 'ko-v1'
const PAGES = `${VERSION}-pages`
const ASSETS = `${VERSION}-assets`

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.add('/offline')).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Build assets are content-hashed: cache first.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/logos/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone()
        caches.open(ASSETS).then((c) => c.put(req, copy))
        return res
      })),
    )
    return
  }

  // Office pages: network first, fall back to the last copy seen, then the offline page.
  // Token pages (/r, /i) and the Foundation console are never cached.
  if (req.mode === 'navigate' && url.pathname.startsWith('/o/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(PAGES).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/offline'))),
    )
  }
})

// Signing out clears everything cached for this person.
self.addEventListener('message', (event) => {
  if (event.data === 'clear') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))))
  }
})
