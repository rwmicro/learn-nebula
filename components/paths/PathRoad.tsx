"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { CHANGE_EVENT } from "@/lib/reading-progress";
import {
  QUIZ_EVENT,
  STUDY_EVENT,
  isDone,
  isStudyKey,
  loadStudyStates,
  type NoteState,
} from "@/lib/path-study";
import { daysAgo, loadAllNoteDecks, retentionBySlug, type Retention } from "@/lib/note-quiz";
import { dayKey, daysBetween } from "@/lib/srs";
import { ART, artStrip, levelArt } from "@/lib/road-art";
import { SCENES } from "@/lib/deco-art";
import type { PathFamily } from "@/lib/path-family";

// A reading path on a phone (app.css shows it below 640px, in place of the
// levels list and the prerequisites graph): a winding road of discs, one per
// note, coloured in the path's family as the reader goes. Read notes keep a
// check and their stars (★ known, ★★ read, ★★★ every question right); the
// next one has a progress ring and a card with "Commencer"; the ones after it
// show their time and what they hold. Each level ends on a chest, the level
// review (ParcoursStudy.tsx opens it: [data-level-review-btn]), then a
// divider names the next level. The current level stays pinned on top with
// its progress and the revision sheet. A finished level whose saved
// questions are due again fades (its discs go pale) and its chest says
// "À rafraîchir": it opens a sheet (what the level still holds, note by
// note) whose button starts the refresh. Small drawings of the path's theme
// (lib/road-art.ts) stand beside the notes, away from their discs, and a strip
// of them sits over each level's heading; those not reached yet stay grey.

export interface RoadNote {
  slug: string;
  title: string;
  href: string;
  minutes: number;
  /** Ids of the note's questions. */
  quiz: string[];
}
export interface RoadLevel {
  n: number;
  name: string;
  /** What the level reaches (`cible:`), shown beside its name. */
  cible?: string;
  notes: RoadNote[];
}

const STEP = 112;
const CARD = 196;
const X = [100, 288, 108, 284];
const W = 390;
/** Room over a level heading for its strip of drawings. */
const STRIP = 96;

const svg = (d: React.ReactNode, w = 1.9) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
const ICON = {
  check: svg(<path d="m5 12.5 4.5 4.5L19 7.5" />, 3),
  read: svg(
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5M8 7h8M8 11h6" />
    </>,
  ),
  quiz: svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.4M12 17h.01" />
    </>,
  ),
  clock: svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>,
  ),
  chest: svg(
    <>
      <rect x="3" y="9" width="18" height="11" rx="2" />
      <path d="M3 13h18M5 9l2-5h10l2 5M11 13v3h2v-3" />
    </>,
  ),
  sheet: svg(
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>,
  ),
  play: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.8l-10-6.5A1 1 0 0 0 8 5.5Z" />
    </svg>
  ),
  star: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
    </svg>
  ),
  sprout: svg(
    <>
      <path d="M12 21v-9" />
      <path d="M12 13C7 13 4 10 4 5c5 0 8 3 8 8Z" fill="currentColor" fillOpacity=".25" />
      <path d="M12 11c0-5 3-8 8-8 0 5-3 8-8 8Z" fill="currentColor" fillOpacity=".25" />
    </>,
    1.4,
  ),
};

const STARS: Record<NoteState, number> = { unread: 0, known: 1, read: 2, mastered: 3 };

/** A smooth road through the points: vertical tangents at each one. */
function roadPath(pts: [number, number][]): string {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const my = (y0 + y1) / 2;
    d += ` C${x0} ${my}, ${x1} ${my}, ${x1} ${y1}`;
  }
  return d;
}

