"use client";

import { useEffect, useMemo } from "react";
import { t, levelNameIn } from "@/lib/i18n";
import { useLocale } from "@/lib/client/use-locale";
import { useHomeData } from "@/components/home/HomeContent";
import { resumePath, useRetention } from "@/components/home/HomeDashboard";
import { useStore } from "@/components/paths/ParcoursDeskBits";
import { PathNowCard } from "@/components/paths/PathNowCard";

/** Per path slug, its levels as [n, name, from, to]. */
export type HeroLevels = Record<string, [number, string, number, number][]>;

const Refresh = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M20 12a8 8 0 1 1-2.3-5.6" />
    <path d="M20 4v5h-5" />
  </svg>
);

/**
 * The top of the desktop /parcours/, over the picture of the path in
 * progress: where the reader is (the next note, its opening, the way on),
 * their other paths, the levels fading, and the path as a line of stations.
 * On a first visit it only marks .pcd[data-first]: the shelf shows instead.
 */
export function ParcoursDeskHero({
  dataVersion,
  levels,
  counts,
}: {
  dataVersion: string;
  levels: HeroLevels;
  counts: { paths: number; rooms: number };
}) {
  const locale = useLocale();
  const tr = (k: string, v?: Record<string, string | number>) => t(k, v, locale);
  const data = useHomeData(dataVersion);
  const store = useStore();
  const ret = useRetention();
  const resume = useMemo(() => resumePath(data, store), [data, store]);
  const first = !resume;
  useEffect(() => {
    document.querySelector(".pcd")?.toggleAttribute("data-first", first);
  }, [first]);

  // First visit (and the first paint of every visit): the shelf
  // (ParcoursShelf, in .pcd-first-only) stands in for this.
  if (!resume || !data) return null;

  // Returning reader: the page's title on paper, then the path in progress
  // (components/paths/PathNowCard.tsx, shared with the desktop home).
  const fading = data.paths.flatMap((x) =>
    (levels[x.slug] ?? [])
      .map(([n, name, from, to]) => {
        let due = 0;
        for (const [s] of x.notes.slice(from, to)) due += ret.get(s)?.due ?? 0;
        return { x, n, name, due };
      })
      .filter((l) => l.due > 0),
  );

  return (
    <section className="pcd-now">
      <div className="pcd-now-h">
        <small>{tr("parcours.title")}</small>
        <h1>{tr("pcd.heroTitle", { n: counts.paths, r: counts.rooms })}</h1>
        <p>{tr("pcd.heroSub")}</p>
      </div>
      <PathNowCard
        data={data}
        store={store}
        fallback={resume.path.slug}
        allHref="#pcd-filter"
        eager
        aside={
          fading.length > 0 && (
            <div className="pcd-now-fade">
              <Refresh />
              <span>
                <b>{tr(fading.length === 1 ? "pcd.fade1" : "pcd.fade", { n: fading.length })}</b>
                {fading
                  .slice(0, 2)
                  .map((l) => levelNameIn(l.name, locale))
                  .join(", ")}
              </span>
              <a href={`/parcours/${fading[0].x.slug}/`}>{tr("pcd.review")}</a>
            </div>
          )
        }
      />
    </section>
  );
}
