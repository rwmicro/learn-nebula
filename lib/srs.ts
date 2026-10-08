/**
 * Spaced repetition for the Anki decks (/cartes/*) and the note questions —
 * pure, React-free.
 *
 * Scheduler: FSRS-5 (the model Anki ships since 23.10) with its published
 * default parameters, on whole days. A card's memory is a stability S (days
 * until recall probability drops to 90 %) and a difficulty D (1–10); each
 * grade updates both from the recall probability at the time of the review,
 * and the next interval is the day recall is predicted to fall to the
 * reader's target retention (90 % by default, see srs-settings.ts). "Again"
 * keeps the card due today, so it comes back later in the same session; a
 * second review the same day uses FSRS's short-term formula.
 *
 * States written by the previous SM-2 scheduler (ease factor `ef`, interval
 * `iv`) are converted on read (parseProgress), so nobody starts over.
 *
 * Days are local calendar days as "YYYY-MM-DD" strings (compare lexically;
 * arithmetic in UTC so DST never shifts a date).
 */

export type Grade = "again" | "hard" | "good" | "easy";
export const GRADES: readonly Grade[] = ["again", "hard", "good", "easy"];

/** Max never-seen cards introduced per deck per day (default; per-deck
 *  setting in srs-settings.ts). */
export const NEW_PER_DAY = 20;

/** Default target retention: the recall probability at which a card is due. */
export const DEFAULT_RETENTION = 0.9;
export const RETENTIONS = [0.85, 0.9, 0.95] as const;

/** Failures after which a card counts as a leech (/progression/, deck page). */
export const LEECH_LAPSES = 6;

const MAX_IVL = 36500;

// The retention reviews schedule with when no explicit one is passed: the
// reader's setting, installed by lib/srs-settings.ts loadSettings().
let activeRetention = DEFAULT_RETENTION;
export function setRetention(r: number): void {
  if (RETENTIONS.includes(r as (typeof RETENTIONS)[number])) activeRetention = r;
}
export const getRetention = () => activeRetention;

// FSRS-5 default parameters (fsrs-rs / ts-fsrs DEFAULT_PARAMETERS).
const W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
  1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
];
const DECAY = -0.5;
const FACTOR = 19 / 81; // 0.9 ** (1 / DECAY) - 1
const G: Record<Grade, number> = { again: 1, hard: 2, good: 3, easy: 4 };

export interface CardState {
  /** FSRS stability, in days. */
  s: number;
  /** FSRS difficulty, 1 (easy) – 10 (hard). */
  d: number;
  /** Interval scheduled at the last review, in days (0 = due again today). */
  iv: number;
  /** Consecutive successful reviews (0 after "again"). */
  reps: number;
  /** Times the card was forgotten after having been learned. */
  lapses: number;
  /** Day of the last review, "YYYY-MM-DD". */
  last: string;
  /** Next review day, "YYYY-MM-DD". */
  due: string;
  /** Suspended by the reader: left out of every queue. */
  sus?: 1;
}

/** What's persisted per deck. `newDay`/`newCount` enforce the new-card limit. */
export interface Progress {
  v: 1;
  cards: Record<string, CardState>;
  newDay: string;
  newCount: number;
}

export function emptyProgress(): Progress {
  return { v: 1, cards: {}, newDay: "", newCount: 0 };
}

/** Local calendar day of `d` as "YYYY-MM-DD". */
export function dayKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (negative when b is earlier). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Stable card identity from its content (cyrb53). Decks now carry an id of
 *  their own (the Anki note guid + template); this is still the note
 *  questions' fallback and the key the decks' progress was stored under
 *  before, which migrateIds() moves over. */
