// More `widget:owid` types (public/js/data/owid.js dispatches here):
//   bulles     GDP per head × life expectancy, bubbles sized by population,
//              one frame per decade with a play button (Gapminder's chart)
//   pente      two years side by side, one line per country (slope chart)
//   multiples  small panels sharing one scale, hover synchronised
// plus the 65+ bar panel a pyramid gets with `projection: oui`.
// Same visual grammar as chart.js: SVG at the figure's real width, French
// numbers, a tooltip inside the figure, direct labels before legends.
import { el, svg, fmt, esc, seriesVar, drawWidth, tooltip, niceTicks, logTicks, fmtShort, reducedMotion } from "../widget-kit.js";
import { fmtValue, nearest } from "./chart.js";

function header(props) {
  return [
    props.title && el("p", { class: "w-chart-title" }, [props.title]),
    props.subtitle && el("p", { class: "w-chart-sub" }, [props.subtitle]),
  ];
}

function sourceLine(props) {
  const s = props.source || {};
  return el("p", { class: "w-source" }, [
    "Source : ",
    el("a", { href: s.url || "https://ourworldindata.org/", rel: "noopener", target: "_blank" }, ["Our World in Data"]),
    s.citation ? `, d'après ${s.citation}` : "",
    " · " + (s.licence || "CC BY 4.0"),
  ]);
}

function onResize(root, fig, draw) {
  let w = 0;
  const ro = new ResizeObserver(() => {
    if (Math.abs(fig.clientWidth - w) > 24) {
      w = fig.clientWidth;
      draw();
    }
  });
  root.onMount = () => {
    draw();
    w = fig.clientWidth;
    ro.observe(fig);
  };
}

