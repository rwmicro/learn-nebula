/**
 * Spaced repetition for the Anki study page (/cartes/*) — pure, React-free.
 *
 * Scheduler: SM-2 (ease factor, interval in days, repetition count) with the
 * four Anki-style grades mapped onto SM-2 qualities (again 1, hard 3, good 4,
 * easy 5) for the ease update, plus two small Anki-like tweaks so the grades
 * differ from the first review on: "hard" grows the interval by ×1.2 instead
 * of ×EF, "easy" adds a ×1.3 bonus (and starts at 4 days). "Again" resets the
 * card to due today, so it comes back later in the same session.
 *
 * Days are local calendar days as "YYYY-MM-DD" strings (compare lexically;
 * arithmetic in UTC so DST never shifts a date).
 */

export type Grade = "again" | "hard" | "good" | "easy";
export const GRADES: readonly Grade[] = ["again", "hard", "good", "easy"];

/** Max never-seen cards introduced per deck per day. */
export const NEW_PER_DAY = 20;

const QUALITY: Record<Grade, number> = { again: 1, hard: 3, good: 4, easy: 5 };
const MIN_EF = 1.3;
const START_EF = 2.5;

export interface CardState {
  /** Ease factor (≥ 1.3). */
  ef: number;
  /** Current interval in days (0 = relearning, due again today). */
  iv: number;
  /** Consecutive successful reviews. */
  reps: number;
  /** Next review day, "YYYY-MM-DD". */
  due: string;
}

/** What's persisted per deck. `newDay`/`newCount` enforce NEW_PER_DAY. */
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

/** Stable card identity from its content (cyrb53), so a deck rebuild keeps
 *  progress for every card whose front+back didn't change. */
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

/** Next state of a card (`prev` undefined = never seen) graded on `today`. */
export function schedule(
  prev: CardState | undefined,
  grade: Grade,
  today: string,
): CardState {
  const s = prev ?? { ef: START_EF, iv: 0, reps: 0, due: today };
  const q = QUALITY[grade];
  const ef = Math.max(MIN_EF, s.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  if (grade === "again") return { ef, iv: 0, reps: 0, due: today };

  let iv: number;
  if (s.reps === 0) iv = grade === "easy" ? 4 : 1;
  else if (s.reps === 1) iv = grade === "hard" ? 3 : grade === "easy" ? 8 : 6;
  else {
    const mult = grade === "hard" ? 1.2 : grade === "easy" ? ef * 1.3 : ef;
    iv = Math.max(s.iv + 1, Math.round(s.iv * mult));
  }
  return {
    ef: Math.round(ef * 1000) / 1000,
    iv,
    reps: s.reps + 1,
    due: addDays(today, iv),
  };
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
      if (
        c &&
        typeof c.ef === "number" &&
        typeof c.iv === "number" &&
        typeof c.reps === "number" &&
        typeof c.due === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(c.due)
      )
        cards[id] = { ef: c.ef, iv: c.iv, reps: c.reps, due: c.due };
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
): Progress {
  const isNew = !p.cards[id];
  const newCount = (p.newDay === today ? p.newCount : 0) + (isNew ? 1 : 0);
  return {
    v: 1,
    cards: { ...p.cards, [id]: schedule(p.cards[id], g, today) },
    newDay: today,
    newCount,
  };
}

export interface Summary {
  /** Seen cards due today or overdue. */
  due: number;
  /** Never-seen cards still allowed today (NEW_PER_DAY minus today's). */
  fresh: number;
  /** Cards with any progress. */
  learned: number;
}

/**
 * Today's review queue as indices into `ids` (the deck's cards): due cards
 * (most overdue first), then new cards in deck order up to the daily limit.
 * Duplicate ids (identical cards) are queued once.
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
  let room = Math.max(0, newPerDay - (p.newDay === today ? p.newCount : 0));
  ids.forEach((id, i) => {
    if (seen.has(id)) return;
    seen.add(id);
    const c = p.cards[id];
    if (c) {
      if (c.due <= today) due.push(i);
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
      if (c.due <= today) due++;
    }
  }
  const room = Math.max(0, newPerDay - (p.newDay === today ? p.newCount : 0));
  return { due, fresh: Math.min(unseen, room), learned };
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
    const d = c ? (c.due > today ? c.due : null) : addDays(today, 1);
    if (d && (!next || d < next)) next = d;
  }
  return next;
}
