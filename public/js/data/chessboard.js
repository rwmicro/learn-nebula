// The chessboard of the notes' chess widgets (`partie`, `echiquier`), drawn
// like the board of /echecs/ (components/play/ChessBoard.tsx): the same SVG
// pieces (lib/chess-pieces.ts, Unicode glyphs turned into emoji on iOS), the
// same square colours, the coordinates inside the edge squares, the last move
// in amber. Below it, the four move buttons as icons, and the move count.
import { el } from "../widget-kit.js";
import { PIECE_SVG } from "../../../lib/chess-pieces.ts";

const FILES = "abcdefgh";

/** A FEN letter ("K", "p"…) as the piece's SVG markup. */
function piece(letter) {
  const key =
    (letter === letter.toUpperCase() ? "w" : "b") + letter.toLowerCase();
  const inner = PIECE_SVG[key];
  if (!inner) return null;
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 45 45");
  s.setAttribute("aria-hidden", "true");
  s.setAttribute("class", "wc-pc");
  s.innerHTML = inner;
  return s;
}

/**
 * Fill `grid` (made by chessGrid()) with board `b` (8 rows of FEN letters or
 * "", rank 8 first). `last` holds the [row, col] of the last move's squares.
 */
export function drawBoard(grid, b, last = []) {
  const cells = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      const hit = last.some(([lr, lc]) => lr === r && lc === c);
      const sq = el("span", {
        "aria-hidden": "true",
        class:
          "wc-sq" + ((r + c) % 2 ? " is-dark" : "") + (hit ? " is-last" : ""),
      });
      if (c === 0)
        sq.appendChild(
          el("span", { class: "wc-co is-rank", "aria-hidden": "true" }, [
            String(8 - r),
          ]),
        );
      if (r === 7)
        sq.appendChild(
          el("span", { class: "wc-co is-file", "aria-hidden": "true" }, [
            FILES[c],
          ]),
        );
      const svgNode = p ? piece(p) : null;
      if (svgNode) sq.appendChild(svgNode);
      cells.push(sq);
    }
  grid.replaceChildren(...cells);
}

/** The board's element (focusable: ← and → replay the moves). The squares
 *  are drawn for the eyes; the move list and the comment say the game. */
export function chessGrid(label) {
  return el("div", {
    class: "wc-board",
    role: "group",
    tabindex: "0",
    "aria-label": label,
  });
}

const ICON = {
  first: '<path d="M7 6v12M18 6l-7 6 7 6"/>',
  prev: '<path d="M15 6l-6 6 6 6"/>',
  next: '<path d="M9 6l6 6-6 6"/>',
  last: '<path d="M17 6v12M6 6l7 6-7 6"/>',
};
function iconButton(kind, label, onclick) {
  const b = el("button", {
    type: "button",
    class: "wc-btn" + (kind === "next" ? " is-main" : ""),
    "aria-label": label,
    title: label,
    onclick,
  });
  b.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICON[kind]}</svg>`;
  return b;
}

/**
 * The move buttons under the board, and the count ("12 / 31"). `go(n)` jumps
 * to move n; `update(step)` refreshes the buttons' states and the count.
 */
export function moveNav(total, go) {
  let step = 0;
  const first = iconButton("first", "Début", () => go(0));
  const prev = iconButton("prev", "Coup précédent", () => go(step - 1));
  const next = iconButton("next", "Coup suivant", () => go(step + 1));
  const last = iconButton("last", "Fin", () => go(total));
  const count = el("span", { class: "wc-count", "aria-live": "polite" });
  const node = el("div", { class: "wc-nav" }, [first, prev, next, last, count]);
  const update = (n) => {
    step = n;
    first.disabled = prev.disabled = n <= 0;
    next.disabled = last.disabled = n >= total;
    count.textContent = `${n} / ${total}`;
  };
  update(0);
  return { node, update };
}

/** ← / → on the board (and Début / Fin keys) call go(). */
export function arrowKeys(grid, getStep, go, total) {
  grid.addEventListener("keydown", (e) => {
    const to = {
      ArrowRight: getStep() + 1,
      ArrowLeft: getStep() - 1,
      Home: 0,
      End: total,
    }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    go(to);
  });
}
