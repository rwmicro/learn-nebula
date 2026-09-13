// Self-hosted server: serves the static export (out/) and the three dynamic
// endpoints (/api/ask, /api/comments, /api/translate) that used to be Cloudflare
// Pages Functions. One long-lived Node process, one container.

import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { env, canGenerate } from "./env.ts";
import { initDb } from "./db.ts";
import { initRag, ragState } from "./rag.ts";
import { askRoute } from "./routes/ask.ts";
import { commentsRoute } from "./routes/comments.ts";
import { translateRoute } from "./routes/translate.ts";

const app = new Hono();

app.get("/healthz", (c) =>
  c.json({ ok: true, generate: canGenerate(), rag: ragState() }),
);

// Dynamic API (must be matched before the static catch-all).
app.route("/api/ask", askRoute);
app.route("/api/comments", commentsRoute);
app.route("/api/translate", translateRoute);

// The service worker script must always be revalidated: browsers apply
// heuristic HTTP caching to it like any other file when no Cache-Control is
// set, so a bumped VERSION inside sw.js can sit unseen in the browser cache
// for a while. no-cache forces a conditional GET on every fetch — the update
// itself still relies on skipWaiting()/clients.claim() in sw.js.
app.get("/sw.js", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-cache");
});

// Static export. trailingSlash:true means URLs are "/foo/" → out/foo/index.html,
// which serveStatic maps automatically.
app.get("*", serveStatic({ root: env.staticDir }));

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
