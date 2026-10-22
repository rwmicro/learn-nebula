// Reading progress, client-side only: which notes this reader has finished,
// and where they stopped in the others. One localStorage entry, a JSON object
// keyed by note slug — no account, nothing leaves the browser. Pure helpers
// here (unit-tested in lib/reading-progress.test.ts); the DOM side is
// public/js/reading-state.js on note pages, components/HomeContent.tsx (the
// "Reprendre" card and the per-folder counts) and components/ReadMarks.tsx
// (checkmarks on /themes/, /disciplines/ and /parcours/).

import type { HomeTreeNode } from "./content";

export const STORAGE_KEY = "gkReading";
/** Past this many notes the oldest entries go: unfinished ones first, then
 *  the oldest reads. ~40 bytes an entry keeps the whole object well under
 *  200 KB, a fraction of the per-origin quota other features share. */
export const MAX_ENTRIES = 4000;
/** Share of the article body scrolled past that counts as reaching the end
 *  (the reading-progress bar's own measure, see scrollProgress). */
export const READ_THRESHOLD = 0.9;
/** Below this, a visit is a glance, not a reading worth resuming. */
export const RESUME_MIN = 0.05;

export interface ReadingEntry {
  /** Furthest scroll position reached on the last visit, in permille of the
   *  article body (0–1000). Integer to stay compact. */
  p: number;
  /** Last visit, seconds since the epoch. */
  t: number;
  /** When the note was marked read, seconds since the epoch; absent = unread. */
  r?: number;
}

export type ReadingStore = Record<string, ReadingEntry>;

const sec = (ms: number) => Math.floor(ms / 1000);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * Same measure as the reading-progress bar (public/js/sticky-header.js): 0
 * while the top of the article body is still below the top of the viewport, 1
 * once its end has come up into view — the last screen of a note counts as
 * read even though it can never scroll past the top.
 */
export function scrollProgress(top: number, height: number, viewport: number): number {
  const total = height - viewport;
  if (total <= 0) return top <= 0 ? 1 : 0;
  return clamp(-top / total, 0, 1);
}

/** Scroll offset that brings the body back to `progress` (inverse of above). */
export function scrollTopFor(
  progress: number,
  bodyTop: number,
  height: number,
  viewport: number,
): number {
  return Math.max(0, Math.round(bodyTop + clamp(progress, 0, 1) * Math.max(0, height - viewport)));
}

/** Validated store from the raw localStorage string; junk is dropped, never thrown. */
export function parseStore(raw: string | null | undefined): ReadingStore {
  if (!raw) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const out: ReadingStore = {};
  for (const [slug, v] of Object.entries(data as Record<string, unknown>)) {
    if (!slug || !v || typeof v !== "object") continue;
    const e = v as Record<string, unknown>;
    const p = Number(e.p);
    const t = Number(e.t);
    if (!Number.isFinite(p) || !Number.isFinite(t)) continue;
    const entry: ReadingEntry = { p: clamp(Math.round(p), 0, 1000), t: Math.round(t) };
    if (e.r != null && Number.isFinite(Number(e.r))) entry.r = Math.round(Number(e.r));
    out[slug] = entry;
  }
  return out;
}

/** Oldest entries out past `max`: unfinished ones go before any read note,
 *  since the read state is what the counts and checkmarks are built on. */
export function pruneStore(store: ReadingStore, max = MAX_ENTRIES): ReadingStore {
  const slugs = Object.keys(store);
  if (slugs.length <= max) return store;
  const keep = slugs
    .sort((a, b) => {
      const ra = store[a].r != null ? 1 : 0;
      const rb = store[b].r != null ? 1 : 0;
      return rb - ra || store[b].t - store[a].t || (a < b ? -1 : 1);
    })
    .slice(0, max);
  const out: ReadingStore = {};
  for (const s of keep) out[s] = store[s];
  return out;
}

export function serializeStore(store: ReadingStore, max = MAX_ENTRIES): string {
  return JSON.stringify(pruneStore(store, max));
}

/** Remember where the reader is in `slug` (0–1). A read note keeps its read
 *  state; its position is not worth keeping. */
export function recordProgress(
  store: ReadingStore,
  slug: string,
  progress: number,
  now = Date.now(),
): ReadingStore {
  const prev = store[slug];
  const p = Math.round(clamp(progress, 0, 1) * 1000);
  const entry: ReadingEntry = prev?.r != null ? { p: 0, t: sec(now), r: prev.r } : { p, t: sec(now) };
  return { ...store, [slug]: entry };
}

export function markRead(store: ReadingStore, slug: string, now = Date.now()): ReadingStore {
  return { ...store, [slug]: { p: 0, t: sec(now), r: sec(now) } };
}

/** Back to unread: the entry goes entirely (no position worth resuming). */
export function markUnread(store: ReadingStore, slug: string): ReadingStore {
  const out = { ...store };
  delete out[slug];
  return out;
}

export function isRead(store: ReadingStore, slug: string | null | undefined): boolean {
  return !!slug && store[slug]?.r != null;
}

/** Saved position (0–1) of an unfinished note, or null. */
export function savedProgress(store: ReadingStore, slug: string): number | null {
  const e = store[slug];
  if (!e || e.r != null || e.p < RESUME_MIN * 1000) return null;
  return e.p / 1000;
}

