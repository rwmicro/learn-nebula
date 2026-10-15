"use client";

import { useCallback, useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { dayKey, type Grade } from "@/lib/srs";
import {
  countSaved,
  dueQuestions,
  gradeQuestion,
  loadAllNoteDecks,
  nextDueDay,
  removeQuestion,
  saveNoteDeck,
  type NoteDeck,
} from "@/lib/note-quiz";
import { loadSettings } from "@/lib/srs-settings";
import { ReviewSession, type Graded, type ReviewItem } from "@/components/ReviewSession";
import { AppBack } from "@/components/AppBack";
import { EmptyActions } from "@/components/EmptyActions";

/**
 * /cartes/revision/ — review the note questions (`> [!quiz]` callouts) the
 * reader saved from note pages (public/js/quiz.js). Same scheduler, grades
 * and keyboard shortcuts as a deck (Flashcards.tsx); the questions come from
 * localStorage alone (lib/note-quiz.ts), each linking back to its note.
 *
 * The stored HTML was read from this site's own rendered notes by quiz.js, in
 * this same origin — the same trust as the page itself.
 */
export function NoteReview() {
  const locale = useLocale();
  const tr = (k: string, vars?: Record<string, string | number>) =>
    t(k, vars, locale);
  // null = not loaded yet; false = no storage.
  const [decks, setDecks] = useState<Record<string, NoteDeck> | null | false>(null);
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [today, setToday] = useState(() => dayKey());

  useEffect(() => {
    try {
      localStorage.setItem("srs:probe", "1");
      localStorage.removeItem("srs:probe");
      loadSettings();
      const all = loadAllNoteDecks(localStorage);
      const day = dayKey();
      setToday(day);
      setDecks(all);
      setQueue(dueQuestions(all, day).map((d) => ({ kind: "note", ...d })));
    } catch {
      setDecks(false);
    }
  }, []);

  const persist = useCallback((slug: string, deck: NoteDeck) => {
    try {
      saveNoteDeck(localStorage, slug, deck);
    } catch {
      /* quota / blocked: the session keeps going in memory */
    }
  }, []);

  const onGrade = useCallback(
    (head: ReviewItem, g: Grade): Graded | undefined => {
      if (!decks || head.kind !== "note") return undefined;
      const before = decks[head.slug];
      const deck = gradeQuestion(before, head.id, g, today);
      persist(head.slug, deck);
      setDecks({ ...decks, [head.slug]: deck });
      return {
        state: deck.cards[head.id],
        undo: () => {
          persist(head.slug, before);
          setDecks((d) => (d ? { ...d, [head.slug]: before } : d));
        },
      };
    },
    [decks, today, persist],
  );

  const remove = (slug: string, id: string) => {
    if (!decks) return;
    const deck = removeQuestion(decks[slug], id);
    persist(slug, deck);
    const next = { ...decks, [slug]: deck };
    if (!Object.keys(deck.items).length) delete next[slug];
    setDecks(next);
    setQueue((q) => q.filter((x) => !(x.slug === slug && x.id === id)));
  };

  const saved = decks ? countSaved(decks) : 0;
  const nextDay = decks && !queue.length ? nextDueDay(decks, today) : null;
  const all = decks
    ? Object.entries(decks).flatMap(([slug, d]) =>
        Object.entries(d.items).map(([id, item]) => ({ slug, id, item })),
      )
    : [];

  return (
    <main id="main" className="flashcards-main note-review mx-auto max-w-[48rem] px-5 py-12 text-ink">
      <AppBack href="/cartes/" labelKey="tabbar.review" />
      <a
        href="/cartes/"
        className="old-back text-micro font-semibold uppercase tracking-[0.1em] text-muted-warm no-underline hover:bg-transparent hover:text-ink"
      >
        ← {tr("noteReview.back")}
      </a>

      <header className="mb-3 mt-3 flex items-baseline justify-between gap-4 border-b border-ink pb-2">
        <h1 className="m-0 text-balance text-[clamp(1.25rem,1rem+1.8vw,2.2rem)] font-medium leading-tight">
          {tr("noteReview.title")}
        </h1>
        {decks && queue.length > 0 && (
          <span className="shrink-0 text-meta tabular-nums text-muted-warm">
            {queue.length} {tr("flashcards.left")}
          </span>
        )}
      </header>
      <p className="mb-5 mt-0 text-small text-ink-2">{tr("noteReview.intro")}</p>

      {decks && saved > 0 && (
        <dl className="mb-5 flex gap-5 text-meta tabular-nums text-muted-warm">
          <div className="flex items-baseline gap-1.5">
            <dt>{tr("flashcards.due")}</dt>
            <dd className="m-0 font-semibold text-ink">{queue.length}</dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt>{tr("noteReview.saved")}</dt>
            <dd className="m-0 font-semibold text-ink">{saved}</dd>
          </div>
        </dl>
      )}

      {decks === null ? (
        <p className="italic text-muted-warm">{tr("flashcards.loading")}</p>
      ) : decks === false ? (
        <p className="italic text-muted-warm">{tr("noteReview.noStorage")}</p>
      ) : saved === 0 ? (
        <section className="review-empty">
          <p className="italic text-muted-warm">{tr("noteReview.empty")}</p>
          <EmptyActions />
        </section>
      ) : (
        <ReviewSession
          queue={queue}
          setQueue={setQueue}
          onGrade={onGrade}
          today={today}
          done={
            nextDay
              ? tr("flashcards.doneNext", {
                  date: new Intl.DateTimeFormat(locale, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  }).format(new Date(`${nextDay}T12:00:00`)),
                })
              : tr("flashcards.done")
          }
        />
      )}

      {decks && saved > 0 && (
        <details className="note-review-all mt-10">
          <summary className="cursor-pointer text-small font-semibold text-ink-2">
            {tr("noteReview.all", { count: saved })}
          </summary>
          <ul className="m-0 mt-3 list-none border-t border-rule p-0">
            {all.map(({ slug, id, item }) => (
              <li key={`${slug}/${id}`} className="flex items-baseline justify-between gap-4 border-b border-rule py-2.5">
                <a href={item.url} className="note-review-item min-w-0 flex-1 text-ink no-underline hover:underline">
                  <span dangerouslySetInnerHTML={{ __html: item.q }} />
                  <span className="block text-micro text-muted-warm">{item.title}</span>
                </a>
                <button
                  type="button"
                  className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-micro font-semibold uppercase tracking-[0.08em] text-muted-warm underline decoration-dotted underline-offset-4 hover:bg-transparent hover:text-ink"
                  aria-label={tr("noteReview.removeAria")}
                  onClick={() => remove(slug, id)}
                >
                  {tr("noteReview.remove")}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
