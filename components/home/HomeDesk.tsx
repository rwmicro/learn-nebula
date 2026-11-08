"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { t, disciplineKey, pathName } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { LazyGraph, useHomeData, useReadingStore } from "@/components/home/HomeContent";
import { useReviewDue } from "@/components/account/AccountChip";
import { FamilyIcon, glyphStroke as s } from "@/components/ui/FamilyIcon";
import { localDay } from "@/lib/personal";
import { ERAGNY, paintingFor } from "@/lib/paintings";
import { daysAgo } from "@/lib/note-quiz";
import { dayKey, daysBetween } from "@/lib/srs";
import { loadChats, type ChatMode, type Conversation } from "@/lib/chat-history";
import type { PathFamily } from "@/lib/path-family";
import { useChessCard, type HomeChessData } from "@/components/home/HomeChess";
import { lastChoice, type HomeTalkLang } from "@/components/home/HomeTalk";
import { useWordOfDay, type HomeWordLang } from "@/components/home/HomeWord";
import {
  DAILY_GOAL,
  LOCALE_TAG,
  mixFamilies,
  pathShare,
  resumePath,
  thisWeek,
  usePersonal,
  useRetention,
  type DashDayNote,
  type DashPath,
  type DashRecent,
} from "@/components/home/HomeDashboard";
import { srcSet, ERAGNY_SIZES } from "@/lib/responsive-image";

// The home on a desktop (from 1024px; home-desk.css shows it and hides the
// tablet layout that follows it in <main>): the phone dashboard's content set
// out as an almanac under the masthead. A greeting and the search; the
// picture of the path in progress, framed, with its next step (or, on a first
// visit, Pissarro's garden and four ways in); the week; then numbered
// sections on a hairline: I. today (the note of the day, cards due, levels
// fading, the word of the day), II. paths, III. chess and the spoken partner,
// IV. ask the garden, V. latest notes, VI. one chart, VII. contents (the
// knowledge map, other ways in, every discipline), and a colophon. Everything
// personal is read from this browser after hydration (the same hooks as
// HomeDashboard), so the first paint is the first visit.

export interface DeskChart {
  title: string;
  href: string;
  lede: string;
  /** ISO date. */
  at: string;
  source: string;
  family: PathFamily | null;
  /** The folder the graphique notes live in. */
  folder: string;
  /** Drawn at build by lib/home-chart.ts, "" when the data was missing. */
  svg: string;
}

export interface DeskDomain {
  slug: string;
  /** i18n key of the grand domain. */
  name: string;
  count: number;
  items: { name: string; slug: string; count: number }[];
}

const Play = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.5v13l10.5-6.5z" />
  </svg>
);
const Arrow = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...s} strokeWidth={2.6}>
    <path d="m9 5 7 7-7 7" />
  </svg>
);
const Mic = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...s} strokeWidth={2}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);
const Refresh = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...s} strokeWidth={2}>
    <path d="M20 12a8 8 0 1 1-2.3-5.6" />
    <path d="M20 4v5h-5" />
  </svg>
);
const Flame = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.7 2-4.5 0 2 1 3 2 3 0-4 1-6.5 1-8.5z" />
  </svg>
);
const Lens = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...s} strokeWidth={2}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const WAYS = {
  path: (
    <>
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="5" r="2" />
      <path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16" />
    </>
  ),
  graph: (
    <>
      <circle cx="5" cy="6" r="2" />
      <circle cx="19" cy="7" r="2" />
      <circle cx="12" cy="18" r="2" />
      <circle cx="12" cy="10" r="1.6" />
      <path d="M6.8 6.8 10.6 9.3M17.2 7.6l-3.7 1.9M12 11.6V16" />
    </>
  ),
  dice: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <circle cx="9" cy="9" r=".9" fill="currentColor" />
      <circle cx="15" cy="15" r=".9" fill="currentColor" />
      <circle cx="15" cy="9" r=".9" fill="currentColor" />
      <circle cx="9" cy="15" r=".9" fill="currentColor" />
    </>
  ),
  ask: (
    <>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
      <path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.9c0 1.6-2.4 2-2.4 3.4" />
    </>
  ),
};

