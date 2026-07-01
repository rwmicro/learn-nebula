"use client";

import { useCallback, useEffect, useState } from "react";

interface Card {
  front: string;
  back: string;
}
interface Deck {
  name: string;
  css: string;
  cards: Card[];
}

const LABELS: Record<string, Record<string, string>> = {
  fr: { home: "Le jardin", flip: "Retourner", next: "Suivant", prev: "Précédent", shuffle: "Mélanger", size: "Agrandir", loading: "Chargement du deck…", empty: "Deck vide.", err: "Impossible de charger le deck.", hint: "Clic / Espace : retourner · ← → : naviguer" },
  en: { home: "The garden", flip: "Flip", next: "Next", prev: "Previous", shuffle: "Shuffle", size: "Enlarge", loading: "Loading deck…", empty: "Empty deck.", err: "Couldn't load the deck.", hint: "Click / Space: flip · ← → : navigate" },
  es: { home: "El jardín", flip: "Voltear", next: "Siguiente", prev: "Anterior", shuffle: "Mezclar", size: "Agrandar", loading: "Cargando el mazo…", empty: "Mazo vacío.", err: "No se pudo cargar el mazo.", hint: "Clic / Espacio: voltear · ← → : navegar" },
  zh: { home: "花园", flip: "翻转", next: "下一张", prev: "上一张", shuffle: "打乱", size: "放大", loading: "正在加载卡组…", empty: "空卡组。", err: "无法加载卡组。", hint: "点击 / 空格：翻转 · ← → ：切换" },
};

function useLocale(): string {
  const [locale, setLocale] = useState("fr");
  useEffect(() => {
    const ok = (s: unknown): s is string =>
      typeof s === "string" && s in LABELS;
    const cur = window.__i18n?.locale ?? window.__i18n?.defaultLocale;
    if (ok(cur)) setLocale(cur);
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<{ locale: string }>).detail?.locale;
      if (ok(next)) setLocale(next);
    };
    document.addEventListener("i18n:change", onChange);
    return () => document.removeEventListener("i18n:change", onChange);
  }, []);
  return locale;
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
  const L = LABELS[useLocale()] ?? LABELS.fr;
  const [deck, setDeck] = useState<Deck | null>(null);
  const [error, setError] = useState(false);
  const [order, setOrder] = useState<number[]>([]);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [sizeIdx, setSizeIdx] = useState(0);

  // Restore + cycle the card size, persisted across cards/sessions.
  useEffect(() => {
    const s = Number(localStorage.getItem("flashcardSize"));
    if (Number.isInteger(s) && s >= 0 && s < SIZES.length) setSizeIdx(s);
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
        className="text-micro font-semibold uppercase tracking-[0.1em] text-[#8a857b] no-underline hover:bg-transparent hover:text-[#1a1a1a]"
      >
        ← {L.home}
      </a>

      <header className="mb-6 mt-3 flex items-baseline justify-between gap-4 border-b border-[#1a1a1a] pb-2">
        <h1 className="m-0 text-balance text-[clamp(1.25rem,1rem+1.8vw,2.2rem)] font-medium leading-tight">
          {name}
        </h1>
        {cards.length > 0 && (
          <span className="shrink-0 text-meta tabular-nums text-[#8a857b]">
            {pos + 1} / {cards.length}
          </span>
        )}
      </header>

      {error ? (
        <p className="italic text-[#8a857b]">{L.err}</p>
      ) : !deck ? (
        <p className="italic text-[#8a857b]">{L.loading}</p>
      ) : !cards.length ? (
        <p className="italic text-[#8a857b]">{L.empty}</p>
      ) : (
        <>
          <button
            type="button"
            onClick={flip}
            aria-label={L.flip}
            className="flex w-full cursor-pointer items-center justify-center rounded-[4px] border border-[#e4e2dd] bg-white p-8 text-center transition-[min-height] duration-200 hover:bg-white"
            style={{ minHeight: `${26 * SIZES[sizeIdx]}rem` }}
          >
            <div
              className="card [&_audio]:mt-3"
              style={{ zoom: SIZES[sizeIdx] }}
              dangerouslySetInnerHTML={{
                __html: flipped ? card.back : card.front,
              }}
            />
          </button>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button type="button" className={btn} onClick={() => go(-1)}>
              {L.prev}
            </button>
            <button type="button" className={btn} onClick={flip}>
              {L.flip}
            </button>
            <button type="button" className={btn} onClick={() => go(1)}>
              {L.next}
            </button>
            <button type="button" className={btn} onClick={shuffle}>
              {L.shuffle}
            </button>
            <button
              type="button"
              className={btn}
              onClick={cycleSize}
              aria-label={L.size}
            >
              {L.size}
              {SIZES[sizeIdx] !== 1 ? ` ×${SIZES[sizeIdx]}` : ""}
            </button>
          </div>
          <p className="mt-4 text-center text-micro italic text-[#8a857b]">
            {L.hint}
          </p>
        </>
      )}
    </main>
  );
}
