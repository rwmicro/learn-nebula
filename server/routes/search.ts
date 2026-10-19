// Semantic search for the ⌘K palette's "Proches par le sens" group: embed the
// query with the assistant's embeddings endpoint, take the nearest chunks of
// the same in-memory index (rag.ts), fold them per note. No LLM, so no
// generation cost — one embedding call per (uncached) query.
//
// 503 when retrieval is off (EMBED_BASE_URL unset), an empty list while the
// index is still embedding: the palette then simply shows no such group.

import { Hono } from "hono";
import { getIp } from "../http.ts";
import { Quota } from "../ratelimit.ts";
import { denseSearch, ragState } from "../rag.ts";
import { groupByNote, normaliseQuery, type NoteHit } from "../search-group.ts";

const MIN_Q = 3;
const MAX_Q = 200;
const LIMIT = 8;
// Enough chunks to fill eight notes even when a few long notes take several.
const CANDIDATES = 40;
// Below this, bge-m3 neighbours are mostly noise for a short query.
const MIN_SCORE = 0.45;

// Each palette keystroke can fire one of these (debounced client-side), and
// every miss is an embeddings call — so a per-minute cap per IP, generous for
// typing, tight for a script.
const quota = new Quota(60, 60_000);

// Short-lived answers by normalised query: the same word typed again (or by
// another reader) costs nothing. Bounded; oldest out first.
const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 500;
const cache = new Map<string, { at: number; results: NoteHit[] }>();

function cached(key: string): NoteHit[] | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return e.results;
}
function remember(key: string, results: NoteHit[]) {
  cache.delete(key);
  cache.set(key, { at: Date.now(), results });
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
}

export const searchRoute = new Hono();

searchRoute.get("/", async (c) => {
  c.header("Cache-Control", "no-store");
  const rag = ragState().state;
  if (rag === "disabled") return c.json({ results: [], error: "disabled" }, 503);

  const q = normaliseQuery((c.req.query("q") || "").slice(0, MAX_Q));
  if ([...q].length < MIN_Q) return c.json({ results: [] });

  const hit = cached(q);
  if (hit) return c.json({ results: hit });
  if (rag !== "ready") return c.json({ results: [] });

  const ip = getIp(c);
  if (ip !== "anon" && quota.exceeded(`search:${ip}`)) {
    return c.json({ results: [] }, 429);
  }
  try {
    const hits = await denseSearch(q, CANDIDATES, MIN_SCORE);
    if (!hits) return c.json({ results: [] });
    const results = groupByNote(hits, LIMIT);
    remember(q, results);
    return c.json({ results });
  } catch (e) {
    console.warn("search: failed", e instanceof Error ? e.message : e);
    return c.json({ results: [] }, 502);
  }
});
