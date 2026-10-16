"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { addDays, buildQueue, dayKey, grade as gradeCard, type Grade, type Progress } from "@/lib/srs";
import { fetchJsonPool } from "@/lib/fetch-pool";
import { deckSettings, loadSettings } from "@/lib/srs-settings";
import { migrateDeck, studyCards, type DeckData } from "@/lib/deck-cards";
import {
  dueQuestions,
  gradeQuestion,
  loadAllNoteDecks,
  saveNoteDeck,
  type NoteDeck,
} from "@/lib/note-quiz";
import {
  deckReviewItem,
  isStarted,
  loadDeckProgress,
  quickCounts,
  saveDeckProgress,
  storageOk,
  type Graded,
  type ReviewItem,
} from "@/lib/review-item";
import type { AnkiDeck } from "@/lib/anki";
import { ReviewSession } from "@/components/ReviewSession";
import { familyOfFolder } from "@/lib/path-family";
import { PRACTICE_SIZE, practicePick, shuffled, type PracticeMode } from "@/lib/practice";
import { AppBack } from "@/components/AppBack";
import { EmptyActions } from "@/components/EmptyActions";

/**
 * /cartes/aujourdhui/ — "Tout réviser": one session over everything due
 * today — every deck that isn't paused (its own settings: new cards per day,
 * sub-deck, tag, direction, typed answer) and the saved note questions.
 * Reviews first, most overdue first across all sources; then the new cards,
 * taken in turn from each deck so one big deck doesn't fill the session.
 *
 * Only decks the reader has started (at least one card graded on the deck
 * page) take part: nineteen decks' worth of new cards is nobody's session,
 * and each deck's JSON can be several MB. Those with something to study are
 * fetched a few at a time (lib/fetch-pool.ts: the host answers bursts with
 * 429). Progress is the same as on each deck page and on /cartes/revision/,
 * so studying here or there is the same thing.
 */
