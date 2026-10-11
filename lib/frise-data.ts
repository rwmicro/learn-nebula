// What /frise/ needs beyond getTimeline(): notes dated by Wikidata instead of
// a `year:` line, and the curve the modern part of the timeline is drawn on.
// Both are fetched at build (cached in .cache/, lib/wikidata.ts and
// lib/owid.ts) and both degrade to nothing when offline with no cache.
import { getAllPosts, getTimeline, type TimelineEntry } from "./content";
import { isQid, loadYears } from "./wikidata";
import { loadOwid, pickSeries } from "./owid";

/**
 * getTimeline(), plus every note that has no `year` but names a Wikidata item
 * (`wikidata: Q6534`): its start and end come from the item (birth and death,
 * start and end, or publication). An explicit `year` always wins.
 */
export async function getTimelineWithWikidata(): Promise<TimelineEntry[]> {
  const out = getTimeline();
  const jobs = getAllPosts()
    .filter((d) => d.frontmatter.year === undefined && !d.frontmatter.draft)
    .map((d) => ({ d, qid: String((d.frontmatter as unknown as Record<string, unknown>).wikidata ?? "").trim() }))
    .filter(({ qid }) => isQid(qid));
  for (const { d, qid } of jobs) {
    const y = await loadYears(qid);
    if (!y) continue;
    out.push({
      title: d.frontmatter.title,
      href: `/posts/${d.slug}/`,
      year: y.year,
      yearEnd: y.yearEnd !== undefined && y.yearEnd !== y.year ? y.yearEnd : undefined,
      period: d.frontmatter.period,
      domain: d.frontmatter.domain,
    });
  }
  return out.sort((a, b) => a.year - b.year);
}

export interface FriseCurve {
  /** [year, people] from CURVE_FROM to the last year OWID has. */
  points: [number, number][];
  from: number;
  to: number;
  max: number;
  source: string;
  url: string;
  /** Dated notes inside [from, to], each placed at its year on the curve. */
  dots: { year: number; value: number; title: string; href: string }[];
  /** Dated notes older than `from`, left to the list. */
  before: number;
}

export const CURVE_FROM = 1500;

/** World population (OWID, from HYDE and the UN) with the notes on it. */
export async function getFriseCurve(entries: TimelineEntry[]): Promise<FriseCurve | null> {
  const d = await loadOwid("population");
  if (!d) return null;
  const { series } = pickSeries(d.table, ["World"], { from: CURVE_FROM });
  const points = series[0]?.points;
  if (!points || points.length < 10) return null;
  const from = points[0][0];
  const to = points.at(-1)![0];
  const at = (yr: number) => {
    // Linear between the two known years around `yr` (decades before 1950).
    let i = points.findIndex((p) => p[0] >= yr);
    if (i <= 0) return points[Math.max(0, i)][1];
    const [y0, v0] = points[i - 1];
    const [y1, v1] = points[i];
    return v0 + ((v1 - v0) * (yr - y0)) / (y1 - y0 || 1);
  };
  const dots = entries
    .filter((e) => e.year >= from && e.year <= to)
    .map((e) => ({ year: e.year, value: at(e.year), title: e.title, href: e.href }));
  return {
    points,
    from,
    to,
    max: Math.max(...points.map((p) => p[1])),
    source: d.meta.citation,
    url: d.meta.url,
    dots,
    before: entries.filter((e) => e.year < from).length,
  };
}
