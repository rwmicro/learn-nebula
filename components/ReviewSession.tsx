"use client";

import { recordActivity } from "@/lib/personal";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { GRADES, preview, type Grade } from "@/lib/srs";
import { recordReview } from "@/lib/srs-log";
import { diff, isMatch } from "@/lib/typed-answer";
import type { Graded, ReviewItem } from "@/lib/review-item";
import { GRADE_COLOR, btn, btnGrade, quiet } from "@/components/srs-ui";
import { DeckFace } from "@/components/DeckFace";

export type { Graded, ReviewItem } from "@/lib/review-item";

const keyOf = (x: ReviewItem) => `${x.kind}\n${x.slug}\n${x.id}`;

/** Interval as shown on a grade button: "< 1 j", "6 j", "2,5 mois", "1,2 an". */
export function formatInterval(days: number, locale: string, tr: (k: string, v?: Record<string, string | number>) => string): string {
  if (days < 1) return tr("flashcards.ivNow");
  const n = (x: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: x < 10 ? 1 : 0 }).format(x);
  if (days < 30) return tr("flashcards.ivDays", { n: days });
  if (days < 365) return tr("flashcards.ivMonths", { n: n(days / 30) });
  return tr("flashcards.ivYears", { n: n(days / 365) });
}

/**
 * One spaced-repetition session: the card, "Afficher la réponse", the four
 * grades (1–4, each showing the interval it leads to), Space to reveal, Z to
 * take back the last grade, and the "done" screen. Shared by the deck pages
 * (Flashcards.tsx), /cartes/revision/ (NoteReview.tsx), "Tout réviser"
 * (TodayReview.tsx) and a reading path's revision (ParcoursStudy.tsx). The
 * queue is the caller's; this grades its head through `onGrade` (which
 * persists and returns the new state plus its undo), re-queues an "again"
 * at the end, and counts each review in the daily log (lib/srs-log.ts).
 *
 * Note questions show their question, then the answer under it; deck cards
 * flip from front to back (components/DeckFace.tsx: the deck's CSS, scoped
 * and brought to the site's type and theme).
 * A thin bar shows the share done; the end screen counts the cards
 * reviewed and how many were remembered. On touch screens a swipe grades
 * (→ good, ← again) once the answer shows.
 * Card HTML is this site's own build output (rendered notes, or decks
 * sanitized by scripts/build-anki.mjs) — the same trust as the page itself.
 */
