// The reader's own marks on the garden, client-side (localStorage) and carried
// by the progress export and the account sync (lib/progress-transfer.ts):
//
// - gkBookmarks  "à lire plus tard": {slug: {t, title, del?}}
// - gkHighlights passages highlighted in a note, with an optional note:
//                {slug: {title, items: {id: {q, t, n?, del?}}}}
// - gkActivity   what was done each day, for the regularity calendar:
//                {"YYYY-MM-DD": {r?: notes read, c?: cards and questions reviewed}}
//
// A removed bookmark or highlight is kept as a tombstone (`del: 1` with the
// time of removal) rather than deleted, so a merge with an older copy from
// another device does not bring it back: per entry, the newest `t` wins.
// Pure apart from the small storage helpers at the end (personal.test.ts).

export const BOOKMARKS_KEY = "gkBookmarks";
export const HIGHLIGHTS_KEY = "gkHighlights";
export const ACTIVITY_KEY = "gkActivity";

/** Caps that keep each entry far below the per-origin quota. */
export const MAX_BOOKMARKS = 500;
export const MAX_HIGHLIGHTS_PER_NOTE = 100;
export const MAX_HIGHLIGHT_CHARS = 1000;
export const MAX_HIGHLIGHT_NOTE_CHARS = 2000;
export const MAX_ACTIVITY_DAYS = 800;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const sec = (ms: number) => Math.floor(ms / 1000);

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// --- bookmarks ---------------------------------------------------------------

export interface Bookmark {
  /** Added (or removed, with `del`), seconds since the epoch. */
  t: number;
  title: string;
  del?: 1;
}
export type Bookmarks = Record<string, Bookmark>;

export function parseBookmarks(v: unknown): Bookmarks {
  const out: Bookmarks = {};
  if (!isObj(v)) return out;
  for (const [slug, e] of Object.entries(v)) {
    if (!slug || !isObj(e)) continue;
    const t = Number(e.t);
    if (!Number.isFinite(t)) continue;
    const b: Bookmark = {
      t: Math.round(t),
      title: typeof e.title === "string" ? e.title.slice(0, 300) : slug,
    };
    if (e.del) b.del = 1;
    out[slug] = b;
  }
  return out;
}

export function mergeBookmarks(a: Bookmarks, b: Bookmarks): Bookmarks {
  const out = { ...a };
  for (const [slug, e] of Object.entries(b)) {
    if (!out[slug] || e.t > out[slug].t) out[slug] = e;
  }
  return out;
}

/** Live bookmarks, most recent first. */
export function listBookmarks(s: Bookmarks): { slug: string; title: string; t: number }[] {
  return Object.entries(s)
    .filter(([, e]) => !e.del)
    .map(([slug, e]) => ({ slug, title: e.title, t: e.t }))
    .sort((x, y) => y.t - x.t);
}

export function toggleBookmark(
  s: Bookmarks,
  slug: string,
  title: string,
  now = Date.now(),
): Bookmarks {
  const cur = s[slug];
  const out = { ...s };
  out[slug] =
    cur && !cur.del ? { t: sec(now), title: cur.title, del: 1 } : { t: sec(now), title };
  // Over the cap: the oldest tombstones go first, then the oldest bookmarks.
  const keys = Object.keys(out);
  if (keys.length > MAX_BOOKMARKS) {
    keys
      .sort((x, y) => Number(!out[x].del) - Number(!out[y].del) || out[x].t - out[y].t)
      .slice(0, keys.length - MAX_BOOKMARKS)
      .forEach((k) => delete out[k]);
  }
  return out;
}

export function isBookmarked(s: Bookmarks, slug: string): boolean {
  return !!s[slug] && !s[slug].del;
}

// --- highlights --------------------------------------------------------------

export interface Highlight {
  /** The highlighted text, whitespace-normalised. */
  q: string;
  /** Created or last edited (or removed, with `del`), seconds since the epoch. */
  t: number;
  /** The reader's own note on it. */
  n?: string;
  del?: 1;
}
export interface NoteHighlights {
  title: string;
  items: Record<string, Highlight>;
}
export type Highlights = Record<string, NoteHighlights>;

