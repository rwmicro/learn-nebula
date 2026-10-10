// Our World in Data, read at build time.
//
// A `widget:owid` block in the vault names a chart by its OWID slug (the last
// part of ourworldindata.org/grapher/<slug>) and the countries to draw. The
// build downloads the chart's CSV and metadata once, keeps them in
// .cache/owid/ (same idea as the vault clone in .cache/pensine: a rebuild
// re-reads the disk instead of the network), and the widget receives only the
// rows it draws. A reader's browser never calls OWID: the figure is the site's
// own SVG, so it follows the theme and works offline.
//
// Licence: OWID's charts and data are CC BY 4.0 (some third-party series carry
// their own terms, named in the metadata); every figure prints the citation
// OWID provides for the chart.
import fs from "node:fs";
import path from "node:path";
import { resolveCountry } from "./countries";

const CACHE_DIR = path.join(process.cwd(), ".cache", "owid");
const BASE = "https://ourworldindata.org/grapher/";
/** Cached files are re-downloaded after this many days (OWID updates most
 *  series yearly). Overridable for a forced refresh: OWID_MAX_AGE_DAYS=0. */
const MAX_AGE_DAYS = Number(process.env.OWID_MAX_AGE_DAYS ?? 30);

export interface OwidTable {
  /** Column short names after entity/code/year, in CSV order. */
  columns: string[];
  rows: { entity: string; code: string; year: number; values: (number | null)[] }[];
}

export interface OwidMeta {
  title: string;
  citation: string;
  url: string;
  /** Unit of the first column, when OWID gives one ("years", "%"). */
  unit: string;
  /** Per-column short title, keyed like OwidTable.columns. */
  columnTitles: Record<string, string>;
}

/** Slugs are lowercase letters, digits and dashes: anything else is refused
 *  before it reaches a URL or a cache path. */
export function isOwidSlug(s: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,120}$/.test(s);
}

function fresh(file: string): boolean {
  try {
    const age = (Date.now() - fs.statSync(file).mtimeMs) / 86_400_000;
    return age < MAX_AGE_DAYS;
  } catch {
    return false;
  }
}

async function cached(file: string, url: string): Promise<string | null> {
  if (fresh(file)) return fs.readFileSync(file, "utf8");
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Write then rename: Next builds pages in several workers at once, and a
    // half-written file must never be read as the cache.
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, file);
    return body;
  } catch (e) {
    // Offline or OWID down: an older copy is better than nothing.
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
    console.warn(`owid: ${url}: ${(e as Error).message}`);
    return null;
  }
}

/** Minimal RFC 4180 line splitter (OWID quotes entity names with commas). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export function parseOwidCsv(text: string): OwidTable {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const head = splitCsvLine(lines[0] ?? "");
  // entity,code,year then the value columns; OWID appends "<col>__annotations"
  // text columns on some charts, which are not numbers and are skipped.
  const keep: number[] = [];
  for (let i = 3; i < head.length; i++) if (!head[i].endsWith("__annotations")) keep.push(i);
  const rows: OwidTable["rows"] = [];
  for (let k = 1; k < lines.length; k++) {
    const f = splitCsvLine(lines[k]);
    const year = Number(f[2]);
    if (!Number.isFinite(year)) continue;
    rows.push({
      entity: f[0],
      code: f[1],
      year,
      values: keep.map((i) => (f[i] === "" || f[i] == null ? null : Number(f[i]))),
    });
  }
  return { columns: keep.map((i) => head[i]), rows };
}

const memo = new Map<string, Promise<{ table: OwidTable; meta: OwidMeta } | null>>();

/** The whole chart (all countries, all years) and its metadata, or null when
 *  it cannot be had (bad slug, offline with no cache). */
export function loadOwid(slug: string): Promise<{ table: OwidTable; meta: OwidMeta } | null> {
  if (!isOwidSlug(slug)) return Promise.resolve(null);
  let p = memo.get(slug);
  if (!p) {
    p = (async () => {
      const csv = await cached(
        path.join(CACHE_DIR, `${slug}.csv`),
        `${BASE}${slug}.csv?v=1&csvType=full&useColumnShortNames=true`,
      );
      const metaRaw = await cached(
        path.join(CACHE_DIR, `${slug}.metadata.json`),
        `${BASE}${slug}.metadata.json?v=1&csvType=full&useColumnShortNames=true`,
      );
      if (!csv || !metaRaw) return null;
      const table = parseOwidCsv(csv);
      let m: {
        chart?: { title?: string; citation?: string; originalChartUrl?: string };
        columns?: Record<string, { shortName?: string; titleShort?: string; unit?: string }>;
      } = {};
      try {
        m = JSON.parse(metaRaw);
      } catch {
        // Metadata is only for labels; the chart still draws without it.
      }
      const columnTitles: Record<string, string> = {};
      let unit = "";
      for (const c of Object.values(m.columns ?? {})) {
        if (c.shortName) columnTitles[c.shortName] = c.titleShort ?? c.shortName;
        if (c.shortName === table.columns[0] && c.unit) unit = c.unit;
      }
      return {
        table,
        meta: {
          title: m.chart?.title ?? slug,
          citation: m.chart?.citation ?? "",
          url: m.chart?.originalChartUrl ?? `${BASE}${slug}`,
          unit,
          columnTitles,
        },
      };
    })();
    memo.set(slug, p);
  }
  return p;
}

/** Rounds to 4 significant digits: what a chart can show, a fraction of the
 *  bytes of OWID's full-precision floats. */
export function sig(v: number): number {
  if (v === 0 || !Number.isFinite(v)) return v;
  const d = Math.max(0, 3 - Math.floor(Math.log10(Math.abs(v))));
  return Number(v.toFixed(Math.min(d, 6)));
}

export interface Series {
  name: string;
  code: string;
  points: [number, number][];
}

/**
 * One series per named country (vault order kept), from column `col`
 * (default: the first), years within [from, to]. Names that resolve to
 * nothing, or that the chart has no data for, are reported in `missing`.
 */
export function pickSeries(
  table: OwidTable,
  names: string[],
  opts: { col?: number; from?: number; to?: number } = {},
): { series: Series[]; missing: string[] } {
  const col = opts.col ?? 0;
  const series: Series[] = [];
  const missing: string[] = [];
  for (const raw of names) {
    const r = resolveCountry(raw);
    const match = r
      ? (row: OwidTable["rows"][number]) => (r.owid ? row.entity === r.owid : row.code === r.code)
      : (row: OwidTable["rows"][number]) => row.entity === raw;
    const points: [number, number][] = [];
    for (const row of table.rows) {
      if (!match(row)) continue;
      if (opts.from != null && row.year < opts.from) continue;
      if (opts.to != null && row.year > opts.to) continue;
      const v = row.values[col];
      if (v == null || !Number.isFinite(v)) continue;
      points.push([row.year, sig(v)]);
    }
    points.sort((a, b) => a[0] - b[0]);
    if (points.length) series.push({ name: r?.fr ?? raw, code: r?.code || r?.owid || raw, points });
    else missing.push(raw);
  }
  return { series, missing };
}
