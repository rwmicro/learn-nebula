// Export / import of the reader's progress (/progression/, the command
// palette). Everything the site remembers about a reader lives in this
// browser's localStorage; this file is the one place that says which keys are
// *progress* (worth carrying to another device) as opposed to preferences
// (theme, text size, assistant position…), and how two copies of each merge.
// Pure apart from the small storage/compression helpers at the end, so the
// format, validation and merge rules are unit-tested (progress-transfer.test.ts).

import { parseStore as parseReading } from "./reading-progress";
import { parseNoteDeck } from "./note-quiz";
import { parseProgress, type CardState, type Progress } from "./srs";
import { LOG_KEY, mergeLogs, parseLog, type ReviewLog } from "./srs-log";

export const FORMAT = "jardin-progression";
/** Bumped when the file layout changes; older files stay importable. */
export const VERSION = 1;

export type KindId = "reading" | "known" | "targets" | "questions" | "decks" | "reviewLog";

export interface KeySpec {
  kind: KindId;
  /** Exact key, or every key starting with `prefix` (minus `exclude`). */
  key?: string;
  prefix?: string;
  exclude?: string[];
}

/**
 * Every localStorage key that holds progress. First match wins, so the more
 * specific prefix goes first. A new feature that stores progress adds its key
 * here (plus a kind in KINDS below) and export, import and the summary pick it
 * up. Preferences (theme, locale, noteTextSize, gkChat*, flashcardSize…) are
 * deliberately left out.
 */
export const PROGRESS_KEYS: KeySpec[] = [
  // Read notes and reading positions (lib/reading-progress.ts).
  { kind: "reading", key: "gkReading" },
  // Notes the reader says they already know, {slug: {t, via?}} (/parcours/).
  { kind: "known", key: "gkKnown" },
  // The note each reading path is aimed at, {pathSlug: noteSlug} (/parcours/).
  { kind: "targets", key: "gkPathTarget" },
  // Questions saved from notes, with their SRS state (lib/note-quiz.ts).
  { kind: "questions", prefix: "srs:note:" },
  // Anki deck SRS state, one key per deck (components/Flashcards.tsx).
  // "srs:probe" is a write test, never data.
  { kind: "decks", prefix: "srs:", exclude: ["srs:probe"] },
  // Reviews per day, {day: [reviews, failed]} (lib/srs-log.ts). No "srs:"
  // prefix, so it never reads as a deck.
  { kind: "reviewLog", key: LOG_KEY },
];

export function specFor(key: string): KeySpec | null {
  for (const s of PROGRESS_KEYS) {
    if (
      s.key !== undefined
        ? key === s.key
        : !!s.prefix && key.startsWith(s.prefix) && !s.exclude?.includes(key)
    ) {
      return s;
    }
  }
  return null;
}

/** Stored value → its canonical form, or null when it isn't valid data. */
function sanitize(kind: KindId, value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const json = JSON.stringify(value);
  switch (kind) {
    case "reading": {
      // parseReading validates p/t/r; fields it doesn't know (a newer reading
      // state) are carried over untouched from the original entry.
      const known = parseReading(json);
      const src = value as Record<string, Record<string, unknown>>;
      const out: Record<string, Record<string, unknown>> = {};
      for (const slug of Object.keys(known))
        out[slug] = { ...src[slug], ...known[slug] };
      return Object.keys(out).length ? out : null;
    }
    case "known": {
      // {t} validated, other fields (via…) carried over.
      const out: Record<string, Record<string, unknown>> = {};
      for (const [slug, e] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (!slug || !e || typeof e !== "object" || Array.isArray(e)) continue;
        const t = Number((e as { t?: unknown }).t);
        if (!Number.isFinite(t)) continue;
        out[slug] = { ...(e as Record<string, unknown>), t: Math.round(t) };
      }
      return Object.keys(out).length ? out : null;
    }
    case "targets": {
      const out: Record<string, string> = {};
      for (const [path, note] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (path && typeof note === "string" && note) out[path] = note;
      }
      return Object.keys(out).length ? out : null;
    }
    case "questions": {
      const d: NoteDeckLike = parseNoteDeck(json);
      // `ok`: questions answered correctly, {questionId: "YYYY-MM-DD"}. An
      // entry may hold only that, with no saved question.
      const ok = parseOk((value as { ok?: unknown }).ok);
      if (Object.keys(ok).length) d.ok = ok;
      return Object.keys(d.items).length || d.ok ? d : null;
    }
    case "decks": {
      if ((value as { v?: unknown }).v !== 1) return null;
      const p = parseProgress(json);
      return Object.keys(p.cards).length || p.newCount ? p : null;
    }
    case "reviewLog": {
      const log = parseLog(json);
      return Object.keys(log).length ? log : null;
    }
  }
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseOk(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [id, day] of Object.entries(v as Record<string, unknown>)) {
    if (id && typeof day === "string" && DAY_RE.test(day)) out[id] = day;
  }
  return out;
}