export function parseHighlights(v: unknown): Highlights {
  const out: Highlights = {};
  if (!isObj(v)) return out;
  for (const [slug, e] of Object.entries(v)) {
    if (!slug || !isObj(e) || !isObj(e.items)) continue;
    const items: Record<string, Highlight> = {};
    for (const [id, h] of Object.entries(e.items)) {
      if (!id || !isObj(h) || typeof h.q !== "string" || !h.q.trim()) continue;
      const t = Number(h.t);
      if (!Number.isFinite(t)) continue;
      const it: Highlight = { q: h.q.slice(0, MAX_HIGHLIGHT_CHARS), t: Math.round(t) };
      if (typeof h.n === "string" && h.n.trim()) it.n = h.n.slice(0, MAX_HIGHLIGHT_NOTE_CHARS);
      if (h.del) it.del = 1;
      items[id] = it;
    }
    if (Object.keys(items).length)
      out[slug] = { title: typeof e.title === "string" ? e.title.slice(0, 300) : slug, items };
  }
  return out;
}

export function mergeHighlights(a: Highlights, b: Highlights): Highlights {
  const out: Highlights = { ...a };
  for (const [slug, nb] of Object.entries(b)) {
    const na = out[slug];
    if (!na) {
      out[slug] = nb;
      continue;
    }
    const items = { ...na.items };
    for (const [id, h] of Object.entries(nb.items)) {
      if (!items[id] || h.t > items[id].t) items[id] = h;
    }
    out[slug] = { title: nb.title || na.title, items };
  }
  return out;
}

/** Live highlights of every note, newest first. */
export function listHighlights(
  s: Highlights,
): { slug: string; title: string; id: string; q: string; n?: string; t: number }[] {
  const rows: { slug: string; title: string; id: string; q: string; n?: string; t: number }[] = [];
  for (const [slug, nh] of Object.entries(s)) {
    for (const [id, h] of Object.entries(nh.items)) {
      if (!h.del) rows.push({ slug, title: nh.title, id, q: h.q, n: h.n, t: h.t });
    }
  }
  return rows.sort((x, y) => y.t - x.t);
}

export function normalizeQuote(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, MAX_HIGHLIGHT_CHARS);
}

export function addHighlight(
  s: Highlights,
  slug: string,
  title: string,
  quote: string,
  now = Date.now(),
): { store: Highlights; id: string } {
  const q = normalizeQuote(quote);
  const id = sec(now).toString(36) + Math.random().toString(36).slice(2, 6);
  const cur = s[slug] ?? { title, items: {} };
  const items: Record<string, Highlight> = { ...cur.items, [id]: { q, t: sec(now) } };
  const ids = Object.keys(items);
  if (ids.length > MAX_HIGHLIGHTS_PER_NOTE) {
    ids
      .sort((x, y) => Number(!items[x].del) - Number(!items[y].del) || items[x].t - items[y].t)
      .slice(0, ids.length - MAX_HIGHLIGHTS_PER_NOTE)
      .forEach((k) => delete items[k]);
  }
  return { store: { ...s, [slug]: { title, items } }, id };
}

export function updateHighlight(
  s: Highlights,
  slug: string,
  id: string,
  change: { n?: string; del?: boolean },
  now = Date.now(),
): Highlights {
  const nh = s[slug];
  const h = nh?.items[id];
  if (!nh || !h) return s;
  const next: Highlight = { ...h, t: Math.max(sec(now), h.t + 1) };
  if (change.n !== undefined) {
    const n = change.n.trim().slice(0, MAX_HIGHLIGHT_NOTE_CHARS);
    if (n) next.n = n;
    else delete next.n;
  }
  if (change.del) next.del = 1;
  return { ...s, [slug]: { ...nh, items: { ...nh.items, [id]: next } } };
}

// --- activity ----------------------------------------------------------------

export interface DayActivity {
  /** Notes finished that day. */
  r?: number;
  /** Cards and quiz questions reviewed that day. */
  c?: number;
}
export type Activity = Record<string, DayActivity>;

