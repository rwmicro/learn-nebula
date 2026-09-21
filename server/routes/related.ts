// "Notes proches" — semantically related notes for a note page, from the same
// embedding index /api/ask already uses. Public (no admin gate, no PII), and
// degrades to an empty list — same as the assistant — when RAG isn't
// configured/ready yet, so the client enhancer can just render nothing.

import { Hono } from "hono";
import { getIp } from "../http.ts";
import { Quota } from "../ratelimit.ts";
import { relatedNotes } from "../rag.ts";

const TOP_K = 4;
const MAX_URL = 300;

// relatedNotes() is synchronous and O(chunks × dim) — cheap once, but with no
// external call to naturally throttle it (unlike /api/ask) a flood would burn
// CPU on Node's single thread and stall every other request.
//
// A rolling quota rather than a cooldown: this used to be Cooldown(1), one
// request per second per IP, and every note page fires exactly one of these on
// load. Two notes opened inside a second — an ordinary reader clicking through
// a garden, or simply two people behind one NAT — got a 429 and silently lost
// the section. A minute-long cap bounds a flood to the same sustained rate
// while leaving normal reading alone.
const quota = new Quota(60, 60_000);

// The answer is deterministic per URL until the index is rebuilt (container
// restart), so it is worth caching at the reader and at the edge. An empty list
// is the exception: it is also what the route returns while RAG is still
// embedding at startup, and pinning that for an hour would hide the feature
// long after it came up.
const CACHE_HIT = "public, max-age=3600";
const CACHE_EMPTY = "public, max-age=60";

export const relatedRoute = new Hono();

relatedRoute.get("/", (c) => {
  const url = (c.req.query("url") || "").slice(0, MAX_URL);
  if (!url.startsWith("/posts/")) {
    c.header("Cache-Control", CACHE_EMPTY);
    return c.json({ related: [] });
  }
  const ip = getIp(c);
  if (ip !== "anon" && quota.exceeded(`related:${ip}`)) {
    c.header("Cache-Control", "no-store");
    return c.json({ related: [] }, 429);
  }
  try {
    const related = relatedNotes(url, TOP_K);
    c.header("Cache-Control", related.length ? CACHE_HIT : CACHE_EMPTY);
    return c.json({ related });
  } catch (e) {
    console.warn("related: lookup failed", e);
    c.header("Cache-Control", "no-store");
    return c.json({ related: [] });
  }
});