// --- reading what's in storage -------------------------------------------

type ReadStore = Pick<Storage, "getItem" | "key" | "length">;
type WriteStore = Pick<Storage, "setItem" | "removeItem">;

/** Progress currently in `store`, key → parsed value. Junk is skipped. */
export function collectProgress(store: ReadStore): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && specFor(k)) keys.push(k);
  }
  for (const k of keys.sort()) {
    try {
      const v = sanitize(
        specFor(k)!.kind,
        JSON.parse(store.getItem(k) ?? "null"),
      );
      if (v) out[k] = v;
    } catch {
      /* unparsable entry: not progress worth carrying */
    }
  }
  return out;
}

export interface Summary {
  /** Notes marked read. */
  read: number;
  /** Notes with a saved reading position, not finished. */
  started: number;
  /** Anki cards with a review state, across `decks` decks. */
  cards: number;
  decks: number;
  /** Questions saved from notes, across `questionNotes` notes. */
  questions: number;
  questionNotes: number;
  /** Notes marked as already known. */
  known: number;
  /** Reading paths with a chosen target note. */
  targets: number;
}

export function summarize(items: Record<string, unknown>): Summary {
  const s: Summary = {
    read: 0,
    started: 0,
    cards: 0,
    decks: 0,
    questions: 0,
    questionNotes: 0,
    known: 0,
    targets: 0,
  };
  for (const [k, v] of Object.entries(items)) {
    const kind = specFor(k)?.kind;
    if (kind === "reading") {
      for (const e of Object.values(
        v as Record<string, { r?: number; p?: number }>,
      )) {
        if (e.r != null) s.read++;
        else if ((e.p ?? 0) > 0) s.started++;
      }
    } else if (kind === "decks") {
      s.decks++;
      s.cards += Object.keys((v as Progress).cards).length;
    } else if (kind === "questions") {
      const n = Object.keys((v as { items: object }).items).length;
      if (n) s.questionNotes++;
      s.questions += n;
    } else if (kind === "known") {
      s.known += Object.keys(v as object).length;
    } else if (kind === "targets") {
      s.targets += Object.keys(v as object).length;
    }
  }
  return s;
}

// --- the file ------------------------------------------------------------

export interface ProgressFile {
  format: typeof FORMAT;
  version: number;
  /** ISO date-time of the export. */
  exportedAt: string;
  /** localStorage key → parsed value. */
  items: Record<string, unknown>;
}

export function buildExport(
  items: Record<string, unknown>,
  now = new Date(),
): ProgressFile {
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: now.toISOString(),
    items,
  };
}

