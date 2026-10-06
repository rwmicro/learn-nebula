// "Recherches sans résultat": a search that settles on zero results is worth
// knowing about — it is a note nobody has written yet, or a spelling the
// index doesn't catch. The client side (home search in components/
// HomeContent.tsx; the note drawer in public/js/pagefind-init.js keeps its own
// copy of report(), being served unbundled) fires one POST /api/search-miss
// per query per page view; the server (server/routes/search-miss.ts) stores
// counts for /admin. The normalisation is shared so both agree on what "the
// same query" is.

export const SEARCH_MISS_MIN_CHARS = 3;
export const SEARCH_MISS_MAX_CHARS = 100;
/** How long a query must stay unchanged (and empty-handed) to count. */
export const SEARCH_MISS_SETTLE_MS = 1500;
export const SEARCH_MISS_WHERE = ["home", "note"] as const;
export type SearchMissWhere = (typeof SEARCH_MISS_WHERE)[number];

/** Trimmed, lowercased, inner whitespace collapsed, control characters
 *  dropped, capped at SEARCH_MISS_MAX_CHARS; null when too short to count. */
export function normaliseSearchMiss(q: unknown): string | null {
  if (typeof q !== "string") return null;
  const s = q
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, SEARCH_MISS_MAX_CHARS)
    .trim();
  return [...s].length >= SEARCH_MISS_MIN_CHARS ? s : null;
}

export function isSearchMissWhere(v: unknown): v is SearchMissWhere {
  return typeof v === "string" && (SEARCH_MISS_WHERE as readonly string[]).includes(v);
}

const sent = new Set<string>();

/** Fire-and-forget report, at most once per (query, where) per page view.
 *  Without a backend (next dev) the POST just fails, silently. */
export function reportSearchMiss(q: string, where: SearchMissWhere): void {
  const n = normaliseSearchMiss(q);
  if (!n) return;
  const key = `${where}:${n}`;
  if (sent.has(key)) return;
  sent.add(key);
  try {
    fetch("/api/search-miss", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ q: n, where }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* no fetch: nothing to report to */
  }
}