export function PathRoad({
  pathSlug,
  pathName,
  family,
  discipline,
  levels,
}: {
  pathSlug: string;
  pathName: string;
  family: PathFamily | null;
  /** The vault folder of the path (English), which can pick its drawings. */
  discipline: string;
  levels: RoadLevel[];
}) {
  const locale = useLocale();
  const tr = (k: string, v?: Record<string, string | number>) => t(k, v, locale);
  const [states, setStates] = useState<Map<string, NoteState> | null>(null);
  /** Answered questions, and those due again, by note slug. */
  const [ret, setRet] = useState<Map<string, Retention>>(new Map());
  /** The faded level whose sheet is open. */
  const [sheet, setSheet] = useState<RoadLevel | null>(null);
  const sheetRef = useRef<HTMLDialogElement>(null);
  const all = useMemo(() => levels.flatMap((l) => l.notes), [levels]);
  const study = useMemo(() => all.map((n) => ({ slug: n.slug, prereqs: [], quiz: n.quiz })), [all]);

  const reload = useCallback(() => {
    setStates(loadStudyStates(study).states);
    try {
      setRet(retentionBySlug(loadAllNoteDecks(localStorage), dayKey()));
    } catch {
      /* storage blocked: nothing fades */
    }
  }, [study]);
  useEffect(() => {
    reload();
    const onStorage = (e: StorageEvent) => isStudyKey(e.key) && reload();
    window.addEventListener("storage", onStorage);
    for (const ev of [CHANGE_EVENT, STUDY_EVENT, QUIZ_EVENT, "pageshow"]) window.addEventListener(ev, reload);
    return () => {
      window.removeEventListener("storage", onStorage);
      for (const ev of [CHANGE_EVENT, STUDY_EVENT, QUIZ_EVENT, "pageshow"]) window.removeEventListener(ev, reload);
    };
  }, [reload]);

  useEffect(() => {
    const d = sheetRef.current;
    if (sheet && d && !d.open) d.showModal();
  }, [sheet]);

  const stateOf = (s: string): NoteState => states?.get(s) ?? "unread";
  const next = states ? (all.find((n) => !isDone(stateOf(n.slug)))?.slug ?? null) : null;
  const curLevel = levels.find((l) => l.notes.some((n) => n.slug === next)) ?? levels[levels.length - 1];
  const curDone = curLevel ? curLevel.notes.filter((n) => isDone(stateOf(n.slug))).length : 0;
  const curMinutes = curLevel ? curLevel.notes.reduce((m, n) => m + n.minutes, 0) : 0;
  let k = 0;

  return (
    <section className="road" aria-label={tr("parcours.order")} data-pagefind-ignore>
      {curLevel && (
        <div className="road-bar">
          <div className="road-bar-tx">
            <small>
              {tr("road.levelOf", { n: curLevel.n, total: levels.length })} · {tr("road.min", { n: curMinutes })}
              {curLevel.cible && ` · ${tr("parcours.cible", { c: curLevel.cible })}`}
            </small>
            <b>{curLevel.name}</b>
            <span className="road-bar-p" aria-hidden="true">
              <i style={{ width: `${(100 * curDone) / curLevel.notes.length}%` }} />
            </span>
          </div>
          <a className="road-bar-sheet" href={`/parcours/${pathSlug}/fiche/`} aria-label={tr("parcours.sheet")}>
            {ICON.sheet}
          </a>
        </div>
      )}
      {levels.map((lv, li) => {
        // Points: one per note, then the chest; the next note leaves room
        // for its card below.
        const pts: [number, number][] = [];
        let y = li > 0 ? 150 + STRIP : 70;
        const art = levelArt(pathName, lv.name, family, discipline);
        const nodes = lv.notes.map((n) => {
          const x = X[k++ % X.length];
          const at: [number, number] = [x, y];
          pts.push(at);
          y += n.slug === next ? CARD + STEP : STEP;
          return { n, at };
        });
        const quiz = lv.notes.reduce((s, n) => s + n.quiz.length, 0);
        const chestX = X[k % X.length] < W / 2 ? 116 : 274;
        const chest: [number, number] | null = quiz > 0 ? [chestX, y] : null;
        if (chest) {
          k++;
          pts.push(chest);
          y += 72;
        }
        const height = y - (chest ? 30 : 60);
        const doneCount = lv.notes.filter((n) => isDone(stateOf(n.slug))).length;
        const lastDone = (() => {
          let i = -1;
          while (i + 1 < lv.notes.length && isDone(stateOf(lv.notes[i + 1].slug))) i++;
          return i === lv.notes.length - 1 && chest ? i + 1 : i;
        })();
        const d = roadPath(pts);
        const dd = lastDone > 0 ? roadPath(pts.slice(0, lastDone + 1)) : "";
        const lvMinutes = lv.notes.reduce((m, n) => m + n.minutes, 0);
        const lvDue = lv.notes.reduce((m, n) => m + (ret.get(n.slug)?.due ?? 0), 0);
        const faded = doneCount === lv.notes.length && lvDue > 0;
        return (
          <div key={lv.n} className={`road-level${faded ? " is-faded" : ""}`} style={{ height }}>
            {li > 0 && (
              <div className="road-div">
                <span className="road-div-art" dangerouslySetInnerHTML={{ __html: artStrip(art) }} />
                <p className="road-div-h">
                  {tr("parcours.level", { n: lv.n })} · {lv.name}
                </p>
                <p className="road-div-sub">
                  {tr("road.levelSub", { n: lv.notes.length, m: lvMinutes })}
                  {lv.cible && ` · ${tr("parcours.cible", { c: lv.cible })}`}
                </p>
              </div>
            )}
            <svg className="road-svg" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" aria-hidden="true">
              <path d={d} className="road-way" vectorEffect="non-scaling-stroke" />
              <path d={d} className="road-dots" vectorEffect="non-scaling-stroke" />
              {dd && <path d={dd} className="road-done" vectorEffect="non-scaling-stroke" />}
              {dd && <path d={dd} className="road-done-line" vectorEffect="non-scaling-stroke" />}
            </svg>
            {nodes.map(({ n, at }, i) => {
              const st = stateOf(n.slug);
              const reached = isDone(st) || n.slug === next;
              const right = at[0] > W / 2;
              const after = nodes[i + 1];
              return (
                <Fragment key={`a${n.slug}`}>
                  <span
                    className={`road-art${reached ? "" : " is-lock"}`}
                    style={{ left: right ? "2%" : "80%", top: at[1] }}
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: ART[art[i % art.length]] }}
                  />
                  {i % 2 === 1 && after && n.slug !== next && (
                    <span
                      className="road-sprout"
                      style={{ left: right ? "87%" : "3%", top: (at[1] + after.at[1]) / 2 - 16 }}
                      aria-hidden="true"
                    >
                      {ICON.sprout}
                    </span>
                  )}
                </Fragment>
              );
            })}
            <ol className="road-list">
              {nodes.map(({ n, at }) => {
                const st = stateOf(n.slug);
                const cur = n.slug === next;
                const done = isDone(st);
                const right = at[0] > W / 2;
                const cls = `road-pn${done ? " done" : cur ? " cur" : " lock"}${right ? " r" : ""}`;
                const index = all.indexOf(n);
                return (
                  <li key={n.slug} className={cls} style={{ left: `${(100 * at[0]) / W}%`, top: at[1] }}>
                    <a className="road-disk" href={n.href} aria-label={n.title}>
                      {cur && <i className="road-ring" aria-hidden="true" />}
                      <span>{done ? ICON.check : ICON.read}</span>
                    </a>
                    {!cur && (
                      <div className="road-lb">
                        <a href={n.href}>{n.title}</a>
                        <small>
                          {done && (
                            <span className="road-stars" aria-label={tr("road.stars", { n: STARS[st] })}>
                              {[0, 1, 2].map((s) => (
                                <i key={s} className={s < STARS[st] ? "on" : undefined}>
                                  {ICON.star}
                                </i>
                              ))}
                            </span>
                          )}
                          {tr("road.min", { n: n.minutes })}
                          {!done && n.quiz.length > 0 && <i className="road-mi">{ICON.quiz}</i>}
                        </small>
                      </div>
                    )}
                    {cur && (
                      <div className={`road-card${right ? " r" : ""}`}>
                        <p className="road-card-k">
                          {tr("road.step", { n: index + 1, total: all.length })} · {tr("road.now")}
                        </p>
                        <p className="road-card-t">{n.title}</p>
                        <p className="road-card-m">
                          <span>
                            {ICON.clock}
                            {tr("road.min", { n: n.minutes })}
                          </span>
                          {n.quiz.length > 0 && (
                            <span>
                              {ICON.quiz}
                              {tr("road.questions", { n: n.quiz.length })}
                            </span>
                          )}
                        </p>
                        <a className="road-go" href={n.href}>
                          {ICON.play}
                          {tr(index > 0 ? "road.continue" : "road.start")}
                        </a>
                      </div>
                    )}
                  </li>
                );
              })}
              {chest && (
                <li
                  className={`road-pn road-chest${faded ? " due" : doneCount === lv.notes.length ? " done" : " lock"}${chest[0] > W / 2 ? " r" : ""}`}
                  style={{ left: `${(100 * chest[0]) / W}%`, top: chest[1] }}
                >
                  <button
                    type="button"
                    className="road-disk"
                    {...(faded
                      ? { onClick: () => setSheet(lv), "aria-haspopup": "dialog" as const }
                      : { "data-level-review-btn": levels.length > 1 ? lv.n : 1 })}
                  >
                    <span>{ICON.chest}</span>
                    <span className="sr-only">{tr(levels.length > 1 ? "parcours.levelReview" : "parcours.review", { n: lv.n })}</span>
                  </button>
                  <div className="road-lb">
                    {faded ? (
                      <em>{tr("road.refresh", { n: lvDue })}</em>
                    ) : (
                      doneCount === lv.notes.length && <em>{tr("road.levelDone", { n: lv.n })}</em>
                    )}
                    <b>{tr(levels.length > 1 ? "parcours.levelReview" : "parcours.review", { n: lv.n })}</b>
                    <small>{tr("road.questions", { n: quiz })}</small>
                  </div>
                </li>
              )}
            </ol>
          </div>
        );
      })}
      {states && all.length > 0 && !next && (
        // The whole path read: the road reaches a tree in bloom (lib/deco-art.ts).
        <div className="road-end">
          <div className="road-end-scene deco" dangerouslySetInnerHTML={{ __html: SCENES.done }} />
          <div className="road-end-card">
            <small>{tr("road.endKicker")}</small>
            <h2>{pathName}</h2>
            <p>{tr("road.endText", { n: all.length, q: all.reduce((m, n) => m + n.quiz.length, 0) })}</p>
            <div className="road-end-stats">
              <div>
                <b>{all.length}</b>
                <span>{tr("road.endNotes")}</span>
              </div>
              <div>
                <b>{levels.length}</b>
                <span>{tr("road.endLevels")}</span>
              </div>
              <div>
                <b>{hours(all.reduce((m, n) => m + n.minutes, 0))}</b>
                <span>{tr("road.endReading")}</span>
              </div>
            </div>
            <a className="road-end-go" href="/cartes/aujourdhui/">
              {tr("road.endGo")}
            </a>
          </div>
        </div>
      )}
      {sheet && (
        <RefreshSheet
          ref={sheetRef}
          level={sheet}
          review={levels.length > 1 ? sheet.n : 1}
          ret={ret}
          tr={tr}
          locale={locale}
          onClose={() => setSheet(null)}
        />
      )}
    </section>
  );
}

