"use client";

import { GrowLoader } from "@/components/ui/GrowLoader";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import {
  RETENTIONS,
  buildQueue,
  dayKey,
  emptyProgress,
  grade as gradeCard,
  isLeech,
  nextReviewDay,
  setSuspended,
  summarize,
  type Grade,
  type Progress,
} from "@/lib/srs";
import {
  DIRECTIONS,
  NEW_PER_DAY_CHOICES,
  deckSettings,
  loadSettings,
  saveSettings,
  withDeck,
  type DeckSettings,
  type SrsSettings,
} from "@/lib/srs-settings";
import {
  canReverse,
  faces,
  firstLine,
  migrateDeck,
  studyCards,
  tagCounts,
  tagLabel,
  type DeckData,
} from "@/lib/deck-cards";
import {
  deckReviewItem,
  loadDeckProgress,
  saveDeckProgress,
  storageOk,
  type Graded,
  type ReviewItem,
} from "@/lib/review-item";
import { ReviewSession } from "@/components/review/ReviewSession";
import { btn, quiet } from "@/components/review/srs-ui";
import { DeckFace } from "@/components/review/DeckFace";
import { AppBack } from "@/components/layout/AppBack";

// Card zoom levels (whole card content scales: text + images).
const SIZES = [1, 1.3, 1.6, 2];

type Mode = "review" | "browse";

/**
 * /cartes/<slug>/ — one Anki deck: today's review (spaced repetition,
 * lib/srs.ts, through components/review/ReviewSession.tsx) or a free flip-through,
 * the deck's settings (new cards per day, sub-deck, tag, direction, typed
 * answer, audio, pause; lib/srs-settings.ts) and its leeches. Progress is
 * per deck in localStorage (`srs:<slug>`); without storage the page falls
 * back to the plain flip-through.
 */
