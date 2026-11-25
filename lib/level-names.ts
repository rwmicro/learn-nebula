import { folderKey, t } from "./i18n";
import { splitRank } from "./folder-label";
import { pathLevels } from "./path-levels";
import type { ReadingPathView } from "./content";

// A reading path's level names, in French as the build names them; the
// bundles translate each under `levelName.*` (levelNameKey() in lib/i18n.ts,
// lib/path-names.test.ts checks every one of the vault has an entry).

/** A path's levels with their names, as the road names them (the home's
 *  "À rafraîchir" lists them too). */
export function namedLevels(
  path: ReadingPathView,
  titleOf: (slug: string) => string,
): { n: number; name: string; from: number; to: number }[] {
  const levels = pathLevels(path.notes);
  const groups = levels.map((l) => path.notes.slice(l.from, l.to));
  return levels.map((lv, i) => ({
    n: lv.n,
    name: levelName(groups[i], groups, path.discipline) ?? titleOf(groups[i][0].slug),
    from: lv.from,
    to: lv.to,
  }));
}

/** A level's name for the phone road: the folders its notes sit in, by
 *  their French label ("History" → "Histoire", "02-Communication" →
 *  "Communication"), two at most; null when every level would get the same
 *  name (a path from one folder). */
export function levelName(
  notes: ReadingPathView["notes"],
  all: ReadingPathView["notes"][],
  discipline?: string | null,
): string | null {
  // Named by hand: `niveau:` on one of its notes.
  const named = notes.find((n) => n.niveau)?.niveau;
  if (named) return named;
  const label = (folder: string) => {
    const key = folderKey(folder);
    return key ? t(key) : splitRank(folder).label;
  };
  // The path's own discipline ("Histoire" on the history path) says nothing
  // about a level: "Antiquité", not "Histoire et antiquité".
  const skip = discipline ? label(discipline) : "";
  const folders = (ns: ReadingPathView["notes"]) => [
    ...new Set(ns.map((n) => label(n.folder)).filter((f) => f && f !== skip)),
  ];
  const names = all.map((ns) => folders(ns).slice(0, 2).join(" et ").toLowerCase());
  if (all.length > 1 && new Set(names).size === 1) return null;
  const mine = folders(notes);
  const name = mine
    .slice(0, 2)
    // "et antiquité", but "et XXe siècle", "et WW2": an acronym keeps its case.
    .map((f, i) => (i ? (/^\p{Lu}\p{Ll}/u.test(f) ? f.charAt(0).toLowerCase() + f.slice(1) : f) : f.charAt(0).toUpperCase() + f.slice(1)))
    .join(" et ");
  return name || null;
}
