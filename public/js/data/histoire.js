// Two history widgets of the data pack:
//   partie  a chess game replayed move by move, with the note's comments
//   durees  how long empires (or any periods) lasted, on one time axis
import { el, svg, fmt, drawWidth, tooltip, esc } from "../widget-kit.js";

// ------------------------------------------------------------- partie

const GLYPH = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟︎" };
const START = ["rnbqkbnr", "pppppppp", "8", "8", "8", "8", "PPPPPPPP", "RNBQKBNR"];

function fenBoard(fen) {
  return fen.split(" ")[0].split("/").map((r) => [...r].flatMap((c) => (/\d/.test(c) ? Array(Number(c)).fill("") : [c])));
}
const sq = (s) => [8 - Number(s[1]), s.charCodeAt(0) - 97];

/** Board after the first `n` moves. Moves are coordinate notation (e2e4,
 *  e7e8q), as in the echiquier and ouverture widgets; castling is the king's
 *  move (e1g1), en passant a pawn's diagonal step to an empty square. */
export function boardAt(moves, n, fen) {
  const b = fen ? fenBoard(fen) : START.map((r) => (r === "8" ? Array(8).fill("") : [...r]));
  for (let k = 0; k < n && k < moves.length; k++) {
    const m = moves[k];
    const [fr, fc] = sq(m.slice(0, 2));
    const [tr, tc] = sq(m.slice(2, 4));
    const piece = b[fr][fc];
    if (!piece) continue;
    const lower = piece.toLowerCase();
    if (lower === "k" && Math.abs(tc - fc) === 2) {
      const [rf, rt] = tc > fc ? [7, 5] : [0, 3];
      b[fr][rt] = b[fr][rf];
      b[fr][rf] = "";
    }
    if (lower === "p" && fc !== tc && !b[tr][tc]) b[fr][tc] = "";
    b[tr][tc] = m[4] ? (piece === "P" ? m[4].toUpperCase() : m[4].toLowerCase()) : piece;
    b[fr][fc] = "";
  }
  return b;
}

export function partie(props) {
  const moves = String(props.coups || "").trim().split(/\s+/).filter((m) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m));
  if (!moves.length) throw new Error("pas de coup");
  const san = String(props.san || "").trim().split(/\s+/).filter(Boolean);
  const label = (i) => san[i] || moves[i];
  const comments = {};
  for (const k of Object.keys(props)) {
    const m = /^commentaire(\d+)$/.exec(k);
    if (m) comments[Number(m[1])] = props[k];
  }
  let step = 0;
  const grid = el("div", { class: "w-board l-board", tabindex: "0", "aria-label": "Échiquier ; flèches gauche et droite pour rejouer" });
  const list = el("div", { class: "l-moves" });
  const note = el("p", { class: "l-move-note", "aria-live": "polite" });
  const btns = moves.map((_, i) =>
    el("button", { type: "button", onclick: () => go(i + 1) }, [label(i)]),
  );
  // One unit per full move, so a move number never wraps away from its moves.
  for (let i = 0; i < btns.length; i += 2) list.appendChild(el("span", { class: "l-mv" }, [el("b", {}, [`${i / 2 + 1}.`]), btns[i], btns[i + 1]]));
  function draw() {
    const b = boardAt(moves, step, props.fen);
    const last = step ? [sq(moves[step - 1].slice(0, 2)), sq(moves[step - 1].slice(2, 4))] : [];
    const cells = [];
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        const p = b[r][c];
        const hit = last.some(([lr, lc]) => lr === r && lc === c);
        cells.push(
          el("i", { class: "w-sq" + ((r + c) % 2 ? " is-dark" : "") + (hit ? " is-last" : "") }, [
            p ? el("span", { class: p === p.toUpperCase() ? "l-pc-w" : "l-pc-b" }, [GLYPH[p.toLowerCase()]]) : null,
          ]),
        );
      }
    grid.replaceChildren(...cells);
    btns.forEach((x, i) => x.classList.toggle("is-current", i === step - 1));
    note.textContent = comments[step] || (step === 0 ? "Position de départ." : step === moves.length && props.fin ? props.fin : "");
  }
  const go = (n) => {
    step = Math.max(0, Math.min(moves.length, n));
    draw();
  };
  grid.addEventListener("keydown", (e) => {
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    go(step + d);
  });
  draw();
  return el("div", { class: "w-root l-partie" }, [
    props.titre && el("p", { class: "w-chart-title" }, [props.titre]),
    el("div", { class: "l-partie-grid" }, [
      el("div", {}, [
        grid,
        el("div", { class: "w-controls" }, [
          el("button", { type: "button", class: "w-btn", "aria-label": "Début", onclick: () => go(0) }, ["⏮"]),
          el("button", { type: "button", class: "w-btn", "aria-label": "Coup précédent", onclick: () => go(step - 1) }, ["◀"]),
          el("button", { type: "button", class: "w-btn is-active", "aria-label": "Coup suivant", onclick: () => go(step + 1) }, ["▶"]),
          el("button", { type: "button", class: "w-btn", "aria-label": "Fin", onclick: () => go(moves.length) }, ["⏭"]),
        ]),
      ]),
      el("div", {}, [list, note]),
    ]),
  ]);
}

