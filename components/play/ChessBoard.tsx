"use client";

import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { Chess, Square } from "chess.js";
import { PIECE_SVG } from "@/lib/chess-pieces";

// The board of /echecs/: squares as buttons (tap a piece, then where it
// goes, or drag it there with a finger or the mouse), the last move, the check, the moves of the selected piece, marks
// for the review (the move played in red, the better one as an arrow) and
// the coach's hint (a pulsing square, then an arrow). Pieces are SVG
// (lib/chess-pieces.ts).

const FILES = "abcdefgh";

export function PieceIcon({ piece, className }: { piece: string; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 45 45"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: PIECE_SVG[piece] ?? "" }}
    />
  );
}

export interface BoardProps {
  pos: Chess;
  flip: boolean;
  label: string;
  /** Accessible name of each square: "e4 cavalier blanc". */
  squareLabel: (sq: Square, piece: string | null) => string;
  sel?: Square | null;
  targets?: Set<string>;
  last?: { from: string; to: string } | null;
  bad?: string[];
  pulse?: string | null;
  arrow?: { from: string; to: string; tone: "good" | "hint" } | null;
  onTap?: (sq: Square) => void;
  /** Pieces that can be picked up and dragged (the player's, on their turn). */
  canDrag?: (sq: Square) => boolean;
  /** A drag began on `sq`: show its moves. */
  onDragStart?: (sq: Square) => void;
  /** A dragged piece was let go on `to` (any square: the caller checks). */
  onDrop?: (from: Square, to: Square) => void;
  /** Promotion picker over the target square. */
  promo?: {
    to: string;
    color: "w" | "b";
    pick: (p: "q" | "r" | "b" | "n") => void;
    cancel: () => void;
  } | null;
}

function centre(sq: string, flip: boolean): [number, number] {
  const f = FILES.indexOf(sq[0]);
  const r = Number(sq[1]);
  const x = flip ? 7 - f : f;
  const y = flip ? r - 1 : 8 - r;
  return [x * 12.5 + 6.25, y * 12.5 + 6.25];
}

