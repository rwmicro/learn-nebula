// Chunk hits → note results for /api/search (server/routes/search.ts). A note
// is several chunks; the palette lists notes, so hits are folded per note URL,
// keeping the best chunk's score and its section. Pure, tested in
// search-group.test.ts.

export interface ChunkHit {
  title: string;
  url: string;
  /** Chunk text; its first line is the "Title › Section › …" breadcrumb
   *  (scripts/build-rag-chunks.mjs). */
  text: string;
  cosine: number;
}

export interface NoteHit {
  url: string;
  title: string;
  /** The best chunk's section ("Section › Subsection"), "" for the intro. */
  section: string;
  score: number;
}

/** The section part of a chunk's breadcrumb line, without the note title. */
export function sectionOf(text: string): string {
  const crumb = (text.split("\n", 1)[0] ?? "").trim();
  const parts = crumb.split(" › ");
  if (parts.length < 2) return "";
  // The first segment is the note title.
  return parts.slice(1).join(" › ").slice(0, 160);
}

/** Best chunk per note, best notes first, at most `limit`. A note reached by
 *  several chunks gets a small bonus (up to +0.03): it is about the query
 *  rather than mentioning it once. Ties keep the input order. */
export function groupByNote(hits: ChunkHit[], limit = 8): NoteHit[] {
  const by = new Map<string, { hit: NoteHit; n: number; order: number }>();
  hits.forEach((h, order) => {
    if (!h.url) return;
    const e = by.get(h.url);
    if (!e) {
      by.set(h.url, {
        hit: { url: h.url, title: h.title, section: sectionOf(h.text), score: h.cosine },
        n: 1,
        order,
      });
      return;
    }
    e.n++;
    if (h.cosine > e.hit.score) {
      e.hit.score = h.cosine;
      e.hit.section = sectionOf(h.text);
    }
  });
  return [...by.values()]
    .map((e) => ({ ...e, rank: e.hit.score + Math.min(0.03, (e.n - 1) * 0.01) }))
    .sort((a, b) => b.rank - a.rank || a.order - b.order)
    .slice(0, Math.max(0, limit))
    .map((e) => ({ ...e.hit, score: Math.round(e.hit.score * 1000) / 1000 }));
}

/** Cache / rate-limit key for a query: trimmed, spaces collapsed, lower-cased. */
export function normaliseQuery(q: string): string {
  return q.replace(/\s+/g, " ").trim().toLowerCase();
}