/** Reading time as "9 h", or "40 min" under an hour. */
function hours(min: number): string {
  return min < 60 ? `${min} min` : `${Math.round(min / 60)} h`;
}

const CELLS = 32;
const REFRESH = svg(
  <>
    <path d="M20 12a8 8 0 1 1-2.3-5.6" />
    <path d="M20 4v5h-5" />
  </>,
  2.2,
);

/** The sheet a faded chest opens: how long since the level was last
 *  reviewed, what still holds (a row of squares, solid then due), each
 *  note's questions due, and the button that starts the level review. */
function RefreshSheet({
  ref,
  level,
  review,
  ret,
  tr,
  locale,
  onClose,
}: {
  ref: React.RefObject<HTMLDialogElement | null>;
  level: RoadLevel;
  review: number;
  ret: Map<string, Retention>;
  tr: (k: string, v?: Record<string, string | number>) => string;
  locale: string;
  onClose: () => void;
}) {
  const rows = level.notes.flatMap((n) => {
    const r = ret.get(n.slug);
    return r ? [{ n, r }] : [];
  });
  const total = rows.reduce((m, x) => m + x.r.saved, 0);
  const due = rows.reduce((m, x) => m + x.r.due, 0);
  const last = rows.reduce<string | null>((m, x) => (x.r.last && (!m || x.r.last > m) ? x.r.last : m), null);
  const cells = Math.min(total, CELLS);
  const solidCells = total ? Math.round(((total - due) / total) * cells) : 0;
  const close = () => ref.current?.close();
  return (
    <dialog
      ref={ref}
      className="road-sheet"
      aria-labelledby="road-sheet-h"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="road-sheet-in">
        <i className="road-sheet-grip" aria-hidden="true" />
        <p className="road-sheet-k">
          {REFRESH}
          {tr("road.sheetKick")}
        </p>
        <h2 id="road-sheet-h">
          {tr("parcours.level", { n: level.n })} · {level.name}
        </h2>
        <p className="road-sheet-lead">
          {last && `${tr("road.sheetLast", { ago: daysAgo(daysBetween(last, dayKey()), locale) })} `}
          {tr("road.sheetLead", { n: due })}
        </p>
        <div className="road-sheet-box">
          <p>
            <b>{tr("road.sheetHolds")}</b>
            <span>{tr("road.sheetOf", { n: total - due, total })}</span>
          </p>
          <span className="road-sheet-cells" aria-hidden="true">
            {Array.from({ length: cells }, (_, i) => (
              <i key={i} className={i < solidCells ? "ok" : "due"} />
            ))}
          </span>
          <p className="road-sheet-legend" aria-hidden="true">
            <span className="ok">{tr("road.sheetSolid")}</span>
            <span className="due">{tr("road.sheetDue")}</span>
          </p>
        </div>
        <ul className="road-sheet-notes">
          {rows.map(({ n, r }) => (
            <li key={n.slug} className={r.due ? "due" : "ok"}>
              <i aria-hidden="true">{r.due ? REFRESH : ICON.check}</i>
              <a href={n.href}>{n.title}</a>
              <small>{r.due ? tr("road.dueN", { n: r.due }) : tr("road.solid")}</small>
            </li>
          ))}
        </ul>
        <button type="button" className="road-sheet-go" data-level-review-btn={review} onClick={close}>
          {tr("road.sheetGo")}
        </button>
        <button type="button" className="road-sheet-later" onClick={close}>
          {tr("road.later")}
        </button>
      </div>
    </dialog>
  );
}