export function ChessBoard({
  pos,
  flip,
  label,
  squareLabel,
  sel,
  targets,
  last,
  bad,
  pulse,
  arrow,
  onTap,
  canDrag,
  onDragStart,
  onDrop,
  promo,
}: BoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  // The press under way: where it started, and whether it became a drag
  // (past a few pixels; below that it stays a tap and the click handles it).
  const press = useRef<{ id: number; sq: Square; x: number; y: number; touch: boolean; drag: boolean } | null>(null);
  const [drag, setDrag] = useState<{ from: Square; over: Square | null; touch: boolean } | null>(null);
  const at = useRef<[number, number]>([0, 0]);

  const squareAt = (x: number, y: number): Square | null => {
    const r = boardRef.current?.getBoundingClientRect();
    if (!r || x < r.left || y < r.top || x >= r.right || y >= r.bottom) return null;
    const col = Math.floor(((x - r.left) / r.width) * 8);
    const row = Math.floor(((y - r.top) / r.height) * 8);
    const f = flip ? 7 - col : col;
    const rank = flip ? row + 1 : 8 - row;
    return `${FILES[f]}${rank}` as Square;
  };
  const placeGhost = (x: number, y: number, touch: boolean) => {
    at.current = [x, y];
    const g = ghostRef.current;
    const r = boardRef.current?.getBoundingClientRect();
    if (!g || !r) return;
    const size = r.width / 8;
    // Under a finger the piece rides above it, bigger, so it stays visible.
    const lift = touch ? size * 0.75 : 0;
    g.style.width = g.style.height = `${size}px`;
    g.style.transform = `translate(${x - size / 2}px, ${y - size / 2 - lift}px)`;
  };
  // The ghost mounts on the first move of a drag: put it under the pointer
  // before it paints.
  const dragging = drag !== null;
  const dragTouch = drag?.touch ?? false;
  useLayoutEffect(() => {
    if (dragging) placeGhost(at.current[0], at.current[1], dragTouch);
  }, [dragging, dragTouch]);
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !onDrop || !canDrag) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-sq]");
    const sq = el?.dataset.sq as Square | undefined;
    if (!sq || !canDrag(sq)) return;
    press.current = { id: e.pointerId, sq, x: e.clientX, y: e.clientY, touch: e.pointerType !== "mouse", drag: false };
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    if (!p.drag) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
      p.drag = true;
      boardRef.current?.setPointerCapture(e.pointerId);
      onDragStart?.(p.sq);
      navigator.vibrate?.(8);
    }
    const over = squareAt(e.clientX, e.clientY);
    setDrag((d) => (d && d.over === over ? d : { from: p.sq, over, touch: p.touch }));
    placeGhost(e.clientX, e.clientY, p.touch);
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    press.current = null;
    if (!p.drag) return;
    setDrag(null);
    const to = squareAt(e.clientX, e.clientY);
    if (to && to !== p.sq) onDrop?.(p.sq, to);
  };
  const cancel = () => {
    press.current = null;
    setDrag(null);
  };

  const ranks = flip ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = flip ? FILES.split("").reverse() : FILES.split("");
  let checkSq: string | null = null;
  if (pos.inCheck()) {
    for (const row of pos.board())
      for (const p of row) if (p && p.type === "k" && p.color === pos.turn()) checkSq = p.square;
  }
  const lifted = drag ? pos.get(drag.from) : null;
  const ghostPiece = lifted ? lifted.color + lifted.type : "";
  let arrowEl = null;
  if (arrow) {
    const [x1, y1] = centre(arrow.from, flip);
    const [x2, y2] = centre(arrow.to, flip);
    const a = Math.atan2(y2 - y1, x2 - x1);
    const ex = x2 - Math.cos(a) * 3.6;
    const ey = y2 - Math.sin(a) * 3.6;
    const h = (d: number): string =>
      `${(x2 - Math.cos(a + d) * 4.4).toFixed(2)} ${(y2 - Math.sin(a + d) * 4.4).toFixed(2)}`;
    arrowEl = (
      <svg className={`chess-arrow is-${arrow.tone}`} viewBox="0 0 100 100" aria-hidden="true">
        <line x1={x1} y1={y1} x2={ex} y2={ey} />
        <path d={`M${x2} ${y2}L${h(0.55)}L${h(-0.55)}Z`} />
      </svg>
    );
  }
  return (
    <div
      ref={boardRef}
      className={`chess-board${drag ? " is-dragging" : ""}`}
      role="grid"
      aria-label={label}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      // Taking the capture from the square fires this on the square too:
      // only the board losing it ends the drag.
      onLostPointerCapture={(e) => e.target === e.currentTarget && cancel()}
    >
      {ranks.map((r, ri) =>
        files.map((f, fi) => {
          const sq = `${f}${r}` as Square;
          const p = pos.get(sq);
          const key = p ? p.color + p.type : null;
          const dark = (FILES.indexOf(f) + r) % 2 === 0;
          const cls = [
            "chess-sq",
            dark ? "is-dark" : "",
            sel === sq ? "is-sel" : "",
            targets?.has(sq) ? (p ? "is-take" : "is-to") : "",
            last && (last.from === sq || last.to === sq) ? "is-last" : "",
            bad?.includes(sq) ? "is-bad" : "",
            pulse === sq ? "is-pulse" : "",
            checkSq === sq ? "is-check" : "",
            canDrag?.(sq) ? "is-mine" : "",
            drag?.from === sq ? "is-lifted" : "",
            drag?.over === sq && drag.from !== sq ? "is-over" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={sq}
              type="button"
              data-sq={sq}
              className={cls}
              onClick={onTap ? () => onTap(sq) : undefined}
              tabIndex={onTap ? 0 : -1}
              aria-label={squareLabel(sq, key)}
            >
              {key && <PieceIcon piece={key} className="chess-pc" />}
              {fi === 0 && <span className="chess-co is-rank">{r}</span>}
              {ri === 7 && <span className="chess-co is-file">{f}</span>}
            </button>
          );
        }),
      )}
      {arrowEl}
      {/* On <body>, so it can leave the board's rounded, clipped frame. */}
      {drag &&
        createPortal(
          <div ref={ghostRef} className={`chess-ghost${drag.touch ? " is-touch" : ""}`} aria-hidden="true">
            <PieceIcon piece={ghostPiece} />
          </div>,
          document.body,
        )}
      {promo && (
        <div className="chess-promo" role="dialog" onClick={promo.cancel}>
          <div className="chess-promo-box" onClick={(e) => e.stopPropagation()}>
            {(["q", "r", "b", "n"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => promo.pick(k)}
                aria-label={squareLabel(promo.to as Square, promo.color + k)}
              >
                <PieceIcon piece={promo.color + k} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
