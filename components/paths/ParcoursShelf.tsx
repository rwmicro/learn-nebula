"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { t, disciplineKey, pathName } from "@/lib/i18n";
import { useLocale } from "@/lib/client/use-locale";
import { splitMinutes } from "@/lib/client/path-study";
import { fold } from "@/lib/palette-match";
import type { PathFamily } from "@/lib/path-family";

/** One path as a book on the shelf. */
export interface ShelfBookView {
  slug: string;
  /** "Réseau : des modèles OSI aux attaques" (pathName() localizes it). */
  name: string;
  family: PathFamily | null;
  notes: number;
  minutes: number;
  /** The first note's href: "Commencer" opens it. */
  first: string;
  /** Folded name, description and note titles (the filter bar's). */
  search: string;
}

/** A line drawn over its books: the paths that follow one another. */
export interface ShelfLineView {
  slugs: string[];
  family: PathFamily | null;
  /** The discipline's folder name, or null when the line mixes several
   *  (it is named after its family then). */
  discipline: string | null;
  minutes: number;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

/** A fixed small wobble per book, so the tops don't line up like a bar
 *  chart; derived from the slug, the same on every build and screenshot. */
function wobble(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) | 0;
  return (Math.abs(h) % 17) - 8;
}

type Drawn = { x: number[]; tops: number[]; y: number; label: string; end: boolean };

/**
 * The desktop /parcours/ on a first visit (ParcoursDesk, shown while
 * .pcd[data-first]): every path a book on two shelves, its spine as thick as
 * its notes and as tall as its reading time, in its family's colour. The
 * lines (paths that follow one another) run over their books, a green dot on
 * the first. Pointing at a spine pulls the book out with its card; the search
 * dims the books it doesn't match, Enter opens the first one that does.
 */
