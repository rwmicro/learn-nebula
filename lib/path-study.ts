// Studying a reading path (/parcours/<slug>/) — the pure part, shared by the
// path page (components/ParcoursStudy.tsx), the index cards
// (components/ReadMarks.tsx) and unit-tested in lib/path-study.test.ts:
//
// - a note's state on a path: non lue / lue / connue / maîtrisée, from the
//   reading store (lib/reading-progress.ts), the "Je connais déjà" store below
//   and the quiz answers (lib/note-quiz.ts);
// - "Je veux comprendre X": the target's ancestors still to read, and how long;
// - the placement test's walk (topological order, a "Non" prunes the branch);
// - the two small localStorage entries this adds: known notes and targets.
//
// Nothing leaves the browser, like the reading progress itself.

import { allAnsweredCorrectly, loadNoteDeck, type NoteDeck } from "./note-quiz";
import { isRead, loadStore } from "./reading-progress";

export interface StudyNote {
  slug: string;
  /** Direct prerequisites within the path. */
  prereqs: string[];
  /** Estimated reading time (minutes, ≥ 1). */
  minutes?: number;
  /** Ids of the note's `[!quiz]` questions (empty: it can't be "maîtrisée"). */
  quiz?: string[];
}

/** Precedence when several apply: maîtrisée > lue > connue > non lue. */
export type NoteState = "unread" | "read" | "known" | "mastered";

/** Read, known or mastered: counts as done for "next to read", targets and
 *  revision eligibility. */
export const isDone = (s: NoteState | undefined) => !!s && s !== "unread";

export function noteState(f: { read: boolean; known: boolean; mastered: boolean }): NoteState {
  if (f.mastered) return "mastered";
  if (f.read) return "read";
  if (f.known) return "known";
  return "unread";
}

export interface StateSources {
  isRead: (slug: string) => boolean;
  isKnown: (slug: string) => boolean;
  /** The note's quiz entry (srs:note:<slug>), null when there is none. */
  deckOf: (slug: string) => NoteDeck | null;
}

export function isMastered(note: StudyNote, deck: NoteDeck | null): boolean {
  return allAnsweredCorrectly(deck, note.quiz ?? []);
}

export function noteStates(notes: StudyNote[], src: StateSources): Map<string, NoteState> {
  const out = new Map<string, NoteState>();
  for (const n of notes) {
    out.set(
      n.slug,
      noteState({
        read: src.isRead(n.slug),
        known: src.isKnown(n.slug),
        mastered: !!n.quiz?.length && isMastered(n, src.deckOf(n.slug)),
      }),
    );
  }
  return out;
}

export interface ProgressCounts {
  /** Read or mastered (a mastered note was read, or answered as if). */
  read: number;
  /** Known without being read. */
  known: number;
  mastered: number;
  /** Any state but unread. */
  done: number;
  total: number;
}

export function progressCounts(slugs: string[], states: Map<string, NoteState>): ProgressCounts {
  const c: ProgressCounts = { read: 0, known: 0, mastered: 0, done: 0, total: slugs.length };
  for (const s of slugs) {
    const st = states.get(s) ?? "unread";
    if (st === "read" || st === "mastered") c.read++;
    if (st === "known") c.known++;
    if (st === "mastered") c.mastered++;
    if (st !== "unread") c.done++;
  }
  return c;
}

// --- graph walks ------------------------------------------------------------

function children(notes: StudyNote[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const n of notes)
    for (const p of n.prereqs) out.set(p, [...(out.get(p) ?? []), n.slug]);
  return out;
}

function walk(start: string, next: (s: string) => string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...next(start)];
  while (stack.length) {
    const s = stack.pop()!;
    if (seen.has(s) || s === start) continue;
    seen.add(s);
    stack.push(...next(s));
  }
  return seen;
}

/** Every note `slug` depends on, directly or not (itself excluded). */
export function ancestorsOf(slug: string, notes: StudyNote[]): Set<string> {
  const pre = new Map(notes.map((n) => [n.slug, n.prereqs]));
  return walk(slug, (s) => pre.get(s) ?? []);
}