/** Labels at `y` (sorted in place) pushed apart to `gap` px, both directions. */
function spread(items, gap) {
  items.sort((a, b) => a.y - b.y);
  for (let k = 0; k < 30; k++) {
    let moved = false;
    for (let i = 1; i < items.length; i++) {
      const d = items[i].y - items[i - 1].y;
      if (d < gap) {
        const push = (gap - d) / 2;
        items[i].y += push;
        items[i - 1].y -= push;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

// ------------------------------------------------------------- bulles

const REGIONS = ["Europe", "Asie", "Afrique", "Amérique du Nord", "Amérique du Sud", "Océanie"];

export function bulles(props, fig) {
  const countries = props.countries || [];
  const years = props.years || [];
  if (countries.length < 2 || !years.length) throw new Error("pas de données");
  const regions = REGIONS.filter((r) => countries.some((c) => c.region === r));
  const colour = (c) => (regions.length ? seriesVar(Math.max(0, regions.indexOf(c.region))) : seriesVar(0));
  const all = countries.flatMap((c) => c.points);
  const xMin = Math.min(...all.map((p) => p[1])), xMax = Math.max(...all.map((p) => p[1]));
  const yMin = Math.min(...all.map((p) => p[2])), yMax = Math.max(...all.map((p) => p[2]));
  const zMax = Math.max(...all.map((p) => p[3]));
  let i = years.length - 1;
  const plot = el("div", { class: "w-plot-wrap" });
  const slider = el("input", { type: "range", class: "w-range", min: 0, max: years.length - 1, step: 1, value: i, "aria-label": "Année" });
  const yl = el("b", { class: "w-pyr-year" }, [String(years[i])]);
  const play = el("button", { type: "button", class: "w-btn" }, ["Lecture"]);
  let timer = null;

  function draw() {
    plot.replaceChildren();
    const tip = tooltip(plot);
    const W = drawWidth(fig);
    const narrow = W < 480;
    const H = narrow ? 300 : 360;
    const m = { t: 10, r: 14, b: 38, l: 44 };
    const lx0 = Math.log10(xMin * 0.8), lx1 = Math.log10(xMax * 1.25);
    const x = props.xLog
      ? (v) => m.l + ((Math.log10(v) - lx0) / (lx1 - lx0)) * (W - m.l - m.r)
      : (v) => m.l + ((v - xMin * 0.9) / (xMax * 1.05 - xMin * 0.9)) * (W - m.l - m.r);
    const yt = niceTicks(Math.floor(yMin / 10) * 10, yMax, 5);
    const y0 = yt[0], y1 = Math.max(yt.at(-1), yMax);
    const y = (v) => H - m.b - ((v - y0) / (y1 - y0)) * (H - m.t - m.b);
    const rMax = narrow ? 22 : 34;
    const r = (v) => Math.max(3, Math.sqrt(v / zMax) * rMax);
    const yr = years[i];
    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${props.title}, ${yr}` });
    const ax = svg("g", { class: "w-axis" });
    for (const t of yt) {
      ax.appendChild(svg("line", { class: "w-gridline", x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }));
      const tx = svg("text", { x: m.l - 6, y: y(t) + 4, "text-anchor": "end" });
      tx.textContent = fmtShort(t);
      ax.appendChild(tx);
    }
    const xt = props.xLog ? logTicksDense(xMin * 0.8, xMax * 1.25, narrow) : niceTicks(xMin, xMax, narrow ? 4 : 6);
    for (const t of xt) {
      const tx = svg("text", { x: x(t), y: H - m.b + 16, "text-anchor": "middle" });
      tx.textContent = fmtShort(t);
      ax.appendChild(tx);
    }
    const xl = svg("text", { x: W - m.r, y: H - 4, "text-anchor": "end" });
    xl.textContent = props.xLabel + (props.xUnit ? ` (${props.xUnit}${props.xLog ? ", échelle log" : ""})` : "");
    ax.appendChild(xl);
    const ylab = svg("text", { x: m.l, y: m.t + 2, "text-anchor": "start", dy: "0.7em" });
    ylab.textContent = props.yLabel + (props.yUnit ? ` (${props.yUnit})` : "");
    ax.appendChild(ylab);
    root.appendChild(ax);
    root.appendChild(svg("line", { class: "w-baseline", x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b }));
    // The year, large and faint, behind the bubbles.
    const big = svg("text", { class: "w-bubble-year", x: W - m.r - 4, y: H - m.b - 10, "text-anchor": "end", "font-size": narrow ? 40 : 64 });
    big.textContent = String(yr);
    root.appendChild(big);
    // Trail of one country up to this year.
    const traced = countries.find((c) => c.name === props.trace);
    if (traced) {
      const pts = traced.points.filter((p) => p[0] <= yr);
      if (pts.length > 1)
        root.appendChild(
          svg("path", {
            d: pts.map((p, k) => `${k ? "L" : "M"}${x(p[1]).toFixed(1)},${y(p[2]).toFixed(1)}`).join(""),
            fill: "none",
            stroke: colour(traced),
            "stroke-width": 1.5,
            "stroke-dasharray": "3 3",
          }),
        );
    }
    const now = countries
      .map((c) => ({ c, p: c.points.find((q) => q[0] === yr) }))
      .filter((d) => d.p)
      .sort((a, b) => b.p[3] - a.p[3]);
    for (const d of now) {
      const dot = svg("circle", {
        cx: x(d.p[1]),
        cy: y(d.p[2]),
        r: r(d.p[3]),
        fill: colour(d.c),
        "fill-opacity": 0.8,
        stroke: "var(--paper)",
        "stroke-width": 1.5,
      });
      const show = (ev) =>
        tip.show(
          `<b>${esc(d.c.name)}, ${yr}</b><div>${esc(props.xLabel)} : ${fmtValue(d.p[1])}${props.xUnit ? " " + esc(props.xUnit) : ""}</div><div>${esc(props.yLabel)} : ${fmtValue(d.p[2])}${props.yUnit ? " " + esc(props.yUnit) : ""}</div><div class="w-dim">Population : ${fmtShort(d.p[3])}</div>`,
          ev.clientX,
          ev.clientY,
        );
      dot.addEventListener("pointerenter", show);
      dot.addEventListener("pointerdown", show);
      dot.addEventListener("pointerleave", () => tip.hide());
      root.appendChild(dot);
    }
    // Names of the biggest bubbles and the traced country, pushed apart.
    const named = now.slice(0, narrow ? 4 : 6);
    if (traced && !named.some((d) => d.c === traced)) {
      const t = now.find((d) => d.c === traced);
      if (t) named.push(t);
    }
    // A bubble wide enough to hold its name carries it in its middle; the
    // others are named beside it, and those side labels are pushed apart.
    const inside = [], beside = [];
    for (const d of named) {
      const rr = r(d.p[3]);
      if (rr >= 18) inside.push({ d, x: x(d.p[1]), y: y(d.p[2]) + 4, anchor: "middle" });
      else {
        const left = x(d.p[1]) > W - 90;
        beside.push({ d, y: y(d.p[2]) + 4, x: left ? x(d.p[1]) - rr - 3 : x(d.p[1]) + rr + 3, anchor: left ? "end" : "start" });
      }
    }
    spread(beside, 13);
    for (const l of [...inside, ...beside]) {
      const t = svg("text", { class: "w-label w-halo", x: l.x, y: l.y, "text-anchor": l.anchor });
      t.textContent = l.d.c.name;
      root.appendChild(t);
    }
    plot.appendChild(root);
  }
  const set = (k) => {
    i = k;
    slider.value = k;
    yl.textContent = years[k];
    draw();
  };
  slider.addEventListener("input", () => set(Number(slider.value)));
  play.addEventListener("click", () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
      play.textContent = "Lecture";
      return;
    }
    if (i >= years.length - 1) set(0);
    play.textContent = "Pause";
    timer = setInterval(() => {
      if (i >= years.length - 1) {
        clearInterval(timer);
        timer = null;
        play.textContent = "Lecture";
        return;
      }
      set(i + 1);
    }, reducedMotion() ? 900 : 500);
  });
  const leg = regions.length > 1
    ? el("ul", { class: "w-legend w-legend-dots" }, regions.map((name, k) => el("li", {}, [el("i", { style: `background:${seriesVar(k)}` }), name])))
    : null;
  const root = el("div", { class: "w-root" }, [
    ...header(props),
    el("div", { class: "w-controls" }, [play, slider, yl]),
    leg,
    plot,
    el("p", { class: "w-note" }, [
      "Taille des bulles : population." + (props.trace ? ` Le pointillé suit ${props.trace} depuis ${countries.find((c) => c.name === props.trace)?.points[0]?.[0] ?? years[0]}.` : "") + " Survole ou touche une bulle pour ses chiffres.",
    ]),
    sourceLine(props),
  ]);
  onResize(root, fig, draw);
  return root;
}

function logTicksDense(lo, hi, narrow) {
  const out = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++)
    for (const k of narrow ? [1] : [1, 2, 5]) {
      const v = k * 10 ** e;
      if (v >= lo && v <= hi) out.push(v);
    }
  return out.length >= 2 ? out : logTicks(lo, hi);
}

// ------------------------------------------------------------- pente

export function pente(props, fig) {
  const rows = props.rows || [];
  const [ya, yb] = props.years || [];
  if (rows.length < 2) throw new Error("pas assez de pays");
  const hi = new Set(props.highlight || []);
  const plot = el("div", { class: "w-plot-wrap" });
  const unit = props.unit ? ` ${props.unit}` : "";
  // One number of decimals for every label, so 72 and 73,2 line up as 72,0.
  const dec = rows.some((r) => !Number.isInteger(r.a) || !Number.isInteger(r.b)) ? 1 : 0;
  const num = (v) => v.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  function draw() {
    plot.replaceChildren();
    const W = drawWidth(fig);
    const narrow = W < 480;
    const H = Math.max(240, Math.min(380, 60 + rows.length * 28));
    const m = { t: 24, b: 12 };
    const xa = Math.round(W * (narrow ? 0.38 : 0.33));
    const xb = narrow ? W - 112 : Math.round(W * 0.62);
    const vals = rows.flatMap((r) => [r.a, r.b]);
    const lo = Math.min(...vals), top = Math.max(...vals);
    const pad = (top - lo) * 0.04;
    const y = (v) => H - m.b - ((v - (lo - pad)) / (top + pad - (lo - pad))) * (H - m.t - m.b);
    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": props.title || `${ya} et ${yb}` });
    for (const [xx, yr] of [[xa, ya], [xb, yb]]) {
      root.appendChild(svg("line", { class: "w-baseline", x1: xx, x2: xx, y1: m.t, y2: H - m.b }));
      const t = svg("text", { class: "w-label", x: xx, y: 12, "text-anchor": "middle" });
      t.textContent = String(yr);
      root.appendChild(t);
    }
    // Highlighted countries get the first series colours; the rest stay grey
    // so the eye goes where the note's text points.
    let k = 0;
    const items = rows.map((r) => ({ ...r, colour: hi.size ? (hi.has(r.name) ? seriesVar(k++) : "var(--w-ghost, var(--muted))") : seriesVar(Math.min(k++, 5)), strong: hi.has(r.name) }));
    const la = items.map((r) => ({ r, y: y(r.a) + 4 }));
    const lb = items.map((r) => ({ r, y: y(r.b) + 4 }));
    spread(la, 14);
    spread(lb, 14);
    const groups = [];
    for (const r of items) {
      const g = svg("g", { class: "w-slope" + (r.strong ? " is-strong" : "") });
      g.appendChild(svg("line", { x1: xa, x2: xb, y1: y(r.a), y2: y(r.b), stroke: r.colour, "stroke-width": r.strong ? 3 : 1.6 }));
      g.appendChild(svg("circle", { cx: xa, cy: y(r.a), r: 3.5, fill: r.colour }));
      g.appendChild(svg("circle", { cx: xb, cy: y(r.b), r: 3.5, fill: r.colour }));
      root.appendChild(g);
      groups.push([r, g]);
    }
    for (const l of la) {
      const t = svg("text", { class: "w-label" + (l.r.strong ? " is-strong" : ""), x: xa - 8, y: l.y, "text-anchor": "end" });
      t.textContent = `${l.r.name} ${num(l.r.a)}`;
      root.appendChild(t);
    }
    for (const l of lb) {
      const d = l.r.b - l.r.a;
      const t = svg("text", { class: "w-label" + (l.r.strong ? " is-strong" : ""), x: xb + 8, y: l.y });
      // Names on both ends when there is room; on a phone, only the
      // highlighted rows repeat theirs.
      const name = !narrow || l.r.strong ? `${l.r.name} ` : "";
      t.textContent = `${name}${num(l.r.b)} (${d >= 0 ? "+" : "−"}${num(Math.abs(d))})`;
      root.appendChild(t);
    }
    // Hovering a line fades the others.
    for (const [, g] of groups) {
      g.addEventListener("pointerenter", () => groups.forEach(([, o]) => o.setAttribute("opacity", o === g ? 1 : 0.2)));
      g.addEventListener("pointerleave", () => groups.forEach(([, o]) => o.setAttribute("opacity", 1)));
    }
    plot.appendChild(root);
  }
  const root = el("div", { class: "w-root" }, [
    ...header(props),
    plot,
    el("p", { class: "w-note" }, [`À gauche ${ya}, à droite ${yb}${unit ? ` (${props.unit})` : ""} ; entre parenthèses, l'écart.`]),
    sourceLine(props),
  ]);
  onResize(root, fig, draw);
  return root;
}

// ------------------------------------------------------------- multiples

export function multiples(props, fig) {
  const panels = props.panels || [];
  if (!panels.length) throw new Error("pas de panneau");
  const ref = props.reference;
  // One scale for all panels when they share a unit (the point of small
  // multiples); each its own when they are different measures.
  const shared = panels.every((p) => p.unit === panels[0].unit);
  const allX = panels.flatMap((p) => p.points.map((q) => q[0])).concat(ref ? ref.points.map((q) => q[0]) : []);
  const x0 = Math.min(...allX), x1 = Math.max(...allX);
  const range = (pts) => [Math.min(0, ...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[1]))];
  const sharedR = range(panels.flatMap((p) => p.points).concat(ref ? ref.points : []));
  const grid = el("div", { class: "w-multiples" + (panels.length <= 2 ? " is-two" : "") });
  const cells = [];
  function draw() {
    grid.replaceChildren();
    cells.length = 0;
    const cols = panels.length <= 2 ? 2 : drawWidth(fig) < 480 ? 2 : 3;
    const W = Math.max(150, Math.floor((drawWidth(fig) - (cols - 1) * 14) / cols));
    const H = Math.round(W * 0.66);
    const m = { t: 8, r: 10, b: 20, l: 34 };
    for (const p of panels) {
      const [lo0, hi0] = shared ? sharedR : range(p.points);
      const t = niceTicks(lo0 > 0 && !shared ? 0 : lo0, hi0, 3);
      const lo = t[0], hi = Math.max(t.at(-1), hi0);
      const x = (v) => m.l + ((v - x0) / (x1 - x0 || 1)) * (W - m.l - m.r);
      const y = (v) => H - m.b - ((v - lo) / (hi - lo || 1)) * (H - m.t - m.b);
      const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": p.title });
      const ax = svg("g", { class: "w-axis" });
      for (const v of t) {
        ax.appendChild(svg("line", { class: "w-gridline", x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }));
        const tx = svg("text", { x: m.l - 4, y: y(v) + 4, "text-anchor": "end" });
        tx.textContent = fmtShort(v);
        ax.appendChild(tx);
      }
      for (const v of [x0, Math.round((x0 + x1) / 2 / 10) * 10, x1]) {
        const tx = svg("text", { x: x(v), y: H - 5, "text-anchor": v === x0 ? "start" : v === x1 ? "end" : "middle" });
        tx.textContent = String(v);
        ax.appendChild(tx);
      }
      root.appendChild(ax);
      const line = (pts, stroke, w) =>
        svg("path", { d: pts.map((q, k) => `${k ? "L" : "M"}${x(q[0]).toFixed(1)},${y(q[1]).toFixed(1)}`).join(""), fill: "none", stroke, "stroke-width": w, "stroke-linejoin": "round" });
      if (ref) root.appendChild(line(ref.points, "var(--rule-strong)", 1.5));
      root.appendChild(line(p.points, seriesVar(0), 2));
      const cross = svg("line", { y1: m.t, y2: H - m.b, stroke: "var(--rule-strong)", visibility: "hidden" });
      const dot = svg("circle", { r: 3.5, fill: seriesVar(0), stroke: "var(--paper)", "stroke-width": 1.5, visibility: "hidden" });
      const val = svg("text", { class: "w-label", y: m.t + 10, visibility: "hidden" });
      root.append(cross, dot, val);
      const hit = svg("rect", { x: m.l, y: 0, width: W - m.l - m.r, height: H, fill: "transparent" });
      const move = (ev) => {
        const r = root.getBoundingClientRect();
        const px = ((ev.clientX - r.left) / r.width) * W;
        sync(Math.round(x0 + ((px - m.l) / (W - m.l - m.r)) * (x1 - x0)));
      };
      hit.addEventListener("pointermove", move);
      hit.addEventListener("pointerdown", move);
      hit.addEventListener("pointerleave", () => sync(null));
      root.appendChild(hit);
      cells.push({ p, x, y, W, cross, dot, val });
      grid.appendChild(el("div", { class: "w-multiple" }, [el("p", { class: "w-multiple-t" }, [p.title + (!shared && p.unit ? ` (${p.unit})` : "")]), root]));
    }
  }
  function sync(yr) {
    for (const c of cells) {
      if (yr == null) {
        for (const n of [c.cross, c.dot, c.val]) n.setAttribute("visibility", "hidden");
        continue;
      }
      const q = nearest(c.p.points, yr);
      c.cross.setAttribute("x1", c.x(yr));
      c.cross.setAttribute("x2", c.x(yr));
      c.cross.setAttribute("visibility", "visible");
      if (q && Math.abs(q[0] - yr) <= 5) {
        c.dot.setAttribute("cx", c.x(q[0]));
        c.dot.setAttribute("cy", c.y(q[1]));
        c.dot.setAttribute("visibility", "visible");
        const left = c.x(yr) < c.W / 2;
        c.val.setAttribute("x", c.x(yr) + (left ? 4 : -4));
        c.val.setAttribute("text-anchor", left ? "start" : "end");
        c.val.textContent = `${q[0]} : ${fmtValue(q[1])}`;
        c.val.setAttribute("visibility", "visible");
      } else {
        c.dot.setAttribute("visibility", "hidden");
        c.val.setAttribute("visibility", "hidden");
      }
    }
  }
  const note = ref
    ? `Ligne grise : ${ref.name}. ${shared ? "Même échelle pour tous les panneaux." : ""} Survole un panneau, les autres suivent.`
    : `${shared ? "Même échelle pour tous les panneaux. " : ""}Survole un panneau, les autres suivent.`;
  const root = el("div", { class: "w-root" }, [
    ...header(props),
    shared && panels[0].unit && !props.subtitle ? el("p", { class: "w-chart-sub" }, [panels[0].unit]) : null,
    grid,
    el("p", { class: "w-note" }, [note]),
    sourceLine(props),
  ]);
  onResize(root, fig, draw);
  return root;
}

// ------------------------------------------------- pyramid projection panel

/** Bars of the 65+ share, estimates filled, projections outlined. */
export function projectionPanel(proj, country, fig) {
  const box = el("div", { class: "w-plot-wrap w-proj" });
  const bars = proj.bars;
  function draw(current) {
    box.replaceChildren();
    const W = Math.min(drawWidth(fig), 480); // .w-proj caps the box at 30rem: draw at that size so the text stays 11px
    const H = 170;
    const m = { t: 22, r: 8, b: 22, l: 8 };
    const max = Math.max(...bars.map((b) => b.v)) * 1.1;
    const bw = (W - m.l - m.r) / bars.length;
    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${country} : part des 65 ans et plus` });
    bars.forEach((b, k) => {
      const h = (b.v / max) * (H - m.t - m.b);
      const xx = m.l + k * bw + bw * 0.18;
      const dim = current != null && !b.projected && b.year > current;
      root.appendChild(
        svg("rect", {
          x: xx,
          y: H - m.b - h,
          width: bw * 0.64,
          height: h,
          rx: 2,
          fill: b.projected ? "none" : seriesVar(1),
          stroke: seriesVar(1),
          "stroke-width": 1.5,
          "stroke-dasharray": b.projected ? "4 3" : null,
          opacity: dim ? 0.35 : 1,
        }),
      );
      const v = svg("text", { class: "w-label", x: xx + bw * 0.32, y: H - m.b - h - 5, "text-anchor": "middle" });
      v.textContent = `${fmt(b.v, 0)} %`;
      const yr = svg("text", { class: "w-axis-t", x: xx + bw * 0.32, y: H - 6, "text-anchor": "middle" });
      yr.textContent = String(b.year);
      root.append(v, yr);
    });
    root.appendChild(svg("line", { class: "w-baseline", x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b }));
    box.appendChild(root);
  }
  return {
    node: el("div", {}, [
      el("p", { class: "w-multiple-t" }, [`Part des 65 ans et plus. Pointillés : projection moyenne de l'ONU après ${proj.lastEstimate}.`]),
      box,
    ]),
    draw,
  };
}
