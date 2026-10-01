"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import {
  GRADES,
  buildQueue,
  cardId,
  dayKey,
  emptyProgress,
  grade as gradeCard,
  nextReviewDay,
  parseProgress,
  summarize,
  type Grade,
  type Progress,
} from "@/lib/srs";
import { GRADE_COLOR, btn, btnGrade, btnOn, quiet } from "@/components/srs-ui";

interface Card {
  front: string;
  back: string;
}
interface Deck {
  name: string;
  css: string;
  cards: Card[];
}

// Card zoom levels (whole card content scales: text + images).
const SIZES = [1, 1.3, 1.6, 2];

type Mode = "review" | "browse";

// Per-deck spaced-repetition progress (lib/srs.ts). Every access is guarded:
// without storage the page falls back to the plain flip-through.
const storeKey = (slug: string) => `srs:${slug}`;
function loadProgress(slug: string): Progress | null {
  try {
    const raw = localStorage.getItem(storeKey(slug));
    // Probe writability too (Safari private mode used to throw on setItem).
    localStorage.setItem("srs:probe", "1");
    localStorage.removeItem("srs:probe");
    return parseProgress(raw);
  } catch {
    return null;
  }
}
function saveProgress(slug: string, p: Progress | null) {
  try {
    if (p) localStorage.setItem(storeKey(slug), JSON.stringify(p));
    else localStorage.removeItem(storeKey(slug));
  } catch {
    /* localStorage unavailable — progress lives for this visit only */
  }
}