export function ParcoursShelf({
  books,
  rows,
  lines,
  counts,
}: {
  books: ShelfBookView[];
  rows: string[][];
  lines: ShelfLineView[];
  counts: { paths: number; rooms: number };
}) {
  const locale = useLocale();
  const tr = useCallback((k: string, v?: Record<string, string | number>) => t(k, v, locale), [locale]);
  const by = useMemo(() => new Map(books.map((b) => [b.slug, b])), [books]);
  const [q, setQ] = useState("");
  const [cur, setCur] = useState<string | null>(null);
  const [card, setCard] = useState<{ left: number; top: number } | null>(null);
  const [drawn, setDrawn] = useState<Drawn[]>([]);
  const box = useRef<HTMLDivElement>(null);

  const dur = (m: number) => {
    const { h, m: mm } = splitMinutes(m);
    return h ? tr("parcours.hm", { h, mm: String(mm).padStart(2, "0") }) : tr("parcours.min", { m: mm });
  };

  const tokens = useMemo(() => fold(q).split(/\s+/).filter(Boolean), [q]);
  const hits = useMemo(
    () => (tokens.length ? rows.flat().filter((s) => tokens.every((tok) => by.get(s)!.search.includes(tok))) : null),
    [tokens, rows, by],
  );
  const hitSet = useMemo(() => (hits ? new Set(hits) : null), [hits]);

  // The lines, measured over the spines once they are laid out (and again
  // when the window or the locale changes the shelf's width).
  useLayoutEffect(() => {
    const root = box.current;
    if (!root) return;
    const draw = () => {
      const b = root.getBoundingClientRect();
      const out: Drawn[] = [];
      lines.forEach((l, i) => {
        const els = l.slugs.map((s) => root.querySelector<HTMLElement>(`[data-book="${CSS.escape(s)}"]`));
        if (els.some((e) => !e)) return;
        const r = els.map((e) => e!.getBoundingClientRect());
        const tops = r.map((x) => x.top - b.top);
        const disc = l.discipline ? disciplineKey(l.discipline) : null;
        const name = !l.discipline && l.family ? tr(`parcours.family.${l.family}`) : disc ? tr(disc) : (l.discipline ?? "");
        const x = r.map((e) => e.left - b.left + e.width / 2);
        out.push({
          x,
          // A line starting in the right half of the shelf hangs its label
          // from its last book, so the label stays over the shelf.
          end: x[0] > b.width * 0.55,
          tops,
          y: Math.min(...tops) - 18,
          label: `${tr("pcd.line", { l: ROMAN[i] ?? String(i + 1), name })} · ${tr("parcours.familyCount", { n: l.slugs.length })} · ${dur(l.minutes)}`,
        });
      });
      setDrawn(out);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(root);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dur follows tr
  }, [lines, tr]);

  const pull = (slug: string, el: HTMLElement) => {
    const root = box.current;
    if (!root) return;
    const b = root.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const W = 300;
    const rtl = getComputedStyle(root).direction === "rtl";
    let left = rtl ? r.left - b.left - W - 14 : r.right - b.left + 14;
    if (left + W > b.width) left = r.left - b.left - W - 14;
    if (left < 0) left = Math.min(b.width - W, r.right - b.left + 14);
    setCur(slug);
    setCard({ left, top: Math.max(0, r.top - b.top - 6) });
  };

  useEffect(() => {
    if (!cur) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCur(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cur]);

  const shown = cur ? by.get(cur) : undefined;
  const sub = shown ? pathName(shown, "sub", locale) : "";

  return (
    <section className="pcd-shelf" aria-labelledby="pcd-shelf-h">
      <div className="pcd-shelf-top">
        <div>
          <p className="pcd-shelf-k">
            {tr("parcours.title")} · {tr("pcd.heroTitle", { n: counts.paths, r: counts.rooms })}
          </p>
          <h1 id="pcd-shelf-h">
            {tr("pcd.shelfA")} <em>{tr("pcd.shelfB")}</em>
          </h1>
          <p className="pcd-shelf-x">{tr("pcd.shelfText")}</p>
        </div>
        <div className="pcd-shelf-q">
          <label>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setCur(null);
              }}
              onKeyDown={(e) => {
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- the site moves between documents, never through the router
                if (e.key === "Enter" && hits?.length) window.location.assign(`/parcours/${hits[0]}/`);
              }}
              placeholder={tr("parcours.filterPlaceholder")}
              aria-label={tr("parcours.filterAria")}
              autoComplete="off"
            />
          </label>
          <p aria-live="polite">
            {hits && (hits.length ? `${tr("parcours.familyCount", { n: hits.length })} / ${books.length}` : tr("pcd.shelfNone"))}
          </p>
        </div>
      </div>

      <div className="pcd-shelves" ref={box} onMouseLeave={() => setCur(null)} data-searching={hitSet ? "" : undefined}>
        {rows.map((row, i) => (
          <div className="pcd-board" key={i}>
            {row.map((s) => {
              const b = by.get(s)!;
              const style = {
                flexGrow: b.notes + 8,
                height: `${Math.round(150 + Math.min(60, b.minutes / 6) + wobble(s))}px`,
              } as CSSProperties;
              return (
                <a
                  key={s}
                  href={`/parcours/${s}/`}
                  className="pcd-book"
                  data-book={s}
                  data-family={b.family ?? undefined}
                  data-out={cur === s ? "" : undefined}
                  data-miss={hitSet && !hitSet.has(s) ? "" : undefined}
                  style={style}
                  onMouseEnter={(e) => pull(s, e.currentTarget)}
                  onFocus={(e) => pull(s, e.currentTarget)}
                >
                  <span>{pathName(b, "title", locale)}</span>
                </a>
              );
            })}
          </div>
        ))}
        <svg className="pcd-shelf-lines" aria-hidden="true">
          {drawn.map((d, i) => (
            <g key={i}>
              <text x={d.end ? d.x[d.x.length - 1] + 6 : d.x[0] - 6} y={d.y - 14} textAnchor={d.end ? "end" : undefined}>
                {d.label}
              </text>
              {d.x.map((x, j) => (
                <line key={j} className="tie" x1={x} y1={d.y} x2={x} y2={d.tops[j]} />
              ))}
              <path className="ln" d={`M${d.x[0]},${d.y} H${d.x[d.x.length - 1]}`} />
              {d.x.map((x, j) => (
                <circle key={j} className={j ? "st" : "st go"} cx={x} cy={d.y} r={j ? 5 : 8} />
              ))}
            </g>
          ))}
        </svg>
        {shown && card && (
          <div className="pcd-pull" data-family={shown.family ?? undefined} style={{ left: card.left, top: card.top }} onMouseEnter={() => setCur(shown.slug)}>
            <small>
              {shown.family ? `${tr(`parcours.family.${shown.family}`)} · ` : ""}
              {tr("dash.notes", { n: shown.notes })} · {dur(shown.minutes)}
            </small>
            <a className="pcd-pull-t" href={`/parcours/${shown.slug}/`}>
              {pathName(shown, "title", locale)}
            </a>
            {sub && <em>{sub}</em>}
            <span className="pcd-pull-a">
              <a className="pcd-pull-go" href={shown.first}>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5.5v13l10.5-6.5z" />
                </svg>
                {tr("pcd.start")}
              </a>
              <a href={`/parcours/${shown.slug}/`}>{tr("pcd.shelfOpen")}</a>
            </span>
          </div>
        )}
      </div>
      <p className="pcd-shelf-hint">
        <span>{tr("pcd.shelfHint")}</span>
      </p>
    </section>
  );
}
