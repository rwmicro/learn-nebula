// "Notes proches" — semantically related notes for a note page, from the same
// embedding index /api/ask already uses. Public (no admin gate, no PII), and
// degrades to an empty list — same as the assistant — when RAG isn't
// configured/ready yet, so the client enhancer can just render nothing.

import { Hono } from "hono";
import { getIp } from "../http.ts";
import { Cooldown } from "../ratelimit.ts";
import { relatedNotes } from "../rag.ts";

const TOP_K = 4;
const MAX_URL = 300;

// relatedNotes() is synchronous and O(chunks × dim) — cheap once, but with no
// external call to naturally throttle it (unlike /api/ask) a flood would burn
// CPU on Node's single thread and stall every other request. One request per
// note load is normal; a cooldown well under that cadence still lets a fast
// page-to-page reader through.
const cooldown = new Cooldown(1);

export const relatedRoute = new Hono();

relatedRoute.get("/", (c) => {
  const url = (c.req.query("url") || "").slice(0, MAX_URL);
  if (!url.startsWith("/posts/")) return c.json({ related: [] });
  const ip = getIp(c);
  if (ip !== "anon" && cooldown.limited(`related:${ip}`)) {
    return c.json({ related: [] }, 429);
  }
  try {
    return c.json({ related: relatedNotes(url, TOP_K) });
  } catch (e) {
    console.warn("related: lookup failed", e);
    return c.json({ related: [] });
  }
});
