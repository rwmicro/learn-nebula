/**
 * Jalons: a handful of milestones read from this browser's own records
 * (notes read, the longest run of days, questions answered right, the
 * disciplines visited). Pure; components/progress/Milestones.tsx gathers the inputs.
 * No points, no levels to grind: each family of milestones shows the ones
 * reached and how far the next one is.
 */

export interface MilestoneInput {
  /** Notes marked read. */
  read: number;
  /** Longest run of active days ever. */
  bestRun: number;
  /** Questions answered right at least once. */
  right: number;
  /** Disciplines (top two folders of a note's slug) with a note read. */
  disciplines: number;
}

export type MilestoneKind = keyof MilestoneInput;

/** Thresholds of each kind, in order. */
export const STEPS: Record<MilestoneKind, number[]> = {
  read: [1, 10, 50, 100, 250],
  bestRun: [3, 7, 30, 100],
  right: [10, 50, 200, 500],
  disciplines: [3, 6, 10],
};

export interface MilestoneRow {
  kind: MilestoneKind;
  value: number;
  /** Thresholds reached. */
  reached: number[];
  /** The next threshold, or null when all are reached. */
  next: number | null;
  /** Previous threshold (0 before the first), for the progress bar. */
  from: number;
}

export function milestones(input: MilestoneInput): MilestoneRow[] {
  return (Object.keys(STEPS) as MilestoneKind[]).map((kind) => {
    const value = Math.max(0, Math.floor(input[kind] || 0));
    const steps = STEPS[kind];
    const reached = steps.filter((s) => value >= s);
    const next = steps.find((s) => value < s) ?? null;
    return { kind, value, reached, next, from: reached[reached.length - 1] ?? 0 };
  });
}

/** Longest run of consecutive active days in a calendar ("YYYY-MM-DD"). */
export function longestRun(days: Record<string, { r: number; c: number }>): number {
  const on = Object.keys(days)
    .filter((d) => days[d].r > 0 || days[d].c > 0)
    .sort();
  let best = 0;
  let cur = 0;
  let prev = "";
  for (const d of on) {
    if (prev) {
      const x = new Date(`${prev}T00:00:00Z`);
      x.setUTCDate(x.getUTCDate() + 1);
      cur = x.toISOString().slice(0, 10) === d ? cur + 1 : 1;
    } else cur = 1;
    if (cur > best) best = cur;
    prev = d;
  }
  return best;
}

/** Distinct disciplines among note slugs: their first two segments
 *  ("social-sciences/history"). */
export function disciplinesOf(slugs: string[]): number {
  return new Set(slugs.map((s) => s.split("/").slice(0, 2).join("/")).filter((s) => s.includes("/"))).size;
}

/** Share of the way from the last threshold reached to the next one (0–1);
 *  1 once every threshold is reached. */
export function progressToNext(r: MilestoneRow): number {
  if (r.next === null) return 1;
  return Math.min(1, Math.max(0, (r.value - r.from) / (r.next - r.from)));
}

/** The rows still open, closest to their next threshold first (ties keep
 *  STEPS order), then the families with every threshold reached. */
export function byProximity(rows: MilestoneRow[]): MilestoneRow[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const da = a.r.next === null ? 1 : 0;
      const db = b.r.next === null ? 1 : 0;
      if (da !== db) return da - db;
      return progressToNext(b.r) - progressToNext(a.r) || a.i - b.i;
    })
    .map(({ r }) => r);
}
