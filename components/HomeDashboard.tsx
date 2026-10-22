"use client";

import { useEffect, useMemo, useState } from "react";
import { t, disciplineKey } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { useHomeData, useReadingStore } from "@/components/HomeContent";
import { useReviewDue } from "@/components/AccountChip";
import { FamilyIcon, glyphStroke as s } from "@/components/FamilyIcon";
import { calendarDays, currentRun, loadActivity, localDay } from "@/lib/personal";
import { loadStore, type ReadingStore } from "@/lib/reading-progress";
import type { HomeData } from "@/lib/home-data";
import type { PathFamily } from "@/lib/path-family";
import { ERAGNY, paintingFor } from "@/lib/paintings";

// The home as an app dashboard, on phones only (app.css hides it from 640px,
// and hides there the masthead it replaces). From the top: the date and a
// greeting; "Aujourd'hui", the discipline's painting (lib/paintings.ts) over the next step of the reading
// path in progress with today's cards and notes (or, with nothing under
// way, three ways in); the week's reading days; the paths under way; paths
// to discover, mixing the disciplines; the note of the day; the latest
// notes. Everything personal is read from this browser after hydration, so
// the first paint is the welcome card.

export interface DashRecent {
  title: string;
  href: string;
  discipline: string;
  family: PathFamily | null;
  minutes: number;
  /** Written or tended in the two weeks before the build. */
  fresh: boolean;
}

export interface DashPath {
  slug: string;
  name: string;
  family: PathFamily | null;
  /** Its notes' slugs, to count the ones read. */
  slugs: string[];
}

/** A note the "note du jour" can show: one a day, picked by the date. */
export interface DashDayNote {
  title: string;
  href: string;
  discipline: string;
  family: PathFamily | null;
  minutes: number;
  excerpt: string;
}

/** Notes read a day that fill the "notes lues aujourd'hui" count. */
const DAILY_GOAL = 3;

const Chevron = () => (
  <svg className="dash-chev" viewBox="0 0 24 24" aria-hidden="true" {...s} strokeWidth={2.4}>
    <path d="m9 5 7 7-7 7" />
  </svg>
);

const Play = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.5v13l10.5-6.5z" />
  </svg>
);

/** The path to pick up: among those started and not finished, the one whose
 *  notes were last visited; its next step is its first unread note, with how
 *  far into it the reader got and the minutes left. */
function resumePath(data: HomeData | null, store: ReadingStore) {
  if (!data) return null;
  let best: { last: number; path: HomeData["paths"][number] } | null = null;
  for (const p of data.paths) {
    let read = 0;
    let last = 0;
    for (const [slug] of p.notes) {
      const e = store[slug];
      if (!e) continue;
      if (e.r != null) read++;
      last = Math.max(last, e.t ?? 0, e.r ?? 0);
    }
    if (last === 0 || read === p.notes.length) continue;
    if (!best || last > best.last) best = { last, path: p };
  }
  if (!best) return null;
  const { path } = best;
  const i = path.notes.findIndex(([slug]) => store[slug]?.r == null);
  const [slug, title, minutes] = path.notes[i];
  const read = path.notes.filter(([x]) => store[x]?.r != null).length;
  const pct = Math.min(99, Math.round((store[slug]?.p ?? 0) / 10));
  const left = Math.max(1, Math.round(minutes * (1 - pct / 100)));
  return { path, slug, title, pct, left, step: i + 1, total: path.notes.length, read };
}

/** "Arabe libanais : des premiers mots à la culture" → "Arabe libanais". */
const shortName = (name: string) => name.split(/\s+:\s+/)[0];

/** Up to 12 dashes for a path: the share read, the current note's progress
 *  as a part-filled dash. */
function dashes(read: number, total: number, pct: number) {
  const n = Math.min(12, total);
  const done = (read / total) * n;
  const part = (pct / 100) * (n / total);
  return Array.from({ length: n }, (_, i) => {
    const fill = Math.max(0, Math.min(1, done + part - i));
    return i < Math.floor(done) ? 1 : fill;
  });
}

/** Round robin over the colour families, so the row never shows the same
 *  family twice in a row while others remain. */
function mixFamilies<T extends { family: PathFamily | null }>(items: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const k = it.family ?? "";
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  const out: T[] = [];
  const queues = [...groups.values()];
  while (out.length < items.length) {
    for (const q of queues) {
      const x = q.shift();
      if (x) out.push(x);
    }
  }
  return out;
}

const LOCALE_TAG: Record<string, string> = { fr: "fr-FR", en: "en-GB", es: "es-ES", zh: "zh-CN", ar: "ar" };