export function cardId(front: string, back: string): string {
  const s = `${front}\u0000${back}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// --- FSRS -------------------------------------------------------------------

const round3 = (x: number) => Math.round(x * 1000) / 1000;
const clampD = (d: number) => Math.min(10, Math.max(1, d));
const initD = (g: number) => clampD(W[4] - Math.exp(W[5] * (g - 1)) + 1);

function nextD(d: number, g: number): number {
  const dp = d - W[6] * (g - 3) * ((10 - d) / 9);
  return clampD(W[7] * initD(4) + (1 - W[7]) * dp);
}

/** Probability of recalling a card of stability `s` after `t` days. */
export function retrievability(t: number, s: number): number {
  return Math.pow(1 + (FACTOR * t) / s, DECAY);
}

function recallS(d: number, s: number, r: number, g: number): number {
  const hard = g === 2 ? W[15] : 1;
  const easy = g === 4 ? W[16] : 1;
  return (
    s *
    (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hard * easy)
  );
}

function forgetS(d: number, s: number, r: number): number {
  const f = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r));
  return Math.min(s, f);
}

/** Days until recall of a card of stability `s` falls to `retention`. */
function interval(s: number, retention: number): number {
  const iv = (s / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return Math.min(MAX_IVL, Math.max(1, Math.round(iv)));
}

function memory(prev: CardState | undefined, g: number, today: string): { s: number; d: number } {
  if (!prev) return { s: W[g - 1], d: initD(g) };
  const t = Math.max(0, daysBetween(prev.last, today));
  const d = nextD(prev.d, g);
  if (t === 0) return { s: prev.s * Math.exp(W[17] * (g - 3 + W[18])), d };
  const r = retrievability(t, prev.s);
  return { s: g === 1 ? forgetS(prev.d, prev.s, r) : recallS(prev.d, prev.s, r, g), d };
}

/** The state each grade would lead to (the buttons show its interval).
 *  Intervals are kept in order: hard ≤ good < easy. */
export function preview(
  prev: CardState | undefined,
  today: string,
  retention: number = activeRetention,
): Record<Grade, CardState> {
  const mem = GRADES.map((g) => memory(prev, G[g], today));
  let hard = interval(mem[1].s, retention);
  let good = interval(mem[2].s, retention);
  let easy = interval(mem[3].s, retention);
  hard = Math.min(hard, good);
  good = Math.max(good, hard);
  easy = Math.max(easy, good + 1);
  const ivs = [0, hard, good, easy];
  const out = {} as Record<Grade, CardState>;
  GRADES.forEach((g, i) => {
    const again = g === "again";
    out[g] = {
      s: Math.max(0.01, round3(mem[i].s)),
      d: round3(mem[i].d),
      iv: ivs[i],
      reps: again ? 0 : (prev?.reps ?? 0) + 1,
      lapses: (prev?.lapses ?? 0) + (again && prev && prev.iv > 0 ? 1 : 0),
      last: today,
      due: addDays(today, ivs[i]),
      ...(prev?.sus ? { sus: 1 as const } : {}),
    };
  });
  return out;
}

/** Next state of a card (`prev` undefined = never seen) graded on `today`. */
export function schedule(
  prev: CardState | undefined,
  grade: Grade,
  today: string,
  retention: number = activeRetention,
): CardState {
  return preview(prev, today, retention)[grade];
}

/** A card state written by the old SM-2 scheduler, as FSRS memory: at 90 %
 *  retention the interval *is* the stability, and the ease factor maps onto
 *  difficulty (default ease 2.5 → a "good" first answer's difficulty, the
 *  1.3 floor → the hardest). */
export function fromSm2(c: { ef: number; iv: number; reps: number; due: string }): CardState {
  const iv = Math.max(0, Math.round(c.iv));
  return {
    s: iv > 0 ? iv : W[0],
    d: round3(clampD(initD(3) + ((2.5 - c.ef) / 1.2) * (10 - initD(3)))),
    iv,
    reps: c.reps,
    lapses: 0,
    last: addDays(c.due, -iv),
    due: c.due,
  };
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** One stored card (current or SM-2 shape), or null when malformed. */
export function parseCard(x: unknown): CardState | null {
  const c = x as Partial<CardState> & { ef?: unknown };
  if (
    !c ||
    typeof c !== "object" ||
    typeof c.iv !== "number" ||
    typeof c.reps !== "number" ||
    typeof c.due !== "string" ||
    !DAY_RE.test(c.due)
  )
    return null;
  if (typeof c.s === "number" && typeof c.d === "number" && c.s > 0) {
    return {
      s: c.s,
      d: clampD(c.d),
      iv: c.iv,
      reps: c.reps,
      lapses: typeof c.lapses === "number" ? c.lapses : 0,
      last: typeof c.last === "string" && DAY_RE.test(c.last) ? c.last : addDays(c.due, -c.iv),
      due: c.due,
      ...(c.sus === 1 ? { sus: 1 as const } : {}),
    };
  }
  if (typeof c.ef === "number") return fromSm2({ ef: c.ef, iv: c.iv, reps: c.reps, due: c.due });
  return null;
}

/** Parse stored progress, falling back to empty on anything malformed. */
export function parseProgress(raw: string | null): Progress {
  if (!raw) return emptyProgress();
  try {
    const p = JSON.parse(raw) as Partial<Progress>;
    if (p?.v !== 1 || !p.cards || typeof p.cards !== "object")
      return emptyProgress();
    const cards: Record<string, CardState> = {};
    for (const [id, c] of Object.entries(p.cards)) {
      const card = parseCard(c);
      if (card) cards[id] = card;
    }
    return {
      v: 1,
      cards,
      newDay: typeof p.newDay === "string" ? p.newDay : "",
      newCount: typeof p.newCount === "number" ? p.newCount : 0,
    };
  } catch {
    return emptyProgress();
  }
}

/** Record a grade: returns the updated progress (input left untouched). */
export function grade(
  p: Progress,
  id: string,
  g: Grade,
  today: string,
  retention: number = activeRetention,
): Progress {
  const isNew = !p.cards[id];
  const newCount = (p.newDay === today ? p.newCount : 0) + (isNew ? 1 : 0);
  return {
    v: 1,
    cards: { ...p.cards, [id]: schedule(p.cards[id], g, today, retention) },
    newDay: today,
    newCount,
  };
}

/** Suspend (or reactivate) a seen card. */
export function setSuspended(p: Progress, id: string, on: boolean): Progress {
  const c = p.cards[id];
  if (!c) return p;
  const { sus: _drop, ...rest } = c;
  void _drop;
  return { ...p, cards: { ...p.cards, [id]: on ? { ...rest, sus: 1 } : rest } };
}

/** Move progress stored under a card's old content hash to its stable id
 *  (`pairs`: [stableId, legacyHash]). Returns the same object when nothing
 *  moved. */
export function migrateIds(p: Progress, pairs: readonly (readonly [string, string])[]): Progress {
  let cards: Record<string, CardState> | null = null;
  for (const [id, old] of pairs) {
    if (!old || old === id) continue;
    const src = (cards ?? p.cards)[old];
    if (!src || (cards ?? p.cards)[id]) continue;
    cards ??= { ...p.cards };
    cards[id] = src;
    delete cards[old];
  }
  return cards ? { ...p, cards } : p;
}

export const isLeech = (c: CardState | undefined) => !!c && c.lapses >= LEECH_LAPSES;

export interface Summary {
  /** Seen cards due today or overdue (suspended ones excluded). */
  due: number;
  /** Never-seen cards still allowed today (the daily limit minus today's). */
  fresh: number;
  /** Cards with any progress. */
  learned: number;
}

/** New cards still allowed today. */
export function newRoom(p: Progress, today: string, newPerDay = NEW_PER_DAY): number {
  return Math.max(0, newPerDay - (p.newDay === today ? p.newCount : 0));
}

/**
 * Today's review queue as indices into `ids` (the deck's cards): due cards
 * (most overdue first), then new cards in deck order up to the daily limit.
 * Duplicate ids (identical cards) are queued once; suspended cards never.
 */
export function buildQueue(
  ids: readonly string[],
  p: Progress,
  today: string,
  newPerDay = NEW_PER_DAY,
): number[] {
  const seen = new Set<string>();
  const due: number[] = [];
  const fresh: number[] = [];
  let room = newRoom(p, today, newPerDay);
  ids.forEach((id, i) => {
    if (seen.has(id)) return;
    seen.add(id);
    const c = p.cards[id];
    if (c) {
      if (c.due <= today && !c.sus) due.push(i);
    } else if (room > 0) {
      fresh.push(i);
      room--;
    }
  });
  due.sort((a, b) =>
    p.cards[ids[a]].due < p.cards[ids[b]].due
      ? -1
      : p.cards[ids[a]].due > p.cards[ids[b]].due
        ? 1
        : a - b,
  );
  return [...due, ...fresh];
}

export function summarize(
  ids: readonly string[],
  p: Progress,
  today: string,
  newPerDay = NEW_PER_DAY,
): Summary {
  const uniq = [...new Set(ids)];
  let due = 0;
  let learned = 0;
  let unseen = 0;
  for (const id of uniq) {
    const c = p.cards[id];
    if (!c) unseen++;
    else {
      learned++;
      if (c.due <= today && !c.sus) due++;
    }
  }
  return { due, fresh: Math.min(unseen, newRoom(p, today, newPerDay)), learned };
}

/** Earliest day after `today` with something to study (a due card, or
 *  tomorrow's new-card allowance), or null if the deck has nothing left. */
export function nextReviewDay(
  ids: readonly string[],
  p: Progress,
  today: string,
): string | null {
  let next: string | null = null;
  for (const id of ids) {
    const c = p.cards[id];
    if (c?.sus) continue;
    const d = c ? (c.due > today ? c.due : null) : addDays(today, 1);
    if (d && (!next || d < next)) next = d;
  }
  return next;
}

/** Reviews due on each of the next `days` days (index 0 = today, overdue
 *  cards included), over any number of card states. */
export function forecast(states: Iterable<CardState>, today: string, days = 7): number[] {
  const out = new Array<number>(days).fill(0);
  const end = addDays(today, days - 1);
  for (const c of states) {
    if (c.sus || c.due > end) continue;
    out[c.due <= today ? 0 : daysBetween(today, c.due)]++;
  }
  return out;
}
