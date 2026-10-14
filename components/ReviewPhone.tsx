"use client";

import { useRef, useState } from "react";
import { GRADES, type Grade } from "@/lib/srs";
import { diff } from "@/lib/typed-answer";
import type { ReviewItem } from "@/lib/review-item";
import { DeckFace } from "@/components/DeckFace";
import { formatInterval } from "@/components/ReviewSession";

// The review session on a phone (ReviewSession.tsx renders this below 640px):
// a full-screen layer with a close button, the progress and an undo button on
// top; the card on a small stack of the ones left; four large grade tiles in
// a glass bar, or a swipe (right: "Bien", left: "À revoir") with a stamp
// that names the grade before the card is let go. Typed answers get their
// own layout: the prompt, the field, then a band that says right or wrong.
// The end screen sums the session up. Styles: assets/css/app.css (".rsm").

type Tr = (k: string, v?: Record<string, string | number>) => string;
type Next = Record<Grade, { iv: number }> | null;

export interface SessionEnd {
  /** Time since the session opened. */
  ms: number;
  /** Days in a row with some activity, today included. */
  run: number;
  /** This week, Monday first: active, idle, or still to come (null). */
  week: (boolean | null)[];
}

const SWIPE = 90;

const svg = (d: React.ReactNode, w = 2) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
const ICON = {
  close: svg(<path d="M6 6l12 12M18 6 6 18" />, 2.2),
  undo: svg(<path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />),
  sound: svg(
    <>
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
    </>,
    1.8,
  ),
  lang: svg(
    <>
      <path d="M4 5h8M8 3v2M5.5 5c.8 3 2.8 5.3 5.5 6.5M10.5 5C9.7 8 7.6 10.5 4.5 12" />
      <path d="m12.5 20 4-9 4 9M14 17h5" />
    </>,
    1.8,
  ),
  cards: svg(
    <>
      <rect x="4" y="6" width="13" height="15" rx="2" />
      <path d="M8 3h10a2 2 0 0 1 2 2v12" />
    </>,
    1.8,
  ),
  check: svg(<path d="m5 12.5 4.5 4.5L19 7.5" />, 2.6),
  flame: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.7 2-4.5 0 2 1 3 2 3 0-4 1-6.5 1-8.5z" />
    </svg>
  ),
};

/** The answer part of a card's back: what follows its `<hr id=answer>`. */
function answerPart(html: string): string {
  const parts = html.split(/<hr\b[^>]*>/i);
  return parts.length > 1 ? parts.slice(1).join("") : html;
}

