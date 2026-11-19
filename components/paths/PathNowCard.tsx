"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { t, pathName, splitPathName } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import type { HomeData } from "@/lib/home-data";
import type { ReadingStore } from "@/lib/reading-progress";
import { paintingForPath, type Painting } from "@/lib/paintings";
import { srcSet } from "@/lib/responsive-image";
import { splitMinutes } from "@/lib/path-study";

/**
 * The path in progress, on the desktop home and /parcours/ (returning reader
 * only; a first visit keeps its own page): one card with the next step, its
 * path's picture framed with a museum label, and the path as a line of
 * steps (the current level's, under a band of levels, when the path has
 * levels), beside the reader's other paths in progress as "doors". A door
 * swaps its path into the card; the choice is kept (localStorage
 * `gk-path-main`) until that path is finished.
 */

type Path = HomeData["paths"][number];
const MAIN_KEY = "gk-path-main";
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"];

const Play = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.5v13l10.5-6.5z" />
  </svg>
);
const Ic = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const Sheet = () => (
  <Ic>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M9 12h7M9 16h7M9 8h3" />
  </Ic>
);
const MapIc = () => (
  <Ic>
    <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" />
    <path d="M9 4v14M15 6v14" />
  </Ic>
);
const Swap = () => (
  <Ic>
    <path d="M4 8h13l-3-3M20 16H7l3 3" />
  </Ic>
);
const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

function Pic({ art, sizes, eager }: { art: Painting; sizes: string; eager?: boolean }) {
  return (
    <picture>
      <source type="image/avif" srcSet={srcSet(art.src, "avif")} sizes={sizes} />
      <img
        src={`${art.src}.webp`}
        srcSet={srcSet(art.src, "webp")}
        sizes={sizes}
        alt=""
        title={art.credit}
        decoding="async"
        style={{ objectPosition: `${art.focus} 50%` }}
        {...(eager ? { fetchPriority: "high" as const } : { loading: "lazy" as const })}
      />
    </picture>
  );
}

/** "Salutations — Turc": the path already says which language. */
function stepTitle(title: string, path: Path) {
  const lang = splitPathName(path.name)[0];
  return title.endsWith(` — ${lang}`) ? title.slice(0, -(lang.length + 3)) : title;
}

function progress(p: Path, store: ReadingStore) {
  let read = 0;
  let last = 0;
  for (const [slug] of p.notes) {
    const e = store[slug];
    if (!e) continue;
    if (e.r != null) read++;
    last = Math.max(last, e.t ?? 0, e.r ?? 0);
  }
  const i = p.notes.findIndex(([slug]) => store[slug]?.r == null);
  return { read, last, i };
}

