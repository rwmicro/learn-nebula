/**
 * "S'entraîner" (/cartes/entrainer/): extra sessions once the day's reviews
 * are done. They pick cards the reader has already studied and never change
 * their schedule (components/home/TodayReview.tsx grades nothing in these modes):
 *
 * - errors: missed ("À revoir") in the last seven days;
 * - fragile: forgotten at least FRAGILE_LAPSES times after being learned;
 * - listen: cards with a pronunciation clip, played first;
 * - flash: a short mix of the saved note questions;
 * - mixed: learned cards and saved questions from every subject, one source
 *   after another (interleaving: telling which method a question calls for
 *   is part of what gets practised).
 */
import type { CardState } from "./srs";
import { addDays } from "./srs";

export const PRACTICE_MODES = ["erreurs", "fragiles", "ecoute", "eclair", "melange"] as const;
export type PracticeMode = (typeof PRACTICE_MODES)[number];

export const FRAGILE_LAPSES = 3;
/** Cards per session. */
export const PRACTICE_SIZE = { erreurs: 30, fragiles: 30, ecoute: 20, eclair: 15, melange: 20 } as const;

/** Does a studied card belong in this practice session? */
export function practicePick(mode: PracticeMode, st: CardState | undefined, today: string): boolean {
  if (!st || st.sus) return false;
  if (mode === "erreurs") return st.reps === 0 && st.last >= addDays(today, -7) && st.last <= today;
  if (mode === "fragiles") return st.lapses >= FRAGILE_LAPSES;
  if (mode === "melange") return st.reps > 0;
  return true;
}

/** A shuffled copy, `rand` returning [0, 1). */
export function shuffled<T>(xs: readonly T[], rand: () => number = Math.random): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Interleave `xs` by source: shuffled within each source, then one from
 *  each source in turn (sources in shuffled order), so two cards of the same
 *  deck or note follow each other only once the others have run out. */
export function interleaveBy<T>(xs: readonly T[], key: (x: T) => string, rand: () => number = Math.random): T[] {
  const groups = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    const g = groups.get(k) ?? [];
    g.push(x);
    groups.set(k, g);
  }
  const lists = shuffled([...groups.values()], rand).map((g) => shuffled(g, rand));
  const out: T[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