export function Flashcards({ slug, name }: { slug: string; name: string }) {
  const locale = useLocale();
  const tr = (k: string, vars?: Record<string, string | number>) =>
    t(`flashcards.${k}`, vars, locale);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [error, setError] = useState(false);
  const [order, setOrder] = useState<number[]>([]);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [sizeIdx, setSizeIdx] = useState(0);
  // null = no storage → browse mode only, exactly the pre-SRS behaviour.
  const [progress, setProgress] = useState<Progress | null>(null);
  const [mode, setMode] = useState<Mode>("browse");
  // Review session: indices into deck.cards, head = current card.
  const [queue, setQueue] = useState<number[]>([]);
  const [today, setToday] = useState(() => dayKey());
  const cardRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  // Restore + cycle the card size, persisted across cards/sessions.
  useEffect(() => {
    try {
      const s = Number(localStorage.getItem("flashcardSize"));
      if (Number.isInteger(s) && s >= 0 && s < SIZES.length) setSizeIdx(s);
    } catch {
      /* localStorage unavailable */
    }
  }, []);
  const cycleSize = useCallback(() => {
    setSizeIdx((i) => {
      const n = (i + 1) % SIZES.length;
      try {
        localStorage.setItem("flashcardSize", String(n));
      } catch {
        /* localStorage unavailable */
      }
      return n;
    });
  }, []);

  useEffect(() => {
    let cancel = false;
    fetch(`/anki/${slug}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Deck) => {
        if (cancel) return;
        setDeck(d);
        setOrder(d.cards.map((_, i) => i));
        const p = loadProgress(slug);
        setProgress(p);
        if (p) {
          const day = dayKey();
          const q = buildQueue(
            d.cards.map((c) => cardId(c.front, c.back)),
            p,
            day,
          );
          setToday(day);
          setQueue(q);
          if (q.length) setMode("review");
        }
      })
      .catch(() => !cancel && setError(true));
    return () => {
      cancel = true;
    };
  }, [slug]);

  const cards = useMemo(() => deck?.cards ?? [], [deck]);
  const ids = useMemo(() => cards.map((c) => cardId(c.front, c.back)), [cards]);
  const reviewing = mode === "review" && progress !== null;
  const card = cards[(reviewing ? queue[0] : order[pos]) ?? 0];
  const summary = useMemo(
    () => (progress ? summarize(ids, progress, today) : null),
    [ids, progress, today],
  );

  const startMode = useCallback(
    (m: Mode, p: Progress | null = progress) => {
      setFlipped(false);
      setMode(m);
      if (m === "review" && p) {
        const day = dayKey();
        setToday(day);
        setQueue(buildQueue(ids, p, day));
      } else setPos(0);
    },
    [ids, progress],
  );

  const go = useCallback(
    (delta: number) => {
      setFlipped(false);
      setPos((p) =>
        cards.length ? (p + delta + cards.length) % cards.length : 0,
      );
    },
    [cards.length],
  );
  const flip = useCallback(() => setFlipped((f) => !f), []);
  // The card's front/back HTML (dangerouslySetInnerHTML) can itself contain a
  // `.pron-btn` pronunciation player nested inside this flip button; let that
  // handle its own click instead of also flipping the card away under it.
  const handleCardClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if ((e.target as HTMLElement).closest(".pron-btn")) return;
      flip();
    },
    [flip],
  );
  const shuffle = useCallback(() => {
    setOrder((o) => {
      const a = [...o];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    });
    setPos(0);
    setFlipped(false);
  }, []);

  // Grade the current review card: persist, then drop it from the session
  // ("again" sends it to the back of the queue so it returns today).
  const grade = useCallback(
    (g: Grade) => {
      if (mode !== "review" || !progress || !flipped || !queue.length) return;
      const [head, ...rest] = queue;
      const next = gradeCard(progress, ids[head], g, today);
      const q = g === "again" ? [...rest, head] : rest;
      saveProgress(slug, next);
      setProgress(next);
      setQueue(q);
      setFlipped(false);
      // Keep keyboard focus on the study surface: the next card (Space flips
      // it) or, once the session is over, the end-of-session heading.
      requestAnimationFrame(() =>
        (q.length ? cardRef.current : doneRef.current)?.focus(),
      );
    },
    [mode, flipped, queue, progress, ids, today, slug],
  );

  const reset = () => {
    if (!window.confirm(tr("resetConfirm"))) return;
    const p = emptyProgress();
    saveProgress(slug, null);
    setProgress(p);
    startMode("review", p);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (e.key === " " || e.key === "Enter") {
        // Let a focused control (Prev/Next/Shuffle/…) activate natively; the card
        // is itself a <button> so it still flips on Space/Enter when focused.
        if (el?.closest("button, a, input, textarea, select")) return;
        e.preventDefault();
        flip();
      } else if (reviewing && /^[1-4]$/.test(e.key)) {
        if (el?.closest("input, textarea, select, [contenteditable]")) return;
        grade(GRADES[Number(e.key) - 1]);
      } else if (reviewing) return;
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flip, go, grade, reviewing]);

  const nextDay =
    reviewing && progress && !queue.length
      ? nextReviewDay(ids, progress, today)
      : null;

  return (
    <main
      id="main"
      className="flashcards-main mx-auto px-5 py-12 text-ink transition-[max-width] duration-200"
      style={{ maxWidth: `${60 * SIZES[sizeIdx]}rem` }}
    >
      {deck?.css && <style dangerouslySetInnerHTML={{ __html: deck.css }} />}

      <a
        href="/"
        className="text-micro font-semibold uppercase tracking-[0.1em] text-muted-warm no-underline hover:bg-transparent hover:text-ink"
      >
        ← {tr("home")}
      </a>

      <header className="mb-6 mt-3 flex items-baseline justify-between gap-4 border-b border-ink pb-2">
        <h1 className="m-0 text-balance text-[clamp(1.25rem,1rem+1.8vw,2.2rem)] font-medium leading-tight">
          {name}
        </h1>
        {cards.length > 0 && !(reviewing && !queue.length) && (
          <span className="shrink-0 text-meta tabular-nums text-muted-warm">
            {reviewing
              ? `${queue.length} ${tr("left")}`
              : `${pos + 1} / ${cards.length}`}
          </span>
        )}
      </header>

      {cards.length > 0 && summary && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div role="group" aria-label={tr("modes")} className="flex">
            {(["review", "browse"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => mode !== m && startMode(m)}
                className={`${mode === m ? btnOn : btn} -ml-px first:ml-0`}
              >
                {tr(m === "review" ? "modeReview" : "modeBrowse")}
              </button>
            ))}
          </div>
          <dl className="m-0 flex gap-5 text-meta tabular-nums text-muted-warm">
            {(
              [
                ["due", summary.due],
                ["fresh", summary.fresh],
                ["learned", summary.learned],
              ] as const
            ).map(([k, n]) => (
              <div key={k} className="flex items-baseline gap-1.5">
                <dt>{tr(k)}</dt>
                <dd className="m-0 font-semibold text-ink">{n}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {error ? (
        <p className="italic text-muted-warm">{tr("err")}</p>
      ) : !deck ? (
        <p className="italic text-muted-warm">{tr("loading")}</p>
      ) : !cards.length ? (
        <p className="italic text-muted-warm">{tr("empty")}</p>
      ) : reviewing && !queue.length ? (
        <section
          className="flex flex-col items-center justify-center gap-5 rounded-[4px] border border-rule bg-paper p-8 text-center"
          style={{ minHeight: `${26 * SIZES[sizeIdx]}rem` }}
        >
          <h2
            ref={doneRef}
            tabIndex={-1}
            className="m-0 text-balance text-[clamp(1.1rem,1rem+1vw,1.5rem)] font-medium leading-snug outline-none"
          >
            {nextDay
              ? tr("doneNext", {
                  date: new Intl.DateTimeFormat(locale, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  }).format(new Date(`${nextDay}T12:00:00`)),
                })
              : tr("done")}
          </h2>
          <button
            type="button"
            className={btn}
            onClick={() => startMode("browse")}
          >
            {tr("modeBrowse")}
          </button>
        </section>
      ) : (
        <>
          <button
            ref={cardRef}
            type="button"
            onClick={handleCardClick}
            aria-label={tr("flip")}
            // keep-light: the card HTML comes with the deck's own CSS (Anki
            // notetypes assume a white card), so it stays a light card in dark mode.
            className="keep-light flex w-full cursor-pointer items-center justify-center rounded-[4px] border border-rule bg-paper p-8 text-center transition-[min-height] duration-200 hover:bg-paper"
            style={{ minHeight: `${26 * SIZES[sizeIdx]}rem` }}
          >
            <div
              className="card [&_.pron]:mt-3"
              style={{ zoom: SIZES[sizeIdx] }}
              dangerouslySetInnerHTML={{
                __html: flipped ? card.back : card.front,
              }}
            />
          </button>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            {reviewing ? (
              flipped ? (
                <div
                  role="group"
                  aria-label={tr("grades")}
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
                      <kbd className="mr-1.5 font-mono font-normal opacity-60">
                        {i + 1}
                      </kbd>
                      {tr(g)}
                    </button>
                  ))}
                </div>
              ) : (
                <button type="button" className={btn} onClick={flip}>
                  {tr("flip")}
                </button>
              )
            ) : (
              <>
                <button type="button" className={btn} onClick={() => go(-1)}>
                  {tr("prev")}
                </button>
                <button type="button" className={btn} onClick={flip}>
                  {tr("flip")}
                </button>
                <button type="button" className={btn} onClick={() => go(1)}>
                  {tr("next")}
                </button>
                <button type="button" className={btn} onClick={shuffle}>
                  {tr("shuffle")}
                </button>
              </>
            )}
            <button
              type="button"
              className={btn}
              onClick={cycleSize}
              aria-label={tr("size")}
            >
              {tr("size")}
              {SIZES[sizeIdx] !== 1 ? ` ×${SIZES[sizeIdx]}` : ""}
            </button>
          </div>
          <p className="mt-4 text-center text-micro italic text-muted-warm">
            {tr(reviewing ? "hintReview" : "hint")}
          </p>
        </>
      )}

      {progress && summary && summary.learned > 0 && (
        <p className="mt-10 text-center">
          <button type="button" className={quiet} onClick={reset}>
            {tr("reset")}
          </button>
        </p>
      )}
    </main>
  );
}
