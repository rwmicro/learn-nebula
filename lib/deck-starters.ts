/**
 * The decks offered to someone who has not started any (/cartes/, phone and
 * desktop): short ones, so the first session ends with a deck that feels
 * within reach, not 16 656 cards of TOEIC vocabulary. One per discipline
 * family, then one per subject, the shortest first; a deck of a handful of
 * cards (a sample, a stub) is passed over while longer ones remain.
 */

export interface StarterCandidate {
  slug: string;
  group: string;
  family: string | null;
  count: number;
  label: string;
}

/** Fewer cards than this reads as a sample rather than a deck. */
export const STARTER_MIN = 60;
/** More than this is not "a short deck to begin with". */
export const STARTER_MAX = 1000;

export function starterDecks<T extends StarterCandidate>(decks: readonly T[], n = 3): T[] {
  const byLength = [...decks].sort((a, b) => a.count - b.count || a.label.localeCompare(b.label));
  const short = byLength.filter((d) => d.count >= STARTER_MIN && d.count <= STARTER_MAX);
  const out: T[] = [];
  const take = (pool: readonly T[], ok: (d: T) => boolean) => {
    for (const d of pool) {
      if (out.length === n) return;
      if (!out.includes(d) && ok(d)) out.push(d);
    }
  };
  // A family once, a subject once; then relax, so a small vault still offers n.
  take(short, (d) => !out.some((x) => x.group === d.group || (d.family !== null && x.family === d.family)));
  take(short, (d) => !out.some((x) => x.group === d.group));
  take(byLength, (d) => !out.some((x) => x.group === d.group));
  take(byLength, () => true);
  return out;
}
