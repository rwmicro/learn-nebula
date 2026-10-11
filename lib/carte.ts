// The /carte/ page: which countries the garden talks about, and through which
// notes. A note is placed on a country two ways:
//   - by its folder: a country under History, a language under
//     "Languages - Dialects" (FOLDERS below says which country each one is);
//   - by its frontmatter, `pays: France` or `pays: [Japon, Chine]`, which any
//     note may carry (French names or ISO codes, as lib/countries.ts reads them).
// The map itself is lib/data/world-110m.json, already projected at build
// (scripts/update-world.mjs); nothing about it runs in the browser but the
// tooltip and the click.
import { getAllPosts, type Doc } from "./content";
import { COUNTRIES, resolveCountry } from "./countries";
import world from "./data/world-110m.json";

export type CarteKind = "histoire" | "langue" | "autre";

export interface CarteNote {
  title: string;
  href: string;
  kind: CarteKind;
}

export interface CarteCountry {
  iso3: string;
  /** ISO numeric code, the map's key. */
  id: string;
  name: string;
  notes: CarteNote[];
}

export interface WorldMap {
  width: number;
  height: number;
  source: string;
  countries: { id: string; d: string }[];
}

export const WORLD = world as WorldMap;

const HISTORY = "Social Sciences/History/";
const LANGUAGES = "Social Sciences/Languages - Dialects/";

/**
 * Folder → the countries it is about. A language goes to the country where
 * most of its speakers live (Tamil to India and Sri Lanka, Arabic to the
 * countries the vault's Arabic notes actually cover); folders that are not
 * a place (Antiquité, Moyen Âge, WW2…) are simply absent.
 */
const FOLDERS: Record<string, string[]> = {
  // History
  Chine: ["CHN"],
  Djibouti: ["DJI"],
  "Empire ottoman": ["TUR"],
  France: ["FRA"],
  Inde: ["IND"],
  Japon: ["JPN"],
  Kurdes: ["TUR", "IRQ", "IRN", "SYR"],
  "Papouasie-Nouvelle-Guinée": ["PNG"],
  Russia: ["RUS"],
  Syrie: ["SYR"],
  "États-Unis": ["USA"],
  // Languages
  Allemand: ["DEU", "AUT", "CHE"],
  Anglais: ["GBR", "USA"],
  Arabe: ["SAU", "EGY"],
  Azéri: ["AZE"],
  Darija: ["MAR"],
  Espagnol: ["ESP", "MEX"],
  "Hakka-Khek": ["CHN"],
  Hindi: ["IND"],
  Indonésien: ["IDN"],
  Kabyle: ["DZA"],
  Malais: ["MYS"],
  Mandarin: ["CHN"],
  Ouighour: ["CHN"],
  Roumain: ["ROU", "MDA"],
  Sambas: ["IDN"],
  Tamoul: ["IND", "LKA"],
  "Tok Pisin": ["PNG"],
  Turc: ["TUR"],
};

/** Single notes (no folder of their own) that are about a country. */
const FILES: Record<string, string[]> = {
  "Social Sciences/History/Pridnestrovie - Transnistrie": ["MDA"],
};

const NUMERIC = new Map(COUNTRIES.map(([iso3, , num, fr]) => [iso3, { num, fr }]));

function listOf(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") return v.split(/[,;]/);
  return [];
}

function placesOf(doc: Doc): { iso3: string; kind: CarteKind }[] {
  const out: { iso3: string; kind: CarteKind }[] = [];
  const fm = doc.frontmatter as unknown as Record<string, unknown>;
  for (const name of listOf(fm.pays ?? fm.country ?? fm.countries)) {
    const r = resolveCountry(name.trim());
    if (r?.code) out.push({ iso3: r.code, kind: "autre" });
  }
  for (const [root, kind] of [
    [HISTORY, "histoire"],
    [LANGUAGES, "langue"],
  ] as const) {
    if (!doc.rawPath.startsWith(root)) continue;
    const top = doc.rawPath.slice(root.length).split("/")[0];
    for (const iso3 of FOLDERS[top] ?? []) out.push({ iso3, kind });
  }
  for (const iso3 of FILES[doc.rawPath] ?? []) out.push({ iso3, kind: "histoire" });
  return out;
}

/** Every country with at least one note, most notes first. */
export function getCarte(): CarteCountry[] {
  const byIso = new Map<string, CarteCountry>();
  for (const doc of getAllPosts()) {
    if (doc.frontmatter.draft) continue;
    const seen = new Set<string>();
    for (const { iso3, kind } of placesOf(doc)) {
      if (seen.has(iso3)) continue;
      seen.add(iso3);
      const n = NUMERIC.get(iso3);
      if (!n) continue;
      let c = byIso.get(iso3);
      if (!c) byIso.set(iso3, (c = { iso3, id: n.num, name: n.fr, notes: [] }));
      c.notes.push({ title: doc.frontmatter.title, href: `/posts/${doc.slug}/`, kind });
    }
  }
  for (const c of byIso.values()) c.notes.sort((a, b) => a.href.localeCompare(b.href));
  return [...byIso.values()].sort((a, b) => b.notes.length - a.notes.length || a.name.localeCompare(b.name, "fr"));
}

/**
 * Sequential classes for the choropleth: note counts are very skewed (a
 * language folder holds fifty notes, a history folder one), so the bins
 * grow geometrically. Returns the class index (0..4) for a count ≥ 1.
 */
export const CARTE_BINS = [1, 3, 10, 30, 100] as const;
export function carteClass(n: number): number {
  let k = 0;
  for (let i = 0; i < CARTE_BINS.length; i++) if (n >= CARTE_BINS[i]) k = i;
  return k;
}