// ------------------------------------------------------------- durees

/** "Empire romain | -27 | 476 | note" rows; negative years are BC. */
export function parseDurees(props) {
  return Object.keys(props)
    .map((k) => [/^ligne(\d+)$/.exec(k)?.[1], props[k]])
    .filter(([n]) => n != null)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, v]) => {
      const [name, a, b, note] = String(v).split("|").map((s) => s.trim());
      return { name, from: Number(a), to: Number(b), note: note || "" };
    })
    .filter((r) => r.name && Number.isFinite(r.from) && Number.isFinite(r.to) && r.to > r.from);
}

const yearText = (y) => (y < 0 ? `${fmt(-y)} av. J.-C.` : String(y));

export function durees(props, fig) {
  const rows = parseDurees(props);
  if (rows.length < 2) throw new Error("pas assez de lignes");
  const hi = new Set(String(props["mettre-en-avant"] || "").split(",").map((s) => s.trim()).filter(Boolean));
  let order = "start";
  const plot = el("div", { class: "w-plot-wrap" });
  const seg = el("div", { class: "w-seg", role: "group", "aria-label": "Ordre" }, [
    el("button", { type: "button", "aria-pressed": "true", onclick: (e) => setOrder("start", e.currentTarget) }, ["Par date"]),
    el("button", { type: "button", "aria-pressed": "false", onclick: (e) => setOrder("dur", e.currentTarget) }, ["Par durée"]),
  ]);
  function setOrder(o, b) {
    order = o;
    [...seg.children].forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    draw();
  }
  function draw() {
    plot.replaceChildren();
    const tip = tooltip(plot);
    const W = drawWidth(fig);
    const narrow = W < 480;
    const sorted = rows.slice().sort(order === "dur" ? (a, b) => b.to - b.from - (a.to - a.from) : (a, b) => a.from - b.from);
    const rowH = 22;
    // Room for the longest name, up to a share of the width; past that a name
    // is cut with an ellipsis (the tooltip has it whole).
    const longest = Math.max(...rows.map((r) => r.name.length));
    const m = { t: 6, r: 62, b: 24, l: Math.min(Math.round(W * (narrow ? 0.4 : 0.34)), 12 + longest * 6.4) };
    const fit = Math.floor((m.l - 12) / 6.4);
    const H = m.t + sorted.length * rowH + m.b;
    const lo = Math.min(...rows.map((r) => r.from)), top = Math.max(...rows.map((r) => r.to));
    const span = top - lo;
    const step = span > 2000 ? 500 : span > 800 ? 200 : span > 300 ? 100 : 50;
    const t0 = lo - span * 0.02, t1 = top + span * 0.02;
    const x = (v) => m.l + ((v - t0) / (t1 - t0)) * (W - m.l - m.r);
    const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": props.titre || "Durées" });
    const ax = svg("g", { class: "w-axis" });
    const every = narrow ? Math.ceil((t1 - t0) / step / 4) : 1;
    for (let t = Math.ceil(t0 / step) * step, k = 0; t <= t1; t += step, k++) {
      ax.appendChild(svg("line", { class: "w-gridline", x1: x(t), x2: x(t), y1: m.t, y2: H - m.b }));
      if (k % every) continue;
      const tx = svg("text", { x: x(t), y: H - 6, "text-anchor": "middle" });
      tx.textContent = t < 0 ? `${-t} av.` : String(t);
      ax.appendChild(tx);
    }
    s.appendChild(ax);
    sorted.forEach((r, i) => {
      const y = m.t + i * rowH;
      const strong = hi.has(r.name);
      const name = svg("text", { class: "w-label", x: m.l - 6, y: y + rowH / 2 + 4, "text-anchor": "end" });
      name.textContent = r.name.length > fit ? r.name.slice(0, fit - 1).trimEnd() + "…" : r.name;
      const bar = svg("rect", {
        x: x(r.from),
        y: y + 4,
        width: Math.max(2, x(r.to) - x(r.from)),
        height: rowH - 8,
        rx: 2,
        fill: strong ? "var(--w-s2)" : "var(--w-s1)",
      });
      const len = svg("text", { class: "w-label w-dim-t", x: x(r.to) + 4, y: y + rowH / 2 + 4 });
      len.textContent = `${fmt(r.to - r.from)} ans`;
      const show = (ev) =>
        tip.show(`<b>${esc(r.name)}</b><div>${yearText(r.from)} – ${yearText(r.to)}</div><div>${fmt(r.to - r.from)} ans</div>${r.note ? `<div class="w-dim">${esc(r.note)}</div>` : ""}`, ev.clientX, ev.clientY);
      bar.addEventListener("pointerenter", show);
      bar.addEventListener("pointerdown", show);
      bar.addEventListener("pointerleave", () => tip.hide());
      s.append(name, bar, len);
    });
    plot.appendChild(s);
  }
  const root = el("div", { class: "w-root" }, [
    props.titre && el("p", { class: "w-chart-title" }, [props.titre]),
    props["sous-titre"] && el("p", { class: "w-chart-sub" }, [props["sous-titre"]]),
    seg,
    plot,
    props.source && el("p", { class: "w-source" }, [props.source]),
  ]);
  root.onMount = draw;
  return root;
}
