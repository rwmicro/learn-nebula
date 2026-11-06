"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { addDays, dayKey, forecast, type CardState } from "@/lib/srs";
import { deckSettings, loadSettings } from "@/lib/srs-settings";
import { dueQuestions, loadAllNoteDecks } from "@/lib/note-quiz";
import { deckMastery, isStarted, loadDeckProgress, quickCounts, storageOk } from "@/lib/review-item";
import { loadLog, successRate, type ReviewLog } from "@/lib/srs-log";
import { calendarDays, currentRun, loadActivity } from "@/lib/personal";
import { loadStore } from "@/lib/reading-progress";
import { htmlText } from "@/lib/deck-cards";
import { artStrip, levelArt } from "@/lib/road-art";
import type { PathFamily } from "@/lib/path-family";
import type { PhoneDeck } from "@/components/review/CartesPhone";

// "Réviser" from 1024px (cartes-desk.css shows it and hides the phone list
// it stands in for): the desk (today's figures, "Tout réviser", the pile of
// today's cards with the first question on top), the year of reviews day by
// day beside the week to come, then the decks by subject, each with its
// discipline's picture and drawings, and the reader's own questions. Every
// figure comes from this browser's storage, after hydration; the static HTML
// is the desk with its links and the decks without counts.

type Count = { due: number; fresh: number; paused: boolean; started: boolean; known: number; total: number };

const SECONDS_PER_CARD = 10;
const WEEKS = 53;

/** Reviews on a day → the shade of its square (0 = none). */
const shade = (n: number) => (n <= 0 ? 0 : n < 10 ? 1 : n < 25 ? 2 : n < 50 ? 3 : 4);

/** Longest run of consecutive days with at least one review. */
function bestRun(log: ReviewLog): number {
  const days = Object.keys(log).sort();
  let best = 0;
  let run = 0;
  let prev = "";
  for (const d of days) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** Monday of the week holding `day` ("YYYY-MM-DD"). */
function monday(day: string): string {
  const wd = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -wd);
}

const PLAY = (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.8l-10-6.5A1 1 0 0 0 8 5.5Z" />
  </svg>
);
const CHEV = (
  <svg className="cdk-chev" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 5 7 7-7 7" />
  </svg>
);
const ico = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

