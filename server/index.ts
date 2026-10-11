// Self-hosted server: serves the static export (out/) and the three dynamic
// endpoints (/api/ask, /api/comments, /api/translate) that used to be Cloudflare
// Pages Functions. One long-lived Node process, one container.

import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { env, canGenerate } from "./env.ts";
import { isAdmin } from "./auth.ts";
import { getIp } from "./http.ts";
import { initDb } from "./db.ts";
import { initRag, ragState } from "./rag.ts";
import { askRoute } from "./routes/ask.ts";
import { commentsRoute } from "./routes/comments.ts";
import { translateRoute } from "./routes/translate.ts";
import { relatedRoute } from "./routes/related.ts";
import { questionsRoute } from "./routes/questions.ts";
import { adminRoute } from "./routes/admin.ts";
import { searchMissRoute } from "./routes/search-miss.ts";
import { authRoute } from "./routes/auth.ts";
import { meRoute, progressRoute, accountRoute, shopRoute } from "./routes/account.ts";
import { buildCSP, SITE_URL } from "../lib/site.ts";
import { staticEntry, isFresh, cacheControlFor } from "./static-cache.ts";

const app = new Hono();

// Security headers on every response. These used to ship via a Cloudflare
// Pages `_headers` file (removed with the rest of the CF config when this
// site moved to a self-hosted Node server — see CLAUDE.md) and were never
// re-added here, so the site has been running without them since. The <meta
// http-equiv="Content-Security-Policy"> in app/layout.tsx (lib/site.ts's
// buildCSP()) covers most of the policy for anyone who somehow gets the HTML
// without this server (there isn't a supported way to), but browsers ignore
// frame-ancestors/report-to in <meta> form — only a real header enforces
// those, hence this middleware sends the same policy again as one.
const csp = buildCSP();
app.use("*", async (c, next) => {
  await next();
  c.header("Content-Security-Policy", csp);
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  // Microphone for this origin only: pronunciation practice (/js/pronounce.js)
  // records in the browser, nothing is uploaded.
  c.header("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
  // Skip on a non-HTTPS SITE_URL (e.g. a Tor .onion build, per lib/site.ts) —
  // HSTS pins the browser to HTTPS-only for this host, which would be wrong
  // for a deployment that's intentionally plain HTTP.
  if (SITE_URL.startsWith("https://")) {
    c.header("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
});

// Public liveness: just {ok:true}. The generation/RAG detail is operational
// information (it tells a stranger whether the paid assistant is live), so it
// is returned only to an authenticated admin — /admin's AssistantCard already
// sends the bearer token here.
app.get("/healthz", (c) => {
  if (isAdmin(c.req.header("authorization"), getIp(c))) {
    c.header("cache-control", "no-store");
    return c.json({ ok: true, generate: canGenerate(), rag: ragState() });
  }
  return c.json({ ok: true });
});

// Dynamic API (must be matched before the static catch-all).
app.route("/api/ask", askRoute);
app.route("/api/comments", commentsRoute);
app.route("/api/translate", translateRoute);
app.route("/api/related", relatedRoute);
app.route("/api/questions", questionsRoute);
app.route("/api/admin", adminRoute);
app.route("/api/search-miss", searchMissRoute);
// Reader accounts: magic-link login, progress sync, coins, streaks, shop.
app.route("/api/auth", authRoute);
app.route("/api/me", meRoute);
app.route("/api/progress", progressRoute);
app.route("/api/account", accountRoute);
app.route("/api/shop", shopRoute);

// serveStatic sends no Cache-Control at all, so every response — HTML pages
// included — is subject to the browser's own heuristic caching (freshness ≈
// 10% of file age). That's what made rebuilt pages/JS intermittently keep
// showing old content regardless of the service worker: sw.js's own fetch()
// calls default to honouring that same HTTP cache (see public/sw.js's
// `cache: "no-store"` fix), and a browser with no active service worker at
// all (private mode, first load, disabled) had nothing else in front of it.
// What each path gets, and why, is in server/static-cache.ts.
app.use("*", async (c, next) => {
  await next();
  if (c.res.headers.has("Cache-Control")) return;
  const value = cacheControlFor(c.req.path);
  if (value) c.header("Cache-Control", value);
});

// Conditional requests. serveStatic sends Last-Modified but never reads the
// client's validators back, so every `no-cache` revalidation used to cost a
// full body. Answering 304 here — before serveStatic opens a read stream —
// keeps the response to its headers.
app.use("*", async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") return next();
  const entry = staticEntry(
    env.staticDir,
    c.req.path,
    c.req.header("Accept-Encoding") || "",
  );
  if (!entry) return next();

  if (isFresh(entry, c.req.header("If-None-Match"), c.req.header("If-Modified-Since"))) {
    c.header("ETag", entry.etag);
    c.header("Last-Modified", entry.mtime.toUTCString());
    if (entry.negotiated) c.header("Vary", "Accept-Encoding");
    return c.body(null, 304);
  }

  await next();
  c.header("ETag", entry.etag);
});

// Static export. trailingSlash:true means URLs are "/foo/" → out/foo/index.html,
// which serveStatic maps automatically.
//
// `precompressed` makes it prefer the .br/.gz that scripts/precompress.mjs
// wrote next to each file at build time. Those were added for an nginx serving
// out/ directly with `brotli_static`; in the deployment that actually ships,
// nginx is a reverse proxy with no view of the filesystem, so without this the
// pre-built brotli was never reaching anyone.
app.get("*", serveStatic({ root: env.staticDir, precompressed: true }));

// Custom 404 (Next emits out/404.html).
let cached404: string | null = null;
app.notFound((c) => {
  if (cached404 === null) {
    try {
      cached404 = fs.readFileSync(path.join(env.staticDir, "404.html"), "utf8");
    } catch {
      cached404 = "<!doctype html><title>404</title><h1>404 — introuvable</h1>";
    }
  }
  return c.html(cached404, 404);
});

// --- startup ---------------------------------------------------------------
initDb();
initRag(); // embeds in the background; retrieval turns on once ready

if (!canGenerate()) {
  console.warn(
    "server: no LLM backend (set ANTHROPIC_API_KEY or LLM_BASE_URL) — /api/ask and /api/translate return 503.",
  );
}

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`server: listening on http://0.0.0.0:${info.port} (static: ${env.staticDir})`);
});