/** Monday-first days of this week, as local "YYYY-MM-DD". */
function thisWeek(now: Date): string[] {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return localDay(x);
  });
}

interface Personal {
  now: Date;
  run: number;
  days: Record<string, { r: number; c: number }>;
  readToday: number;
  fresh: boolean;
}

function usePersonal(store: ReadingStore): Personal | null {
  const [p, setP] = useState<Personal | null>(null);
  useEffect(() => {
    const load = () => {
      try {
        const st = loadStore();
        const reads = Object.values(st)
          .map((e) => e.r)
          .filter((r): r is number => typeof r === "number");
        const activity = loadActivity();
        const days = calendarDays(activity, reads);
        const today = localDay();
        setP({
          now: new Date(),
          run: currentRun(days),
          days,
          readToday: reads.filter((r) => localDay(new Date(r * 1000)) === today).length,
          fresh: Object.keys(st).length === 0 && Object.keys(activity).length === 0,
        });
      } catch {
        setP({ now: new Date(), run: 0, days: {}, readToday: 0, fresh: true });
      }
    };
    load();
    window.addEventListener("gk:activity", load);
    window.addEventListener("gk:progress-synced", load);
    return () => {
      window.removeEventListener("gk:activity", load);
      window.removeEventListener("gk:progress-synced", load);
    };
  }, [store]);
  return p;
}

