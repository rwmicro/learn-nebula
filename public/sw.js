// Pensine offline-first service worker.
//
// Strategy:
//   - Static build assets (/_next/static/*): cache-first, immutable.
//   - HTML routes: stale-while-revalidate so visited pages stay readable
//     offline while a fresh copy is fetched in the background.
//   - Index JSONs (pensine-*.json): stale-while-revalidate, served from
//     cache when offline.
//   - R2 assets (assets.nebula.li): cache-first with network fallback.
//   - Everything else: network-first.

const VERSION = "v1"
const STATIC_CACHE = `pensine-static-${VERSION}`
const RUNTIME_CACHE = `pensine-runtime-${VERSION}`

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k)),
      )
      await self.clients.claim()
    })(),
  )
})

const STATIC_RE = /\/_next\/static\//
const INDEX_RE = /\/pensine-(index|search|backlinks)\.json$/
const ASSETS_HOST = "assets.nebula.li"

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(req)
  const fetched = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone())
      return res
    })
    .catch(() => null)
  return cached || (await fetched) || Response.error()
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(req)
  if (cached) return cached
  try {
    const res = await fetch(req)
    if (res.ok) cache.put(req, res.clone())
    return res
  } catch {
    return Response.error()
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return
  const url = new URL(req.url)

  // Skip cross-origin requests we don't control.
  if (url.origin !== self.location.origin && url.host !== ASSETS_HOST) return

  if (STATIC_RE.test(url.pathname)) {
    event.respondWith(cacheFirst(req, STATIC_CACHE))
    return
  }

  if (INDEX_RE.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE))
    return
  }

  if (url.host === ASSETS_HOST) {
    event.respondWith(cacheFirst(req, RUNTIME_CACHE))
    return
  }

  // HTML navigation: SWR so visited articles work offline.
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE))
    return
  }
})
