// The desktop /parcours/ (components/paths/ParcoursDesk.tsx): what is worked
// out at build from the reading paths, pure so it can be tested. The lines
// (paths that follow one another through `suite:`), the paths by the time
// they take, and the greeting each language tile shows.

import type { PathFamily } from "./path-family";

export interface DeskLinePath {
  slug: string;
  /** "Réseau : des modèles OSI aux attaques". */
  name: string;
  discipline: string;
  family: PathFamily | null;
  minutes: number;
  prev?: string;
  next?: string;
}

export interface DeskLine {
  family: PathFamily | null;
  discipline: string;
  /** In order, each station a path. `label` is the short name, or the part
   *  after " : " when the whole line shares one ("Philosophie : …"). */
  stations: { slug: string; label: string; sub: boolean }[];
  minutes: number;
  /** Its paths come from more than one discipline (it is named after the
   *  family then). */
  mixed: boolean;
}

const title = (name: string) => {
  const i = name.indexOf(" : ");
  return i > 0 ? name.slice(0, i) : name;
};
const after = (name: string) => {
  const i = name.indexOf(" : ");
  return i > 0 ? name.slice(i + 3) : name;
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The chains of two paths or more, longest first. A family can be left out
 *  (the languages, which have their tiles). */
export function deskLines(paths: DeskLinePath[], skip: (PathFamily | null)[] = []): DeskLine[] {
  const by = new Map(paths.map((p) => [p.slug, p]));
  const lines: DeskLine[] = [];
  for (const head of paths) {
    if (!head.next || (head.prev && by.has(head.prev))) continue;
    const chain: DeskLinePath[] = [];
    const seen = new Set<string>();
    for (let p: DeskLinePath | undefined = head; p && !seen.has(p.slug); p = p.next ? by.get(p.next) : undefined) {
      seen.add(p.slug);
      chain.push(p);
    }
    if (chain.length < 2 || skip.includes(head.family)) continue;
    const titles = chain.map((p) => title(p.name));
    // "Philosophie en culture générale", "Philosophie : de l'Antiquité aux
    // modernes"…: a line whose stations share a first word drops it.
    const word = titles[0].split(" ")[0];
    const shared = new Set(titles).size < titles.length && titles.every((x) => x.split(" ")[0] === word);
    const strip = (s: string) => cap(s.replace(/^(de l['’]|de la |du |des |de |les |le |la |l['’]|en )/i, ""));
    lines.push({
      family: head.family,
      discipline: head.discipline,
      mixed: new Set(chain.map((p) => p.discipline)).size > 1,
      stations: chain.map((p) => {
        if (!shared) return { slug: p.slug, label: title(p.name), sub: false };
        const rest = title(p.name).slice(word.length).trim();
        return { slug: p.slug, label: strip(rest || after(p.name)), sub: !rest };
      }),
      minutes: chain.reduce((s, p) => s + p.minutes, 0),
    });
  }
  return lines.sort((a, b) => b.stations.length - a.stations.length);
}

export interface PlacedLine extends DeskLine {
  /** Left and right ends of the line and its height in the 1070-wide SVG. */
  x0: number;
  x1: number;
  y: number;
  /** Where its name sits. */
  tx: number;
  ty: number;
}

/** Rows of lines: a long one alone, short ones side by side, each as wide as
 *  its stations need. Returns the lines placed and the SVG's height. */
export function placeLines(lines: DeskLine[], width = 1070, perRow = 10): { lines: PlacedLine[]; height: number } {
  const rows: DeskLine[][] = [];
  for (const l of lines) {
    const row = rows.find((r) => r.reduce((n, x) => n + x.stations.length, 0) + l.stations.length <= perRow && r[0].stations.length < 6);
    if (row && l.stations.length < 6) row.push(l);
    else rows.push([l]);
  }
  const out: PlacedLine[] = [];
  const ROW = 150;
  const GAP = 80;
  rows.forEach((row, r) => {
    const y0 = r * ROW + (r ? 6 : 0);
    if (row.length === 1) {
      out.push({ ...row[0], x0: 40, x1: width - 40, y: y0 + 92, tx: 0, ty: y0 + 22 });
      return;
    }
    // Each line's share: its gaps between stations, plus room for a label at
    // each end.
    const units = row.map((l) => l.stations.length - 1 + 0.6);
    const total = units.reduce((a, b) => a + b, 0);
    const free = width - GAP * (row.length - 1);
    let x = 0;
    row.forEach((l, i) => {
      const w = (free * units[i]) / total;
      const pad = Math.min(40, w * 0.15);
      out.push({ ...l, x0: x + pad, x1: x + w - pad, y: y0 + 92, tx: x, ty: y0 + 22 });
      x += w + GAP;
    });
  });
  return { lines: out, height: rows.length * ROW + 6 };
}

export interface TimedPath {
  slug: string;
  minutes: number;
}

/** Four quick ones, four of about an hour, the four longest. */
export function timeBuckets<T extends TimedPath>(paths: T[], n = 4): [T[], T[], T[]] {
  const asc = [...paths].sort((a, b) => a.minutes - b.minutes || a.slug.localeCompare(b.slug));
  const quick = asc.slice(0, n);
  const long = [...asc].reverse().slice(0, n);
  const used = new Set([...quick, ...long].map((p) => p.slug));
  const hour = asc
    .filter((p) => !used.has(p.slug))
    .sort((a, b) => Math.abs(a.minutes - 60) - Math.abs(b.minutes - 60))
    .slice(0, n)
    .sort((a, b) => a.minutes - b.minutes);
  return [quick, hour, long];
}

/** "Bonjour" in each language a path teaches, and the script class its tile
 *  sets it in (assets/css/parcours-desk.css). Keyed by the path's short name
 *  as the vault writes it. */
export const LANG_HELLO: Record<string, [string, string?]> = {
  Allemand: ["Guten Tag"],
  Anglais: ["Hello"],
  "Arabe libanais": ["مرحبا", "ar"],
  "Arabe standard": ["السلام عليكم", "ar"],
  Azéri: ["Salam"],
  Espagnol: ["¡Hola!"],
  Hakka: ["你好", "zh"],
  Hindi: ["नमस्ते", "hi"],
  Indonésien: ["Halo"],
  Kabyle: ["Azul"],
  Malais: ["Selamat"],
  Mandarin: ["你好", "zh"],
  Ouïghour: ["ياخشىمۇسىز", "ar"],
  Roumain: ["Bună ziua"],
  Sambas: ["Kalimantan", "x"],
  Tamoul: ["வணக்கம்", "ta"],
  "Tok Pisin": ["Gude"],
  Turc: ["Merhaba"],
};
