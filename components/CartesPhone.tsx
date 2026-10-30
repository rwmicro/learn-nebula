"use client";

import { drawer, levelArt } from "@/lib/road-art";
import type { PathFamily } from "@/lib/path-family";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { dayKey } from "@/lib/srs";
import { deckSettings, loadSettings } from "@/lib/srs-settings";
import { dueQuestions, loadAllNoteDecks } from "@/lib/note-quiz";
import { isStarted, loadDeckProgress, quickCounts, storageOk } from "@/lib/review-item";
import { calendarDays, currentRun, loadActivity } from "@/lib/personal";
import { loadStore } from "@/lib/reading-progress";

// "Réviser" on a phone (app.css shows it below 640px and hides the desktop
// index it stands in for): today's load on one green card with "Tout
// réviser", the note questions, then every deck as a row with what it has
// due. Counts come from this browser's storage, after hydration.

export interface PhoneDeck {
  slug: string;
  /** "Arabe libanais · Arabic for LS". */
  label: string;
  count: number;
  family: string | null;
}

type Count = { due: number; fresh: number; paused: boolean; started: boolean };

/** Seconds a card takes on average, for the "environ N min" estimate. */
const SECONDS_PER_CARD = 10;

const svg = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
const QUIZ = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.4M12 17h.01" />
  </>,
);
const CHEV = (
  <svg className="rv-chev" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 5 7 7-7 7" />
  </svg>
);

export function CartesPhone({ decks }: { decks: PhoneDeck[] }) {
  const locale = useLocale();
  const tr = (k: string, v?: Record<string, string | number>) => t(k, v, locale);
  const [counts, setCounts] = useState<Record<string, Count> | null>(null);
  const [notes, setNotes] = useState(0);
  const [saved, setSaved] = useState(0);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (!storageOk()) return;
    const today = dayKey();
    const s = loadSettings();
    const out: Record<string, Count> = {};
    for (const d of decks) {
      const cfg = deckSettings(s, d.slug);
      const p = loadDeckProgress(d.slug);
      out[d.slug] = { ...quickCounts(p, d.count, cfg, today), paused: cfg.paused, started: isStarted(p) };
    }
    setCounts(out);
    const noteDecks = loadAllNoteDecks(localStorage);
    setNotes(dueQuestions(noteDecks, today).length);
    setSaved(Object.values(noteDecks).reduce((n, d) => n + Object.keys(d.items).length, 0));
    const reads = Object.values(loadStore())
      .map((e) => e.r)
      .filter((r): r is number => typeof r === "number");
    setRun(currentRun(calendarDays(loadActivity(), reads)));
  }, [decks]);

  let due = notes;
  let fresh = 0;
  for (const c of Object.values(counts ?? {}))
    if (c.started && !c.paused) {
      due += c.due;
      fresh += c.fresh;
    }
  const total = due + fresh;
  const load = (d: PhoneDeck) => {
    const c = counts?.[d.slug];
    return !c?.started ? -2 : c.paused ? -1 : c.due + c.fresh;
  };
  const started = Object.values(counts ?? {}).some((c) => c.started);
  // Before the counts load (or without storage) the regular card shows.
  const state = counts === null ? "counts" : !started && saved === 0 ? "new" : total === 0 ? "done" : "counts";
  const sorted = [...decks].sort((a, b) => load(b) - load(a) || a.label.localeCompare(b.label));

  return (
    <div className="rv" data-pagefind-ignore>
      <h1 className="rv-title">{tr("tabbar.review")}</h1>

      {/* A fresh browser has nothing to count: one invitation instead of a
          row of zeros and a "Tout réviser" with nothing behind it. */}
      {state === "new" ? (
        <section className="rv-today rv-start">
          <p className="rv-kicker">{tr("rv.startKicker")}</p>
          <p className="rv-start-h">{tr("rv.startTitle")}</p>
          <p className="rv-start-p">{tr("rv.startText")}</p>
          <a className="rv-go" href="#rv-decks">
            {tr("rv.startGo")}
          </a>
        </section>
      ) : state === "done" ? (
        <section className="rv-today rv-start">
          <p className="rv-kicker">{tr("rv.today")}</p>
          <p className="rv-start-h">{tr("rv.doneTitle")}</p>
          <p className="rv-start-p">{tr("rv.doneText")}</p>
          <a className="rv-go" href="/cartes/entrainer/">
            {tr("rv.doneGo")}
          </a>
        </section>
      ) : (
      <section className="rv-today">
        <p className="rv-kicker">{tr("rv.today")}</p>
        <p className="rv-big">
          <b>{total}</b>
          <span>
            {tr("rv.cards", { count: total })}
            {total > 0 && ` · ${tr("rv.about", { n: Math.max(1, Math.round((total * SECONDS_PER_CARD) / 60)) })}`}
          </span>
        </p>
        <p className="rv-sub">
          <span>{tr("rv.due", { n: due })}</span>
          <span>{tr("rv.fresh", { n: fresh })}</span>
          <span className="rv-run">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
              <path d="M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.7 2-4.5 0 2 1 3 2 3 0-4 1-6.5 1-8.5z" />
            </svg>
            {tr("rv.days", { n: run })}
          </span>
        </p>
        <a className="rv-go" href="/cartes/aujourdhui/">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
            <path d="M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.8l-10-6.5A1 1 0 0 0 8 5.5Z" />
          </svg>
          {tr("cartesIndex.today")}
        </a>
      </section>
      )}

      <h2 className="rv-h">{tr("rv.myQuestions")}</h2>
      <ul className="rv-list">
        <li>
          <a href="/cartes/revision/">
            <span className="rv-ico">{QUIZ}</span>
            <span className="rv-tx">
              <b>{tr("rv.noteQuestions")}</b>
              <small>{tr("rv.noteQuestionsText")}</small>
            </span>
            <span className={`rv-pill${notes ? "" : " soft"}`}>{notes}</span>
            {CHEV}
          </a>
        </li>
        <li>
          <a href="/cartes/entrainer/">
            <span className="rv-ico">{svg(<path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z" />)}</span>
            <span className="rv-tx">
              <b>{tr("rv.practice")}</b>
              <small>{tr("rv.practiceText")}</small>
            </span>
            {CHEV}
          </a>
        </li>
      </ul>

      <h2 className="rv-h" id="rv-decks">{tr("rv.decks")}</h2>
      {decks.length === 0 ? (
        <p className="rv-empty">{tr("cartesIndex.empty")}</p>
      ) : (
        // Each deck as a seed drawer with its theme's drawing on the corner
        // (lib/road-art.ts), two to a row.
        <ul className="rv-decks">
          {sorted.map((d) => {
            const c = counts?.[d.slug];
            const n = c && c.started && !c.paused ? c.due + c.fresh : 0;
            const art = levelArt(d.label, "", (d.family as PathFamily | null) ?? null)[0];
            return (
              <li key={d.slug} data-family={d.family ?? undefined}>
                <a href={`/cartes/${d.slug}/`}>
                  <span className="rv-drawer deco" aria-hidden="true" dangerouslySetInnerHTML={{ __html: drawer(art) }} />
                  <b>{d.label}</b>
                  <small>
                    {c?.paused
                      ? tr("cartesIndex.paused")
                      : c?.started
                        ? n
                          ? tr("rv.due", { n })
                          : tr("rv.nothingToday")
                        : tr("cartesIndex.count", { count: d.count.toLocaleString(locale) })}
                  </small>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
