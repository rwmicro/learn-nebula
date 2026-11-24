"use client";

import { useEffect, useMemo, useState } from "react";
import { t, levelNameIn, pathName, splitPathName } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { useHomeData } from "@/components/home/HomeContent";
import { resumePath, useRetention } from "@/components/home/HomeDashboard";
import { ERAGNY, paintingByline, paintingFor, paintingText, type Painting } from "@/lib/paintings";
import { splitMinutes } from "@/lib/path-study";
import type { PathFamily } from "@/lib/path-family";
import { useStore } from "@/components/paths/ParcoursDeskBits";
import { PathNowCard } from "@/components/paths/PathNowCard";
import { srcSet } from "@/lib/responsive-image";

/** Per path slug, its levels as [n, name, from, to]. */
export type HeroLevels = Record<string, [number, string, number, number][]>;

type Lite = { slug: string; name: string; family: PathFamily | null; notes: [string, string, number][] };

const Play = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.5v13l10.5-6.5z" />
  </svg>
);
const Refresh = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M20 12a8 8 0 1 1-2.3-5.6" />
    <path d="M20 4v5h-5" />
  </svg>
);

function Pic({ art, hero = false, className, eager = false }: { art: Painting; hero?: boolean; className?: string; eager?: boolean }) {
  const src = hero && art.hero ? art.hero : art.src;
  // The hero fills the screen; otherwise the picture sits in a card.
  const sizes = hero ? "100vw" : "(max-width: 1100px) 50vw, 420px";
  const locale = useLocale();
  return (
    <picture className={className}>
      <source type="image/avif" srcSet={srcSet(src, "avif")} sizes={sizes} />
      { }
      <img src={`${src}.webp`} srcSet={srcSet(src, "webp")} sizes={sizes} alt="" title={paintingText(art, "credit", locale)} decoding="async" style={hero ? undefined : { objectPosition: `${art.focus} 50%` }} {...(eager ? { fetchPriority: "high" as const } : { loading: "lazy" as const })} />
    </picture>
  );
}

const PICKS: PathFamily[] = ["societe", "langues", "informatique", "sciences", "pensee", "arts"];
const TARGET = [15, 60, 400];

/**
 * The top of the desktop /parcours/, over the picture of the path in
 * progress: where the reader is (the next note, its opening, the way on),
 * their other paths, the levels fading, and the path as a line of stations.
 * On a first visit: Pissarro's garden, two questions (what tempts you, how
 * much time) and the path they point to, and the eight rooms.
 */
