// "Notes proches" — semantically related notes for a note page, from the same
// embedding index /api/ask already uses. Public (no admin gate, no PII), and
// degrades to an empty list — same as the assistant — when RAG isn't
// configured/ready yet, so the client enhancer can just render nothing.

import { Hono } from "hono";
import { relatedNotes } from "../rag.ts";

const TOP_K = 4;
const MAX_URL = 300;

export const relatedRoute = new Hono();

relatedRoute.get("/", (c) => {
  const url = (c.req.query("url") || "").slice(0, MAX_URL);
  if (!url.startsWith("/posts/")) return c.json({ related: [] });
  try {
    return c.json({ related: relatedNotes(url, TOP_K) });
  } catch (e) {
    console.warn("related: lookup failed", e);
    return c.json({ related: [] });
  }
});