/** The unfinished note visited last, for the home "Reprendre" card. */
export function resumeCandidate(
  store: ReadingStore,
  exists: (slug: string) => boolean = () => true,
): { slug: string; progress: number } | null {
  let best: { slug: string; progress: number; t: number } | null = null;
  for (const [slug, e] of Object.entries(store)) {
    if (e.r != null || e.p < RESUME_MIN * 1000 || e.p >= READ_THRESHOLD * 1000) continue;
    if (!exists(slug)) continue;
    if (!best || e.t > best.t || (e.t === best.t && slug < best.slug)) {
      best = { slug, progress: e.p / 1000, t: e.t };
    }
  }
  return best && { slug: best.slug, progress: best.progress };
}

/** "/posts/a/b/" (or a full URL, with #hash/?query) → "a/b"; null for anything else. */
export function slugFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  let path = href;
  try {
    path = new URL(href, "https://x.invalid").pathname;
  } catch {
    return null;
  }
  const m = path.match(/^\/posts\/(.+?)\/?$/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/** Minimum time on a note before reaching its end marks it read: a quarter of
 *  the estimated reading time, between 10 s and 90 s. Scrolling straight to
 *  the bottom of a long note is skimming, not reading. */
export function minDwellMs(readingMinutes: number): number {
  const m = Number.isFinite(readingMinutes) && readingMinutes > 0 ? readingMinutes : 1;
  return clamp(m * 60_000 * 0.25, 10_000, 90_000);
}

export function shouldMarkRead(progress: number, dwellMs: number, readingMinutes: number): boolean {
  return progress >= READ_THRESHOLD && dwellMs >= minDwellMs(readingMinutes);
}

export interface FolderCount {
  read: number;
  total: number;
}

/** Read / total notes under every folder of the home tree, keyed by the
 *  folder's `path`. Decks and attachments are not notes and are not counted. */
export function folderReadCounts(
  tree: HomeTreeNode[],
  store: ReadingStore,
): Map<string, FolderCount> {
  const out = new Map<string, FolderCount>();
  const walk = (node: HomeTreeNode): FolderCount => {
    if (node.type === "note") {
      if (node.deck || node.asset) return { read: 0, total: 0 };
      return { read: isRead(store, slugFromHref(node.href)) ? 1 : 0, total: 1 };
    }
    const sum = { read: 0, total: 0 };
    for (const c of node.children) {
      const r = walk(c);
      sum.read += r.read;
      sum.total += r.total;
    }
    out.set(node.path, sum);
    return sum;
  };
  for (const n of tree) walk(n);
  return out;
}

/** In a reading path (notes in reading order, each with its prerequisites):
 *  the first unread note whose prerequisites are all read — the one to read
 *  next. Null when the path is finished. */
export function nextToRead(
  notes: { slug: string; prereqs: string[] }[],
  store: ReadingStore,
): string | null {
  for (const n of notes) {
    if (isRead(store, n.slug)) continue;
    if (n.prereqs.every((p) => isRead(store, p))) return n.slug;
  }
  return null;
}

/** The note being read, for the tab bar's mini player (components/
 *  MobileTabBar.tsx): written by public/js/reading-state.js with the note's
 *  position, dropped once the note is read. Its title rides along so pages
 *  without the home's data can still show it. Not synced with the account:
 *  gkReading already carries the progress, this is only its label. */
export const NOW_KEY = "gkNow";

export interface NowReading {
  /** Note slug. */
  s: string;
  title: string;
  /** Colour family (lib/path-family.ts), when the note has one. */
  f?: string;
  /** Reading time of the whole note, minutes. */
  m: number;
}

export function parseNow(raw: string | null | undefined): NowReading | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (!v || typeof v.s !== "string" || !v.s || typeof v.title !== "string" || !v.title) return null;
    const m = Number(v.m);
    return {
      s: v.s,
      title: v.title.slice(0, 200),
      ...(typeof v.f === "string" && /^[a-z]{1,20}$/.test(v.f) ? { f: v.f } : {}),
      m: Number.isFinite(m) && m > 0 ? Math.round(m) : 1,
    };
  } catch {
    return null;
  }
}

/** What the mini player shows: the remembered note while it is unfinished
 *  and was opened in the last 30 days, with its position (0–1) and the
 *  minutes left; null otherwise. */
export function nowPlaying(
  now: NowReading | null,
  store: ReadingStore,
  at = Date.now(),
): { note: NowReading; progress: number; left: number } | null {
  if (!now) return null;
  const e = store[now.s];
  if (!e || e.r != null || at / 1000 - e.t > 30 * 86400) return null;
  const progress = clamp(e.p / 1000, 0, 1);
  return { note: now, progress, left: Math.max(1, Math.round(now.m * (1 - progress))) };
}

// --- browser glue (tolerates blocked storage: private mode, disabled cookies)

export function loadStore(storage: Pick<Storage, "getItem"> | null = safeStorage()): ReadingStore {
  try {
    return parseStore(storage?.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

export function saveStore(
  store: ReadingStore,
  storage: Pick<Storage, "setItem"> | null = safeStorage(),
): boolean {
  try {
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, serializeStore(store));
    return true;
  } catch {
    return false;
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Fired on window after this tab changes the store (the `storage` event only
 *  reaches *other* tabs). */
export const CHANGE_EVENT = "gk:reading-change";

export function loadNow(storage: Pick<Storage, "getItem"> | null = safeStorage()): NowReading | null {
  try {
    return parseNow(storage?.getItem(NOW_KEY));
  } catch {
    return null;
  }
}

export function saveNow(
  now: NowReading | null,
  storage: Pick<Storage, "setItem" | "removeItem"> | null = safeStorage(),
): void {
  try {
    if (!storage) return;
    if (now) storage.setItem(NOW_KEY, JSON.stringify(now));
    else storage.removeItem(NOW_KEY);
  } catch {
    /* storage blocked */
  }
}
