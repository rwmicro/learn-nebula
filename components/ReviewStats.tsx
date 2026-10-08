"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { addDays, dayKey, forecast, isLeech, type CardState } from "@/lib/srs";
import { loadLog, successRate } from "@/lib/srs-log";
import { loadAllNoteDecks } from "@/lib/note-quiz";
import { loadDeckProgress, storageOk } from "@/lib/review-item";
import type { AnkiDeck } from "@/lib/anki";

interface Stats {
  rate: { reviews: number; ok: number };
  next7: number[];
  /** Decks with leeches, most first; note questions under slug "". */
  leeches: { slug: string; name: string; n: number }[];
}

function readStats(decks: AnkiDeck[]): Stats | null {
  if (!storageOk()) return null;
  const today = dayKey();
  const states: CardState[] = [];
  const leeches: Stats["leeches"] = [];
  for (const d of decks) {
    const cards = Object.values(loadDeckProgress(d.slug).cards);
    states.push(...cards);
    const n = cards.filter((c) => isLeech(c) && !c.sus).length;
    if (n) leeches.push({ slug: d.slug, name: d.name, n });
  }
  let noteLeeches = 0;
  for (const nd of Object.values(loadAllNoteDecks(localStorage)))
    for (const id of Object.keys(nd.items)) {
      const c = nd.cards[id];
      if (!c) continue;
      states.push(c);
      if (isLeech(c) && !c.sus) noteLeeches++;
    }
  if (noteLeeches) leeches.push({ slug: "", name: "", n: noteLeeches });
  leeches.sort((a, b) => b.n - a.n);
  return { rate: successRate(loadLog(), today), next7: forecast(states, today, 7), leeches };
}

/**
 * /progression/'s review section: success rate over 30 days (from the daily
 * log, lib/srs-log.ts), the reviews coming over the next 7 days, and the
 * leeches — cards forgotten again and again — per deck, linking to the deck
 * page where they can be suspended. All from this browser's storage.
 */
export function ReviewStats({ decks }: { decks: AnkiDeck[] }) {
  const locale = useLocale();
  const tr = (k: string, vars?: Record<string, string | number>) => t(`progression.${k}`, vars, locale);
  const [s, setS] = useState<Stats | null | undefined>(undefined);
  useEffect(() => setS(readStats(decks)), [decks]);
  if (!s) return null;
  const today = dayKey();
  const max = Math.max(1, ...s.next7);
  const weekday = (i: number) =>
    i === 0
      ? tr("statsToday")
      : new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(`${addDays(today, i)}T12:00:00`));
  const pct = s.rate.reviews ? Math.round((100 * s.rate.ok) / s.rate.reviews) : null;

  return (
    <section className="progression-review" aria-labelledby="progression-review-title">
      <h2 id="progression-review-title" className="progression-h2">
        {tr("statsTitle")}
      </h2>
      <dl className="progression-stats progression-stats--review">
        <div className="progression-stat">
          <dt>{tr("statsRate")}</dt>
          <dd>{pct === null ? "–" : `${pct} %`}</dd>
        </div>
        <div className="progression-stat">
          <dt>{tr("statsReviews")}</dt>
          <dd>{s.rate.reviews.toLocaleString(locale)}</dd>
        </div>
        <div className="progression-stat">
          <dt>{tr("statsWeek")}</dt>
          <dd>{s.next7.reduce((a, b) => a + b, 0).toLocaleString(locale)}</dd>
        </div>
      </dl>

      <h3 className="progression-h3">{tr("statsForecast")}</h3>
      <ol className="progression-forecast" aria-label={tr("statsForecast")}>
        {s.next7.map((n, i) => (
          <li key={i}>
            <span className="progression-forecast-n">{n}</span>
            <span className="progression-forecast-bar" style={{ height: `${(100 * n) / max}%` }} />
            <span className="progression-forecast-day">{weekday(i)}</span>
          </li>
        ))}
      </ol>

      <h3 className="progression-h3">{tr("statsLeeches")}</h3>
      {s.leeches.length === 0 ? (
        <p className="progression-muted">{tr("statsNoLeech")}</p>
      ) : (
        <>
          <p className="progression-muted">{tr("statsLeechesIntro")}</p>
          <ul className="progression-leeches">
            {s.leeches.map((l) => (
              <li key={l.slug || "notes"}>
                <a href={l.slug ? `/cartes/${l.slug}/` : "/cartes/revision/"}>
                  {l.slug ? l.name : t("noteReview.title", undefined, locale)}
                </a>
                <span>{tr("statsLeechCount", { count: l.n })}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