export function Flashcards({ slug, name, family = null }: { slug: string; name: string; family?: string | null }) {
  const locale = useLocale();
  const tr = (k: string, vars?: Record<string, string | number>) =>
    t(`flashcards.${k}`, vars, locale);
  const [deck, setDeck] = useState<DeckData | null>(null);
  const [error, setError] = useState(false);
  const [order, setOrder] = useState<number[]>([]);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [sizeIdx, setSizeIdx] = useState(0);
  // null = no storage → browse mode only, exactly the pre-SRS behaviour.
  const [progress, setProgressState] = useState<Progress | null>(null);
  // Mirror for the grade/undo callbacks, which must see the latest progress
  // even when two run before a re-render.
  const progressRef = useRef<Progress | null>(null);
  const setProgress = useCallback((p: Progress | null) => {
    progressRef.current = p;
    setProgressState(p);
  }, []);
  const [settings, setSettings] = useState<SrsSettings | null>(null);
  const [mode, setMode] = useState<Mode>("browse");
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [today, setToday] = useState(() => dayKey());
  const cardRef = useRef<HTMLButtonElement>(null);

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

  const cfg: DeckSettings = useMemo(
    () => deckSettings(settings ?? { retention: 0.9, decks: {} }, slug),
    [settings, slug],
  );
  const study = useMemo(() => (deck ? studyCards(deck, cfg) : []), [deck, cfg]);
  const ids = useMemo(() => study.map((c) => c.key), [study]);

  const makeQueue = useCallback(
    (d: DeckData, p: Progress, c: DeckSettings, day: string) => {
      const sc = studyCards(d, c);
      return buildQueue(
        sc.map((x) => x.key),
        p,
        day,
        c.newPerDay,
      ).map((i) => deckReviewItem(slug, d, sc[i], c, p.cards[sc[i].key]));
    },
    [slug],
  );

  useEffect(() => {
    let cancel = false;
    fetch(`/anki/${slug}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: DeckData) => {
        if (cancel) return;
        setDeck(d);
        setOrder(d.cards.map((_, i) => i));
        if (!storageOk()) return;
        const s = loadSettings();
        setSettings(s);
        const stored = loadDeckProgress(slug);
        const p = migrateDeck(stored, d);
        if (p !== stored) saveDeckProgress(slug, p);
        setProgress(p);
        const day = dayKey();
        const q = makeQueue(d, p, deckSettings(s, slug), day);
        setToday(day);
        setQueue(q);
        if (q.length) setMode("review");
      })
      .catch(() => !cancel && setError(true));
    return () => {
      cancel = true;
    };
  }, [slug, makeQueue, setProgress]);

  const reviewing = mode === "review" && progress !== null;
  const summary = useMemo(
    () => (progress ? summarize(ids, progress, today, cfg.newPerDay) : null),
    [ids, progress, today, cfg.newPerDay],
  );

  const startMode = useCallback(
    (m: Mode, p: Progress | null = progressRef.current, c: DeckSettings = cfg) => {
      setFlipped(false);
      setMode(m);
      if (m === "review" && p && deck) {
        const day = dayKey();
        setToday(day);
        setQueue(makeQueue(deck, p, c, day));
      } else setPos(0);
    },
    [cfg, deck, makeQueue],
  );

  const onGrade = useCallback(
    (head: ReviewItem, g: Grade): Graded | undefined => {
      const before = progressRef.current;
      if (!before || head.kind !== "deck") return undefined;
      const next = gradeCard(before, head.id, g, today);
      saveDeckProgress(slug, next);
      setProgress(next);
      return {
        state: next.cards[head.id],
        undo: () => {
          saveDeckProgress(slug, before);
          setProgress(before);
        },
      };
    },
    [today, slug, setProgress],
  );

  const updateDeck = (patch: Partial<DeckSettings>) => {
    if (!settings) return;
    const s = withDeck(settings, slug, patch);
    saveSettings(s);
    setSettings(s);
    if (mode === "review") startMode("review", progressRef.current, deckSettings(s, slug));
    else setPos(0);
  };
  const setRetention = (r: number) => {
    if (!settings) return;
    const s = { ...settings, retention: r };
    saveSettings(s);
    setSettings(s);
  };

  const toggleSuspend = (id: string, on: boolean) => {
    const p = progressRef.current;
    if (!p) return;
    const next = setSuspended(p, id, on);
    saveDeckProgress(slug, next);
    setProgress(next);
    if (on) setQueue((q) => q.filter((x) => x.id !== id));
  };

  // --- browse mode ----------------------------------------------------------
  const browse = useMemo(() => {
    // The free flip-through follows the order (shuffle) over the cards in play.
    const inPlay = new Map(study.map((c) => [c.idx, c] as const));
    return order.flatMap((i) => (inPlay.has(i) ? [inPlay.get(i)!] : []));
  }, [order, study]);
  const browseCard = deck && browse.length ? browse[Math.min(pos, browse.length - 1)] : null;
  const browseFaces = deck && browseCard ? faces(deck.cards[browseCard.idx], browseCard.rev) : null;

  const go = useCallback(
    (delta: number) => {
      setFlipped(false);
      setPos((p) => (browse.length ? (p + delta + browse.length) % browse.length : 0));
    },
    [browse.length],
  );
  const flip = useCallback(() => setFlipped((f) => !f), []);
  // The card's front/back HTML can itself contain a `.pron-btn` pronunciation
  // player nested inside this flip button; let that handle its own click
  // instead of also flipping the card away under it.
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
    if (reviewing) return; // ReviewSession has its own keys
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable], summary")) return;
      if (e.key === " " || e.key === "Enter") {
        // Let a focused control (Prev/Next/Shuffle/…) activate natively; the card
        // is itself a <button> so it still flips on Space/Enter when focused.
        if (el?.closest("button, a")) return;
        e.preventDefault();
        flip();
      } else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flip, go, reviewing]);

  const reset = () => {
    if (!window.confirm(tr("resetConfirm"))) return;
    const p = emptyProgress();
    saveDeckProgress(slug, null);
    setProgress(p);
    startMode("review", p);
  };

  const nextDay =
    reviewing && progress && !queue.length ? nextReviewDay(ids, progress, today) : null;
  const fmtDay = (day: string) =>
    new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(
      new Date(`${day}T12:00:00`),
    );

  // Leeches and suspended cards of the deck, in deck order.
  const troubled = useMemo(() => {
    if (!deck || !progress) return [];
    return study.filter((c) => {
      const st = progress.cards[c.key];
      return st && (isLeech(st) || st.sus);
    });
  }, [deck, progress, study]);

  const hasAudio = useMemo(
    () => !!deck?.cards.slice(0, 200).some((c) => /pron-btn/.test(c.front + c.back)),
    [deck],
  );
  const tags = useMemo(() => (deck ? tagCounts(deck) : []), [deck]);
  const zoom = SIZES[sizeIdx];
  const cardCount = study.length;

  return (
    <main
      id="main"
      className="flashcards-main mx-auto px-5 py-12 text-ink transition-[max-width] duration-200"
      style={{ maxWidth: `${60 * zoom}rem` }}
    >
      {/* A plain link, like the rest of /cartes/: next/link would make scripts/prune-rsc.mjs keep RSC payloads. */}
      <AppBack href="/cartes/" labelKey="tabbar.review" />
      <a
        href="/cartes/"
        className="old-back text-micro font-semibold uppercase tracking-[0.1em] text-muted-warm no-underline hover:bg-transparent hover:text-ink"
      >
        ← {t("tabbar.review", undefined, locale)}
      </a>

      <header className="fc-head">
        <h1 className="fc-title">
          {name}
          {cfg.sub && <span className="text-muted-warm"> › {cfg.sub}</span>}
        </h1>
        {cardCount > 0 && !(reviewing && !queue.length) && (
          <span className="fc-count">
            {reviewing ? `${queue.length} ${tr("left")}` : `${pos + 1} / ${browse.length}`}
          </span>
        )}
      </header>

      {deck && progress && summary && (
        <div className="fc-bar">
          <div role="group" aria-label={tr("modes")} className="fc-seg">
            {(["review", "browse"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => mode !== m && startMode(m)}
              >
                {tr(m === "review" ? "modeReview" : "modeBrowse")}
              </button>
            ))}
          </div>
          <dl className="fc-stats">
            {(
              [
                ["due", summary.due],
                ["fresh", summary.fresh],
                ["learned", summary.learned],
              ] as const
            ).map(([k, n]) => (
              <div key={k} className="fc-stat">
                <dt>{tr(k)}</dt>
                <dd>{n}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {cfg.paused && progress && (
        <p className="mb-5 mt-0 text-small italic text-muted-warm">{tr("pausedNote")}</p>
      )}

      {error ? (
        <p className="italic text-muted-warm">{tr("err")}</p>
      ) : !deck ? (
        <GrowLoader>{tr("loading")}</GrowLoader>
      ) : !cardCount ? (
        <p className="italic text-muted-warm">{tr("empty")}</p>
      ) : reviewing ? (
        <ReviewSession
          queue={queue}
          setQueue={setQueue}
          onGrade={onGrade}
          today={today}
          zoom={zoom}
          families={{ [slug]: family }}
          done={nextDay ? tr("doneNext", { date: fmtDay(nextDay) }) : tr("done")}
        />
      ) : (
        browseFaces && (
          <>
            <button
              ref={cardRef}
              type="button"
              onClick={handleCardClick}
              aria-label={tr("flip")}
              className="flex w-full cursor-pointer items-center justify-center rounded-md border border-rule bg-paper p-6 text-center transition-[min-height] duration-200 hover:bg-paper sm:p-8"
              style={{ minHeight: `${22 * zoom}rem` }}
            >
              <DeckFace
                slug={slug}
                css={deck.css}
                html={flipped ? browseFaces.back : browseFaces.front}
                zoom={zoom}
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
            </div>
            <p className="kbd-only mt-4 text-center text-micro italic text-muted-warm">{tr("hint")}</p>
          </>
        )
      )}

      {deck && cardCount > 0 && (
        // No room to enlarge on a phone.
        <p className="mt-4 hidden text-center sm:block">
          <button type="button" className={quiet} onClick={cycleSize} aria-label={tr("size")}>
            {tr("size")}
            {zoom !== 1 ? ` ×${zoom}` : ""}
          </button>
        </p>
      )}

      {deck && progress && settings && (
        <details className="fc-panel deck-settings">
          <PanelSummary icon={GEAR}>{tr("settings")}</PanelSummary>
          <div className="fc-panel-body grid gap-4 text-small sm:grid-cols-2">
            <Field label={tr("newPerDay")}>
              <select
                value={cfg.newPerDay}
                onChange={(e) => updateDeck({ newPerDay: Number(e.target.value) })}
              >
                {[...new Set([...NEW_PER_DAY_CHOICES, cfg.newPerDay])]
                  .sort((a, b) => a - b)
                  .map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
              </select>
            </Field>
            {deck.subs && deck.subs.length > 1 && (
              <Field label={tr("subdeck")}>
                <select value={cfg.sub} onChange={(e) => updateDeck({ sub: e.target.value })}>
                  <option value="">{tr("allCards")}</option>
                  {deck.subs.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {tags.length > 0 && (
              <Field label={tr("tag")}>
                <select value={cfg.tag} onChange={(e) => updateDeck({ tag: e.target.value })}>
                  <option value="">{tr("allCards")}</option>
                  {tags.map(([tag, n]) => (
                    <option key={tag} value={tag}>
                      {tagLabel(tag)} ({n})
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {canReverse(deck) && (
              <Field label={tr("direction")}>
                <select
                  value={cfg.dir}
                  onChange={(e) => updateDeck({ dir: e.target.value as DeckSettings["dir"] })}
                >
                  {DIRECTIONS.map((d) => (
                    <option key={d} value={d}>
                      {tr(`dir_${d}`)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label={tr("retention")} hint={tr("retentionHint")}>
              <select value={settings.retention} onChange={(e) => setRetention(Number(e.target.value))}>
                {RETENTIONS.map((r) => (
                  <option key={r} value={r}>
                    {Math.round(r * 100)} %
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Check checked={cfg.typed} onChange={(v) => updateDeck({ typed: v })} label={tr("typed")} />
              {hasAudio && (
                <Check checked={cfg.autoplay} onChange={(v) => updateDeck({ autoplay: v })} label={tr("autoplay")} />
              )}
              <Check checked={cfg.paused} onChange={(v) => updateDeck({ paused: v })} label={tr("paused")} />
            </div>
          </div>
        </details>
      )}

      {deck && progress && troubled.length > 0 && (
        <details className="fc-panel deck-leeches">
          <PanelSummary icon={LEECH}>{tr("leeches", { count: troubled.length })}</PanelSummary>
          <div className="fc-panel-body">
          <p className="mt-0 text-small text-ink-2">{tr("leechesIntro")}</p>
          <ul className="m-0 mt-3 list-none border-t border-rule p-0">
            {troubled.map((c) => {
              const st = progress.cards[c.key];
              const f = faces(deck.cards[c.idx], c.rev);
              return (
                <li key={c.key} className="flex items-baseline justify-between gap-4 border-b border-rule py-2.5">
                  <span className="min-w-0 flex-1" dir="auto">
                    {firstLine(f.front) || "—"}
                    <span className="block text-micro text-muted-warm">
                      {tr("lapses", { count: st.lapses })}
                      {st.sus ? ` · ${tr("suspended")}` : ""}
                    </span>
                  </span>
                  <button type="button" className={`${quiet} shrink-0`} onClick={() => toggleSuspend(c.key, !st.sus)}>
                    {st.sus ? tr("unsuspend") : tr("suspend")}
                  </button>
                </li>
              );
            })}
          </ul>
          </div>
        </details>
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

// The two folds (settings, troubled cards) open from a row like the
// /cartes/ index's (CartesPhone.tsx): icon tile, label, chevron.
const icon = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);
const GEAR = icon(
  <>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </>,
);
const LEECH = icon(<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />);

function PanelSummary({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <summary className="fc-sum">
      <span className="rv-ico">{icon}</span>
      <span className="fc-sum-tx">{children}</span>
      <svg className="rv-chev" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="m9 5 7 7-7 7" />
      </svg>
    </summary>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="deck-field flex flex-col gap-1">
      <span className="deck-field-label">{label}</span>
      {children}
      {hint && <span className="text-micro text-muted-warm">{hint}</span>}
    </label>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-baseline gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
