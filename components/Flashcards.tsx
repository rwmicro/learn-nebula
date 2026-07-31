"use client";

import { useCallback, useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

interface Card {
  front: string;
  back: string;
}
interface Deck {
  name: string;
  css: string;
  cards: Card[];
}

const btn =
  "cursor-pointer rounded-[2px] border border-[#1a1a1a] bg-transparent px-3.5 py-1.5 text-micro font-semibold uppercase tracking-[0.08em] text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white disabled:opacity-40";

// Card zoom levels (whole card content scales: text + images).
const SIZES = [1, 1.3, 1.6, 2];

export function Flashcards({
  slug,
  name,
}: {
  slug: string;
  name: string;
}) {
  const locale = useLocale();
  const tr = (k: string) => t(`flashcards.${k}`, undefined, locale);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [error, setError] = useState(false);
  const [order, setOrder] = useState<number[]>([]);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [sizeIdx, setSizeIdx] = useState(0);

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
      })
      .catch(() => !cancel && setError(true));
    return () => {
      cancel = true;
    };
  }, [slug]);

  const cards = deck?.cards ?? [];
  const card = cards[order[pos] ?? 0];

  const go = useCallback(
    (delta: number) => {
      setFlipped(false);
      setPos((p) => (cards.length ? (p + delta + cards.length) % cards.length : 0));
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        // Let a focused control (Prev/Next/Shuffle/…) activate natively; the card
        // is itself a <button> so it still flips on Space/Enter when focused.
        const el = e.target as HTMLElement | null;
        if (el?.closest("button, a, input, textarea, select")) return;
        e.preventDefault();
        flip();
      } else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flip, go]);

  return (
    <main
      id="main"
      className="mx-auto px-5 py-12 text-[#1a1a1a] transition-[max-width] duration-200"
      style={{ maxWidth: `${60 * SIZES[sizeIdx]}rem` }}
    >
      {deck?.css && <style dangerouslySetInnerHTML={{ __html: deck.css }} />}

      <a
        href="/"
        className="text-micro font-semibold uppercase tracking-[0.1em] text-[#787369] no-underline hover:bg-transparent hover:text-[#1a1a1a]"
      >
        ← {tr("home")}
      </a>

      <header className="mb-6 mt-3 flex items-baseline justify-between gap-4 border-b border-[#1a1a1a] pb-2">
        <h1 className="m-0 text-balance text-[clamp(1.25rem,1rem+1.8vw,2.2rem)] font-medium leading-tight">
          {name}
        </h1>
        {cards.length > 0 && (
          <span className="shrink-0 text-meta tabular-nums text-[#787369]">
            {pos + 1} / {cards.length}
          </span>
        )}
      </header>

      {error ? (
        <p className="italic text-[#787369]">{tr("err")}</p>
      ) : !deck ? (
        <p className="italic text-[#787369]">{tr("loading")}</p>
      ) : !cards.length ? (
        <p className="italic text-[#787369]">{tr("empty")}</p>
      ) : (
        <>
          <button
            type="button"
            onClick={handleCardClick}
            aria-label={tr("flip")}
            className="flex w-full cursor-pointer items-center justify-center rounded-[4px] border border-[#e4e2dd] bg-white p-8 text-center transition-[min-height] duration-200 hover:bg-white"
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
          <p className="mt-4 text-center text-micro italic text-[#787369]">
            {tr("hint")}
          </p>
        </>
      )}
    </main>
  );
}
