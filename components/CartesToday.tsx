"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { dayKey } from "@/lib/srs";
import { deckSettings, loadSettings } from "@/lib/srs-settings";
import { dueQuestions, loadAllNoteDecks } from "@/lib/note-quiz";
import { isStarted, loadDeckProgress, quickCounts, storageOk } from "@/lib/review-item";
import type { AnkiDeck } from "@/lib/anki";

type Counts = Record<string, { due: number; fresh: number; paused: boolean; started: boolean }>;

function readCounts(decks: AnkiDeck[]): { decks: Counts; notes: number } | null {
  if (!storageOk()) return null;
  const today = dayKey();
  const s = loadSettings();
  const out: Counts = {};
  for (const d of decks) {
    const cfg = deckSettings(s, d.slug);
    const p = loadDeckProgress(d.slug);
    out[d.slug] = { ...quickCounts(p, d.count, cfg, today), paused: cfg.paused, started: isStarted(p) };
  }
  return { decks: out, notes: dueQuestions(loadAllNoteDecks(localStorage), today).length };
}

/**
 * The /cartes/ index's "Tout réviser" entry: today's total over the decks
 * the reader has started (and not paused) and the saved note questions (localStorage only, so it
 * appears after hydration; the static HTML is just the link).
 */
export function CartesToday({ decks }: { decks: AnkiDeck[] }) {
  const locale = useLocale();
  const tr = (k: string, vars?: Record<string, string | number>) => t(`cartesIndex.${k}`, vars, locale);
  const [counts, setCounts] = useState<ReturnType<typeof readCounts>>(null);
  useEffect(() => setCounts(readCounts(decks)), [decks]);

  let due = counts?.notes ?? 0;
  let fresh = 0;
  let started = 0;
  for (const c of Object.values(counts?.decks ?? {}))
    if (c.started && !c.paused) {
      started++;
      due += c.due;
      fresh += c.fresh;
    }
  return (
    <section className="cartes-today">
      {/* A plain link, like the rest of /cartes/: next/link would make scripts/prune-rsc.mjs keep RSC payloads. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/cartes/aujourdhui/" className="cartes-today-btn">
        {tr("today")}
      </a>
      {counts && (
        <span className="cartes-today-count">
          {due + fresh > 0
            ? tr("todayCounts", { due, fresh })
            : started || counts.notes
              ? tr("todayNothing")
              : tr("todayStart")}
        </span>
      )}
    </section>
  );
}

/** One deck's "12 à revoir · 20 nouvelles" on the index (after hydration). */
export function DeckDue({ deck }: { deck: AnkiDeck }) {
  const locale = useLocale();
  const tr = (k: string, vars?: Record<string, string | number>) => t(`cartesIndex.${k}`, vars, locale);
  const [c, setC] = useState<{ due: number; fresh: number; paused: boolean } | null>(null);
  useEffect(() => {
    if (!storageOk()) return;
    const cfg = deckSettings(loadSettings(), deck.slug);
    const p = loadDeckProgress(deck.slug);
    // Never studied: the plain card count says enough.
    if (!Object.keys(p.cards).length && !cfg.paused) return;
    setC({ ...quickCounts(p, deck.count, cfg, dayKey()), paused: cfg.paused });
  }, [deck]);
  if (!c) return null;
  if (c.paused) return <span className="cartes-index-paused">{tr("paused")}</span>;
  if (!c.due && !c.fresh) return <span className="cartes-index-uptodate">{tr("upToDate")}</span>;
  return (
    <span className="cartes-index-due">
      {c.due > 0 && tr("deckDue", { count: c.due })}
      {c.due > 0 && c.fresh > 0 && " · "}
      {c.fresh > 0 && tr("deckFresh", { count: c.fresh })}
    </span>
  );
}

/**
 * "En cours" on the /cartes/ index: the decks the reader has started, most
 * to do first, so today's decks don't hide in the folder list below
 * (localStorage only: nothing in the static HTML).
 */
export function StartedDecks({ decks }: { decks: AnkiDeck[] }) {
  const locale = useLocale();
  const tr = (k: string, vars?: Record<string, string | number>) => t(`cartesIndex.${k}`, vars, locale);
  const [counts, setCounts] = useState<ReturnType<typeof readCounts>>(null);
  useEffect(() => setCounts(readCounts(decks)), [decks]);
  if (!counts) return null;
  const load = (d: AnkiDeck) => {
    const c = counts.decks[d.slug];
    return c.paused ? -1 : c.due + c.fresh;
  };
  const started = decks
    .filter((d) => counts.decks[d.slug]?.started)
    .sort((a, b) => load(b) - load(a) || a.name.localeCompare(b.name));
  if (!started.length) return null;
  return (
    <section className="cartes-index-group cartes-index-started">
      <h2 className="cartes-index-folder">{tr("started")}</h2>
      <ul className="cartes-index-list">
        {started.map((d) => (
          <li key={d.slug} className="cartes-index-deck">
            { }
            <a href={`/cartes/${d.slug}/`}>{d.name}</a>
            <span className="cartes-index-meta">
              <DeckDue deck={d} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
