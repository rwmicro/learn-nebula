// "Le jardin en chiffres" (/jardin/): the vault counted at build time. Pure
// over a list of notes (unit-tested in lib/garden-stats.test.ts); app/jardin
// feeds it getAllPosts() and the [[wikilink]] edges. Nothing here reads a
// reader's data: it is the same page for everyone.

export interface StatNote {
  slug: string;
  rawPath: string;
  title: string;
  body: string;
  date?: Date;
}

export interface MonthCount {
  /** "2026-02" */
  month: string;
  planted: number;
  /** Notes planted up to and including this month. */
  total: number;
}

export interface GardenStats {
  notes: number;
  words: number;
  disciplines: number;
  clips: number;
  months: MonthCount[];
  /** Biggest month (for the chart's note). */
  peak: MonthCount | null;
  /** Discipline folder name → notes, biggest first. */
  byDiscipline: { name: string; notes: number }[];
  /** Most linked-to notes. */
  cited: { slug: string; title: string; links: number }[];
  /** Disciplines with the most notes planted in the last 90 days. */
  growing: { name: string; notes: number }[];
}

/** The discipline of a note: its level-2 folder ("Social Sciences/Philosophy/…"
 *  → "Philosophy"); notes higher up count under their top folder. */
export function disciplineOf(rawPath: string): string {
  const parts = rawPath.split("/");
  if (parts.length >= 3) return parts[1];
  return parts.length === 2 ? parts[0] : "";
}

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** Every month from `from` to `to` inclusive, "YYYY-MM". */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

const AUDIO_REF = /\]\(([^)\s]+\.mp3)\)/gi;

/** Words of the readable text: code blocks, links' targets and markup out. */
export function countWords(body: string): number {
  const text = body
    .replace(/^---[\s\S]*?\n---/, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g, "$1")
    .replace(/[#>*_`|~=-]+/g, " ");
  return (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
}

export function gardenStats(
  notes: StatNote[],
  edges: [string, string][],
  now: Date = new Date(),
  opts: { disciplinesShown?: number; citedShown?: number } = {},
): GardenStats {
  const { disciplinesShown = 10, citedShown = 8 } = opts;
  let words = 0;
  const clips = new Set<string>();
  const perDisc = new Map<string, number>();
  const perMonth = new Map<string, number>();
  const recent = new Map<string, number>();
  const since = now.getTime() - 90 * 86_400_000;

  for (const n of notes) {
    words += countWords(n.body);
    for (const m of n.body.matchAll(AUDIO_REF)) clips.add(m[1].split("/").pop()!);
    const disc = disciplineOf(n.rawPath);
    if (disc) perDisc.set(disc, (perDisc.get(disc) ?? 0) + 1);
    if (n.date && !Number.isNaN(n.date.getTime()) && n.date.getTime() <= now.getTime()) {
      const k = monthKey(n.date);
      perMonth.set(k, (perMonth.get(k) ?? 0) + 1);
      if (disc && n.date.getTime() >= since) recent.set(disc, (recent.get(disc) ?? 0) + 1);
    }
  }

  const keys = [...perMonth.keys()].sort();
  let total = 0;
  const months: MonthCount[] = keys.length
    ? monthRange(keys[0], monthKey(now)).map((month) => {
        const planted = perMonth.get(month) ?? 0;
        total += planted;
        return { month, planted, total };
      })
    : [];
  const peak = months.reduce<MonthCount | null>((b, m) => (!b || m.planted > b.planted ? m : b), null);

  const byDiscipline = [...perDisc.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, n]) => ({ name, notes: n }));
  const shown = byDiscipline.slice(0, disciplinesShown);
  const rest = byDiscipline.slice(disciplinesShown);

  const titles = new Map(notes.map((n) => [n.slug, n.title]));
  const inDeg = new Map<string, Set<string>>();
  for (const [s, t] of edges) {
    if (s === t || !titles.has(t)) continue;
    let set = inDeg.get(t);
    if (!set) inDeg.set(t, (set = new Set()));
    set.add(s);
  }
  const cited = [...inDeg.entries()]
    .map(([slug, from]) => ({ slug, title: titles.get(slug)!, links: from.size }))
    .sort((a, b) => b.links - a.links || a.title.localeCompare(b.title))
    .slice(0, citedShown);

  const growing = [...recent.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([name, n]) => ({ name, notes: n }));

  return {
    notes: notes.length,
    words,
    disciplines: perDisc.size,
    clips: clips.size,
    months,
    peak: peak && peak.planted > 0 ? peak : null,
    byDiscipline: rest.length
      ? [...shown, { name: "", notes: rest.reduce((a, d) => a + d.notes, 0) }]
      : shown,
    cited,
    growing,
  };
}
