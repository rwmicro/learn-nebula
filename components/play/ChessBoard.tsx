"use client";

import type { Chess, Square } from "chess.js";
import { PIECE_SVG } from "@/lib/chess-pieces";

// The board of /echecs/: squares as buttons (tap a piece, then where it
// goes), the last move, the check, the moves of the selected piece, marks
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
  promo,
}: BoardProps) {
  const ranks = flip ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = flip ? FILES.split("").reverse() : FILES.split("");
  let checkSq: string | null = null;
  if (pos.inCheck()) {
    for (const row of pos.board())
      for (const p of row) if (p && p.type === "k" && p.color === pos.turn()) checkSq = p.square;
  }
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
    <div className="chess-board" role="grid" aria-label={label}>
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
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={sq}
              type="button"
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
