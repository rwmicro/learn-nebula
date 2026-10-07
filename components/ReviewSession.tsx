"use client";

import { recordActivity } from "@/lib/personal";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { GRADES, type CardState, type Grade } from "@/lib/srs";
import type { DueItem } from "@/lib/note-quiz";
import { GRADE_COLOR, btn, btnGrade } from "@/components/srs-ui";

/**
 * One spaced-repetition session over note questions: the card, "Afficher la
 * réponse", the four grades with their 1–4 / Space shortcuts, and the "done"
 * screen. Shared by /cartes/revision/ (components/NoteReview.tsx, every saved
 * question) and a reading path's "Réviser ce parcours" (components/
 * ParcoursStudy.tsx, the path's questions). The queue is the caller's; this
 * only grades its head through `onGrade` (which persists and returns the new
 * scheduling state) and re-queues an "again" at the end, as a deck does.
 *
 * The question/answer HTML is this site's own rendered note markup (saved by
 * quiz.js, or extracted at build by lib/path-extras.ts) — same trust as the
 * page itself.
 */
export function ReviewSession({
  queue,
  setQueue,
  onGrade,
  done,
  autoFocus = false,
}: {
  queue: DueItem[];
  setQueue: (q: DueItem[]) => void;
  onGrade: (head: DueItem, g: Grade) => CardState | undefined;
  /** Heading of the "nothing left" screen. */
  done: string;
  autoFocus?: boolean;
}) {
  const locale = useLocale();
  const tr = (k: string, vars?: Record<string, string | number>) => t(k, vars, locale);
  const head = queue[0];
  const headKey = head ? `${head.slug}\n${head.id}` : "";
  // Revealed for one head only: removing or grading the card hides the answer
  // of the next one without an effect.
  const [revealedFor, setRevealedFor] = useState<string | null>(null);
  const revealed = !!head && revealedFor === headKey;
  const revealRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (autoFocus) revealRef.current?.focus();
  }, [autoFocus]);

  const grade = useCallback(
    (g: Grade) => {
      if (!revealed || !head) return;
      const state = onGrade(head, g);
      recordActivity("c");
      const rest = queue.slice(1);
      const q = g === "again" ? [...rest, { ...head, state }] : rest;
      setQueue(q);
      setRevealedFor(null);
      requestAnimationFrame(() => (q.length ? revealRef.current : doneRef.current)?.focus());
    },
    [revealed, head, queue, onGrade, setQueue],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable]")) return;
      if ((e.key === " " || e.key === "Enter") && !el?.closest("button, a, summary")) {
        if (!head) return;
        e.preventDefault();
        setRevealedFor(headKey);
      } else if (revealed && /^[1-4]$/.test(e.key)) {
        grade(GRADES[Number(e.key) - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [grade, revealed, head, headKey]);

  if (!head)
    return (
      <section className="flex min-h-[14rem] flex-col items-center justify-center gap-5 rounded-[4px] border border-rule bg-paper p-8 text-center">
        <h2
          ref={doneRef}
          tabIndex={-1}
          className="m-0 text-balance text-[clamp(1.1rem,1rem+1vw,1.5rem)] font-medium leading-snug outline-none"
        >
          {done}
        </h2>
      </section>
    );

  return (
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
          <button ref={revealRef} type="button" className={btn} onClick={() => setRevealedFor(headKey)}>
            {tr("quiz.reveal")}
          </button>
        )}
        <a href={head.item.url} className={`${btn} no-underline`}>
          {tr("noteReview.openNote")}
        </a>
      </div>
      <p className="mt-4 text-center text-micro italic text-muted-warm">{tr("noteReview.hintReview")}</p>
    </>
  );
}
