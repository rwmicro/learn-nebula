/* Service worker for The Gardener — hand-rolled, no Workbox: the site is a
 * static export, so the whole policy fits in a few rules.
 *
 *   documents  → network-first (a rebuild is picked up immediately), falling
 *                back to the cached copy, then to /offline.html
 *   assets     → stale-while-revalidate (instant, refreshed in the background)
 *   /api/*     → never touched (the RAG assistant, comments and translation are
 *                dynamic and metered — a cached answer would be plain wrong)
 *
 * Bump VERSION to evict every cache on the next visit. Documents being
 * network-first, staleness is bounded even without a bump; Next's static assets
 * are content-hashed, so their URLs change on their own.
 */

const VERSION = "v2";
const DOC_CACHE = `gk-doc-${VERSION}`;
const ASSET_CACHE = `gk-asset-${VERSION}`;
const OFFLINE_URL = "/offline.html";

// Kept small on purpose: the vault has ~1000 notes, so an unbounded document
// cache would grow without end. Assets get a larger budget (fonts, KaTeX,
// images). Browsers evict under storage pressure anyway; this is good manners.
const MAX_DOCS = 60;
const MAX_ASSETS = 200;

// Precached so an installed app opens cold, with no network at all.
const PRECACHE = [OFFLINE_URL, "/"];
// …and never evicted by the trimmer.
const PINNED = new Set(PRECACHE);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(DOC_CACHE);
      // allSettled: one unreachable entry must not abort the whole install.
      await Promise.allSettled(
        PRECACHE.map((url) => cache.add(new Request(url, { cache: "reload" }))),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([DOC_CACHE, ASSET_CACHE]);
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("gk-") && !keep.has(k))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Requests the worker must stay out of entirely. */
function shouldBypass(request, url) {
  return (
    request.method !== "GET" ||
    // Cross-origin (Turnstile, analytics): let the network handle it, and never
    // store opaque responses.
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (shouldBypass(request, url)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirst(request) {
  const cache = await caches.open(DOC_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone()).then(() => trim(DOC_CACHE, MAX_DOCS));
    }
    return fresh;
  } catch {
    return (
      (await cache.match(request)) ||
      (await cache.match(OFFLINE_URL)) ||
      new Response("", { status: 504, statusText: "Offline" })
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  const fetching = fetch(request)
    .then((res) => {
      if (res && res.ok) {
        cache
          .put(request, res.clone())
          .then(() => trim(ASSET_CACHE, MAX_ASSETS));
      }
      return res;
    })
    .catch(() => null);
  // Serve from cache when we have it; otherwise wait for the network.
  return (
    cached ||
    (await fetching) ||
    new Response("", { status: 504, statusText: "Offline" })
  );
}

/** Oldest-first trim — cache.keys() preserves insertion order. */
async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  for (const request of keys.slice(0, keys.length - max)) {
    if (PINNED.has(new URL(request.url).pathname)) continue;
    await cache.delete(request);
  }
}