export function ReviewSession({
  queue,
  setQueue,
  onGrade,
  done,
  today,
  autoFocus = false,
  zoom = 1,
  showSource = false,
  doneNote,
}: {
  queue: ReviewItem[];
  setQueue: (q: ReviewItem[]) => void;
  onGrade: (head: ReviewItem, g: Grade) => Graded | undefined;
  /** Heading of the "nothing left" screen. */
  done: React.ReactNode;
  today: string;
  autoFocus?: boolean;
  /** Deck cards' scale (the deck page's size button). */
  zoom?: number;
  /** Name the deck above each deck card (sessions mixing several decks). */
  showSource?: boolean;
  /** Extra line on the end screen (e.g. tomorrow's load). */
  doneNote?: () => React.ReactNode;
}) {
  const locale = useLocale();
  const tr = (k: string, vars?: Record<string, string | number>) => t(k, vars, locale);
  const head = queue[0];
  const headKey = head ? keyOf(head) : "";
  // Revealed for one head only: removing or grading the card hides the answer
  // of the next one without an effect.
  const [revealedFor, setRevealedFor] = useState<string | null>(null);
  const revealed = !!head && revealedFor === headKey;
  const [typed, setTyped] = useState("");
  // Undo stack: the queue before each grade, with the caller's undo.
  const [history, setHistory] = useState<{ queue: ReviewItem[]; g: Grade; undo: () => void }[]>([]);
  // This session's grades (the undo stack is capped, these are not).
  const [tally, setTally] = useState({ n: 0, again: 0 });
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const revealRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const surfaceRef = useRef<HTMLElement>(null);
  const faceRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const expected = head?.kind === "deck" ? head.expected : null;

  const focusNext = useCallback((q: ReviewItem[]) => {
    requestAnimationFrame(() => {
      if (!q.length) return doneRef.current?.focus();
      (inputRef.current ?? revealRef.current)?.focus();
    });
  }, []);

  useEffect(() => {
    if (autoFocus) (inputRef.current ?? revealRef.current)?.focus();
  }, [autoFocus]);

  const reveal = useCallback(() => {
    if (!head) return;
    setRevealedFor(headKey);
    // Out of the answer box, so 1–4 grade right away.
    requestAnimationFrame(() => surfaceRef.current?.focus());
  }, [head, headKey]);

  // Autoplay: the first clip of the face on screen, front then back.
  const autoplay = head?.kind === "deck" && head.autoplay;
  useEffect(() => {
    if (!autoplay) return;
    const id = requestAnimationFrame(() => {
      faceRef.current?.querySelector<HTMLButtonElement>(".pron-btn")?.click();
    });
    return () => cancelAnimationFrame(id);
  }, [autoplay, headKey, revealed]);

  const grade = useCallback(
    (g: Grade) => {
      if (!revealed || !head) return;
      const res = onGrade(head, g);
      recordReview(today, g);
      recordActivity("c");
      const rest = queue.slice(1);
      const q = g === "again" ? [...rest, { ...head, state: res?.state }] : rest;
      setHistory((h) => [...h.slice(-49), { queue, g, undo: res?.undo ?? (() => {}) }]);
      setTally((t) => ({ n: t.n + 1, again: t.again + (g === "again" ? 1 : 0) }));
      setQueue(q);
      setRevealedFor(null);
      setTyped("");
      focusNext(q);
    },
    [revealed, head, queue, onGrade, setQueue, today, focusNext],
  );

  const undo = useCallback(() => {
    const last = history[history.length - 1];
    if (!last) return;
    last.undo();
    recordReview(today, last.g, true);
    setHistory(history.slice(0, -1));
    setTally((t) => ({ n: Math.max(0, t.n - 1), again: Math.max(0, t.again - (last.g === "again" ? 1 : 0)) }));
    setQueue(last.queue);
    // Back on the card, answer shown, ready for another grade.
    setRevealedFor(keyOf(last.queue[0]));
    requestAnimationFrame(() => surfaceRef.current?.focus());
  }, [history, setQueue, today]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable]")) return;
      if ((e.key === " " || e.key === "Enter") && !el?.closest("button, a, summary")) {
        if (!head || revealed) return;
        e.preventDefault();
        reveal();
      } else if (revealed && /^[1-4]$/.test(e.key)) {
        grade(GRADES[Number(e.key) - 1]);
      } else if ((e.key === "z" || e.key === "Z") && history.length) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [grade, revealed, head, reveal, undo, history.length]);

  const undoButton = history.length > 0 && (
    <p className="mt-4 text-center">
      <button type="button" className={quiet} onClick={undo} aria-keyshortcuts="z">
        {tr("flashcards.undo")}
      </button>
    </p>
  );

  if (!head)
    return (
      <>
        <section className="flex min-h-[14rem] flex-col items-center justify-center gap-5 rounded-[4px] border border-rule bg-paper p-8 text-center">
          <h2
            ref={doneRef}
            tabIndex={-1}
            className="m-0 text-balance text-[clamp(1.1rem,1rem+1vw,1.5rem)] font-medium leading-snug outline-none"
          >
            {done}
          </h2>
          {tally.n > 0 && (
            <p className="m-0 text-small tabular-nums text-ink-2">
              {tr("flashcards.sessionTally", {
                count: tally.n,
                pct: Math.round((100 * (tally.n - tally.again)) / tally.n),
              })}
            </p>
          )}
          {doneNote && <p className="m-0 text-small text-muted-warm">{doneNote()}</p>}
        </section>
        {undoButton}
      </>
    );

  const next = revealed ? preview(head.state, today) : null;
  const match = revealed && expected != null && typed.trim() ? isMatch(typed, expected) : null;

  const total = tally.n + queue.length;
  const onTouchStart = (e: React.TouchEvent) => {
    const t0 = e.touches[0];
    touchStart.current = e.touches.length === 1 ? { x: t0.clientX, y: t0.clientY } : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s0 = touchStart.current;
    touchStart.current = null;
    if (!s0 || !revealed) return;
    const t1 = e.changedTouches[0];
    const dx = t1.clientX - s0.x;
    const dy = t1.clientY - s0.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < 2 * Math.abs(dy)) return;
    grade(dx > 0 ? "good" : "again");
  };

  return (
    <>
      <div
        className="review-progress mb-4 h-[2px] w-full overflow-hidden rounded-full bg-rule-soft"
        role="progressbar"
        aria-label={tr("flashcards.progress")}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={tally.n}
      >
        <div
          className="h-full bg-[var(--garden)] transition-[width] duration-300"
          style={{ width: `${total ? (100 * tally.n) / total : 0}%` }}
        />
      </div>
      {showSource && head.kind === "deck" && (
        <p className="m-0 mb-2 text-micro font-semibold uppercase tracking-[0.08em] text-muted-warm">
          { }
          <a href={`/cartes/${head.slug}/`} className="text-muted-warm hover:text-ink">
            {head.deckName}
          </a>
        </p>
      )}
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {head.kind === "note" ? (
        <article
          ref={surfaceRef}
          tabIndex={-1}
          className="note-review-card rounded-[4px] border border-rule bg-paper p-6 outline-none sm:p-8"
        >
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
      ) : (
        <section ref={surfaceRef} tabIndex={-1} className="deck-review outline-none" aria-label={head.deckName}>
          <div
            className="flex w-full cursor-pointer items-center justify-center rounded-[4px] border border-rule bg-paper p-6 text-center sm:p-8"
            style={{ minHeight: `${(expected != null ? 16 : 22) * zoom}rem` }}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest(".pron-btn, a")) return;
              if (!revealed) reveal();
            }}
          >
            <DeckFace
              slug={head.slug}
              css={head.css}
              html={revealed ? head.back : head.front}
              zoom={zoom}
              faceRef={faceRef}
            />
          </div>
          {expected != null && (
            <div className="typed-answer mx-auto mt-4 max-w-[32rem]">
              <label className="mb-1 block text-micro font-semibold uppercase tracking-[0.08em] text-muted-warm" htmlFor="typed-answer">
                {tr("flashcards.typeLabel")}
              </label>
              <input
                ref={inputRef}
                id="typed-answer"
                type="text"
                dir="auto"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                value={typed}
                disabled={revealed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    reveal();
                  }
                }}
                className="w-full rounded-[2px] border border-rule bg-paper px-3 py-2 text-ink disabled:opacity-80"
              />
              {revealed && (
                <div className="typed-compare mt-3 text-small" aria-live="polite">
                  {!typed.trim() ? (
                    <p className="m-0 italic text-muted-warm">{tr("flashcards.typeEmpty")}</p>
                  ) : match ? (
                    <p className="m-0 font-semibold text-[var(--garden)]">✓ {tr("flashcards.typeRight")}</p>
                  ) : (
                    <TypedDiff typed={typed} expected={expected} tr={tr} />
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        {revealed && next ? (
          <div
            role="group"
            aria-label={tr("flashcards.grades")}
            className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:gap-3"
          >
            {GRADES.map((g, i) => {
              const iv = formatInterval(next[g].iv, locale, tr);
              return (
                <button
                  key={g}
                  type="button"
                  className={`${btnGrade} flex flex-col items-center gap-0.5 sm:min-w-[7.5rem]`}
                  style={{ "--g": GRADE_COLOR[g] } as React.CSSProperties}
                  onClick={() => grade(g)}
                  aria-keyshortcuts={String(i + 1)}
                  aria-label={`${tr(`flashcards.${g}`)} · ${iv}`}
                >
                  <span>
                    <kbd className="kbd-only mr-1.5 font-mono font-normal opacity-60">{i + 1}</kbd>
                    {tr(`flashcards.${g}`)}
                  </span>
                  <span className="font-normal normal-case tracking-normal tabular-nums">{iv}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <button ref={revealRef} type="button" className={btn} onClick={reveal}>
            {tr("quiz.reveal")}
          </button>
        )}
        {head.kind === "note" && (
          <a href={head.item.url} className={`${btn} no-underline`}>
            {tr("noteReview.openNote")}
          </a>
        )}
      </div>
      <p className="kbd-only mt-4 text-center text-micro italic text-muted-warm">{tr("noteReview.hintReview")}</p>
      <p className="touch-only mt-4 text-center text-micro italic text-muted-warm">{tr("noteReview.hintTouch")}</p>
      {undoButton}
    </>
  );
}

function TypedDiff({
  typed,
  expected,
  tr,
}: {
  typed: string;
  expected: string;
  tr: (k: string) => string;
}) {
  const d = diff(typed, expected);
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      <dt className="text-muted-warm">{tr("flashcards.typeYours")}</dt>
      <dd className="m-0" dir="auto">
        {d.typed.map((s, i) =>
          s.ok ? (
            <span key={i}>{s.text}</span>
          ) : (
            <del key={i} className="text-[var(--callout-red)] decoration-2">
              {s.text}
            </del>
          ),
        )}
      </dd>
      <dt className="text-muted-warm">{tr("flashcards.typeExpected")}</dt>
      <dd className="m-0" dir="auto">
        {d.expected.map((s, i) =>
          s.ok ? (
            <span key={i}>{s.text}</span>
          ) : (
            <ins key={i} className="bg-transparent font-semibold text-[var(--garden)] no-underline underline decoration-2">
              {s.text}
            </ins>
          ),
        )}
      </dd>
    </dl>
  );
}