export function ParcoursDeskHero({
  dataVersion,
  rooms,
  levels,
  counts,
  logoClass,
}: {
  logoClass: string;
  dataVersion: string;
  rooms: { f: PathFamily; count: number; src: string; focus: string }[];
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
  const [pick, setPick] = useState<PathFamily>("langues");
  const [time, setTime] = useState(0);

  useEffect(() => {
    document.querySelector(".pcd")?.toggleAttribute("data-first", first);
  }, [first]);

  const dur = (m: number) => {
    const { h, m: mm } = splitMinutes(m);
    return h ? tr("parcours.hm", { h, mm: String(mm).padStart(2, "0") }) : tr("parcours.min", { m: mm });
  };
  const short = (p: { slug: string; name: string }) => pathName(p, "title", locale);
  const minutes = (p: Lite) => p.notes.reduce((s, n) => s + n[2], 0);

  const logo = (
    <a className={`pcd-logo ${logoClass}`} href="/">
      Garden of Knowledge
    </a>
  );

  if (!resume || !data) {
    // First visit (and the first paint of every visit).
    const paths = data?.paths ?? [];
    const pool = paths
      .filter((p) => p.family === pick)
      .map((p) => ({ p, m: minutes(p) }))
      .sort((a, b) => Math.abs(a.m - TARGET[time]) - Math.abs(b.m - TARGET[time]) || a.m - b.m);
    const sug = pool[0];
    const sugArt = paintingFor(pick);
    return (
      <section className="pcd-hero fv" data-family={pick}>
        <Pic art={ERAGNY} className="pcd-bg" eager />
        <div className="pcd-veil" />
        {logo}
        <figure className="pcd-cartel">
          <b>{paintingText(ERAGNY, "title", locale)}</b>
          <span>{paintingByline(ERAGNY, locale)}</span>
        </figure>
        <div className="pcd-main">
          <p className="pcd-k">
            <span>{tr("parcours.title")}</span> · {tr("pcd.heroTitle", { n: counts.paths, r: counts.rooms })}
          </p>
          <h1 className="pcd-h">
            {tr("pcd.fvTitleA")} <em>{tr("pcd.fvTitleB")}</em>
            {tr("pcd.fvTitleC")}
          </h1>
          <p className="pcd-ex">{tr("pcd.fvText")}</p>
          <div className="pcd-pick">
            <small>{tr("pcd.pickK")}</small>
            <span>
              {PICKS.map((f) => (
                <button key={f} type="button" aria-pressed={pick === f} onClick={() => setPick(f)}>
                  {tr(`pcd.pick_${f}`)}
                </button>
              ))}
            </span>
          </div>
          <div className="pcd-pick">
            <small>{tr("pcd.timeK")}</small>
            <span>
              {[0, 1, 2].map((i) => (
                <button key={i} type="button" aria-pressed={time === i} onClick={() => setTime(i)}>
                  {tr(`pcd.t${i + 1}k`)}
                </button>
              ))}
            </span>
          </div>
        </div>
        {sug && (
          <aside className="pcd-panel pcd-sug" data-family={pick}>
            <small className="pcd-pk">{tr("pcd.sugK")}</small>
            <Pic art={sugArt} className="fr" />
            <span className="chip">
              {tr(`parcours.family.${pick}`)} · {tr("dash.notes", { n: sug.p.notes.length })} · {dur(sug.m)}
            </span>
            <b className="tt">{short(sug.p)}</b>
            {pathName(sug.p, "sub", locale) && <em className="ts">{pathName(sug.p, "sub", locale)}</em>}
            <ol className="steps">
              {sug.p.notes.slice(0, 3).map(([s, nt]) => (
                // "Salutations — Turc": the path already says which language.
                <li key={s}>{nt.endsWith(` — ${splitPathName(sug.p.name)[0]}`) ? nt.slice(0, -(splitPathName(sug.p.name)[0].length + 3)) : nt}</li>
              ))}
              {sug.p.notes.length > 3 && <li className="more">{tr("pcd.moreSteps", { n: sug.p.notes.length - 3 })}</li>}
            </ol>
            <a className="pcd-btn" href={`/posts/${sug.p.notes[0][0]}/`}>
              <Play />
              {tr("pcd.startPath")}
            </a>
            {pool.length > 1 && (
              <p className="alt">
                {tr("pcd.orElse")}{" "}
                {pool.slice(1, 3).map(({ p, m }, i) => (
                  <span key={p.slug}>
                    {i ? ", " : ""}
                    <a href={`/parcours/${p.slug}/`}>{short(p)}</a> · {dur(m)}
                  </span>
                ))}
              </p>
            )}
          </aside>
        )}
        <div className="pcd-rooms">
          <div className="pcd-rail-h">
            <small>{tr("pcd.roomsK")}</small>
            <span>{tr("pcd.roomsHint")}</span>
          </div>
          <div className="row">
            {rooms.map((r, i) => (
              <a key={r.f} className="pcd-room-l" data-family={r.f} href={`#salle-${r.f}`}>
                <span className="fr">
                  {/* eslint-disable-next-line @next/next/no-img-element -- static export */}
                  <img src={`${r.src}.webp`} srcSet={srcSet(r.src, "webp")} sizes="160px" alt="" loading="lazy" decoding="async" style={{ objectPosition: `${r.focus} 50%` }} />
                </span>
                <small>{tr("pcd.room", { n: ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"][i] })}</small>
                <b>{tr(`pcd.roomShort_${r.f}`)}</b>
                <em>{tr(r.count === 1 ? "parcours.familyCountOne" : "parcours.familyCount", { n: r.count })}</em>
              </a>
            ))}
          </div>
        </div>
      </section>
    );
  }

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
