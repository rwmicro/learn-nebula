"use client";

import { useEffect, useMemo, useState } from "react";
import { t, disciplineKey } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { useHomeData, useReadingStore } from "@/components/HomeContent";
import { useReviewDue } from "@/components/AccountChip";
import { calendarDays, currentRun, loadActivity } from "@/lib/personal";
import { loadStore, type ReadingStore } from "@/lib/reading-progress";
import type { HomeData } from "@/lib/home-data";
import type { PathFamily } from "@/lib/path-family";

// The home as an app dashboard, on phones only (app.css hides it from 640px,
// and hides there the masthead's intro and painting it replaces):
// the painting as a banner with its line, "Reprendre" (the next step of the
// reading path in progress), today's cards to review and the run of days,
// the disciplines in a row that scrolls sideways, and the latest notes as a
// list. Everything personal is read from this browser, after hydration; the
// first paint shows the "start a path" card and zeros.

export interface DashRecent {
  title: string;
  href: string;
  discipline: string;
  family: PathFamily | null;
  minutes: number;
}

const s = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** One small glyph per colour family (lib/path-family.ts). */
export function FamilyIcon({ family }: { family: PathFamily | null }) {
  switch (family) {
    case "sciences":
      return (
        <svg viewBox="0 0 24 24" {...s}>
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          <ellipse cx="12" cy="12" rx="9" ry="3.6" />
          <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)" />
          <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)" />
        </svg>
      );
    case "informatique":
      return (
        <svg viewBox="0 0 24 24" {...s} strokeWidth={2.2}>
          <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />
        </svg>
      );
    case "vivant":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M5 19C5 10 10 5 20 4c-1 10-6 15-15 15Z" />
        </svg>
      );
    case "pensee":
      return (
        <svg viewBox="0 0 24 24" {...s}>
          <path d="M4 20h16M6 20V10M12 20V10M18 20V10M3 10l9-6 9 6" />
        </svg>
      );
    case "societe":
      return (
        <svg viewBox="0 0 24 24" {...s}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
        </svg>
      );
    case "arts":
      return (
        <svg viewBox="0 0 24 24" {...s}>
          <path d="M14 4l6 6-8 8-6-6z" />
          <path d="M6 12l-3 8 8-3" />
        </svg>
      );
    case "langues":
      return (
        <svg viewBox="0 0 24 24" {...s}>
          <path d="M4 5h9M8.5 3v2M6 5c1 4 4 7 7 8M11 5c-1 4-4 7-7 8M13 21l4-9 4 9M14.5 18h5" />
        </svg>
      );
    case "jeux":
      return (
        <svg viewBox="0 0 24 24" {...s}>
          <path d="M8 20h8M9 20l1-6-3-2 3-6h4l3 6-3 2 1 6" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" {...s}>
          <path d="M12 21v-8" />
          <path d="M12 14C7 14 4.5 11 4.5 6.5 9 6.5 12 9 12 14Z" fill="currentColor" />
          <path d="M12 12c0-4.5 3-7.5 7.5-7.5 0 4.5-3 7.5-7.5 7.5Z" fill="currentColor" opacity=".6" />
        </svg>
      );
  }
}

const Chevron = () => (
  <svg className="dash-chev" viewBox="0 0 24 24" aria-hidden="true" {...s} strokeWidth={2.4}>
    <path d="m9 5 7 7-7 7" />
  </svg>
);

/** The path to pick up: among those started and not finished, the one whose
 *  notes were last visited; its next step is its first unread note, with how
 *  far into it the reader got (the ring) and the minutes left. */
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
  const pct = Math.min(99, Math.round((store[slug]?.p ?? 0) / 10));
  const left = Math.max(1, Math.round(minutes * (1 - pct / 100)));
  return { path, slug, title, pct, left, step: i + 1, total: path.notes.length };
}

/** "Arabe libanais : des premiers mots à la culture" → "Arabe libanais". */
const shortName = (name: string) => name.split(/\s+:\s+/)[0];

export interface DashDiscipline {
  slug: string;
  name: string;
  count: number;
  family: PathFamily | null;
}

