import { fold } from "./palette-match";

/**
 * Shorter note titles for a reading path's page (/parcours/<slug>/): a suffix
 * the path's notes share ("Salutations — Arabe Libanais", "Verbes — Arabe
 * Libanais"…) says nothing on a page that is already about Lebanese Arabic,
 * yet it doubled every line of the list and cut the graph's boxes short.
 *
 * A " — <suffix>" is dropped when at least two notes of the path carry it, or
 * when it names the path's subject ("Culture — Liban et Arabe Libanais" in
 * "Arabe libanais : …"). A title that would end up empty, or the same as
 * another note's, keeps its full form.
 */
export function shortNoteTitles(
  pathName: string,
  notes: { slug: string; title: string }[],
): Map<string, string> {
  const subject = fold(pathName.split(" : ")[0]).trim();
  const split = (title: string) => {
    const m = /^(.*\S)\s+[—–]\s+(\S.*)$/.exec(title);
    return m ? { head: m[1], suffix: m[2] } : null;
  };
  const counts = new Map<string, number>();
  for (const n of notes) {
    const s = split(n.title);
    if (s) counts.set(fold(s.suffix), (counts.get(fold(s.suffix)) ?? 0) + 1);
  }
  const short = new Map<string, string>();
  for (const n of notes) {
    const s = split(n.title);
    const key = s ? fold(s.suffix) : "";
    const drop =
      !!s &&
      ((counts.get(key) ?? 0) >= 2 ||
        (subject.length >= 4 &&
          key.length >= 4 &&
          (key.includes(subject) || subject.includes(key))));
    short.set(n.slug, drop ? s!.head : n.title);
  }
  // Two notes now reading the same: both keep their full title.
  const seen = new Map<string, string[]>();
  for (const [slug, t] of short) {
    const k = fold(t);
    seen.set(k, [...(seen.get(k) ?? []), slug]);
  }
  for (const slugs of seen.values()) {
    if (slugs.length < 2) continue;
    for (const s of slugs) short.set(s, notes.find((n) => n.slug === s)!.title);
  }
  return short;
}

/**
 * The prerequisites worth printing after a line of the ordered list: none
 * when the only one is the line just above (the order already says it).
 */
export function prereqsToShow(
  prereqs: string[],
  previous: string | null,
): string[] {
  if (prereqs.length === 1 && prereqs[0] === previous) return [];
  return prereqs;
}

/**
 * A path whose graph is (almost) a single column: at least 90% of its rows hold
 * one note. Its drawing repeats the list, so the page folds it away.
 */
export function isMostlyLinear(nodes: { y: number }[]): boolean {
  if (nodes.length < 6) return false;
  const rows = new Map<number, number>();
  for (const n of nodes) rows.set(n.y, (rows.get(n.y) ?? 0) + 1);
  const single = [...rows.values()].filter((c) => c === 1).length;
  return single / rows.size >= 0.9;
}
