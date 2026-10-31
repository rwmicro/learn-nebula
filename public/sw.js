/* Service worker for The Gardener — hand-rolled, no Workbox: the site is a
 * static export, so the whole policy fits in a few rules.
 *
 *   documents  → network-first (a rebuild is picked up immediately), falling
 *                back to the cached copy, then to /offline.html. The request
 *                leaves with navigation preload, in parallel with the worker
 *                waking up; a page the reader is about to open (sw-register.js,
 *                where speculation rules don't exist) may already be on its way.
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
const SAVED_CACHE = "gk-saved";

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
      // gk-saved: reading paths saved for offline reading
      // (components/paths/OfflinePath.tsx), kept until the reader removes them.
      const keep = new Set([DOC_CACHE, ASSET_CACHE, SAVED_CACHE]);
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("gk-") && !keep.has(k))
          .map((k) => caches.delete(k)),
      );
      // Navigation preload: without it a sleeping worker has to boot (~50 ms
      // on a desktop, ~250 ms on a phone) before the page request even
      // leaves. With it the browser sends the request alongside, and
      // networkFirst() picks it up from event.preloadResponse.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(() => {});
      }
      await self.clients.claim();
    })(),
  );
});

// --- warm next page (Safari, Firefox) ---------------------------------------
// Where speculation rules don't exist, public/js/sw-register.js posts the URL
// of a link the reader is pressing (or hovering) a few hundred ms before the
// navigation. The fetch starts now and the navigation that follows reuses it.
// Kept in memory only and for WARM_MS: a page fetched that recently is as
// fresh as one fetched on click, so network-first still means what it says.

const WARM_MS = 30000;
const MAX_WARM = 4;
/** url → { at, response: Promise<Response | null> } */
const warm = new Map();

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "warm" || typeof data.url !== "string") return;
  let url;
  try {
    url = new URL(data.url, self.location.origin);
  } catch {
    return;
  }
  url.hash = "";
  if (url.origin !== self.location.origin || url.search || url.pathname.startsWith("/api/")) return;
  const key = url.href;
  const hit = warm.get(key);
  if (hit && Date.now() - hit.at < WARM_MS) return;
  if (warm.size >= MAX_WARM) warm.delete(warm.keys().next().value);
  const response = fetch(key, { cache: "no-cache", credentials: "same-origin" })
    .then((res) => (res && res.ok && !res.redirected ? res : null))
    .catch(() => null);
  warm.set(key, { at: Date.now(), response });
  // Keep the worker alive until the page is in.
  event.waitUntil(response);
});

/** The warmed response for this navigation, if one is fresh enough. */
async function takeWarm(request) {
  const hit = warm.get(request.url);
  if (!hit) return null;
  warm.delete(request.url);
  if (Date.now() - hit.at >= WARM_MS) return null;
  return hit.response;
}

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
    // Settled even when a warmed page wins, or the browser logs the
    // preload as cancelled.
    if (event.preloadResponse) event.waitUntil(event.preloadResponse.catch(() => {}));
    event.respondWith(networkFirst(request, event.preloadResponse));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirst(request, preloadResponse) {
  const cache = await caches.open(DOC_CACHE);
  try {
    // "no-cache", not "no-store": both bypass the browser's HTTP cache as a
    // source of truth (a bare fetch() defaults to honouring it, which would let
    // a stale disk-cached page satisfy a "network-first" request without ever
    // reaching the server). But no-store also strips the validators, so the
    // server had to send the whole page back every time. no-cache revalidates
    // instead — server/static-cache.ts answers 304 for an unchanged page — so
    // freshness is guaranteed exactly as before at a fraction of the bytes.
    // The preloaded response is that same request, sent by the browser (a
    // `no-cache` document always revalidates); a warmed one is under 30 s old.
    const fresh =
      (await takeWarm(request)) ||
      (await preloadResponse) ||
      (await fetch(request, { cache: "no-cache" }));
    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone()).then(() => trim(DOC_CACHE, MAX_DOCS));
    }
    return fresh;
  } catch {
    return (
      (await cache.match(request)) ||
      (await (await caches.open(SAVED_CACHE)).match(request)) ||
      (await cache.match(OFFLINE_URL)) ||
      new Response("", { status: 504, statusText: "Offline" })
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  // Assets, unlike documents, are exactly where the HTTP cache should win: the
  // server now declares a lifetime for each of them (server/static-cache.ts) —
  // a year and immutable for content-hashed /_next/static/**, a month for the
  // font subsets, revalidate-always for the rest. A default-mode fetch honours
  // those, so the background half of this strategy costs nothing for a hashed
  // chunk and a 304 for everything else. Forcing no-store here re-downloaded
  // every chunk, font and image on every page view to store bytes the browser
  // already had.
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

// --- review reminders (Web Push) --------------------------------------------
// The server (server/push-sender.ts) sends the Declarative Web Push shape,
// {web_push: 8030, notification: {title, body, navigate, …}, app_badge?}:
// Safari 18.4+ shows it on its own; everywhere else this handler does. A
// plain-text payload is shown as the body. Clicking opens the `navigate` URL
// (same origin only), or /cartes/, focusing a tab already on it.

const PUSH_FALLBACK_URL = "/cartes/";

function sameOriginUrl(u) {
  try {
    const url = new URL(u || PUSH_FALLBACK_URL, self.location.origin);
    return url.origin === self.location.origin ? url.href : new URL(PUSH_FALLBACK_URL, self.location.origin).href;
  } catch {
    return new URL(PUSH_FALLBACK_URL, self.location.origin).href;
  }
}

self.addEventListener("push", (event) => {
  let data = null;
  try {
    data = event.data ? event.data.json() : null;
  } catch {
    data = event.data ? { notification: { body: event.data.text() } } : null;
  }
  const n = (data && data.notification) || {};
  const title = n.title || "Garden of Knowledge";
  event.waitUntil(
    (async () => {
      if (typeof data?.app_badge === "number" && self.navigator.setAppBadge) {
        await self.navigator.setAppBadge(data.app_badge).catch(() => {});
      }
      await self.registration.showNotification(title, {
        body: n.body || "",
        lang: n.lang,
        tag: n.tag || "gk-review",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: sameOriginUrl(n.navigate) },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = sameOriginUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if (w.url === url && "focus" in w) return w.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});
// --- end review reminders ---------------------------------------------------