/** A section head: the roman numeral, small caps, a hint, a link. */
function Head({ n, title, hint, link, id }: { n: string; title: string; hint?: string; link?: { href: string; label: string; onClick?: () => void }; id?: string }) {
  return (
    <div className="hd-h">
      <span className="n" aria-hidden="true">
        {n}.
      </span>
      <h2 id={id}>{title}</h2>
      {hint && <i>{hint}</i>}
      {link && (
        <a
          href={link.href}
          onClick={
            link.onClick &&
            ((e) => {
              e.preventDefault();
              link.onClick!();
            })
          }
        >
          {link.label}
        </a>
      )}
    </div>
  );
}

const ask = (detail: { question?: string; mode?: ChatMode; resume?: string; view?: "history" }) =>
  window.dispatchEvent(new CustomEvent("gk:chat-ask", { detail }));

/** The conversations to pick up, most recent first (lib/chat-history.ts). */
function useChats(): Conversation[] {
  const [c, setC] = useState<Conversation[]>([]);
  useEffect(() => {
    const load = () => {
      try {
        setC(loadChats(localStorage).filter((x) => x.messages.length > 0));
      } catch {
        /* storage blocked */
      }
    };
    load();
    window.addEventListener("storage", load);
    window.addEventListener("pageshow", load);
    return () => {
      window.removeEventListener("storage", load);
      window.removeEventListener("pageshow", load);
    };
  }, []);
  return c;
}

