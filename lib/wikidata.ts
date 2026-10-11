// Wikidata, read at build time (CC0, no attribution required; the figures
// still link back to the item).
//
// Two uses: a language note's fact sheet (`widget:fiche-langue` with
// `wikidata: Q9240`: speakers, scripts, family, ISO code), and dates for the
// timeline when a note's frontmatter names its item (`wikidata: Q9312`) but
// gives no `year`. Entities are cached in .cache/wikidata/ like OWID's charts
// in .cache/owid/ (lib/owid.ts), so a rebuild reads the disk.
import fs from "node:fs";
import path from "node:path";

const CACHE_DIR = path.join(process.cwd(), ".cache", "wikidata");
const MAX_AGE_DAYS = Number(process.env.WIKIDATA_MAX_AGE_DAYS ?? 60);
const UA = "GardenOfKnowledge/1.0 (https://github.com/rwmicro/learn-nebula; static site build)";

export const isQid = (s: string) => /^Q[1-9]\d{0,10}$/.test(s);

type Snak = { datavalue?: { value: unknown } };
type Claim = { mainsnak: Snak; qualifiers?: Record<string, Snak[]>; rank?: string };
interface Entity {
  id: string;
  labels?: Record<string, { value: string }>;
  claims?: Record<string, Claim[]>;
  sitelinks?: Record<string, { title: string }>;
}

const memo = new Map<string, Promise<Entity | null>>();

async function entity(qid: string): Promise<Entity | null> {
  if (!isQid(qid)) return null;
  let p = memo.get(qid);
  if (!p) {
    p = (async () => {
      const file = path.join(CACHE_DIR, `${qid}.json`);
      try {
        const age = (Date.now() - fs.statSync(file).mtimeMs) / 86_400_000;
        if (age < MAX_AGE_DAYS) return JSON.parse(fs.readFileSync(file, "utf8")) as Entity;
      } catch {
        // not cached yet
      }
      try {
        const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, {
          headers: { "User-Agent": UA },
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const all = (await res.json()) as { entities: Record<string, Entity> };
        const e = Object.values(all.entities)[0];
        // Keep only what is used: the full JSON of a country is megabytes.
        const slim: Entity = {
          id: e.id,
          labels: { fr: e.labels?.fr, en: e.labels?.en } as Entity["labels"],
          claims: Object.fromEntries(
            ["P1098", "P282", "P220", "P279", "P569", "P570", "P571", "P580", "P582", "P585", "P577"]
              .filter((k) => e.claims?.[k])
              .map((k) => [k, e.claims![k]]),
          ),
          sitelinks: e.sitelinks?.frwiki ? { frwiki: e.sitelinks.frwiki } : {},
        };
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        const tmp = `${file}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(slim));
        fs.renameSync(tmp, file);
        return slim;
      } catch (err) {
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as Entity;
        console.warn(`wikidata ${qid}: ${(err as Error).message}`);
        return null;
      }
    })();
    memo.set(qid, p);
  }
  return p;
}

const label = (e: Entity | null) => e?.labels?.fr?.value ?? e?.labels?.en?.value ?? e?.id ?? "";
const itemId = (s: Snak) => (s.datavalue?.value as { id?: string } | undefined)?.id;
const usable = (cs: Claim[] | undefined) => (cs ?? []).filter((c) => c.rank !== "deprecated");

/** Year of a Wikidata time value ("+1770-08-27T00:00:00Z", "-0384-…"). */
export function wdYear(s: Snak | undefined): number | undefined {
  const t = (s?.datavalue?.value as { time?: string } | undefined)?.time;
  const m = t && /^([+-])(\d+)-/.exec(t);
  return m ? (m[1] === "-" ? -1 : 1) * Number(m[2]) : undefined;
}

export interface LanguageFacts {
  qid: string;
  label: string;
  iso: string;
  scripts: string[];
  /** Broadest family last: ["malais", "langues malaïques", …, "langues austronésiennes"]. */
  family: string[];
  /** Latest count per kind (first / second language), with its year. */
  speakers: { kind: "L1" | "L2" | "total"; count: number; year?: number }[];
  url: string;
}

const L1 = "Q36870";
/** Generic classes above every language family: language, natural language, modern language. */
const GENERIC = new Set(["Q34770", "Q33742", "Q1288568", "Q20162172", "Q315"]);
const L2 = "Q125421";

export async function loadLanguage(qid: string): Promise<LanguageFacts | null> {
  const e = await entity(qid);
  if (!e) return null;
  const c = e.claims ?? {};
  const best = new Map<string, { count: number; year?: number }>();
  for (const cl of usable(c.P1098)) {
    const v = cl.mainsnak.datavalue?.value as { amount?: string } | undefined;
    const count = Number(v?.amount);
    if (!Number.isFinite(count)) continue;
    const part = cl.qualifiers?.P518?.map(itemId);
    const kind = part?.includes(L1) ? "L1" : part?.includes(L2) ? "L2" : "total";
    const year = wdYear(cl.qualifiers?.P585?.[0]);
    const prev = best.get(kind);
    if (!prev || (year ?? 0) > (prev.year ?? 0)) best.set(kind, { count, year });
  }
  const scripts = await Promise.all(usable(c.P282).map((cl) => entity(itemId(cl.mainsnak) ?? "")));
  // Walk "subclass of" up to the family's root, at most 8 steps.
  const family: string[] = [];
  let cur = usable(c.P279)[0];
  for (let i = 0; cur && i < 8; i++) {
    const parent = await entity(itemId(cur.mainsnak) ?? "");
    if (!parent) break;
    // Past the family's root the chain turns generic ("langue humaine",
    // "langue", "langue naturelle"): stop there.
    if (GENERIC.has(parent.id ?? "") || /^langue( |$)/i.test(label(parent))) break;
    family.push(label(parent));
    cur = usable(parent.claims?.P279)[0];
  }
  return {
    qid,
    label: label(e),
    iso: (usable(c.P220)[0]?.mainsnak.datavalue?.value as string) ?? "",
    scripts: scripts.filter(Boolean).map(label),
    family,
    speakers: [...best].map(([kind, v]) => ({ kind: kind as "L1" | "L2" | "total", ...v })),
    url: e.sitelinks?.frwiki
      ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(e.sitelinks.frwiki.title.replace(/ /g, "_"))}`
      : `https://www.wikidata.org/wiki/${qid}`,
  };
}

/**
 * Start (and end) year of the item: birth–death for a person, start–end for
 * an event or period, publication or inception otherwise. Used by the
 * timeline for notes that name a Wikidata item and no `year`.
 */
export async function loadYears(qid: string): Promise<{ year: number; yearEnd?: number } | null> {
  const e = await entity(qid);
  if (!e) return null;
  const c = e.claims ?? {};
  const first = (k: string) => wdYear(usable(c[k])[0]?.mainsnak);
  const year = first("P569") ?? first("P580") ?? first("P585") ?? first("P577") ?? first("P571");
  if (year == null) return null;
  const yearEnd = first("P570") ?? first("P582");
  return { year, yearEnd };
}