export function HomeDashboard({
  dataVersion,
  recent,
  paths,
  dayNotes,
  noteCount,
}: {
  dataVersion: string;
  recent: DashRecent[];
  /** The reading paths, in the site's order. */
  paths: DashPath[];
  dayNotes: DashDayNote[];
  noteCount: number;
}) {
  const locale = useLocale();
  const tr = (k: string, v?: Record<string, string | number>) => t(k, v, locale);
  const data = useHomeData(dataVersion);
  const store = useReadingStore();
  const due = useReviewDue();
  const me = usePersonal(store);

  const resume = useMemo(() => resumePath(data, store), [data, store]);
  const rows = useMemo(
    () =>
      paths.map((p, i) => {
        const read = p.slugs.filter((slug) => store[slug]?.r != null).length;
        return { ...p, read, total: p.slugs.length, i };
      }),
    [paths, store],
  );
  // Under way, furthest along first.
  const mine = rows
    .filter((p) => p.read > 0 && p.read < p.total)
    .sort((a, b) => b.read / b.total - a.read / a.total)
    .slice(0, 3);
  // Not started, largest first, then one family after another.
  const discover = mixFamilies(rows.filter((p) => p.read === 0).sort((a, b) => b.total - a.total || a.i - b.i));
  const nextTitle = (slug: string) => {
    const p = data?.paths.find((x) => x.slug === slug);
    return p?.notes.find(([x]) => store[x]?.r == null)?.[1];
  };
  const discName = (name: string) => {
    const k = disciplineKey(name);
    return k ? tr(k) : name;
  };
  const nf = new Intl.NumberFormat(LOCALE_TAG[locale] ?? "fr-FR");

  const hour = me?.now.getHours() ?? 12;
  const greeting = me?.fresh ? "dash.hiFirst" : hour >= 18 || hour < 5 ? "dash.hiEvening" : "dash.hiDay";
  const date = me ? new Intl.DateTimeFormat(LOCALE_TAG[locale] ?? "fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(me.now) : "";
  const dayNote = me && dayNotes.length ? dayNotes[Math.floor(me.now.getTime() / 86_400_000 - me.now.getTimezoneOffset() / 1440) % dayNotes.length] : null;
  const week = me ? thisWeek(me.now) : [];
  const today = me ? localDay(me.now) : "";
  const activeToday = !!me?.days[today] && (me.days[today].r > 0 || me.days[today].c > 0);
  const weekLetters = tr("dash.weekLetters").split("|");
  const art = paintingFor(resume?.path.family);

  return (
    <section className="dash" data-pagefind-ignore>
      <header className="dash-top">
        <p className="dash-date">{date || " "}</p>
        <h1 className="dash-hello" data-ready={me ? "" : undefined}>
          {tr(greeting)} <em>{tr(`${greeting}Em`)}</em>
        </h1>
      </header>

      {resume ? (
        <section className="dash-today" data-family={resume.path.family ?? undefined} aria-label={tr("dash.today")}>
          <a className="dash-art" href={`/posts/${resume.slug}/#reprendre`} tabIndex={-1} aria-hidden="true">
            <picture className={art === ERAGNY ? undefined : "is-family"}>
              <source type="image/avif" srcSet={`${art.src}.avif`} />
              <img src={`${art.src}.webp`} alt="" title={art.credit} decoding="async" />
            </picture>
            <span className="dash-chip">
              <span className="dash-chip-dot">
                <FamilyIcon family={resume.path.family} />
              </span>
              {tr("dash.stepOf", { path: shortName(resume.path.name), n: resume.step, total: resume.total })}
            </span>
            <span className="dash-cap">
              <small>{tr("dash.resumeKicker", { m: resume.left })}</small>
              <b>{resume.title}</b>
            </span>
          </a>
          <div className="dash-progress" aria-hidden="true">
            <span className="dash-dashes">
              {dashes(resume.read, resume.total, resume.pct).map((f, i) => (
                <i key={i} style={{ "--f": f } as React.CSSProperties} />
              ))}
            </span>
            <span>{tr("dash.pctRead", { p: resume.pct })}</span>
          </div>
          <a className="dash-go" href={`/posts/${resume.slug}/#reprendre`} aria-label={tr("dash.continueAria", { title: resume.title })}>
            <Play />
            {tr("dash.resumeCta")}
          </a>
          <nav className="dash-session" aria-label={tr("dash.today")}>
            <a className={due ? "is-due" : undefined} href={due?.href ?? "/cartes/"}>
              <b>
                <svg viewBox="0 0 24 24" {...s} strokeWidth={1.9} aria-hidden="true">
                  <rect x="3" y="7" width="13" height="14" rx="2" />
                  <path d="M8 3h11a2 2 0 0 1 2 2v12" />
                </svg>
                {due?.n ?? 0}
              </b>
              <small>{tr("dash.cardsDue")}</small>
            </a>
            <a className={(me?.readToday ?? 0) >= DAILY_GOAL ? "is-done" : undefined} href="/progression/">
              <b>
                <svg viewBox="0 0 24 24" {...s} strokeWidth={2.2} aria-hidden="true">
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
                {(me?.readToday ?? 0) >= DAILY_GOAL ? Math.min(me?.readToday ?? 0, 99) : `${me?.readToday ?? 0}/${DAILY_GOAL}`}
              </b>
              <small>{tr("dash.readToday")}</small>
            </a>
          </nav>
        </section>
      ) : (
        <section className="dash-today dash-welcome" aria-label={tr("dash.today")}>
          <div className="dash-art">
            <picture>
              <source type="image/avif" srcSet="/images/eragny.avif" />
              <img src="/images/eragny.webp" alt="" width="1200" height="950" decoding="async" />
            </picture>
            <span className="dash-cap">
              <b>{tr("dash.quote")}</b>
              <small>{tr("dash.credit")}</small>
            </span>
          </div>
          <p className="dash-welcome-text">{tr("dash.welcomeText", { n: nf.format(noteCount) })}</p>
          <ul className="dash-ways">
            <li>
              <a className="is-main" href="/parcours/">
                <span className="dash-way-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" {...s}>
                    <circle cx="6" cy="19" r="2" />
                    <circle cx="18" cy="5" r="2" />
                    <path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16" />
                  </svg>
                </span>
                <span>
                  <b>{tr("dash.wayPath")}</b>
                  <small>{tr("dash.wayPathText", { n: paths.length })}</small>
                </span>
                <Chevron />
              </a>
            </li>
            <li>
              <a href="/graph/">
                <span className="dash-way-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" {...s}>
                    <circle cx="5" cy="6" r="2" />
                    <circle cx="19" cy="7" r="2" />
                    <circle cx="12" cy="18" r="2" />
                    <circle cx="12" cy="10" r="1.6" />
                    <path d="M6.8 6.8 10.6 9.3M17.2 7.6l-3.7 1.9M12 11.6V16" />
                  </svg>
                </span>
                <span>
                  <b>{tr("dash.wayGraph")}</b>
                  <small>{tr("dash.wayGraphText")}</small>
                </span>
                <Chevron />
              </a>
            </li>
            <li>
              <a href="/hasard/">
                <span className="dash-way-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" {...s}>
                    <rect x="4" y="4" width="16" height="16" rx="4" />
                    <circle cx="9" cy="9" r=".9" fill="currentColor" />
                    <circle cx="15" cy="15" r=".9" fill="currentColor" />
                    <circle cx="15" cy="9" r=".9" fill="currentColor" />
                    <circle cx="9" cy="15" r=".9" fill="currentColor" />
                  </svg>
                </span>
                <span>
                  <b>{tr("dash.wayRandom")}</b>
                  <small>{tr("dash.wayRandomText")}</small>
                </span>
                <Chevron />
              </a>
            </li>
          </ul>
        </section>
      )}

      {me && Object.keys(me.days).length > 0 && (
        <a className="dash-week" href="/defis/">
          <span className="dash-week-days" aria-hidden="true">
            {week.map((d, i) => {
              const on = !!me.days[d] && (me.days[d].r > 0 || me.days[d].c > 0);
              return (
                <span key={d}>
                  <i className={on ? "is-on" : d === today ? "is-now" : undefined}>
                    {on && (
                      <svg viewBox="0 0 24 24" {...s} strokeWidth={3}>
                        <path d="m5 12.5 4.5 4.5L19 7.5" />
                      </svg>
                    )}
                  </i>
                  {weekLetters[i]}
                </span>
              );
            })}
          </span>
          <span className="dash-week-text">
            <b>
              <svg className="dash-flame" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.7 2-4.5 0 2 1 3 2 3 0-4 1-6.5 1-8.5z" />
              </svg>
              {tr(me.run === 1 ? "dash.run1" : "dash.run", { n: me.run })}
            </b>
            <small>{tr(activeToday ? "dash.runKept" : me.run > 0 ? "dash.runKeep" : "dash.runStart")}</small>
          </span>
        </a>
      )}

      {mine.length > 0 && (
        <>
          <div className="dash-row-h">
            <h2 className="dash-h">{tr("dash.mine")}</h2>
            <a href="/parcours/">{tr("dash.seeAll")}</a>
          </div>
          <ul className="dash-mine">
            {mine.map((p) => {
              const next = nextTitle(p.slug);
              const pct = Math.round((100 * p.read) / p.total);
              return (
                <li key={p.slug} data-family={p.family ?? undefined}>
                  <a href={`/parcours/${encodeURIComponent(p.slug)}/`}>
                    <span className="dash-mine-icon" aria-hidden="true">
                      <FamilyIcon family={p.family} />
                    </span>
                    <span className="dash-mine-text">
                      <b>{shortName(p.name)}</b>
                      <small>
                        {tr("dash.pathRead", { read: p.read, total: p.total })}
                        {next ? ` · ${tr("dash.next", { title: next })}` : ""}
                      </small>
                      <i className="dash-bar" aria-hidden="true">
                        <i style={{ width: `${pct}%` }} />
                      </i>
                    </span>
                    <span className="dash-mine-pct">{pct} %</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {discover.length > 0 && (
        <>
          <div className="dash-row-h">
            <h2 className="dash-h">{tr(mine.length > 0 ? "dash.discover" : "dash.startWith")}</h2>
            <a href="/parcours/">{tr("dash.seeAll")}</a>
          </div>
          <ul className="dash-disc">
            {discover.map((p) => (
              <li key={p.slug} data-family={p.family ?? undefined}>
                <a href={`/parcours/${encodeURIComponent(p.slug)}/`}>
                  <span className="dash-disc-icon" aria-hidden="true">
                    <FamilyIcon family={p.family} />
                  </span>
                  <span>
                    <b>{shortName(p.name)}</b>
                    <small>{tr("dash.notes", { n: p.total })}</small>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {dayNote && (
        <>
          <div className="dash-row-h">
            <h2 className="dash-h">{tr("dash.dayNote")}</h2>
            <a href="/hasard/">{tr("dash.random")}</a>
          </div>
          <article className="dash-day" data-family={dayNote.family ?? undefined}>
            <a href={dayNote.href}>
              <small className="dash-day-kicker">
                <FamilyIcon family={dayNote.family} />
                {discName(dayNote.discipline)} · {tr("dash.min", { m: dayNote.minutes })}
              </small>
              <b>{dayNote.title}</b>
              <p>{dayNote.excerpt}</p>
              <span className="dash-day-read">{tr("dash.read")}</span>
            </a>
          </article>
        </>
      )}

      <div className="dash-row-h">
        <h2 className="dash-h">{tr("dash.recent")}</h2>
        <a href="/jardin/">{tr("dash.seeAll")}</a>
      </div>
      <ul className="dash-list">
        {recent.slice(0, 3).map((n) => (
          <li key={n.href} data-family={n.family ?? undefined}>
            <a href={n.href}>
              <span className="dash-list-icon" aria-hidden="true">
                <FamilyIcon family={n.family} />
              </span>
              <span className="dash-list-text">
                <b>{n.title}</b>
                <small>
                  {discName(n.discipline)} · {tr("dash.min", { m: n.minutes })}
                  {n.fresh && <span className="dash-new">{tr("dash.new")}</span>}
                </small>
              </span>
              <Chevron />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