export function HomeDesk({
  dataVersion,
  recent,
  paths,
  dayNotes,
  noteCount,
  chess,
  talk,
  words,
  chart,
  index,
  stats,
}: {
  dataVersion: string;
  recent: DashRecent[];
  paths: DashPath[];
  dayNotes: DashDayNote[];
  noteCount: number;
  chess: HomeChessData;
  talk: HomeTalkLang[];
  words: HomeWordLang[];
  chart: DeskChart | null;
  index: DeskDomain[];
  stats: { notes: number; paths: number; languages: number; links: number };
}) {
  const locale = useLocale();
  const tr = (k: string, v?: Record<string, string | number>) => t(k, v, locale);
  const shortName = (p: { slug: string; name: string }) => pathName(p, "title", locale);
  const nf = new Intl.NumberFormat(LOCALE_TAG[locale] ?? "fr-FR");
  const discName = (name: string) => {
    const k = disciplineKey(name);
    return k ? tr(k) : name;
  };

  const data = useHomeData(dataVersion);
  const store = useReadingStore();
  const due = useReviewDue();
  const me = usePersonal(store);
  const ret = useRetention();
  const chats = useChats();
  const word = useWordOfDay(words);
  const chessCard = useChessCard(chess);
  const [question, setQuestion] = useState("");
  const [talkPick, setTalkPick] = useState<{ lang: string; level: string }>({ lang: "es", level: "a2" });
  useEffect(() => {
    const c = lastChoice();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the stored language, read after hydration
    if (c && talk.some((l) => l.id === c.lang)) setTalkPick(c);
  }, [talk]);

  // The masthead's "Sciences sociales / appliquées" jump to their group of
  // the contents here (the tablet tree that owns those anchors is hidden).
  useEffect(() => {
    const go = () => {
      const h = decodeURIComponent(location.hash.slice(1));
      if (!matchMedia("(min-width: 1024px)").matches) return;
      const el = h && document.getElementById(`hd-${h}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, []);

  const resume = useMemo(() => resumePath(data, store), [data, store]);
  const first = !resume;
  const rows = useMemo(
    () =>
      paths.map((p, i) => {
        const read = p.slugs.filter((slug) => store[slug]?.r != null).length;
        return { ...p, read, total: p.slugs.length, i };
      }),
    [paths, store],
  );
  const mine = rows
    .filter((p) => p.read > 0 && p.read < p.total && p.slug !== resume?.path.slug)
    .sort((a, b) => b.read / b.total - a.read / a.total);
  const discover = mixFamilies(rows.filter((p) => p.read === 0).sort((a, b) => b.total - a.total || a.i - b.i));
  const pathCards = [...mine.slice(0, 2).map((p) => ({ p, mine: true })), ...discover.map((p) => ({ p, mine: false }))].slice(0, 6);

  const fading = rows
    .flatMap((p) =>
      p.levels.map((lv) => {
        let n = 0;
        let last: string | null = null;
        for (const slug of p.slugs.slice(lv.from, lv.to)) {
          const r = ret.get(slug);
          if (!r) continue;
          n += r.due;
          if (r.last && (!last || r.last > last)) last = r.last;
        }
        return { path: p, lv, due: n, last };
      }),
    )
    .filter((x) => x.due > 0)
    .sort((a, b) => (a.last ?? "").localeCompare(b.last ?? ""));
  const fadingDue = fading.reduce((n, x) => n + x.due, 0);
  const fadingPaths = new Set(fading.map((x) => x.path.slug)).size;
  const todayKey = dayKey();

  const hour = me?.now.getHours() ?? 12;
  const greeting = first ? "dash.hiFirst" : hour >= 18 || hour < 5 ? "dash.hiEvening" : "dash.hiDay";
  const dayNote = me && dayNotes.length ? dayNotes[Math.floor(me.now.getTime() / 86_400_000 - me.now.getTimezoneOffset() / 1440) % dayNotes.length] : (dayNotes[0] ?? null);
  const week = useMemo(() => (me ? thisWeek(me.now) : []), [me]);
  const today = me ? localDay(me.now) : "";
  const weekLetters = tr("dash.weekLetters").split("|");
  // Minutes read this week: the notes finished since Monday that a path
  // knows the length of.
  const weekMinutes = useMemo(() => {
    if (!data || !week.length) return 0;
    const minutes = new Map<string, number>();
    for (const p of data.paths) for (const [slug, , m] of p.notes) minutes.set(slug, m);
    let sum = 0;
    for (const [slug, e] of Object.entries(store)) {
      if (e.r == null || !minutes.has(slug)) continue;
      if (localDay(new Date(e.r * 1000)) >= week[0]) sum += minutes.get(slug)!;
    }
    return sum;
  }, [data, store, week]);
  const art = paintingFor(resume?.path.family, resume?.slug);

  // Talk card: the partner of the level last practised.
  const talkLang = talk.find((l) => l.id === talkPick.lang) ?? talk[0];
  const LEVELS = ["a1", "a2", "b1", "b2"];
  const partner = talkLang ? (talkLang.partners[Math.max(0, LEVELS.indexOf(talkPick.level))] ?? talkLang.partners[1]) : "";
  const otherLangs = talk.filter((l) => l.id !== talkLang?.id);

  const rel = (ms: number) => {
    const d = daysBetween(dayKey(new Date(ms)), todayKey);
    if (d <= 1) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-d, "day");
    if (d < 7) return new Intl.DateTimeFormat(LOCALE_TAG[locale] ?? "fr-FR", { weekday: "long" }).format(new Date(ms));
    return daysAgo(d, locale);
  };

  const weekDays = (
    <div className="hd-days" aria-hidden="true">
      {week.map((d, i) => {
        const on = !!me?.days[d] && (me.days[d].r > 0 || me.days[d].c > 0);
        return (
          <span key={d}>
            <i className={on ? "on" : d === today ? "now" : undefined}>
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
    </div>
  );

  const pct = resume ? pathShare(resume.read, resume.total, resume.pct) : 0;

  return (
    <section className="hd" data-pagefind-ignore data-first={first ? "" : undefined} aria-label={tr("nav.home")}>
      <div className="hd-hello">
        <div>
          <h2 data-ready={me ? "" : undefined}>
            {tr(greeting)} <em>{tr(`${greeting}Em`)}</em>
          </h2>
          {first && <p>{tr("dash.welcomeText", { n: nf.format(noteCount) })}</p>}
        </div>
        <button
          type="button"
          className="hd-search"
          data-palette-open
          aria-haspopup="dialog"
          aria-expanded="false"
          onKeyDown={(e) => {
            if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
            e.preventDefault();
            (window as unknown as { __palette?: { open: (q: string) => void } }).__palette?.open(e.key);
          }}
        >
          <Lens />
          <span>{tr("home.searchPlaceholder").replace(/^Rechercher u/, "U")}</span>
          <kbd>Ctrl K</kbd>
        </button>
      </div>

      {resume ? (
        <figure className="hd2-art" data-family={resume.path.family ?? undefined}>
          <a className="hd2-frame" href={`/posts/${resume.slug}/#reprendre`} aria-label={tr("dash.continueAria", { title: resume.title })}>
            <picture>
              <source type="image/avif" srcSet={srcSet(art.src, "avif")} sizes="min(1070px, 92vw)" />
              <img src={`${art.src}.webp`} srcSet={srcSet(art.src, "webp")} sizes="min(1070px, 92vw)" alt="" title={art.credit} decoding="async" fetchPriority="high" />
            </picture>
            <span className="hd-chip">
              <span>
                <FamilyIcon family={resume.path.family} />
              </span>
              {tr("dash.stepOf", { path: shortName(resume.path), n: resume.step, total: resume.total })}
            </span>
            <span className="hd2-cap">
              <small>{tr("desk.nextStep", { m: resume.left })}</small>
              <b>{resume.title}</b>
              <span className="hd2-row">
                <span className="hd2-prog">
                  <i style={{ "--w": `${pct}%` } as CSSProperties} />
                  {resume.step} / {resume.total}
                </span>
                <span className="hd-go">
                  <Play />
                  {tr("dash.resumeCta")}
                </span>
              </span>
            </span>
          </a>
          <figcaption>
            {art.by && `${art.by}, `}
            <i>{art.title}</i>, {art.note}. — {tr("dash.quote")}
          </figcaption>
        </figure>
      ) : (
        <figure className="hd2-art hd3-art">
          <div className="hd2-frame">
            <picture>
              <source type="image/avif" srcSet={srcSet(ERAGNY.src, "avif")} sizes={ERAGNY_SIZES} />
              <img src={`${ERAGNY.src}.webp`} srcSet={srcSet(ERAGNY.src, "webp")} sizes={ERAGNY_SIZES} alt="" decoding="async" fetchPriority="high" />
            </picture>
            <span className="hd2-cap">
              <small>{tr("desk.tagline")}</small>
              <b className="hd3-q">« {tr("dash.quote")} »</b>
              <span className="hd3-intro">{tr("desk.intro")}</span>
            </span>
          </div>
          <figcaption>
            {ERAGNY.by}, <i>{ERAGNY.title}</i>, {ERAGNY.note}. —{" "}
            <span lang="en">The Gardener</span>.
          </figcaption>
        </figure>
      )}

      {resume ? (
        <a className="hd-card hd2-week" href="/defis/">
          {weekDays}
          <div className="hd-goal">
            <b>{(me?.readToday ?? 0) >= DAILY_GOAL ? me!.readToday : `${me?.readToday ?? 0} / ${DAILY_GOAL}`}</b>
            {tr("dash.readToday")}
          </div>
          <div className="hd2-sep" />
          <div className="hd-goal">
            <b>{tr("dash.min", { m: weekMinutes })}</b>
            {tr("desk.weekMinText")}
          </div>
          <div className="hd-flame">
            <Flame />
            <b>{me?.run === 1 ? tr("dash.run1") : tr("dash.run", { n: me?.run ?? 0 })}</b> {tr("desk.runText")}
          </div>
        </a>
      ) : (
        <ul className="hd3-ways">
          <li className="main">
            <a href="/parcours/">
              <span className="hd-ic">
                <svg viewBox="0 0 24 24" aria-hidden="true" {...s}>
                  {WAYS.path}
                </svg>
              </span>
              <span className="tx">
                <b>{tr("dash.wayPath")}</b>
                <small>{tr("desk.wayPathText", { n: paths.length })}</small>
              </span>
            </a>
          </li>
          <li data-family="informatique">
            <a href="/graph/">
              <span className="hd-ic">
                <svg viewBox="0 0 24 24" aria-hidden="true" {...s}>
                  {WAYS.graph}
                </svg>
              </span>
              <span className="tx">
                <b>{tr("dash.wayGraph")}</b>
                <small>{tr("dash.wayGraphText")}</small>
              </span>
            </a>
          </li>
          <li data-family="pensee">
            <a href="/hasard/">
              <span className="hd-ic">
                <svg viewBox="0 0 24 24" aria-hidden="true" {...s}>
                  {WAYS.dice}
                </svg>
              </span>
              <span className="tx">
                <b>{tr("dash.wayRandom")}</b>
                <small>{tr("dash.wayRandomText")}</small>
              </span>
            </a>
          </li>
          <li data-family="langues">
            <a
              href="#demander"
              onClick={(e) => {
                e.preventDefault();
                ask({});
              }}
            >
              <span className="hd-ic">
                <svg viewBox="0 0 24 24" aria-hidden="true" {...s}>
                  {WAYS.ask}
                </svg>
              </span>
              <span className="tx">
                <b>{tr("dash.wayAsk")}</b>
                <small>{tr("dash.wayAskText")}</small>
              </span>
            </a>
          </li>
        </ul>
      )}

      {/* I. Today */}
      <Head
        n="I"
        title={tr(first ? "desk.start" : "dash.today")}
        hint={tr(first ? "desk.startHint" : "desk.todayHint")}
        link={{ href: "/hasard/", label: tr("dash.random") }}
      />
      <div className="hd-row r-75">
        {dayNote ? (
          <article className="hd-card hd-day" data-family={dayNote.family ?? undefined}>
            <p className="k">
              <FamilyIcon family={dayNote.family} />
              {discName(dayNote.discipline)} · {tr("dash.min", { m: dayNote.minutes })}
            </p>
            <h3>
              <a href={dayNote.href}>{dayNote.title}</a>
            </h3>
            <p className="lede">{dayNote.lede ?? dayNote.excerpt}</p>
            {dayNote.toc && dayNote.toc.length > 1 && (
              <div className="hd6-toc">
                <small>{tr("desk.inThisNote")}</small>
                <ol>
                  {dayNote.toc.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ol>
              </div>
            )}
            <div className="foot">
              {dayNote.path && (
                <span>
                  {tr("desk.inPath")} <a href={`/parcours/${encodeURIComponent(dayNote.path.slug)}/`}>{pathName(dayNote.path, "title", locale)}</a>
                </span>
              )}
              {!!dayNote.questions && <span>{dayNote.path ? "· " : ""}{tr(dayNote.questions === 1 ? "desk.questions1" : "desk.questions", { n: dayNote.questions })}</span>}
              <a className="read hd-go ghost" href={dayNote.href}>
                {tr("desk.readNote")}
              </a>
            </div>
          </article>
        ) : (
          <div />
        )}
        <div className="hd-col">
          {first && (
            <section className="hd-card hd3-how">
              <p className="k">{tr("desk.how")}</p>
              <ol>
                {[1, 2, 3].map((i) => (
                  <li key={i}>
                    <b>{tr(`desk.how${i}`)}</b>
                    <span>{tr(`desk.how${i}Text`)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {!first && due && (
            <a className="hd-card hd-tile" data-family="sciences" href={due.href}>
              <span className="hd-ic">
                <svg viewBox="0 0 24 24" aria-hidden="true" {...s} strokeWidth={1.9}>
                  <rect x="3" y="7" width="13" height="14" rx="2" />
                  <path d="M8 3h11a2 2 0 0 1 2 2v12" />
                </svg>
              </span>
              <span className="tx">
                <b>{tr(due.n === 1 ? "desk.cardsDue1" : "desk.cardsDue", { n: due.n })}</b>
                <small>{tr(due.decks === 1 ? "desk.cardsSub1" : "desk.cardsSub", { m: Math.max(1, Math.round((due.n * 25) / 60)), d: due.decks })}</small>
              </span>
              <em>{tr("desk.review")}</em>
            </a>
          )}
          {!first && fading.length > 0 && (
            <section className="hd-card hd-fade">
              <p className="k">
                <Refresh />
                {tr("dash.refresh")}
              </p>
              <h3>{tr(fading.length === 1 ? "dash.fadeOne" : "dash.fadeN", { n: fading.length })}</h3>
              <p>
                {tr(fadingPaths === 1 ? "dash.fadeSubOne" : "dash.fadeSub", { n: fadingDue, p: fadingPaths })}
                {fading.length > 1 && ` ${tr("dash.fadeOldest")}`}
              </p>
              <ul>
                {fading.slice(0, 3).map(({ path: p, lv, due: n, last }) => (
                  <li key={`${p.slug}:${lv.n}`} data-family={p.family ?? undefined}>
                    <a href={`/parcours/${encodeURIComponent(p.slug)}/`}>
                      <span className="hd-ic">
                        <Refresh />
                      </span>
                      <span className="tx">
                        <b>{lv.name}</b>
                        <small>
                          {shortName(p)} · {tr("parcours.level", { n: lv.n }).toLowerCase()}
                          {last ? ` · ${daysAgo(daysBetween(last, todayKey), locale)}` : ""}
                        </small>
                      </span>
                      <em>{n}</em>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {word && (
            <section className="hd-card hd-word" data-family="langues">
              <p className="k">
                <FamilyIcon family="langues" />
                {tr("desk.wordK", { lang: word.langName })}
              </p>
              <div className="row">
                <div className="w">
                  <b lang={word.lang.id} dir="auto">
                    {word.word.w}
                  </b>
                  <span>{word.word.tr ? `${word.word.tr} · ` : ""}{word.word.g}</span>
                </div>
                <button type="button" className={word.playing ? "is-playing" : undefined} onClick={word.play} aria-label={tr("dash.wordListen", { w: word.word.w })}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" {...s} strokeWidth={2}>
                    <path d="M11 5 6 9H3v6h3l5 4z" />
                    <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
                  </svg>
                </button>
                <a className="btn" href={word.word.href} aria-label={tr("dash.wordRepeat")}>
                  <Mic />
                </a>
              </div>
              {word.word.ex && (
                <p className="ex" lang={word.lang.id} dir="auto">
                  {word.word.ex}
                </p>
              )}
            </section>
          )}
        </div>
      </div>

      {/* II. Paths */}
      <Head
        n="II"
        title={tr("dash.paths")}
        hint={first || !mine.length ? tr("desk.pathsHintFirst", { n: paths.length }) : tr("desk.pathsHint", { m: mine.length + (resume ? 1 : 0), d: discover.length })}
        link={{ href: "/parcours/", label: tr("dash.seeAll") }}
      />
      {mine.length > 0 && (
        <div className="hd-paths-k" style={{ "--mine": Math.min(2, mine.length) } as CSSProperties}>
          <span>{tr("desk.mine")}</span>
          <span>{tr("desk.start")}</span>
        </div>
      )}
      <div className="hd-row hd-paths-row">
        <div className="hd-paths">
          {pathCards.map(({ p, mine: m }) => {
            const share = Math.round((100 * p.read) / p.total);
            return (
              <a key={p.slug} className={m ? "hd-path mine" : "hd-path"} data-family={p.family ?? undefined} href={`/parcours/${encodeURIComponent(p.slug)}/`}>
                <span className="hd-ic">
                  <FamilyIcon family={p.family} />
                </span>
                <b>{shortName(p)}</b>
                <small>
                  {m ? tr("desk.pathPct", { read: p.read, total: p.total, pct: share }) : `${tr("dash.notes", { n: p.total })}${p.cible ? ` · ${p.cible}` : ""}`}
                </small>
                {m && <span className="bar" style={{ "--w": `${share}%` } as CSSProperties} />}
              </a>
            );
          })}
        </div>
      </div>

      <div className="hd-row r-75">
        {/* III. Play */}
        <div>
          <Head n="III" title={tr("dash.play")} hint={tr("desk.playHint")} link={{ href: "/duel/", label: tr("dash.chessDuel") }} />
          <div className="hd-play">
            <article className="hd-card hd-pc">
              <a className="hd-band chess" href={chessCard.href} tabIndex={-1} aria-hidden="true">
                <span dangerouslySetInnerHTML={{ __html: chessCard.board }} />
              </a>
              <div className="body">
                <b>{tr("dash.chess")}</b>
                <small>{chessCard.saved ? chessCard.sub : tr("desk.chessSub")}</small>
                <div className="levels">
                  {chess.levels.map((l) => (
                    <a key={l.id} href={`/echecs/#jouer=${l.id}`} className={l.id === chessCard.level ? "on" : undefined}>
                      {tr(`chess.lv_${l.id}`)}
                      {l.id === chessCard.level ? ` · ${l.elo}` : ""}
                    </a>
                  ))}
                </div>
                <a className="hd-go" href={chessCard.href}>
                  {tr(chessCard.saved ? "dash.chessResumeShort" : "dash.chessGo")}
                  <Arrow />
                </a>
              </div>
            </article>
            {talkLang && (
              <article className="hd-card hd-pc">
                <a className="hd-band talk" href={`/parler/#lang=${talkLang.id}`} tabIndex={-1} aria-hidden="true">
                  <span className="hd-av">{partner[0]}</span>
                  <span className="hd-bubble">
                    <span lang={talkLang.id} dir="auto">
                      {talkLang.line}
                    </span>
                    <small>{tr("dash.talkAt", { name: partner })}</small>
                  </span>
                </a>
                <div className="body">
                  <b>{tr("dash.talk")}</b>
                  <small>{tr("desk.talkSub")}</small>
                  <div className="hd-langs">
                    <a className="on" href={`/parler/#lang=${talkLang.id}`}>
                      {tr(`parler.lang_${talkLang.id}`)} {talkPick.level.toUpperCase()}
                    </a>
                    {otherLangs.slice(0, 2).map((l) => (
                      <a key={l.id} href={`/parler/#lang=${l.id}`}>
                        {tr(`parler.lang_${l.id}`)}
                      </a>
                    ))}
                    {otherLangs.length > 2 && <a href="/parler/">+ {otherLangs.length - 2}</a>}
                  </div>
                  <a className="hd-go" href={`/parler/#lang=${talkLang.id}`}>
                    <Mic />
                    {tr("dash.talk")}
                  </a>
                </div>
              </article>
            )}
          </div>
        </div>

        {/* IV. Ask the garden */}
        <div className="hd-stack">
          <Head n="IV" title={tr("dash.wayAsk")} link={{ href: "#demander", label: tr("desk.myQuestions"), onClick: () => ask({ view: "history" }) }} />
          <section id="hd-demander" className="hd-card hd-ask">
            <p>
              {tr("dash.askIntro", { n: "\u0000" })
                .split("\u0000")
                .flatMap((part, i) => (i ? [<b key={i}>{tr("dash.notes", { n: nf.format(noteCount) })}</b>, part.replace(/^ notes/, "")] : [part]))}{" "}
              {tr(first ? "desk.askPrivateFirst" : "desk.askPrivate")}
            </p>
            <form
              className="f"
              onSubmit={(e) => {
                e.preventDefault();
                const q = question.trim();
                if (!q) return;
                ask({ question: q });
                setQuestion("");
              }}
            >
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={1000}
                autoComplete="off"
                placeholder={tr("dash.askPlaceholder")}
                aria-label={tr("home.askAria")}
              />
              <button type="submit" aria-label={tr("desk.askSend")}>
                <svg viewBox="0 0 24 24" aria-hidden="true" {...s} strokeWidth={2.4}>
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            </form>
            <div className="hd-chips">
              {tr("dash.askChips")
                .split("|")
                .map((q) => (
                  <button key={q} type="button" onClick={() => ask({ question: q })}>
                    {q}
                  </button>
                ))}
            </div>
            {!first && chats.length > 0 && (
              <div className="hist">
                <small>{tr("desk.resume")}</small>
                {chats.slice(0, 2).map((c) => (
                  <button key={c.id} type="button" onClick={() => ask({ resume: c.id })}>
                    {c.title}
                    <span>
                      {c.note?.discipline ? `${discName(c.note.discipline)} · ` : ""}
                      {rel(c.updated)}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="modes">
              <button type="button" className="on" onClick={() => ask({ mode: "answer" })}>
                {tr("desk.modeAnswer")}
              </button>
              <button type="button" onClick={() => ask({ mode: "socratic" })}>
                {tr("desk.modeSocratic")}
              </button>
              <button type="button" onClick={() => ask({ mode: "own" })}>
                {tr("desk.modeOwn")}
              </button>
            </div>
          </section>
        </div>
      </div>

      <div className="hd-row r-57">
        {/* V. Latest notes: five, so the card is as tall as the chart beside
            it (three left it half empty). The phone keeps three. */}
        <div className="hd-stack">
          <Head n="V" title={tr("dash.recent")} link={{ href: "/jardin/", label: tr("dash.seeAll") }} />
          <section className="hd-card hd-recent">
            <ul className="hd-list">
              {recent.slice(0, 5).map((n) => (
                <li key={n.href} data-family={n.family ?? undefined}>
                  <a href={n.href}>
                    <span className="hd-ic">
                      <FamilyIcon family={n.family} />
                    </span>
                    <span className="tx">
                      <b>{n.title}</b>
                      <small>
                        {discName(n.discipline)} · {tr("dash.min", { m: n.minutes })}
                        {n.fresh && <span className="hd-new">{tr("dash.new")}</span>}
                      </small>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            <div className="hd-list-foot">
              <a href="/feed.xml">{tr("desk.rss")}</a>
              <a href="/jardin/">{tr("desk.numbers")}</a>
            </div>
          </section>
        </div>

        {/* VI. One chart */}
        {chart && (
          <div className="hd-stack">
            <Head n="VI" title={tr("desk.chartTitle")} link={{ href: chart.folder, label: tr("desk.allCharts") }} />
            <article className="hd-card hd-chart hd6-chart" data-family={chart.family ?? undefined}>
              <div>
                <h3>
                  <a href={chart.href}>{chart.title}</a>
                </h3>
                <p>{chart.lede}</p>
                <small>
                  {new Intl.DateTimeFormat(LOCALE_TAG[locale] ?? "fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(chart.at))} · {chart.source}
                </small>
              </div>
              {chart.svg && <a className="svg" href={chart.href} tabIndex={-1} aria-hidden="true" dangerouslySetInnerHTML={{ __html: chart.svg }} />}
            </article>
          </div>
        )}
      </div>

      {/* VII. Contents */}
      <Head n="VII" title={tr("desk.index")} hint={tr("desk.indexHint")} link={{ href: "/notes/", label: tr("desk.browse") }} />
      <div className="hd-row hd6-som">
        <aside className="hd6-aside">
          <a className="hd6-map" href="/graph/">
            <span className="g">
              <LazyGraph graphData={data?.graph ?? null} />
            </span>
            <span className="cap">
              {tr("desk.mapTitle")}
              <small>{tr("desk.mapSub", { n: nf.format(stats.notes), l: nf.format(stats.links) })}</small>
            </span>
          </a>
          <ul className="hd6-ex">
            {[
              ["/graph/", "dash.graph", "desk.graphText"],
              ["/frise/", "dash.frise", "dash.friseText"],
              ["/carte/", "dash.map", "dash.mapText"],
              ["/themes/", "dash.themes", "dash.themesText"],
              ["/jardin/", "dash.numbers", "dash.numbersText"],
            ].map(([href, b, sm]) => (
              <li key={href}>
                <a href={href}>
                  <b>{tr(b)}</b>
                  <small>{tr(sm)}</small>
                </a>
              </li>
            ))}
          </ul>
        </aside>
        <div className="hd-index">
          {index.map((dom) => (
            <div key={dom.slug} id={`hd-${dom.slug}`}>
              <h3>
                <a href={`/notes/${dom.slug}/`}>{tr(dom.name)}</a> <span>{tr("dash.notes", { n: nf.format(dom.count) })}</span>
              </h3>
              <ul>
                {dom.items.map((d) => (
                  <li key={d.slug}>
                    <a href={`/disciplines/${d.slug}/`}>{discName(d.name)}</a>
                    <span>{d.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <footer className="hd-colo">
        <details>
          <summary>
            <q>{tr("dash.aboutQuote")}</q>
            <span className="by">
              <span lang="en">The Gardener</span> · {tr("dash.readMore")}
            </span>
          </summary>
          <p>
            {tr("home.intro1")} {tr("home.intro2")} {tr("home.intro3")}
          </p>
        </details>
        <a className="hd-stats" href="/jardin/">
          <span>
            <b>{nf.format(stats.notes)}</b>
            <small>{tr("dash.nNotes")}</small>
          </span>
          <span>
            <b>{nf.format(stats.paths)}</b>
            <small>{tr("dash.nPaths")}</small>
          </span>
          <span>
            <b>{nf.format(stats.languages)}</b>
            <small>{tr("dash.nLangs")}</small>
          </span>
        </a>
        <p className="hd-lic">
          <a className="cc" href="https://creativecommons.org/licenses/by-nc-sa/4.0/">
            CC BY-NC-SA
          </a>{" "}
          © {new Date().getFullYear()} The Gardener
          <br />
          <a href="https://www.gnu.org/licenses/gpl-3.0.html">{tr("dash.footerCode")}</a> · <a href="/progression/">{tr("desk.progress")}</a>
        </p>
      </footer>
    </section>
  );
}