/** `jardin-progression-2026-10-02.json` (local date). */
export function exportFilename(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `jardin-progression-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

export type ImportError = "json" | "format" | "version" | "empty";

export type Validated =
  | {
      ok: true;
      file: ProgressFile;
      /** Keys dropped: unknown or malformed. */ dropped: number;
    }
  | { ok: false; error: ImportError };

/** Check a file (its text, or already-parsed JSON) and keep only valid progress. */
export function validateImport(input: string | unknown): Validated {
  let data: unknown = input;
  if (typeof input === "string") {
    try {
      data = JSON.parse(input);
    } catch {
      return { ok: false, error: "json" };
    }
  }
  const d = data as Partial<ProgressFile> | null;
  if (
    !d ||
    typeof d !== "object" ||
    d.format !== FORMAT ||
    !d.items ||
    typeof d.items !== "object" ||
    Array.isArray(d.items)
  ) {
    return { ok: false, error: "format" };
  }
  if (!Number.isInteger(d.version) || (d.version as number) < 1)
    return { ok: false, error: "format" };
  if ((d.version as number) > VERSION) return { ok: false, error: "version" };
  const items: Record<string, unknown> = {};
  let dropped = 0;
  for (const [k, v] of Object.entries(d.items as Record<string, unknown>)) {
    const spec = specFor(k);
    const clean = spec && sanitize(spec.kind, v);
    if (clean) items[k] = clean;
    else dropped++;
  }
  if (!Object.keys(items).length) return { ok: false, error: "empty" };
  const exportedAt =
    typeof d.exportedAt === "string" && !Number.isNaN(Date.parse(d.exportedAt))
      ? d.exportedAt
      : "";
  return {
    ok: true,
    file: { format: FORMAT, version: d.version as number, exportedAt, items },
    dropped,
  };
}

// --- merge -----------------------------------------------------------------

type ReadingEntry = { p: number; t: number; r?: number } & Record<
  string,
  unknown
>;

/** Newest visit wins per note; on a tie, the entry that says "read". */
function mergeReading(
  a: Record<string, ReadingEntry>,
  b: Record<string, ReadingEntry>,
) {
  const out = { ...a };
  for (const [slug, e] of Object.entries(b)) {
    const cur = out[slug];
    if (!cur || e.t > cur.t || (e.t === cur.t && e.r != null && cur.r == null))
      out[slug] = e;
  }
  return out;
}

/** The card reviewed last is the newer state; on the same day, the one
 *  reviewed furthest (later due date, then more repetitions). */
function newerCard(a: CardState, b: CardState): CardState {
  if (b.last !== a.last) return b.last > a.last ? b : a;
  if (b.due !== a.due) return b.due > a.due ? b : a;
  return b.reps > a.reps ? b : a;
}

function mergeProgress<T extends Progress>(a: T, b: T): T {
  const cards = { ...a.cards };
  for (const [id, c] of Object.entries(b.cards))
    cards[id] = cards[id] ? newerCard(cards[id], c) : c;
  const day =
    a.newDay === b.newDay
      ? { newDay: a.newDay, newCount: Math.max(a.newCount, b.newCount) }
      : a.newDay > b.newDay
        ? { newDay: a.newDay, newCount: a.newCount }
        : { newDay: b.newDay, newCount: b.newCount };
  return { ...a, ...b, cards, ...day };
}

type NoteDeckLike = Progress & {
  items: Record<string, { added?: string }>;
  ok?: Record<string, string>;
};

function mergeQuestions(a: NoteDeckLike, b: NoteDeckLike): NoteDeckLike {
  const items = { ...a.items };
  for (const [id, it] of Object.entries(b.items)) {
    const cur = items[id];
    if (!cur || (it.added ?? "") > (cur.added ?? "")) items[id] = it;
  }
  // `ok` marks: union, the latest date per question.
  const ok = { ...(a.ok ?? {}) };
  for (const [id, day] of Object.entries(b.ok ?? {})) {
    if (!ok[id] || day > ok[id]) ok[id] = day;
  }
  const out: NoteDeckLike = { ...mergeProgress(a, b), items };
  if (Object.keys(ok).length) out.ok = ok;
  else delete out.ok;
  return out;
}

type KnownEntry = { t: number } & Record<string, unknown>;

/** Newest `t` wins per note. */
function mergeKnown(
  a: Record<string, KnownEntry>,
  b: Record<string, KnownEntry>,
) {
  const out = { ...a };
  for (const [slug, e] of Object.entries(b)) {
    if (!out[slug] || e.t > out[slug].t) out[slug] = e;
  }
  return out;
}

/** A target is the reader's choice on this device: merging only fills the
 *  paths that have none here ("replace" takes the file's as a whole). */
function mergeTargets(a: Record<string, string>, b: Record<string, string>) {
  return { ...b, ...a };
}

/** Merge two values of the same key. */
export function mergeValue(
  key: string,
  local: unknown,
  incoming: unknown,
): unknown {
  switch (specFor(key)?.kind) {
    case "reading":
      return mergeReading(
        local as Record<string, ReadingEntry>,
        incoming as Record<string, ReadingEntry>,
      );
    case "decks":
      return mergeProgress(local as Progress, incoming as Progress);
    case "questions":
      return mergeQuestions(local as NoteDeckLike, incoming as NoteDeckLike);
    case "known":
      return mergeKnown(
        local as Record<string, KnownEntry>,
        incoming as Record<string, KnownEntry>,
      );
    case "reviewLog":
      return mergeLogs(local as ReviewLog, incoming as ReviewLog);
    case "targets":
      return mergeTargets(
        local as Record<string, string>,
        incoming as Record<string, string>,
      );
    default:
      return incoming;
  }
}

/** The countable units of a value: note slugs, card ids, question ids. */
function unitsOf(key: string, v: unknown): Record<string, string> {
  const kind = specFor(key)?.kind;
  const out: Record<string, string> = {};
  if (!v) return out;
  if (kind === "reading" || kind === "known" || kind === "targets" || kind === "reviewLog") {
    for (const [s, e] of Object.entries(v as Record<string, unknown>))
      out[s] = JSON.stringify(e);
  } else if (kind === "decks") {
    for (const [id, c] of Object.entries((v as Progress).cards))
      out[id] = JSON.stringify(c);
  } else if (kind === "questions") {
    const d = v as NoteDeckLike;
    for (const [id, it] of Object.entries(d.items))
      out[id] = JSON.stringify([it, d.cards[id] ?? null, d.ok?.[id] ?? null]);
    // Answered-correctly marks of questions no longer saved count on their own.
    for (const [id, day] of Object.entries(d.ok ?? {}))
      if (!(id in d.items)) out[`ok:${id}`] = day;
  }
  return out;
}

export interface KindChanges {
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
}

export type ImportMode = "merge" | "replace";

export interface ImportPlan {
  mode: ImportMode;
  /** Keys to write, with their final value. */
  write: Record<string, unknown>;
  /** Keys to delete (replace mode: local progress the file doesn't have). */
  remove: string[];
  /** Per kind, counted in notes (reading, known), paths (targets), cards
   *  (decks) or questions. */
  changes: Record<KindId, KindChanges>;
}

/**
 * What importing `incoming` over `local` would do. "merge": every item from
 * both sides is kept, the newer copy winning where both have it. "replace":
 * the browser ends up with exactly the file's progress.
 */
export function planImport(
  local: Record<string, unknown>,
  incoming: Record<string, unknown>,
  mode: ImportMode,
): ImportPlan {
  const zero = (): KindChanges => ({
    added: 0,
    updated: 0,
    removed: 0,
    unchanged: 0,
  });
  const changes: Record<KindId, KindChanges> = {
    reading: zero(),
    known: zero(),
    targets: zero(),
    questions: zero(),
    decks: zero(),
    reviewLog: zero(),
  };
  const write: Record<string, unknown> = {};
  const remove: string[] = [];
  const keys = new Set([...Object.keys(local), ...Object.keys(incoming)]);
  for (const key of [...keys].sort()) {
    const kind = specFor(key)?.kind;
    if (!kind) continue;
    const before = local[key];
    let after: unknown;
    if (mode === "replace") after = incoming[key];
    else if (before && incoming[key])
      after = mergeValue(key, before, incoming[key]);
    else after = before ?? incoming[key];
    const ub = unitsOf(key, before);
    const ua = unitsOf(key, after);
    const c = changes[kind];
    for (const [id, v] of Object.entries(ua)) {
      if (!(id in ub)) c.added++;
      else if (ub[id] !== v) c.updated++;
      else c.unchanged++;
    }
    for (const id of Object.keys(ub)) if (!(id in ua)) c.removed++;
    if (after === undefined) {
      if (before !== undefined) remove.push(key);
    } else if (JSON.stringify(after) !== JSON.stringify(before)) {
      write[key] = after;
    }
  }
  return { mode, write, remove, changes };
}

export function hasChanges(plan: ImportPlan): boolean {
  return Object.keys(plan.write).length > 0 || plan.remove.length > 0;
}

/** Write a plan to storage. Returns false if any write failed (quota). */
export function applyPlan(store: WriteStore, plan: ImportPlan): boolean {
  let ok = true;
  for (const k of plan.remove) {
    try {
      store.removeItem(k);
    } catch {
      ok = false;
    }
  }
  for (const [k, v] of Object.entries(plan.write)) {
    try {
      store.setItem(k, JSON.stringify(v));
    } catch {
      ok = false;
    }
  }
  return ok;
}

// --- transfer link ---------------------------------------------------------
// The file, deflate-compressed and base64url-encoded, in the URL *fragment*
// (/progression/#import=…): browsers never send the fragment to the server.

export const LINK_PARAM = "import";
/** Past this many characters the link is refused and the file suggested
 *  instead: long URLs get cut by chat apps, mail clients and some browsers. */
export const MAX_LINK_CHARS = 16_000;

export function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error("base64url");
  const b64 =
    s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const out = new Response(
    new Blob([bytes as BlobPart]).stream().pipeThrough(stream),
  );
  return new Uint8Array(await out.arrayBuffer());
}

export function canCompress(): boolean {
  return (
    typeof CompressionStream !== "undefined" &&
    typeof DecompressionStream !== "undefined"
  );
}

/** The fragment payload for `text` (the exported JSON). */
export async function encodeTransfer(text: string): Promise<string> {
  return toBase64Url(
    await pipe(
      new TextEncoder().encode(text),
      new CompressionStream("deflate-raw"),
    ),
  );
}

export async function decodeTransfer(payload: string): Promise<string> {
  const bytes = await pipe(
    fromBase64Url(payload),
    new DecompressionStream("deflate-raw"),
  );
  return new TextDecoder().decode(bytes);
}

// --- browser glue (shared by /progression/ and the command palette) ---------

/** localStorage, or null when it's blocked (private mode, disabled storage). */
export function progressStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    localStorage.setItem("srs:probe", "1");
    localStorage.removeItem("srs:probe");
    return localStorage;
  } catch {
    return null;
  }
}

/** The export file's text for what this browser holds. */
export function exportText(store: ReadStore, now = new Date()): string {
  return JSON.stringify(buildExport(collectProgress(store), now), null, 1);
}

/** Download this browser's progress as a dated JSON file; returns its name,
 *  or null when storage is blocked. */
export function downloadExport(now = new Date()): string | null {
  const store = progressStorage();
  if (!store) return null;
  const name = exportFilename(now);
  const url = URL.createObjectURL(
    new Blob([exportText(store, now)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}

/** Fired on window after an import rewrites progress in this tab. */
export const PROGRESS_IMPORTED_EVENT = "gk:progress-imported";
/** The events open views already listen to for each kind of progress
 *  (reading-progress CHANGE_EVENT aside): dispatched after an import too. */
export const REFRESH_EVENTS = ["gk:study-change", "gk:quiz-change"];

/** `#import=…` → the payload, or null. */
export function payloadFromHash(hash: string): string | null {
  const m = hash.match(new RegExp(`^#?${LINK_PARAM}=([A-Za-z0-9_-]+)$`));
  return m ? m[1] : null;
}
