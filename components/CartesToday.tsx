"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { dayKey } from "@/lib/srs";
import { deckSettings, loadSettings } from "@/lib/srs-settings";
import { dueQuestions, loadAllNoteDecks } from "@/lib/note-quiz";
import { loadDeckProgress, quickCounts, storageOk } from "@/lib/review-item";
import type { AnkiDeck } from "@/lib/anki";

type Counts = Record<string, { due: number; fresh: number; paused: boolean }>;

function readCounts(decks: AnkiDeck[]): { decks: Counts; notes: number } | null {
  if (!storageOk()) return null;
  const today = dayKey();
  const s = loadSettings();
  const out: Counts = {};
  for (const d of decks) {
    const cfg = deckSettings(s, d.slug);
    out[d.slug] = { ...quickCounts(loadDeckProgress(d.slug), d.count, cfg, today), paused: cfg.paused };
  }
  return { decks: out, notes: dueQuestions(loadAllNoteDecks(localStorage), today).length };
}

/**
 * The /cartes/ index's "Tout réviser" entry: today's total over every deck
 * that isn't paused and the saved note questions (localStorage only, so it
 * appears after hydration; the static HTML is just the link).
 */
export function CartesToday({ decks }: { decks: AnkiDeck[] }) {
  const locale = useLocale();
  const tr = (k: string, vars?: Record<string, string | number>) => t(`cartesIndex.${k}`, vars, locale);
  const [counts, setCounts] = useState<ReturnType<typeof readCounts>>(null);
  useEffect(() => setCounts(readCounts(decks)), [decks]);

  let due = counts?.notes ?? 0;
  let fresh = 0;
  for (const c of Object.values(counts?.decks ?? {}))
    if (!c.paused) {
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
          {due + fresh === 0
            ? tr("todayNothing")
            : tr("todayCounts", { due, fresh })}
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
