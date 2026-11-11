"use client";

import { useEffect, useRef, useState } from "react";

/** How long the press must last, in ms. */
const HOLD_MS = 1500;
/** How fast an early release empties the button again. */
const DRAIN_MS = 400;

/**
 * A button for what can't be undone: it fills while it is held (pointer,
 * Space or Enter) and acts only once full, after HOLD_MS. Let go before and
 * it empties and its label says what to do (`tooShort`) for a moment. Replaces a `confirm()`
 * or a word to type: the press is the confirmation, the same on a phone, a
 * mouse or a keyboard. The fill is a layer of the button's own text colour
 * (global.css `.hold-btn`), so it suits any button it is given the class of.
 */
export function HoldButton({
  className = "",
  children,
  hint,
  tooShort,
  onConfirm,
  disabled,
}: {
  className?: string;
  children: React.ReactNode;
  /** The tooltip, read out as its description: "keep pressing until …". */
  hint: string;
  /** Said when the button is let go of too early. */
  tooShort: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const state = useRef({ p: 0, dir: 0, last: 0, raf: 0, sayT: 0, done: false });
  const [said, setSaid] = useState("");

  useEffect(() => {
    const s = state.current;
    return () => {
      cancelAnimationFrame(s.raf);
      clearTimeout(s.sayT);
    };
  }, []);

  const paint = () =>
    ref.current?.style.setProperty("--hold", String(state.current.p));

  const tick = (t: number) => {
    const s = state.current;
    const dt = s.last ? t - s.last : 16;
    s.last = t;
    s.p = Math.min(
      1,
      Math.max(0, s.p + (s.dir > 0 ? dt / HOLD_MS : -dt / DRAIN_MS)),
    );
    paint();
    if (s.dir > 0 && s.p >= 1) {
      s.dir = 0;
      s.done = true;
      navigator.vibrate?.(20);
      onConfirm();
      // Ready again a moment later, if it is still on screen.
      s.sayT = window.setTimeout(() => {
        s.done = false;
        s.p = 0;
        paint();
      }, 1200);
      return;
    }
    if (s.dir < 0 && s.p <= 0) {
      s.dir = 0;
      return;
    }
    s.raf = requestAnimationFrame(tick);
  };

  const run = (dir: 1 | -1) => {
    const s = state.current;
    if (s.done || disabled) return;
    s.dir = dir;
    s.last = 0;
    cancelAnimationFrame(s.raf);
    s.raf = requestAnimationFrame(tick);
  };

  const start = () => {
    setSaid("");
    run(1);
  };
  const stop = () => {
    const s = state.current;
    if (s.dir <= 0 || s.done) return;
    if (s.p < 0.6) {
      setSaid(tooShort);
      clearTimeout(s.sayT);
      s.sayT = window.setTimeout(() => setSaid(""), 1800);
    }
    run(-1);
  };

  return (
    <button
      ref={ref}
      type="button"
      className={`${className} hold-btn`.trim()}
      disabled={disabled}
      title={hint}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        start();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") stop();
      }}
      onBlur={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="hold-btn-fill" aria-hidden="true" />
      <span className="hold-btn-label" aria-live="polite">
        {said || children}
      </span>
    </button>
  );
}