export function PhoneSession({
  tr,
  locale,
  head,
  family,
  queueLength,
  done,
  total,
  revealed,
  next,
  typed,
  setTyped,
  match,
  run,
  canUndo,
  zoom,
  onReveal,
  onGrade,
  onUndo,
  onClose,
  surfaceRef,
  faceRef,
  revealRef,
  inputRef,
}: {
  tr: Tr;
  locale: string;
  head: ReviewItem;
  family: string | null;
  queueLength: number;
  done: number;
  total: number;
  revealed: boolean;
  next: Next;
  typed: string;
  setTyped: (v: string) => void;
  match: boolean | null;
  run: { n: number; lost: boolean };
  canUndo: boolean;
  zoom: number;
  onReveal: () => void;
  onGrade: (g: Grade) => void;
  onUndo: () => void;
  onClose: () => void;
  surfaceRef: React.RefObject<HTMLElement | null>;
  faceRef: React.RefObject<HTMLDivElement | null>;
  revealRef: React.RefObject<HTMLButtonElement | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; on: boolean } | null>(null);
  const expected = head.kind === "deck" ? head.expected : null;
  const typedMode = expected != null;
  const html = head.kind === "deck" ? (revealed && !typedMode ? head.back : head.front) : "";
  const sound = head.kind === "deck" && /pron-btn/.test(html);
  const iv = (g: Grade) => (next ? formatInterval(next[g].iv, locale, tr) : "");
  const swipeGrade: Grade | null = dx > 20 ? "good" : dx < -20 ? "again" : null;
  const armed = Math.abs(dx) >= SWIPE;

  const play = () => faceRef.current?.querySelector<HTMLButtonElement>(".pron-btn")?.click();

  const onTouchStart = (e: React.TouchEvent) => {
    const t0 = e.touches[0];
    start.current = revealed && !typedMode && e.touches.length === 1 ? { x: t0.clientX, y: t0.clientY, on: false } : null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = start.current;
    if (!s) return;
    const t1 = e.touches[0];
    const x = t1.clientX - s.x;
    const y = t1.clientY - s.y;
    // Horizontal moves only; a vertical one lets the card scroll.
    if (!s.on && Math.abs(x) > 8 && Math.abs(x) > 1.5 * Math.abs(y)) s.on = true;
    if (s.on) setDx(x);
  };
  const onTouchEnd = () => {
    const s = start.current;
    start.current = null;
    if (!s?.on) return;
    const g = dx >= SWIPE ? "good" : dx <= -SWIPE ? "again" : null;
    setDx(0);
    if (g) onGrade(g);
  };

  const source = head.kind === "deck" ? head.deckName : head.item.title;
  const pct = total ? (100 * done) / total : 0;

  const top = (
    <div className="rsm-top">
      <button type="button" className="rsm-gbtn glass" onClick={onClose} aria-label={tr("rs.close")}>
        {ICON.close}
      </button>
      <div className="rsm-prog">
        <span className="rsm-cnt">
          {done} / {total}
        </span>
        <div
          className="rsm-bar"
          role="progressbar"
          aria-label={tr("flashcards.progress")}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
        >
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>
      <button
        type="button"
        className="rsm-gbtn glass"
        onClick={onUndo}
        disabled={!canUndo}
        aria-label={tr("flashcards.undo")}
        aria-keyshortcuts="z"
      >
        {ICON.undo}
      </button>
    </div>
  );

  if (typedMode && head.kind === "deck") {
    const d = revealed && !match ? diff(typed, expected) : null;
    return (
      <div className="rsm rsm-typed" data-family={family ?? undefined} role="dialog" aria-modal="true" aria-label={source}>
        {top}
        <div className="rsm-chip-row">
          {(run.n > 1 || run.lost) && (
            <span className={`rsm-run${run.n > 1 ? "" : " lost"}`}>
              {ICON.flame}
              {run.n > 1 ? tr("rs.run", { n: run.n }) : tr("rs.runLost")}
            </span>
          )}
        </div>
        <section ref={surfaceRef} tabIndex={-1} className="rsm-ask" aria-label={source}>
          <p className="rsm-kicker">{tr(family === "langues" ? "rs.translate" : "rs.answer")}</p>
          <div className="rsm-prompt">
            {sound && (
              <button type="button" className="rsm-play" onClick={play} aria-label={tr("rs.listen")}>
                {ICON.sound}
              </button>
            )}
            <div className="rsm-face">
              <DeckFace slug={head.slug} css={head.css} html={head.front} zoom={zoom} faceRef={faceRef} />
            </div>
          </div>
        </section>
        <label className="sr-only" htmlFor="rsm-typed">
          {tr("flashcards.typeLabel")}
        </label>
        <input
          ref={inputRef}
          id="rsm-typed"
          className={`rsm-inp${revealed ? (match ? " ok" : " ko") : ""}`}
          type="text"
          dir="auto"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={tr("rs.typeHere")}
          value={typed}
          readOnly={revealed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (!revealed) onReveal();
            else onGrade(match ? "good" : "again");
          }}
        />
        {!revealed ? (
          <div className="rsm-foot">
            <button ref={revealRef} type="button" className="rsm-btn rsm-big" onClick={onReveal}>
              {tr(typed.trim() ? "rs.check" : "quiz.reveal")}
            </button>
          </div>
        ) : (
          <div className={`rsm-fb ${match ? "ok" : "ko"}`} aria-live="polite">
            <h2>
              <i>{match ? ICON.check : ICON.close}</i>
              {tr(match ? "rs.right" : typed.trim() ? "rs.almost" : "rs.answerWas")}
            </h2>
            {match ? (
              <div className="rsm-fb-more" dangerouslySetInnerHTML={{ __html: answerPart(head.back) }} />
            ) : (
              <p>
                <b>{tr("rs.expected")}</b>{" "}
                <span dir="auto">
                  {d
                    ? d.expected.map((s, i) => (s.ok ? <span key={i}>{s.text}</span> : <ins key={i}>{s.text}</ins>))
                    : expected}
                </span>
                <small>{tr("rs.comesBack")}</small>
              </p>
            )}
            <button type="button" className="rsm-btn" onClick={() => onGrade(match ? "good" : "again")}>
              {tr("rs.continue")}
            </button>
          </div>
        )}
      </div>
    );
  }

  const hint = !revealed
    ? tr("rs.tapHint")
    : armed && swipeGrade
      ? tr("rs.release", { g: tr(`flashcards.${swipeGrade}`) })
      : tr("rs.swipeHint");

  return (
    <div className="rsm" data-family={family ?? undefined} role="dialog" aria-modal="true" aria-label={source}>
      {top}
      {swipeGrade && (
        <div
          className={`rsm-edge ${swipeGrade}`}
          style={{ opacity: Math.min(1, Math.abs(dx) / SWIPE) }}
          aria-hidden="true"
        />
      )}
      <div className="rsm-chip-row">
        <span className="rsm-chip">
          <i>{family === "langues" ? ICON.lang : ICON.cards}</i>
          <span>
            {source} · {tr(head.state ? "rs.due" : "rs.new")}
          </span>
        </span>
      </div>
      <div className="rsm-stack" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={() => setDx(0)}>
        {queueLength > 2 && <div className="rsm-fc b2" aria-hidden="true" />}
        {queueLength > 1 && <div className="rsm-fc b1" aria-hidden="true" />}
        <section
          ref={surfaceRef}
          tabIndex={-1}
          aria-label={source}
          className={`rsm-fc rsm-card${dx ? " drag" : ""}`}
          style={dx ? { transform: `translateX(${dx}px) rotate(${dx / 10}deg)` } : undefined}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest(".pron-btn, a, button")) return;
            if (!revealed) onReveal();
          }}
        >
          <span className="rsm-tag">
            {head.kind === "note" ? tr("rs.question") : tr(revealed ? "rs.back" : "rs.front")}
          </span>
          {sound && (
            <button type="button" className="rsm-snd" onClick={play} aria-label={tr("rs.listen")}>
              {ICON.sound}
            </button>
          )}
          {swipeGrade && (
            <span className={`rsm-stamp ${swipeGrade}`} style={{ opacity: Math.min(1, Math.abs(dx) / SWIPE) }}>
              {tr(`flashcards.${swipeGrade}`)} · {iv(swipeGrade)}
            </span>
          )}
          <div className="rsm-face">
            {head.kind === "deck" ? (
              <DeckFace slug={head.slug} css={head.css} html={html} zoom={zoom} faceRef={faceRef} />
            ) : (
              <>
                <div className="rsm-q" dangerouslySetInnerHTML={{ __html: head.item.q }} />
                {revealed && (
                  <>
                    <hr />
                    <div className="rsm-a" dangerouslySetInnerHTML={{ __html: head.item.a }} />
                    <a className="rsm-open" href={head.item.url}>
                      {tr("noteReview.openNote")}
                    </a>
                  </>
                )}
              </>
            )}
          </div>
        </section>
      </div>
      <p className="rsm-hint">{hint}</p>
      <div className="rsm-foot">
        {revealed && next ? (
          <div className={`rsm-grades glass${dx ? " dim" : ""}`} role="group" aria-label={tr("flashcards.grades")}>
            {GRADES.map((g, i) => (
              <button
                key={g}
                type="button"
                className={`rsm-g ${g}`}
                onClick={() => onGrade(g)}
                aria-keyshortcuts={String(i + 1)}
              >
                <b>{tr(`flashcards.${g}`)}</b>
                <small>{iv(g)}</small>
              </button>
            ))}
          </div>
        ) : (
          <button ref={revealRef} type="button" className="rsm-btn rsm-big" onClick={onReveal}>
            {tr("quiz.reveal")}
          </button>
        )}
      </div>
    </div>
  );
}