export function CartesDesk({ decks }: { decks: PhoneDeck[] }) {
  const locale = useLocale();
  const tr = (k: string, v?: Record<string, string | number>) => t(k, v, locale);
  const [counts, setCounts] = useState<Record<string, Count> | null>(null);
  const [notes, setNotes] = useState(0);
  const [top, setTop] = useState<{ kind: "q"; text: string; from: string } | { kind: "deck"; label: string; n: number } | null>(null);
  const [run, setRun] = useState(0);
  const [log, setLog] = useState<ReviewLog>({});
  const [week, setWeek] = useState<number[]>([]);
  const [today, setToday] = useState("");

  useEffect(() => {
    if (!storageOk()) return;
    const day = dayKey();
    const s = loadSettings();
    const out: Record<string, Count> = {};
    const states: CardState[] = [];
    for (const d of decks) {
      const cfg = deckSettings(s, d.slug);
      const p = loadDeckProgress(d.slug);
      const m = deckMastery(p, d.count, cfg);
      out[d.slug] = {
        ...quickCounts(p, d.count, cfg, day),
        paused: cfg.paused,
        started: isStarted(p),
        known: m.known,
        total: m.known + m.learning + m.unseen,
      };
      if (!cfg.paused) states.push(...Object.values(p.cards));
    }
    const noteDecks = loadAllNoteDecks(localStorage);
    const dueQ = dueQuestions(noteDecks, day);
    for (const nd of Object.values(noteDecks)) states.push(...Object.values(nd.cards));
    const reads = Object.values(loadStore())
      .map((e) => e.r)
      .filter((r): r is number => typeof r === "number");
    // The pile's top card: the first saved question due, else the deck with
    // the most to do (its cards live in a JSON too big to fetch for this).
    const busiest = decks
      .filter((d) => out[d.slug].started && !out[d.slug].paused)
      .sort((a, b) => out[b.slug].due + out[b.slug].fresh - (out[a.slug].due + out[a.slug].fresh))[0];
    setTop(
      dueQ.length
        ? { kind: "q", text: htmlText(dueQ[0].item.q), from: dueQ[0].item.title }
        : busiest && out[busiest.slug].due + out[busiest.slug].fresh > 0
          ? { kind: "deck", label: busiest.label, n: out[busiest.slug].due + out[busiest.slug].fresh }
          : null,
    );
    setCounts(out);
    setNotes(dueQ.length);
    setRun(currentRun(calendarDays(loadActivity(), reads)));
    setLog(loadLog());
    setWeek(forecast(states, day, 7));
    setToday(day);
  }, [decks]);

  let due = notes;
  let fresh = 0;
  for (const c of Object.values(counts ?? {}))
    if (c.started && !c.paused) {
      due += c.due;
      fresh += c.fresh;
    }
  const total = due + fresh;
  const minutes = Math.max(1, Math.round((total * SECONDS_PER_CARD) / 60));
  const load = (d: PhoneDeck) => {
    const c = counts?.[d.slug];
    return !c?.started ? -2 : c.paused ? -1 : c.due + c.fresh;
  };
  const dueOf = (d: PhoneDeck) => {
    const c = counts?.[d.slug];
    return c && c.started && !c.paused ? c.due + c.fresh : 0;
  };

  // Subjects (a language, a discipline), the busiest first.
  const bySubject = new Map<string, PhoneDeck[]>();
  for (const d of [...decks].sort((a, b) => load(b) - load(a) || a.label.localeCompare(b.label)))
    bySubject.set(d.group, [...(bySubject.get(d.group) ?? []), d]);
  const groups = [...bySubject].sort(
    ([a, x], [b, y]) => Math.max(...y.map(load)) - Math.max(...x.map(load)) || a.localeCompare(b),
  );

  // The calendar: WEEKS columns of seven days, Monday on top, this week last.
  // Until the effect has read today's date, nothing dated is drawn: the build
  // ran on another day, and a text that differs from the static HTML makes
  // React rebuild the whole document on hydration, dropping <html data-theme>
  // (the reader's theme fell back to Auto on this page).
  const dated = today !== "";
  const end = today || "2000-01-03";
  const first = addDays(monday(end), -7 * (WEEKS - 1));
  const cells: { day: string; n: number; future: boolean }[] = [];
  for (let i = 0; i < WEEKS * 7; i++) {
    const day = addDays(first, i);
    cells.push({ day, n: log[day]?.[0] ?? 0, future: day > end });
  }
  const months: { col: number; label: string }[] = [];
  for (let w = 0; w < WEEKS; w++) {
    const day = addDays(first, w * 7);
    const prev = w ? addDays(first, (w - 1) * 7) : "";
    if (!prev || prev.slice(5, 7) !== day.slice(5, 7))
      months.push({ col: w, label: new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, { month: "short", timeZone: "UTC" }) });
  }
  const yearReviews = cells.reduce((n, c) => n + c.n, 0);
  const rate = successRate(log, end, 30);
  const known = Object.values(counts ?? {}).reduce((n, c) => n + c.known, 0);
  const best = bestRun(log);
  const weekMax = Math.max(1, ...week);

  const state = counts === null ? "loading" : total > 0 ? "due" : Object.values(counts).some((c) => c.started) ? "done" : "new";

  return (
    <div className="cdk" data-pagefind-ignore>
      <section className="cdk-desk">
        <div className="cdk-desk-txt">
          <p className="cdk-kicker">{tr("cdk.kicker")}</p>
          <h1 className="cdk-title">{tr("tabbar.review")}</h1>
          <p className="cdk-sub">{tr("cdk.sub")}</p>
          <dl className="cdk-meta">
            <div className="is-due">
              <dt>{tr("cdk.due")}</dt>
              <dd>{counts ? due : "—"}</dd>
            </div>
            <div className="is-new">
              <dt>{tr("cdk.fresh")}</dt>
              <dd>{counts ? fresh : "—"}</dd>
            </div>
            <div>
              <dt>{tr("cdk.duration")}</dt>
              <dd>{counts ? tr("cdk.minutes", { n: total ? minutes : 0 }) : "—"}</dd>
            </div>
            <div>
              <dt>{tr("cdk.runLabel")}</dt>
              <dd>{tr("cdk.run", { n: run })}</dd>
            </div>
          </dl>
          <p className="cdk-actions">
            {state === "new" ? (
              <a className="cdk-go" href="#cdk-decks">
                {tr("rv.startGo")}
              </a>
            ) : state === "done" ? (
              <a className="cdk-go" href="/cartes/entrainer/">
                {tr("rv.doneGo")}
              </a>
            ) : (
              <a className="cdk-go" href="/cartes/aujourdhui/">
                {PLAY}
                {tr("cartesIndex.today")}
                {total > 0 && <small>{tr("cdk.goCards", { n: total })}</small>}
              </a>
            )}
            <a className="cdk-alt" href="/cartes/entrainer/">
              {tr("cdk.practice")}
            </a>
          </p>
        </div>

        <a className="cdk-pile" href={state === "due" ? "/cartes/aujourdhui/" : "#cdk-decks"} aria-label={tr("cartesIndex.today")}>
          <span className="cdk-k" aria-hidden="true" />
          <span className="cdk-k" aria-hidden="true" />
          <span className="cdk-k" aria-hidden="true" />
          <span className="cdk-k cdk-top">
            {top?.kind === "q" ? (
              <>
                <span className="cdk-tag">{top.from}</span>
                <span className="cdk-q">{top.text}</span>
                <span className="cdk-hint">{tr("cdk.flip")}</span>
              </>
            ) : top?.kind === "deck" ? (
              <>
                <span className="cdk-tag">{tr("cdk.next")}</span>
                <span className="cdk-q">{top.label}</span>
                <span className="cdk-hint">{tr("rv.due", { n: top.n })}</span>
              </>
            ) : (
              <>
                <span className="cdk-tag">{tr("rv.today")}</span>
                <span className="cdk-q">{state === "done" ? tr("rv.doneTitle") : tr("rv.startTitle")}</span>
                <span className="cdk-hint">{state === "done" ? tr("rv.doneGo") : tr("rv.startGo")}</span>
              </>
            )}
          </span>
          {total > 0 && (
            <span className="cdk-stamp" aria-hidden="true">
              <b>{total}</b>
              <span>{tr("cdk.today")}</span>
            </span>
          )}
        </a>
      </section>

      <div className="cdk-mem">
        <section className="cdk-card">
          <h2 className="cdk-card-h">
            {tr("cdk.memory")} <span>{tr("cdk.memoryHint")}</span>
          </h2>
          <div className="cdk-heat" style={{ "--wk": WEEKS } as React.CSSProperties} role="img" aria-label={tr("cdk.memoryAria", { n: yearReviews })}>
            {cells.map((c) => (
              <i
                key={c.day}
                className={!dated ? "l0" : c.future ? "is-future" : c.day === end ? `l${shade(c.n)} is-today` : `l${shade(c.n)}`}
                title={!dated || c.future ? undefined : `${new Date(`${c.day}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "long", timeZone: "UTC" })} · ${c.n}`}
              />
            ))}
          </div>
          <div className="cdk-months" style={{ "--wk": WEEKS } as React.CSSProperties} aria-hidden="true">
            {(dated ? months : []).map((m) => (
              <span key={m.col} style={{ gridColumnStart: m.col + 1 }}>
                {m.label}
              </span>
            ))}
          </div>
          <p className="cdk-figs">
            <span>
              <b>{yearReviews.toLocaleString(locale)}</b> {tr("cdk.reviews")}
            </span>
            <span>
              <b>{rate.reviews ? `${Math.round((rate.ok / rate.reviews) * 100)} %` : "—"}</b> {tr("cdk.kept")}
            </span>
            <span>
              <b>{known.toLocaleString(locale)}</b> {tr("cdk.known")}
            </span>
            <span>
              <b>{tr("cdk.run", { n: best })}</b> {tr("cdk.best")}
            </span>
          </p>
        </section>
        <section className="cdk-card">
          <h2 className="cdk-card-h">
            {tr("cdk.week")} <span>{tr("cdk.weekHint")}</span>
          </h2>
          <ol className="cdk-week">
            {(week.length ? week : new Array(7).fill(0)).map((n: number, i) => (
              <li key={i} className={i === 0 ? "is-today" : undefined}>
                <em>{n}</em>
                <i style={{ height: `${Math.max(3, (n / weekMax) * 100)}%` }} />
                <span>
                  {i === 0
                    ? tr("cdk.todayShort")
                    : dated
                      ? new Date(`${addDays(end, i)}T12:00:00Z`).toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" })
                      : ""}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <h2 className="cdk-h" id="cdk-decks">
        <i>I</i>
        {tr("cdk.decks")}
        <span>{tr("cdk.decksHint")}</span>
      </h2>
      {decks.length === 0 ? (
        <p className="cdk-empty">{tr("cartesIndex.empty")}</p>
      ) : (
        <ul className="cdk-decks">
          {groups.map(([group, list]) => {
            const family = (list[0].family as PathFamily | null) ?? null;
            const n = list.reduce((s, d) => s + dueOf(d), 0);
            const cards = list.reduce((s, d) => s + d.count, 0);
            const kn = list.reduce((s, d) => s + (counts?.[d.slug]?.known ?? 0), 0);
            const tot = list.reduce((s, d) => s + (counts?.[d.slug]?.total ?? d.count), 0);
            const pct = tot ? Math.round((kn / tot) * 100) : 0;
            const one = list.length === 1;
            return (
              <li key={group} className="cdk-deck" data-family={family ?? undefined}>
                <a className="cdk-deck-top deco" href={`/cartes/${list[0].slug}/`} tabIndex={-1} aria-hidden="true">
                  {family && <span className="cdk-deck-img" style={{ backgroundImage: `url(/images/disciplines/${family}.webp)` }} />}
                  <span className="cdk-deck-art" dangerouslySetInnerHTML={{ __html: artStrip(levelArt(list[0].label, "", family)) }} />
                  {n > 0 && <span className="cdk-pill">{n}</span>}
                </a>
                <div className="cdk-deck-bd">
                  <div>
                    <a className="cdk-deck-name" href={`/cartes/${list[0].slug}/`}>
                      {one ? list[0].label : group}
                    </a>
                    <small>
                      {one ? "" : `${tr("rv.deckCount", { n: list.length })} · `}
                      {tr("cartesIndex.count", { count: cards.toLocaleString(locale) })}
                    </small>
                  </div>
                  <span className="cdk-ring" style={{ "--p": pct } as React.CSSProperties} role="img" aria-label={tr("cdk.ringAria", { n: pct })}>
                    <em>{pct}%</em>
                  </span>
                </div>
                {!one && (
                  <ul className="cdk-deck-list">
                    {list.slice(0, 4).map((d) => (
                      <li key={d.slug}>
                        <a href={`/cartes/${d.slug}/`}>
                          <span>{d.name}</span>
                          {dueOf(d) > 0 && <b>{dueOf(d)}</b>}
                          {CHEV}
                        </a>
                      </li>
                    ))}
                    {list.length > 4 && <li className="cdk-more">{tr("cdk.more", { n: list.length - 4 })}</li>}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="cdk-h">
        <i>II</i>
        {tr("rv.myQuestions")}
        <span>{tr("cdk.questionsHint")}</span>
      </h2>
      <ul className="cdk-q2">
        <li>
          <a href="/cartes/revision/">
            <span className="cdk-ico">
              {ico(
                <>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.4M12 17h.01" />
                </>,
              )}
            </span>
            <span className="cdk-tx">
              <b>{tr("rv.noteQuestions")}</b>
              <small>{tr("rv.noteQuestionsText")}</small>
            </span>
            <span className={notes ? "cdk-pill" : "cdk-pill is-soft"}>{notes}</span>
            {CHEV}
          </a>
        </li>
        <li>
          <a href="/cartes/entrainer/">
            <span className="cdk-ico">{ico(<path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z" />)}</span>
            <span className="cdk-tx">
              <b>{tr("rv.practice")}</b>
              <small>{tr("rv.practiceText")}</small>
            </span>
            {CHEV}
          </a>
        </li>
      </ul>
    </div>
  );
}