export function PathNowCard({
  data,
  store,
  fallback,
  aside,
  allHref = "/parcours/",
  eager = false,
}: {
  data: HomeData;
  store: ReadingStore;
  /** The path the page would resume (resumePath()), used until the reader
   *  picks another one. */
  fallback: string;
  /** Extra rows under the doors (the fading levels on /parcours/). */
  aside?: ReactNode;
  /** Where "Tous les parcours" leads. */
  allHref?: string;
  eager?: boolean;
}) {
  const locale = useLocale();
  const tr = (k: string, v?: Record<string, string | number>) => t(k, v, locale);
  const [picked, setPicked] = useState<string | null>(null);
  const [lvView, setLvView] = useState<number | null>(null);
  useEffect(() => {
    try {
      setPicked(localStorage.getItem(MAIN_KEY));
    } catch {
      /* private mode */
    }
  }, []);

  // Paths begun and not finished, most recently read first.
  const going = useMemo(
    () =>
      data.paths
        .map((p) => ({ p, ...progress(p, store) }))
        .filter((x) => x.last > 0 && x.i >= 0)
        .sort((a, b) => b.last - a.last),
    [data, store],
  );
  const main = going.find((x) => x.p.slug === picked) ?? going.find((x) => x.p.slug === fallback) ?? going[0];
  if (!main) return null;
  const others = going.filter((x) => x !== main).slice(0, 2);

  const pick = (slug: string) => {
    const go = () => {
      setPicked(slug);
      setLvView(null);
      try {
        localStorage.setItem(MAIN_KEY, slug);
      } catch {
        /* private mode */
      }
    };
    const d = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (d.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) d.startViewTransition(go);
    else go();
  };

  const p = main.p;
  const [slug, title, minutes] = p.notes[main.i];
  const pct = Math.min(99, Math.round((store[slug]?.p ?? 0) / 10));
  const left = Math.max(1, Math.round(minutes * (1 - pct / 100)));
  const total = p.notes.length;
  const art = paintingForPath(p.family, p.notes[0][0]);
  const leftMinutes = p.notes.filter(([s]) => store[s]?.r == null).reduce((s, n) => s + n[2], 0);
  const dur = (m: number) => {
    const { h, m: mm } = splitMinutes(m);
    return h ? tr("parcours.hm", { h, mm: String(mm).padStart(2, "0") }) : tr("parcours.min", { m: mm });
  };
  const levels = p.lv ?? [];
  const curLv = levels.findIndex(([, , from, to]) => main.i >= from && main.i < to);
  const shownLv = lvView ?? curLv;
  const [from, to] = levels.length && shownLv >= 0 ? [levels[shownLv][2], levels[shownLv][3]] : [0, total];
  const steps = p.notes.slice(from, to);

  return (
    <div className="pnc" data-family={p.family ?? undefined}>
      <article className="pnc-card" style={{ viewTransitionName: "pnc-card" } as CSSProperties}>
        <div className="pnc-top">
          <div className="pnc-text">
            <p className="pnc-k">
              {tr("pnc.here")} · {pathName(p, "title", locale)} · {tr("pcd.mStep", { n: main.i + 1, t: total })}
            </p>
            <h2 className="pnc-h">
              <a href={`/posts/${slug}/#reprendre`}>{stepTitle(title, p)}</a>
            </h2>
            {pathName(p, "sub", locale) && <p className="pnc-sub">{pathName(p, "sub", locale)}</p>}
            {p.d && <p className="pnc-desc">{p.d}</p>}
            <div className="pnc-cta">
              <a className="pnc-btn main" href={`/posts/${slug}/#reprendre`}>
                <Play />
                {tr("dash.resumeCta")}
                <small>{tr("parcours.min", { m: left })}</small>
              </a>
              <a className="pnc-btn" href={`/parcours/${p.slug}/fiche/`}>
                <Sheet />
                {tr("pnc.sheet")}
              </a>
              <a className="pnc-btn" href={`/parcours/${p.slug}/`}>
                <MapIc />
                {tr("pnc.plan")}
              </a>
            </div>
          </div>
          <figure className="pnc-fig">
            <span className="pnc-frame">
              <Pic key={art.src} art={art} sizes="300px" eager={eager} />
            </span>
            <figcaption>
              <b>{art.title}</b>
              {[art.by, art.note].filter(Boolean).join(", ")}
            </figcaption>
          </figure>
        </div>

        <div className="pnc-fil">
          <div className="pnc-fil-h">
            <span>{tr("pcd.rail")}</span>
            <em>{tr("pcd.railMeta", { r: main.read, l: total - main.read, d: dur(leftMinutes) })}</em>
          </div>
          {levels.length > 0 && (
            <div className="pnc-lv" style={{ gridTemplateColumns: levels.map(([, , a, b]) => `${b - a}fr`).join(" ") }}>
              {levels.map(([n, name, a, b], li) => {
                const r = p.notes.slice(a, b).filter(([s]) => store[s]?.r != null).length;
                const st = r === b - a ? "done" : li === curLv ? "now" : "";
                return (
                  <button key={n} type="button" className={st} aria-pressed={li === shownLv} onClick={() => setLvView(li)} title={name}>
                    <span className="b">
                      <i style={{ width: `${(100 * r) / (b - a)}%` }} />
                    </span>
                    <span className="t">
                      <b>
                        <span>{ROMAN[n - 1] ?? n}</span>
                        {name}
                      </b>
                      <em>
                        {r}/{b - a}
                      </em>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <ol className="pnc-steps" style={{ "--n": steps.length } as CSSProperties}>
            {steps.map(([s, nt, m], k) => {
              const i = from + k;
              const now = i === main.i;
              const done = store[s]?.r != null;
              return (
                <li key={s} className={now ? "now" : done ? "done" : undefined}>
                  <a href={`/posts/${s}/`}>
                    <span className="d">{done ? <Check /> : i + 1}</span>
                    <b>{stepTitle(nt, p)}</b>
                    <small>{now ? `${tr("pnc.toRead")} · ${tr("parcours.min", { m: left })}` : tr("parcours.min", { m })}</small>
                  </a>
                </li>
              );
            })}
          </ol>
        </div>
      </article>

      <aside className="pnc-side">
        <div className="pnc-side-h">
          <span>{tr("pcd.mine")}</span>
          <em>{tr("pcd.mineOn", { n: going.length })}</em>
        </div>
        {others.map((o) => {
          const a = paintingForPath(o.p.family, o.p.notes[0][0]);
          return (
            <button
              key={o.p.slug}
              type="button"
              className="pnc-door"
              data-family={o.p.family ?? undefined}
              onClick={() => pick(o.p.slug)}
              style={{ viewTransitionName: `pnc-door-${o.p.slug.replace(/[^a-z0-9-]/gi, "")}` } as CSSProperties}
            >
              <Pic art={a} sizes="260px" />
              <span className="k">
                {pathName(o.p, "title", locale)} · {tr("pcd.mOf", { n: o.i + 1, t: o.p.notes.length })}
              </span>
              <b>{stepTitle(o.p.notes[o.i][1], o.p)}</b>
              <span className="bar">
                <i style={{ width: `${Math.max(3, (100 * o.read) / o.p.notes.length)}%` }} />
              </span>
              <span className="go">
                <Swap />
                {tr("pnc.show")}
              </span>
            </button>
          );
        })}
        {aside}
        <a className="pnc-all" href={allHref}>
          {tr("pnc.all")} <span aria-hidden="true">→</span>
        </a>
      </aside>
    </div>
  );
}
