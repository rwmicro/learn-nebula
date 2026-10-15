// Widget "descente-gradient": gradient descent fitting a line, shown twice —
// the line moving through the data, and the point (w, b) moving down the
// level sets of the loss. The learning rate is the lesson: too small and it
// crawls, too large and it zigzags, then diverges. Model: lib/ml-train.ts.
import { el, svg, fmt, drawWidth, reducedMotion } from "../widget-kit.js";
import { ellipse, forme, mse, nuage, pas } from "../../../lib/ml-train.ts";
import { chart, num, slider, table, points } from "./common.js";

const TAUX = [0.005, 0.01, 0.02, 0.03, 0.05, 0.08, 0.1, 0.12, 0.14, 0.15, 0.16, 0.17, 0.2, 0.25];
const ATTEINT = 0.005; // loss within this of the minimum = reached
const MAX_PAS = 2000;

export function descenteGradient(props, fig, ctx) {
  const pts = nuage(20, 0.8, 1, 0.5);
  const f = forme(pts);
  const w0 = num(props.w, -1, -3, 4);
  const b0 = num(props.b, 4, -3, 6);
  let taux = num(props.taux, 0.02, 0.001, 1);
  let start = { w: w0, b: b0 };
  let cur = { ...start };
  let trace = [start];
  let n = 0;
  let timer = 0;
  let divergeVu = false;

  // Fixed windows, so a diverging run visibly leaves the frame.
  const ys = pts.map((p) => p.y);
  const yLo = Math.floor(Math.min(...ys) - 1);
  const yHi = Math.ceil(Math.max(...ys) + 1);
  const wR = [Math.floor(f.w - 2.5), Math.ceil(f.w + 2.5)];
  const bR = [Math.floor(f.b - 3.5), Math.ceil(f.b + 4)];
  const NIV = [0.02, 0.08, 0.25, 0.7, 1.6, 3.5, 7, 14, 28].map((d) => f.min + d);

  const perte = () => mse(pts, cur.w, cur.b);
  const diverge = () => !(perte() < 1e4);
  const atteint = () => perte() - f.min < ATTEINT;
  const fini = () => diverge() || atteint() || n >= MAX_PAS;

  const iTaux = TAUX.reduce((k, v, i) => (Math.abs(v - taux) < Math.abs(TAUX[k] - taux) ? i : k), 0);
  taux = TAUX[iTaux];
  const sTaux = slider({
    label: "Taux d'apprentissage η",
    min: 0,
    max: TAUX.length - 1,
    step: 1,
    value: iTaux,
    format: (i) => fmt(TAUX[i], TAUX[i] < 0.01 ? 3 : 2),
    onInput: (i) => {
      taux = TAUX[i];
      draw();
    },
  });

  const btnPas = el("button", { type: "button", class: "w-btn", onclick: () => (stop(), avance(1)) }, ["Un pas"]);
  const btnRun = el("button", { type: "button", class: "w-btn sci-cta", onclick: () => (timer ? stop() : lance()) }, [
    "Lancer",
  ]);
  const btnReset = el("button", { type: "button", class: "w-btn", onclick: () => reset(start) }, ["Recommencer"]);

  const plots = el("div", { class: "sci-two" });
  const out = el("div", { class: "w-out" });

  function avance(k) {
    for (let i = 0; i < k && !fini(); i++) {
      cur = pas(pts, cur.w, cur.b, taux);
      n++;
      trace.push(cur);
    }
    if (diverge()) divergeVu = true;
    draw();
  }

  function lance() {
    if (fini()) reset(start);
    if (reducedMotion()) {
      avance(MAX_PAS);
      return;
    }
    btnRun.textContent = "Pause";
    timer = setInterval(() => {
      avance(n < 20 ? 1 : n < 100 ? 3 : 12);
      if (fini()) stop();
    }, 45);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = 0;
    btnRun.textContent = "Lancer";
  }

  function reset(p) {
    stop();
    start = p;
    cur = { ...p };
    trace = [p];
    n = 0;
    draw();
  }

  function draw() {
    const wide = (fig.clientWidth || 640) >= 600;
    const full = drawWidth(fig, 640, 300);
    const W = wide ? Math.floor((full - 16) / 2) : full;
    const H = wide ? 260 : 230;

    // --- left: the data and the current line, residuals dashed
    const a = chart({
      W,
      H,
      x: [0, 4.2],
      y: [yLo, yHi],
      xLabel: "x",
      yLabel: "y",
      label: "nuage de points et droite y = wx + b",
      padL: 32,
    });
    const ok = Number.isFinite(cur.w) && Number.isFinite(cur.b);
    if (ok) {
      for (const p of pts) {
        a.plot.appendChild(
          svg("line", { x1: a.X(p.x), x2: a.X(p.x), y1: a.Y(p.y), y2: a.Y(cur.w * p.x + cur.b), class: "ml-resid" }),
        );
      }
      a.plot.appendChild(
        svg("line", {
          x1: a.X(0),
          x2: a.X(4.2),
          y1: a.Y(cur.b),
          y2: a.Y(cur.w * 4.2 + cur.b),
          stroke: "var(--link)",
          "stroke-width": 2.2,
        }),
      );
    }
    for (const p of pts) a.plot.appendChild(svg("circle", { cx: a.X(p.x), cy: a.Y(p.y), r: 3.6, class: "ml-dot" }));

    // --- right: level sets of the loss in the (w, b) plane, and the path
    const b = chart({
      W,
      H,
      x: wR,
      y: bR,
      xLabel: "pente w",
      yLabel: "ordonnée b",
      label: "courbes de niveau de la perte et trajet de la descente",
      padL: 32,
    });
    NIV.forEach((lv, i) => {
      const e = ellipse(f, lv);
      b.plot.appendChild(
        svg("polyline", {
          points: points(
            e.map((q) => q.w),
            e.map((q) => q.b),
            b.X,
            b.Y,
          ),
          class: "ml-level",
          style: `opacity:${(0.85 - i * 0.07).toFixed(2)}`,
        }),
      );
    });
    const cx = b.X(f.w);
    const cy = b.Y(f.b);
    b.plot.appendChild(svg("path", { d: `M${cx - 5},${cy - 5}L${cx + 5},${cy + 5}M${cx - 5},${cy + 5}L${cx + 5},${cy - 5}`, class: "ml-min" }));
    // The path up to its first point well outside the frame: a diverging run
    // shows its widening zigzag, not hundreds of segments off the chart.
    const vis = [];
    for (const q of trace) {
      if (!Number.isFinite(q.w) || !Number.isFinite(q.b)) break;
      vis.push(q);
      const out = q.w < wR[0] - 1 || q.w > wR[1] + 1 || q.b < bR[0] - 1 || q.b > bR[1] + 1;
      if (out) break;
    }
    b.plot.appendChild(
      svg("polyline", {
        points: vis.map((q) => b.X(q.w).toFixed(1) + "," + b.Y(q.b).toFixed(1)).join(" "),
        class: "ml-path",
      }),
    );
    if (vis.length < 80) {
      for (const q of vis) b.plot.appendChild(svg("circle", { cx: b.X(q.w), cy: b.Y(q.b), r: 2, class: "ml-step" }));
    }
    if (ok && vis.length === trace.length) b.plot.appendChild(svg("circle", { cx: b.X(cur.w), cy: b.Y(cur.b), r: 5.5, class: "ml-cur" }));
    b.root.appendChild(
      svg("text", { x: cx - 9, y: cy + 20, "text-anchor": "end", class: "w-label" }, ["minimum"]),
    );
    // Click / tap on the plane: start from there.
    b.root.style.cursor = "crosshair";
    b.root.addEventListener("click", (ev) => {
      const r = b.root.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      const py = ((ev.clientY - r.top) / r.height) * H;
      const w = wR[0] + ((px - b.P.l) / (W - b.P.l - b.P.r)) * (wR[1] - wR[0]);
      const bb = bR[0] + ((H - b.P.b - py) / (H - b.P.t - b.P.b)) * (bR[1] - bR[0]);
      if (w < wR[0] || w > wR[1] || bb < bR[0] || bb > bR[1]) return;
      reset({ w: Math.round(w * 100) / 100, b: Math.round(bb * 100) / 100 });
    });

    plots.replaceChildren(
      el("div", { class: "w-plot-wrap" }, [el("p", { class: "sci-cap" }, ["La droite et les données"]), a.root]),
      el("div", { class: "w-plot-wrap" }, [
        el("p", { class: "sci-cap" }, ["La perte vue d'en haut (touchez pour changer de départ)"]),
        b.root,
      ]),
    );

    const L = perte();
    const etat = diverge()
      ? "diverge : chaque pas dépasse le creux et remonte plus haut"
      : atteint()
        ? "minimum atteint en " + n + " pas"
        : n >= MAX_PAS
          ? "arrêtée après " + MAX_PAS + " pas"
          : n
            ? "en cours"
            : "au départ";
    const rows = [
      ["Pas", String(n)],
      ["w ; b", ok && Math.abs(cur.w) < 1e6 ? fmt(cur.w, 3) + " ; " + fmt(cur.b, 3) : "hors cadre"],
      ["Perte (erreur quadratique moyenne)", L < 1e6 ? fmt(L, 3) : "> 1 000 000"],
      ["Minimum possible", fmt(f.min, 3) + " en w = " + fmt(f.w, 3) + ", b = " + fmt(f.b, 3)],
      ["État", etat],
    ];
    if (divergeVu) rows.push(["Taux critique", "≈ " + fmt(f.tauxMax, 3) + " : au-delà, la descente diverge"]);
    out.replaceChildren(
      table(rows),
      el("p", { class: "w-note" }, [
        "À chaque pas, w et b reculent dans le sens opposé au gradient de la perte, multiplié par η : w ← w − η·∂L/∂w, b ← b − η·∂L/∂b. Les courbes de niveau sont des ellipses très allongées : la perte monte vite quand on change la pente, lentement quand on change l'ordonnée. Un petit taux suit la vallée sagement mais met des centaines de pas ; un taux plus grand rebondit d'un bord à l'autre de la vallée, et passé un seuil chaque rebond monte plus haut que le précédent.",
      ]),
    );
    btnPas.disabled = fini();

    ctx?.report({
      pas: n,
      perte: Number.isFinite(L) ? Math.round(L * 1000) / 1000 : 1e9,
      ecart: Number.isFinite(L) ? L - f.min : 1e9,
      taux,
      atteint: atteint() ? 1 : 0,
      diverge: diverge() ? 1 : 0,
    });
  }

  draw();
  return el("div", { class: "w-root ml-gd" }, [
    el("div", { class: "sci-sliders" }, [sTaux.node]),
    el("div", { class: "w-controls" }, [btnRun, btnPas, btnReset]),
    plots,
    out,
  ]);
}