export function PhoneEnd({
  tr,
  locale,
  n,
  again,
  end,
  note,
  doneRef,
  onClose,
}: {
  tr: Tr;
  locale: string;
  n: number;
  again: number;
  end: SessionEnd;
  note: React.ReactNode;
  doneRef: React.RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
}) {
  const pct = n ? Math.round((100 * (n - again)) / n) : 0;
  const minutes = Math.max(1, Math.round(end.ms / 60000));
  const day = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  // 2024-01-01 was a Monday.
  const names = Array.from({ length: 7 }, (_, i) => day.format(new Date(2024, 0, 1 + i)));
  return (
    <div className="rsm rsm-end" role="dialog" aria-modal="true" aria-labelledby="rsm-done">
      <div className="rsm-top">
        <button type="button" className="rsm-gbtn glass" onClick={onClose} aria-label={tr("rs.close")}>
          {ICON.close}
        </button>
      </div>
      <div className="rsm-ring" style={{ "--p": pct / 100 } as React.CSSProperties}>
        <div>
          <b>{pct} %</b>
          <small>{tr("rs.retained")}</small>
        </div>
      </div>
      <h2 id="rsm-done" ref={doneRef} tabIndex={-1}>
        {tr("rs.doneTitle")}
      </h2>
      {note && <p className="rsm-end-note">{note}</p>}
      <div className="rsm-stats">
        <div>
          <b>{n}</b>
          <small>{tr("rs.cards")}</small>
        </div>
        <div>
          <b>{tr("rs.minutes", { n: minutes })}</b>
          <small>{tr("rs.ofReview")}</small>
        </div>
        <div>
          <b>
            {ICON.flame}
            {end.run}
          </b>
          <small>{tr("rs.daysRun")}</small>
        </div>
      </div>
      {end.week.length === 7 && (
        <div className="rsm-week">
          {end.week.map((on, i) => (
            <span key={i} className={on ? "y" : undefined}>
              <i>{on && ICON.check}</i>
              {names[i]}
            </span>
          ))}
        </div>
      )}
      <div className="rsm-foot rsm-end-actions">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full load leaves the session for the hub */}
        <a className="rsm-btn rsm-big" href="/cartes/">
          {tr("rs.finish")}
        </a>
      </div>
    </div>
  );
}
