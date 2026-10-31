"use client";

import { ART, levelArt } from "@/lib/road-art";
import type { PathFamily } from "@/lib/path-family";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { dayKey } from "@/lib/srs";
import { deckSettings, loadSettings } from "@/lib/srs-settings";
import { dueQuestions, loadAllNoteDecks } from "@/lib/note-quiz";
import { deckMastery, isStarted, loadDeckProgress, quickCounts, storageOk } from "@/lib/review-item";
import { calendarDays, currentRun, loadActivity } from "@/lib/personal";
import { loadStore } from "@/lib/reading-progress";

// "Réviser" on a phone (app.css shows it below 640px and hides the desktop
// index it stands in for): today's load on one green card with "Tout
// réviser", the note questions, the decks under way, then every deck grouped
// by subject (a language, a discipline) with how much of it is known. Counts
// come from this browser's storage, after hydration.

export interface PhoneDeck {
  slug: string;
  /** "Arabe libanais · Arabic for LS". */
  label: string;
  /** The deck's own name, without the subject: "Arabic for LS". */
  name: string;
  /** The subject it is listed under: "Arabe libanais", "Géographie". */
  group: string;
  count: number;
  family: string | null;
}

type Mastery = { known: number; learning: number; unseen: number };
type Count = { due: number; fresh: number; paused: boolean; started: boolean; m: Mastery };

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
const sum = (ms: (Mastery | undefined)[]): Mastery | null =>
  ms.some(Boolean)
    ? ms.reduce<Mastery>(
        (t, m) => (m ? { known: t.known + m.known, learning: t.learning + m.learning, unseen: t.unseen + m.unseen } : t),
        { known: 0, learning: 0, unseen: 0 },
      )
    : null;
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
      out[d.slug] = { ...quickCounts(p, d.count, cfg, today), paused: cfg.paused, started: isStarted(p), m: deckMastery(p, d.count, cfg) };
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

  // Subjects with something due first, then by name; decks likewise inside.
  const bySubject = new Map<string, PhoneDeck[]>();
  for (const d of sorted) bySubject.set(d.group, [...(bySubject.get(d.group) ?? []), d]);
  const groups = [...bySubject].sort(
    ([a, x], [b, y]) => Math.max(...y.map(load)) - Math.max(...x.map(load)) || a.localeCompare(b),
  );
  // Consecutive lone decks run together into one card.
  const blocks: PhoneDeck[][][] = [];
  for (const [, list] of groups) {
    const last = blocks[blocks.length - 1];
    if (list.length === 1 && last && last[0].length === 1) last.push(list);
    else blocks.push([list]);
  }
  const dueOf = (d: PhoneDeck) => {
    const c = counts?.[d.slug];
    return c && c.started && !c.paused ? c.due + c.fresh : 0;
  };
  // Known · being learned · never seen, as one bar; hidden until the first
  // card of the deck (or the subject) is graded.
  const bar = (m: Mastery) =>
    m.known + m.learning > 0 && (
      <span
        className="rv-bar"
        role="img"
        aria-label={tr("rv.masteryAria", { known: m.known, learning: m.learning, unseen: m.unseen })}
      >
        <i style={{ flexGrow: m.known }} />
        <i style={{ flexGrow: m.learning }} />
        <i style={{ flexGrow: m.unseen }} />
      </span>
    );
  const icon = (d: PhoneDeck) => {
    const art = levelArt(d.label, "", (d.family as PathFamily | null) ?? null)[0];
    return <span className="rv-ico rv-art deco" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ART[art] }} />;
  };
  const deckRow = (d: PhoneDeck, title: string, inGroup = false) => {
    const c = counts?.[d.slug];
    const n = dueOf(d);
    return (
      <a href={`/cartes/${d.slug}/`}>
        {!inGroup && icon(d)}
        <span className="rv-tx">
          <b>{title}</b>
          <small>
            {c?.paused
              ? tr("cartesIndex.paused")
              : c?.started
                ? n
                  ? tr("rv.due", { n })
                  : tr("rv.nothingToday")
                : tr("cartesIndex.count", { count: d.count.toLocaleString(locale) })}
          </small>
          {c && bar(c.m)}
        </span>
        {n > 0 && <span className="rv-pill">{n}</span>}
        {CHEV}
      </a>
    );
  };

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

      {started && (
        <>
          <h2 className="rv-h">{tr("rv.inProgress")}</h2>
          <ul className="rv-list rv-rows">
            {sorted
              .filter((d) => counts?.[d.slug]?.started)
              .map((d) => (
                <li key={d.slug} data-family={d.family ?? undefined}>
                  {deckRow(d, d.label)}
                </li>
              ))}
          </ul>
        </>
      )}

      <h2 className="rv-h" id="rv-decks">
        {tr("rv.decks")}
      </h2>
      {decks.length === 0 ? (
        <p className="rv-empty">{tr("cartesIndex.empty")}</p>
      ) : (
        // A subject of several decks is one card that folds them under the
        // subject's line, with the subject's bar; lone decks share a card,
        // one row each, so a vault of one-deck subjects stays short.
        <div className="rv-groups">
          {blocks.map((b) => {
            if (b.length > 1 || b[0].length === 1)
              return (
                <ul key={b[0][0].slug} className="rv-list rv-rows">
                  {b.map(([d]) => (
                    <li key={d.slug} data-family={d.family ?? undefined}>
                      {deckRow(d, d.label)}
                    </li>
                  ))}
                </ul>
              );
            const list = b[0];
            const group = list[0].group;
            const due = list.reduce((n, d) => n + dueOf(d), 0);
            const cards = list.reduce((n, d) => n + d.count, 0);
            const m = sum(list.map((d) => counts?.[d.slug]?.m));
            return (
              <details key={group} className="rv-list rv-grp" data-family={list[0].family ?? undefined}>
                <summary>
                  {icon(list[0])}
                  <span className="rv-tx">
                    <b>{group}</b>
                    <small>
                      {tr("rv.deckCount", { n: list.length })} ·{" "}
                      {due ? tr("rv.due", { n: due }) : tr("cartesIndex.count", { count: cards.toLocaleString(locale) })}
                    </small>
                    {m && bar(m)}
                  </span>
                  {CHEV}
                </summary>
                <ul className="rv-rows">
                  {list.map((d) => (
                    <li key={d.slug}>{deckRow(d, d.name, true)}</li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
