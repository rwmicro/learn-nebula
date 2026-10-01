"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { GRADES, dayKey, type Grade } from "@/lib/srs";
import {
  countSaved,
  dueQuestions,
  gradeQuestion,
  loadAllNoteDecks,
  nextDueDay,
  removeQuestion,
  saveNoteDeck,
  type DueItem,
  type NoteDeck,
} from "@/lib/note-quiz";
import { GRADE_COLOR, btn, btnGrade } from "@/components/srs-ui";

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
  const [queue, setQueue] = useState<DueItem[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [today, setToday] = useState(() => dayKey());
  const revealRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem("srs:probe", "1");
      localStorage.removeItem("srs:probe");
      const all = loadAllNoteDecks(localStorage);
      const day = dayKey();
      setToday(day);
      setDecks(all);
      setQueue(dueQuestions(all, day));
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

  const grade = useCallback(
    (g: Grade) => {
      if (!decks || !revealed || !queue.length) return;
      const [head, ...rest] = queue;
      const deck = gradeQuestion(decks[head.slug], head.id, g, today);
      persist(head.slug, deck);
      setDecks({ ...decks, [head.slug]: deck });
      const q = g === "again" ? [...rest, { ...head, state: deck.cards[head.id] }] : rest;
      setQueue(q);
      setRevealed(false);
      requestAnimationFrame(() =>
        (q.length ? revealRef.current : doneRef.current)?.focus(),
      );
    },
    [decks, revealed, queue, today, persist],
  );

  const remove = (slug: string, id: string) => {
    if (!decks) return;
    const deck = removeQuestion(decks[slug], id);
    persist(slug, deck);
    const next = { ...decks, [slug]: deck };
    if (!Object.keys(deck.items).length) delete next[slug];
    setDecks(next);
    setQueue((q) => q.filter((x) => !(x.slug === slug && x.id === id)));
    if (queue[0]?.slug === slug && queue[0]?.id === id) setRevealed(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable]")) return;
      if ((e.key === " " || e.key === "Enter") && !el?.closest("button, a, summary")) {
        if (!queue.length) return;
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && /^[1-4]$/.test(e.key)) {
        grade(GRADES[Number(e.key) - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [grade, revealed, queue.length]);

  const head = queue[0];
  const saved = decks ? countSaved(decks) : 0;
  const nextDay = decks && !queue.length ? nextDueDay(decks, today) : null;
  const all = decks
    ? Object.entries(decks).flatMap(([slug, d]) =>
        Object.entries(d.items).map(([id, item]) => ({ slug, id, item })),
      )
    : [];

  return (
    <main id="main" className="flashcards-main note-review mx-auto max-w-[48rem] px-5 py-12 text-ink">
      <a
        href="/cartes/"
        className="text-micro font-semibold uppercase tracking-[0.1em] text-muted-warm no-underline hover:bg-transparent hover:text-ink"
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
        <p className="italic text-muted-warm">{tr("noteReview.empty")}</p>
      ) : !head ? (
        <section className="flex min-h-[14rem] flex-col items-center justify-center gap-5 rounded-[4px] border border-rule bg-paper p-8 text-center">
          <h2
            ref={doneRef}
            tabIndex={-1}
            className="m-0 text-balance text-[clamp(1.1rem,1rem+1vw,1.5rem)] font-medium leading-snug outline-none"
          >
            {nextDay
              ? tr("flashcards.doneNext", {
                  date: new Intl.DateTimeFormat(locale, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  }).format(new Date(`${nextDay}T12:00:00`)),
                })
              : tr("flashcards.done")}
          </h2>
        </section>
      ) : (
        <>
          <article className="note-review-card rounded-[4px] border border-rule bg-paper p-6 sm:p-8">
            <p className="m-0 mb-3 text-micro font-semibold uppercase tracking-[0.08em] text-muted-warm">
              <a href={head.item.url} className="text-muted-warm hover:text-ink">
                {tr("noteReview.from", { title: head.item.title })}
              </a>
            </p>
            <div
              className="note-review-q text-[clamp(1.1rem,1rem+0.6vw,1.35rem)] font-medium leading-snug"
              dangerouslySetInnerHTML={{ __html: head.item.q }}
            />
            {revealed && (
              <div
                className="note-review-a mt-5 border-t border-rule pt-5"
                dangerouslySetInnerHTML={{ __html: head.item.a }}
              />
            )}
          </article>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            {revealed ? (
              <div
                role="group"
                aria-label={tr("flashcards.grades")}
                className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:gap-3"
              >
                {GRADES.map((g, i) => (
                  <button
                    key={g}
                    type="button"
                    className={btnGrade}
                    style={{ "--g": GRADE_COLOR[g] } as React.CSSProperties}
                    onClick={() => grade(g)}
                    aria-keyshortcuts={String(i + 1)}
                  >
                    <kbd className="mr-1.5 font-mono font-normal opacity-60">{i + 1}</kbd>
                    {tr(`flashcards.${g}`)}
                  </button>
                ))}
              </div>
            ) : (
              <button
                ref={revealRef}
                type="button"
                className={btn}
                onClick={() => setRevealed(true)}
              >
                {tr("quiz.reveal")}
              </button>
            )}
            <a href={head.item.url} className={`${btn} no-underline`}>
              {tr("noteReview.openNote")}
            </a>
          </div>
          <p className="mt-4 text-center text-micro italic text-muted-warm">
            {tr("noteReview.hintReview")}
          </p>
        </>
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