/** Every note that depends on `slug`, directly or not (itself excluded). */
export function descendantsOf(slug: string, notes: StudyNote[]): Set<string> {
  const ch = children(notes);
  return walk(slug, (s) => ch.get(s) ?? []);
}

/** First note (in path order) not done whose prerequisites are all done. */
export function nextToReadIn(notes: StudyNote[], done: (slug: string) => boolean): string | null {
  for (const n of notes) {
    if (done(n.slug)) continue;
    if (n.prereqs.every(done)) return n.slug;
  }
  return null;
}

export interface TargetPlan {
  /** The target and its ancestors, in path order. */
  scope: Set<string>;
  /** The notes of `scope` still to read (not done), in path order. */
  todo: string[];
  /** Their reading time, in minutes. */
  minutes: number;
}

/** "Je veux comprendre X": what is left to read to get to `target`. */
export function targetPlan(
  notes: StudyNote[],
  target: string,
  done: (slug: string) => boolean,
): TargetPlan {
  const scope = ancestorsOf(target, notes);
  scope.add(target);
  const todo = notes.filter((n) => scope.has(n.slug) && !done(n.slug));
  return {
    scope,
    todo: todo.map((n) => n.slug),
    minutes: todo.reduce((m, n) => m + Math.max(1, Math.round(n.minutes ?? 1)), 0),
  };
}

/** 125 → { h: 2, m: 5 }. */
export function splitMinutes(total: number): { h: number; m: number } {
  const t = Math.max(0, Math.round(total));
  return { h: Math.floor(t / 60), m: t % 60 };
}

// --- placement test -----------------------------------------------------------

export type PlacementAnswer = "yes" | "no" | "unsure";

/**
 * The next note the placement test asks about, walking the path in reading
 * order: the first one not answered yet, not already done (`skip`: read,
 * known or mastered — those count as a "yes"), and with no ancestor answered
 * "no" (not knowing a prerequisite stops that branch). "Pas sûr" neither
 * marks the note known nor stops the descent. Null when the walk is over.
 */
export function nextPlacementNote(
  notes: StudyNote[],
  answers: Record<string, PlacementAnswer>,
  skip: (slug: string) => boolean = () => false,
): string | null {
  const blocked = placementBlocked(notes, answers);
  for (const n of notes) {
    if (answers[n.slug] || skip(n.slug) || blocked.has(n.slug)) continue;
    return n.slug;
  }
  return null;
}

/**
 * The notes a placement test covers: the whole path, or — with a target set —
 * only its scope (the target and its ancestors, `targetPlan(...).scope`), in
 * path order. The scope is closed under ancestors, so every path between two
 * of its notes stays inside it and the "no" pruning works the same on the
 * subset.
 */
export function placementNotes<T extends StudyNote>(notes: T[], target: string | null | undefined): T[] {
  if (!target || !notes.some((n) => n.slug === target)) return notes;
  const scope = ancestorsOf(target, notes);
  scope.add(target);
  return notes.filter((n) => scope.has(n.slug));
}

/** Notes below a "no": every descendant of a note answered "no". */
export function placementBlocked(
  notes: StudyNote[],
  answers: Record<string, PlacementAnswer>,
): Set<string> {
  const out = new Set<string>();
  for (const [slug, a] of Object.entries(answers))
    if (a === "no") for (const d of descendantsOf(slug, notes)) out.add(d);
  return out;
}

/** Upper bound of the questions still to come (for "3 / ≤ 9"). */
export function placementRemaining(
  notes: StudyNote[],
  answers: Record<string, PlacementAnswer>,
  skip: (slug: string) => boolean = () => false,
): number {
  const blocked = placementBlocked(notes, answers);
  return notes.filter((n) => !answers[n.slug] && !skip(n.slug) && !blocked.has(n.slug)).length;
}

// --- storage: known notes ------------------------------------------------------