export function TodayReview({ decks, mode }: { decks: AnkiDeck[]; mode?: PracticeMode }) {
  const locale = useLocale();
  const tr = (k: string, vars?: Record<string, string | number>) => t(k, vars, locale);
  // null: loading; false: no storage.
  const [queue, setQueue] = useState<ReviewItem[] | null | false>(null);
  const [today] = useState(() => dayKey());
  const [failed, setFailed] = useState<string[]>([]);
  // Decks being fetched: [settled, total].
  const [loading, setLoading] = useState<[number, number] | null>(null);
  const [started, setStarted] = useState(0);
  const [hasNotes, setHasNotes] = useState(false);
  // A practice session that found nothing to practise.
  const [emptyStart, setEmptyStart] = useState(false);
  const progress = useRef(new Map<string, Progress>());
  const notes = useRef<Record<string, NoteDeck>>({});

  useEffect(() => {
    if (!storageOk()) {
      setQueue(false);
      return;
    }
    let cancel = false;
    const settings = loadSettings();
    const all = loadAllNoteDecks(localStorage);
    notes.current = all;
    setHasNotes(Object.keys(all).length > 0);
    // S'entraîner (lib/practice.ts): studied cards only, nothing rescheduled.
    const notePick = (st: Parameters<typeof practicePick>[1]) =>
      mode === "eclair" ? true : mode && mode !== "ecoute" ? practicePick(mode, st, today) : false;
    const reviews: ReviewItem[] = mode
      ? shuffled(
          Object.entries(all).flatMap(([slug, d]) =>
            Object.entries(d.items)
              .filter(([id]) => notePick(d.cards[id]))
              .map(([id, item]) => ({ kind: "note" as const, slug, id, item, state: d.cards[id] })),
          ),
        )
      : dueQuestions(all, today).map((d) => ({ kind: "note", ...d }));
    const begun = decks.filter((d) => isStarted(loadDeckProgress(d.slug)));
    setStarted(begun.length);
    const wanted = begun.filter((d) => {
      const cfg = deckSettings(settings, d.slug);
      if (mode === "eclair") return false;
      if (mode === "ecoute") return familyOfFolder(d.folder) === "langues";
      if (mode) return Object.values(loadDeckProgress(d.slug).cards).some((c) => practicePick(mode, c, today));
      if (cfg.paused) return false;
      const c = quickCounts(loadDeckProgress(d.slug), d.count, cfg, today);
      return c.due + c.fresh > 0;
    });
    if (wanted.length) setLoading([0, wanted.length]);
    fetchJsonPool<DeckData>(
      wanted.map((d) => `/anki/${d.slug}.json`),
      { onEach: (n) => !cancel && setLoading([n, wanted.length]) },
    ).then((datas) => {
      const loaded = wanted.map((d, i) => ({ d, data: datas[i] }));
      if (cancel) return;
      const fresh: ReviewItem[][] = [];
      const bad: string[] = [];
      for (const { d, data } of loaded) {
        if (!data) {
          bad.push(d.name);
          continue;
        }
        const cfg = deckSettings(settings, d.slug);
        const stored = loadDeckProgress(d.slug);
        const p = migrateDeck(stored, data);
        if (p !== stored) saveDeckProgress(d.slug, p);
        progress.current.set(d.slug, p);
        const sc = studyCards(data, cfg);
        if (mode) {
          for (const x of sc) {
            const st = p.cards[x.key];
            if (!practicePick(mode, st, today)) continue;
            const item = deckReviewItem(d.slug, data, x, { ...cfg, autoplay: cfg.autoplay || mode === "ecoute" }, st);
            if (mode === "ecoute" && !/pron-btn/.test(item.front + item.back)) continue;
            reviews.push(item);
          }
          continue;
        }
        const deckNew: ReviewItem[] = [];
        for (const i of buildQueue(
          sc.map((x) => x.key),
          p,
          today,
          cfg.newPerDay,
        )) {
          const item = deckReviewItem(d.slug, data, sc[i], cfg, p.cards[sc[i].key]);
          (item.state ? reviews : deckNew).push(item);
        }
        if (deckNew.length) fresh.push(deckNew);
      }
      // Reviews: most overdue first, wherever they come from (never-graded
      // note questions count as due today).
      reviews.sort((a, b) => (a.state?.due ?? today).localeCompare(b.state?.due ?? today));
      // New cards: one from each deck in turn.
      const interleaved: ReviewItem[] = [];
      for (let i = 0; fresh.some((f) => i < f.length); i++)
        for (const f of fresh) if (i < f.length) interleaved.push(f[i]);
      setFailed(bad);
      setLoading(null);
      const q = mode ? shuffled(reviews).slice(0, PRACTICE_SIZE[mode]) : [...reviews, ...interleaved];
      setEmptyStart(!!mode && q.length === 0);
      setQueue(q);
    });
    return () => {
      cancel = true;
    };
  }, [decks, today, mode]);

  const onGrade = useCallback(
    (head: ReviewItem, g: Grade): Graded | undefined => {
      // Practice leaves every schedule as it was.
      if (mode) return { state: head.state, undo: () => {} };
      if (head.kind === "note") {
        const before = notes.current[head.slug];
        if (!before) return undefined;
        const deck = gradeQuestion(before, head.id, g, today);
        notes.current = { ...notes.current, [head.slug]: deck };
        try {
          saveNoteDeck(localStorage, head.slug, deck);
        } catch {
          /* quota / blocked: the session keeps going in memory */
        }
        return {
          state: deck.cards[head.id],
          undo: () => {
            notes.current = { ...notes.current, [head.slug]: before };
            try {
              saveNoteDeck(localStorage, head.slug, before);
            } catch {
              /* storage gone */
            }
          },
        };
      }
      const before = progress.current.get(head.slug);
      if (!before) return undefined;
      const next = gradeCard(before, head.id, g, today);
      progress.current.set(head.slug, next);
      saveDeckProgress(head.slug, next);
      return {
        state: next.cards[head.id],
        undo: () => {
          progress.current.set(head.slug, before);
          saveDeckProgress(head.slug, before);
        },
      };
    },
    [today, mode],
  );

  // The "done" screen: what tomorrow already holds, from the same progress.
  const tomorrowLoad = () => {
    const tomorrow = addDays(today, 1);
    let n = dueQuestions(notes.current, tomorrow).length;
    for (const p of progress.current.values())
      for (const c of Object.values(p.cards)) if (c.due <= tomorrow && !c.sus) n++;
    return n;
  };
  const doneText = mode
    ? tr(emptyStart ? "practice.empty" : "practice.done")
    : queue && queue.length === 0 && started === 0 && !hasNotes
      ? tr("todayReview.nothingTitle")
      : tr("todayReview.done");

  return (
    <main id="main" className="flashcards-main note-review mx-auto max-w-[60rem] px-5 py-12 text-ink">
      {/* A plain link, like the rest of /cartes/: next/link would make scripts/prune-rsc.mjs keep RSC payloads. */}
      <AppBack href="/cartes/" labelKey="tabbar.review" />
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/cartes/"
        className="old-back text-micro font-semibold uppercase tracking-[0.1em] text-muted-warm no-underline hover:bg-transparent hover:text-ink"
      >
        ← {tr("cartesIndex.title")}
      </a>
      <header className="mb-3 mt-3 flex items-baseline justify-between gap-4 border-b border-ink pb-2">
        <h1 className="m-0 text-balance text-[clamp(1.25rem,1rem+1.8vw,2.2rem)] font-medium leading-tight">
          {tr(mode ? `practice.${mode}` : "todayReview.title")}
        </h1>
        {queue && queue.length > 0 && (
          <span className="shrink-0 text-meta tabular-nums text-muted-warm">
            {queue.length} {tr("flashcards.left")}
          </span>
        )}
      </header>
      <p className="mb-5 mt-0 text-small text-ink-2">
        {tr(mode ? `practice.${mode}Intro` : "todayReview.intro")}
      </p>
      {failed.length > 0 && (
        <p className="mb-5 mt-0 text-small italic text-muted-warm">
          {tr("todayReview.failed", { decks: failed.join(", ") })}
        </p>
      )}
      {queue === null ? (
        <p className="italic text-muted-warm" aria-live="polite">
          {loading ? tr("todayReview.loading", { n: loading[0], total: loading[1] }) : tr("flashcards.loading")}
        </p>
      ) : queue === false ? (
        <p className="italic text-muted-warm">{tr("noteReview.noStorage")}</p>
      ) : (
        <ReviewSession
          queue={queue}
          setQueue={setQueue}
          onGrade={onGrade}
          today={today}
          autoFocus
          showSource
          families={Object.fromEntries(decks.map((d) => [d.slug, familyOfFolder(d.folder)]))}
          done={doneText}
          doneActions={
            (mode ? emptyStart : started === 0 && !hasNotes) ? (
              <EmptyActions text={mode ? undefined : tr("todayReview.nothingText")} />
            ) : undefined
          }
          doneNote={() => (!mode && started > 0 ? tr("todayReview.tomorrow", { count: tomorrowLoad() }) : null)}
        />
      )}
    </main>
  );
}