export function HomeDashboard({
  dataVersion,
  recent,
  disciplines,
}: {
  dataVersion: string;
  recent: DashRecent[];
  /** The largest first. */
  disciplines: DashDiscipline[];
}) {
  const locale = useLocale();
  const tr = (k: string, v?: Record<string, string | number>) => t(k, v, locale);
  const data = useHomeData(dataVersion);
  const store = useReadingStore();
  const due = useReviewDue();
  const [run, setRun] = useState(0);

  useEffect(() => {
    const load = () => {
      try {
        const reads = Object.values(loadStore())
          .map((e) => e.r)
          .filter((r): r is number => typeof r === "number");
        setRun(currentRun(calendarDays(loadActivity(), reads)));
      } catch {
        setRun(0);
      }
    };
    load();
    window.addEventListener("gk:activity", load);
    window.addEventListener("gk:progress-synced", load);
    return () => {
      window.removeEventListener("gk:activity", load);
      window.removeEventListener("gk:progress-synced", load);
    };
  }, []);

  const resume = useMemo(() => resumePath(data, store), [data, store]);
  const discName = (name: string) => {
    const k = disciplineKey(name);
    return k ? tr(k) : name;
  };

  return (
    <section className="dash" data-pagefind-ignore>
      <a className="dash-hero" href="/jardin/">
        <picture>
          <source type="image/avif" srcSet="/images/eragny.avif" />
          <img src="/images/eragny.webp" alt="" width="1200" height="950" decoding="async" />
        </picture>
        <span className="dash-hero-cap">
          <b>{tr("dash.quote")}</b>
          <span>{tr("dash.credit")}</span>
        </span>
      </a>

      <h2 className="dash-h">{tr("dash.resume")}</h2>
      {resume ? (
        <a
          className="dash-card dash-resume"
          href={`/posts/${resume.slug}/`}
          data-family={resume.path.family ?? undefined}
          aria-label={tr("dash.continueAria", { title: resume.title })}
        >
          <span
            className="dash-ring"
            style={{ "--p": resume.pct / 100 } as React.CSSProperties}
            aria-hidden="true"
          >
            <span>{resume.pct} %</span>
          </span>
          <span className="dash-resume-text">
            <span className="dash-kicker">
              {shortName(resume.path.name)} · {resume.step}/{resume.total}
            </span>
            <b>{resume.title}</b>
            <small>{tr("dash.left", { m: resume.left })}</small>
          </span>
          <span className="dash-play" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5.5v13l10.5-6.5z" />
            </svg>
          </span>
        </a>
      ) : (
        <a className="dash-card dash-resume" href="/parcours/" data-family="vivant">
          <span className="dash-ring dash-ring-start" aria-hidden="true">
            <svg viewBox="0 0 24 24" {...s}>
              <circle cx="6" cy="19" r="2" />
              <circle cx="18" cy="5" r="2" />
              <path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16" />
            </svg>
          </span>
          <span className="dash-resume-text">
            <b>{tr("dash.startTitle")}</b>
            <small>{tr("dash.startText")}</small>
          </span>
          <span className="dash-play" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5.5v13l10.5-6.5z" />
            </svg>
          </span>
        </a>
      )}

      {due || run > 0 ? (
        <div className="dash-tiles">
          <a className={`dash-tile${due ? " dash-tile-cta" : ""}`} href={due?.href ?? "/cartes/"}>
            <b>{due?.n ?? 0}</b>
            <span>{tr(due ? "dash.due" : "dash.dueNone")}</span>
          </a>
          <a className="dash-tile" href="/defis/">
            <b>
              <svg className="dash-flame" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.7 2-4.5 0 2 1 3 2 3 0-4 1-6.5 1-8.5z" />
              </svg>
              {run}
            </b>
            <span>{tr("dash.streak")}</span>
          </a>
        </div>
      ) : (
        /* Nothing due and no run yet: an invitation, not two zeros. */
        <a className="dash-invite" href="/cartes/">
          <span className="dash-invite-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" {...s} strokeWidth={1.8}>
              <rect x="3" y="7" width="13" height="14" rx="2" />
              <path d="M8 3h11a2 2 0 0 1 2 2v12" />
            </svg>
          </span>
          <span className="dash-invite-text">
            <b>{tr("dash.inviteTitle")}</b>
            <small>{tr("dash.inviteText")}</small>
          </span>
        </a>
      )}

      <div className="dash-row-h">
        <h2 className="dash-h">{tr("dash.disciplines")}</h2>
        <a href="/themes/">{tr("dash.seeAll")}</a>
      </div>
      <ul className="dash-disc">
        {disciplines.map((d) => (
          <li key={d.slug} data-family={d.family ?? undefined}>
            <a href={`/disciplines/${d.slug}/`}>
              <span className="dash-disc-icon" aria-hidden="true">
                <FamilyIcon family={d.family} />
              </span>
              <span>
                <b>{discName(d.name)}</b>
                <small>{tr("dash.notes", { n: d.count })}</small>
              </span>
            </a>
          </li>
        ))}
      </ul>

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