/** localStorage key of the "Je connais déjà" marks: { slug: { t, via? } }. */
export const KNOWN_KEY = "gkKnown";
/** localStorage key of the per-path targets: { pathSlug: noteSlug }. */
export const TARGET_KEY = "gkPathTarget";
/** Fired on window after this tab changes either store (or a quiz answer). */
export const STUDY_EVENT = "gk:study-change";
export const QUIZ_EVENT = "gk:quiz-change";

export interface KnownEntry {
  /** When it was marked, seconds since the epoch. */
  t: number;
  /** Path slug of the placement test that set it; absent = marked by hand.
   *  "Réinitialiser le placement" removes only that path's entries. */
  via?: string;
}
export type KnownStore = Record<string, KnownEntry>;

export function parseKnown(raw: string | null | undefined): KnownStore {
  if (!raw) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const out: KnownStore = {};
  for (const [slug, v] of Object.entries(data as Record<string, unknown>)) {
    if (!slug || !v || typeof v !== "object") continue;
    const e = v as Record<string, unknown>;
    const t = Number(e.t);
    if (!Number.isFinite(t)) continue;
    out[slug] = typeof e.via === "string" && e.via ? { t: Math.round(t), via: e.via } : { t: Math.round(t) };
  }
  return out;
}

export function markKnown(store: KnownStore, slug: string, via?: string, now = Date.now()): KnownStore {
  // A hand mark wins over a placement one (a reset must not undo it).
  const prev = store[slug];
  const keepHand = prev && !prev.via;
  const entry: KnownEntry = via && !keepHand ? { t: Math.floor(now / 1000), via } : { t: Math.floor(now / 1000) };
  return { ...store, [slug]: entry };
}

export function unmarkKnown(store: KnownStore, slug: string): KnownStore {
  const out = { ...store };
  delete out[slug];
  return out;
}

/** Undo a path's placement test: drop the marks it set (hand marks stay). */
export function resetPlacement(store: KnownStore, pathSlug: string): KnownStore {
  const out: KnownStore = {};
  for (const [s, e] of Object.entries(store)) if (e.via !== pathSlug) out[s] = e;
  return out;
}

export const hasPlacement = (store: KnownStore, pathSlug: string) =>
  Object.values(store).some((e) => e.via === pathSlug);

export function parseTargets(raw: string | null | undefined): Record<string, string> {
  try {
    const d = raw ? JSON.parse(raw) : null;
    if (!d || typeof d !== "object" || Array.isArray(d)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(d as Record<string, unknown>))
      if (k && typeof v === "string" && v) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

// --- browser glue (tolerates blocked storage) ---------------------------------

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function read(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): boolean {
  try {
    const s = storage();
    if (!s) return false;
    if (value == null) s.removeItem(key);
    else s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export const loadKnown = () => parseKnown(read(KNOWN_KEY));
export const saveKnown = (store: KnownStore) =>
  write(KNOWN_KEY, Object.keys(store).length ? JSON.stringify(store) : null);

export const loadTarget = (pathSlug: string): string | null => parseTargets(read(TARGET_KEY))[pathSlug] ?? null;
export function saveTarget(pathSlug: string, slug: string | null): boolean {
  const all = parseTargets(read(TARGET_KEY));
  if (slug) all[pathSlug] = slug;
  else delete all[pathSlug];
  return write(TARGET_KEY, Object.keys(all).length ? JSON.stringify(all) : null);
}

/** Every note's state from this browser's stores (reading, known, quiz). */
export function loadStudyStates(notes: StudyNote[]): {
  states: Map<string, NoteState>;
  known: KnownStore;
} {
  const reading = loadStore();
  const known = loadKnown();
  const s = storage();
  const states = noteStates(notes, {
    isRead: (slug) => isRead(reading, slug),
    isKnown: (slug) => !!known[slug],
    deckOf: (slug) => {
      try {
        return s ? loadNoteDeck(s, slug) : null;
      } catch {
        return null;
      }
    },
  });
  return { states, known };
}

/** Does a storage event's key concern a path's states? */
export const isStudyKey = (key: string | null) =>
  key === null ||
  key === KNOWN_KEY ||
  key === TARGET_KEY ||
  key === "gkReading" ||
  key.startsWith("srs:note:");
