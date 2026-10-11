// Levels of a reading path (/parcours/<slug>/): a long path cut into a few
// groups of consecutive notes, each read as one stage ("Niveau 2", its own
// progress, a review of its questions, a card when it is done). Pure, built
// at build time from the path's reading order and prerequisites.
//
// The cut follows the prerequisite graph where it can: inside a target size,
// a level preferably ends where the next note sits deeper in the graph (it
// needs something from the level before), so a level is not split in the
// middle of notes that only build on the same base.

export interface LevelNote {
  slug: string;
  prereqs: string[];
}

export interface PathLevel {
  /** 1-based level number. */
  n: number;
  /** Index of the level's first note in the reading order, and one past its
   *  last (`notes.slice(from, to)`). */
  from: number;
  to: number;
}

/** Paths up to this many notes stay one level: nothing to group. */
export const MIN_LEVELED = 12;
/** Notes per level aimed at. */
export const LEVEL_SIZE = 7;

/** Longest chain of prerequisites leading to each note (0 for a root), over
 *  the reading order (a topological order: prerequisites come first). */
export function depths(notes: LevelNote[]): Map<string, number> {
  const d = new Map<string, number>();
  for (const n of notes) {
    let max = -1;
    for (const p of n.prereqs) {
      const pd = d.get(p);
      if (pd !== undefined && pd > max) max = pd;
    }
    d.set(n.slug, max + 1);
  }
  return d;
}

export function pathLevels(
  notes: LevelNote[],
  size = LEVEL_SIZE,
  min = MIN_LEVELED,
): PathLevel[] {
  const total = notes.length;
  if (total === 0) return [];
  if (total < min) return [{ n: 1, from: 0, to: total }];
  const count = Math.max(2, Math.round(total / size));
  const depth = depths(notes);
  const deeper = (i: number) =>
    i > 0 &&
    i < total &&
    (depth.get(notes[i].slug) ?? 0) > (depth.get(notes[i - 1].slug) ?? 0);

  const levels: PathLevel[] = [];
  let from = 0;
  while (from < total) {
    const left = total - from;
    const remaining = count - levels.length;
    // The last level takes what is left.
    if (remaining <= 1) {
      levels.push({ n: levels.length + 1, from, to: total });
      break;
    }
    // Size aimed at for this level, from what the levels still to come share.
    const target = left / remaining;
    const minAfter = Math.ceil(target * 0.6) * (remaining - 1);
    const lo = from + Math.max(2, Math.ceil(target * 0.6));
    const hi = Math.max(
      lo,
      Math.min(total - minAfter, from + Math.floor(target * 1.4)),
    );
    const ideal = from + Math.round(target);
    let cut = Math.min(Math.max(ideal, lo), hi);
    let best = Infinity;
    for (let i = lo; i <= hi; i++) {
      // Distance to the ideal size, with a strong preference for a cut where
      // the graph goes one step deeper.
      const score = Math.abs(i - ideal) + (deeper(i) ? 0 : target);
      if (score < best) {
        best = score;
        cut = i;
      }
    }
    levels.push({ n: levels.length + 1, from, to: cut });
    from = cut;
  }
  return levels;
}