export function parseActivity(v: unknown): Activity {
  const out: Activity = {};
  if (!isObj(v)) return out;
  for (const [day, e] of Object.entries(v)) {
    if (!DAY_RE.test(day) || !isObj(e)) continue;
    const d: DayActivity = {};
    for (const f of ["r", "c"] as const) {
      const n = Math.round(Number(e[f]));
      if (Number.isFinite(n) && n > 0) d[f] = Math.min(n, 100_000);
    }
    if (d.r || d.c) out[day] = d;
  }
  return out;
}

/** The same day counted on two devices: the larger count of each kind (they
 *  are usually copies of one another, rarely disjoint work). */
export function mergeActivity(a: Activity, b: Activity): Activity {
  const out = { ...a };
  for (const [day, e] of Object.entries(b)) {
    const cur = out[day] ?? {};
    const m: DayActivity = {};
    const r = Math.max(cur.r ?? 0, e.r ?? 0);
    const c = Math.max(cur.c ?? 0, e.c ?? 0);
    if (r) m.r = r;
    if (c) m.c = c;
    out[day] = m;
  }
  return trimActivity(out);
}

function trimActivity(a: Activity): Activity {
  const days = Object.keys(a).sort();
  if (days.length <= MAX_ACTIVITY_DAYS) return a;
  const out = { ...a };
  for (const d of days.slice(0, days.length - MAX_ACTIVITY_DAYS)) delete out[d];
  return out;
}

export function bumpActivity(a: Activity, day: string, kind: "r" | "c", n = 1): Activity {
  const cur = a[day] ?? {};
  return trimActivity({ ...a, [day]: { ...cur, [kind]: (cur[kind] ?? 0) + n } });
}

/** Local calendar day as "YYYY-MM-DD" (same convention as lib/srs.ts). */
export function localDay(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Per-day totals for the calendar: the activity log, plus the reading
 *  store's "read" timestamps, so notes finished before the log existed
 *  still show (the larger of the two counts wins on a given day). */
export function calendarDays(
  activity: Activity,
  readTimes: number[],
): Record<string, { r: number; c: number }> {
  const fromReads: Record<string, number> = {};
  for (const t of readTimes) {
    const d = localDay(new Date(t * 1000));
    fromReads[d] = (fromReads[d] ?? 0) + 1;
  }
  const out: Record<string, { r: number; c: number }> = {};
  for (const d of new Set([...Object.keys(activity), ...Object.keys(fromReads)])) {
    out[d] = {
      r: Math.max(activity[d]?.r ?? 0, fromReads[d] ?? 0),
      c: activity[d]?.c ?? 0,
    };
  }
  return out;
}

/** Current run of consecutive active days ending today (or yesterday, so the
 *  streak isn't shown as broken before today's reading). */
export function currentRun(days: Record<string, { r: number; c: number }>, today = localDay()): number {
  const active = (d: string) => !!days[d] && (days[d].r > 0 || days[d].c > 0);
  const step = (d: string) => {
    const x = new Date(`${d}T00:00:00Z`);
    x.setUTCDate(x.getUTCDate() - 1);
    return x.toISOString().slice(0, 10);
  };
  let d = active(today) ? today : step(today);
  let n = 0;
  while (active(d)) {
    n++;
    d = step(d);
  }
  return n;
}

// --- storage glue ------------------------------------------------------------

function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}
function write(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage blocked or full: the mark simply isn't kept */
  }
}

export const loadBookmarks = () => parseBookmarks(read(BOOKMARKS_KEY));
export const saveBookmarks = (s: Bookmarks) => write(BOOKMARKS_KEY, s);
export const loadHighlights = () => parseHighlights(read(HIGHLIGHTS_KEY));
export const saveHighlights = (s: Highlights) => write(HIGHLIGHTS_KEY, s);
export const loadActivity = () => parseActivity(read(ACTIVITY_KEY));

/** Count one thing done today ("r" a note finished, "c" a card or question
 *  reviewed). Called from the note page, the flashcards and the quizzes. */
export function recordActivity(kind: "r" | "c", n = 1): void {
  write(ACTIVITY_KEY, bumpActivity(loadActivity(), localDay(), kind, n));
  try {
    window.dispatchEvent(new CustomEvent("gk:activity", { detail: { kind } }));
  } catch {
    /* no window (tests) */
  }
}
