// "Mes lectures" on /graph/: which note nodes this reader has finished (from
// the reading store, lib/reading-progress.ts) and where to go next. Pure, so
// it is unit-tested in lib/graph-reading.test.ts; components/CircularGraph.tsx
// feeds it the graph data and the store.

import type { GraphData } from "./graph-data";
import { isRead, type ReadingStore } from "./reading-progress";

/** Node id of a note, as lib/graph-data.ts builds it. */
export const noteNodeId = (slug: string) => `file:/posts/${slug}/`;

const slugOf = (id: string): string | null => {
  const m = /^file:\/posts\/(.+)\/$/.exec(id);
  return m ? m[1] : null;
};

export interface ReadingView {
  /** Note node ids the reader has finished. */
  read: Set<string>;
  /** Notes in the graph (folders, decks and attachments excluded). */
  total: number;
  /** Unread notes to open next, best first. */
  next: string[];
  /** True when `next` follows the reader's links (else: the most cited
   *  notes, for a reader with nothing read yet). */
  fromReading: boolean;
}

/**
 * Suggestions follow the [[links]]: an unread note linked to or from many of
 * the notes already read is the natural next step. With nothing read (or no
 * unread neighbour), the most linked-to notes overall are a good way in.
 */
export function readingView(data: GraphData, store: ReadingStore, limit = 5): ReadingView {
  const notes = data.nodes.filter((n) => n.kind === "note");
  const read = new Set<string>();
  for (const n of notes) if (isRead(store, slugOf(n.id))) read.add(n.id);

  const isNote = new Set(notes.map((n) => n.id));
  const score = new Map<string, number>();
  const cited = new Map<string, number>();
  for (const l of data.links) {
    if (l.kind !== "wikilink") continue;
    const a = l.source;
    const b = l.target;
    if (!isNote.has(a) || !isNote.has(b) || a === b) continue;
    cited.set(b, (cited.get(b) ?? 0) + 1);
    if (read.has(a) && !read.has(b)) score.set(b, (score.get(b) ?? 0) + 1);
    if (read.has(b) && !read.has(a)) score.set(a, (score.get(a) ?? 0) + 1);
  }
  const rank = (m: Map<string, number>) =>
    [...m.entries()]
      .filter(([id]) => !read.has(id))
      .sort((x, y) => y[1] - x[1] || (cited.get(y[0]) ?? 0) - (cited.get(x[0]) ?? 0) || (x[0] < y[0] ? -1 : 1))
      .slice(0, limit)
      .map(([id]) => id);

  const near = rank(score);
  return near.length
    ? { read, total: notes.length, next: near, fromReading: true }
    : { read, total: notes.length, next: rank(cited), fromReading: false };
}
