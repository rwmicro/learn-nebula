// Line chart for the data pack: years on x, one line per series, values on a
// linear or log y axis, direct labels at the line ends, a crosshair tooltip.
// Drawn as SVG at the figure's real width (viewBox = pixels), so 11-12px text
// stays 11-12px on a phone instead of shrinking with the figure.
import { el, svg, fmt, fmtShort, niceTicks, logTicks, seriesVar, tooltip, esc } from "../widget-kit.js";

/** Value as French text with a sensible precision for its size. */
export function fmtValue(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return fmtShort(v);
  if (a >= 1000) return fmt(v, 0);
  if (a >= 100) return fmt(v, a % 1 ? 1 : 0);
  if (a >= 1) return fmt(v, Number.isInteger(v) ? 0 : 1);
  return fmt(v, 2);
}

/**
 * Builds the chart into `host` (emptied first).
 *   series: [{ name, points: [[year, value], …] }]
 *   opts: { width, height, log, zero, unit, xDomain, highlight (series name),
 *           hideAfter (draw series 0 only up to this year), labelEnds }
 * Returns { x, y, svg, W, H, m } for overlays (guess layer, annotations).
 */
export function lineChart(host, series, opts) {
  host.replaceChildren();
  const W = opts.width;
  const narrow = W < 480;
  const H = opts.height || (narrow ? 240 : 290);
  const all = series.flatMap((s) => s.points);
  const years = all.map((p) => p[0]);
  const vals = all.map((p) => p[1]).filter((v) => !opts.log || v > 0);
  const [x0, x1] = opts.xDomain || [Math.min(...years), Math.max(...years)];
  const inX = (p) => p[0] >= x0 && p[0] <= x1;
  const shown = series.flatMap((s) => s.points.filter(inX).map((p) => p[1])).filter((v) => !opts.log || v > 0);
  const vMax = Math.max(...(shown.length ? shown : vals));
  const vMin = Math.min(...(shown.length ? shown : vals));

  // End labels need room on the right; on a phone they get at most a third.
  const labelText = (s) => {
    const last = s.points.filter(inX).at(-1);
    return last ? `${s.name} ${fmtValue(last[1])}` : s.name;
  };
  const longest = Math.max(...series.map((s) => labelText(s).length));
  const cap = Math.round(W * (narrow ? 0.36 : 0.3));
  // A label that cannot fit keeps only the value; the legend names the line.
  const fits = 14 + longest * 6.4 <= cap;
  const endText = (s) => {
    if (fits) return labelText(s);
    const last = s.points.filter(inX).at(-1);
    return last ? fmtValue(last[1]) : "";
  };
  const endLen = Math.max(...series.map((s) => endText(s).length));
  const right = opts.labelEnds === false ? 12 : Math.min(cap, 14 + endLen * 6.4);
  const m = { t: 10, r: right, b: 24, l: 40 };

  let y, ticks;
  if (opts.log) {
    const lo = Math.max(vMin * 0.85, 1e-9);
    const hi = vMax * 1.15;
    const L0 = Math.log10(lo), L1 = Math.log10(hi);
    y = (v) => H - m.b - ((Math.log10(Math.max(v, lo)) - L0) / (L1 - L0)) * (H - m.t - m.b);
    ticks = logTicks(lo, hi);
  } else {
    const lo = opts.zero === false ? vMin - (vMax - vMin) * 0.08 : Math.min(0, vMin);
    const hi = vMax + (vMax - lo) * 0.06;
    ticks = niceTicks(lo, hi, narrow ? 4 : 5);
    const t0 = Math.min(lo, ticks[0]), t1 = Math.max(hi, ticks.at(-1));
    y = (v) => H - m.b - ((v - t0) / (t1 - t0)) * (H - m.t - m.b);
  }
  const x = (yr) => m.l + ((yr - x0) / (x1 - x0 || 1)) * (W - m.l - m.r);

  const root = svg("svg", {
    viewBox: `0 0 ${W} ${H}`,
    role: "img",
    "aria-label": opts.label || series.map((s) => s.name).join(", "),
  });
  const grid = svg("g", { class: "w-axis" });
  for (const t of ticks) {
    grid.appendChild(svg("line", { class: "w-gridline", x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }));
    const tx = svg("text", { x: m.l - 6, y: y(t) + 4, "text-anchor": "end" });
    tx.textContent = fmtShort(t);
    grid.appendChild(tx);
  }
  const span = x1 - x0;
  const xt = niceTicks(x0, x1, narrow ? 4 : 6).filter((t) => Number.isInteger(t));
  if (!xt.includes(x1) && span > 8 && x(x1) - x(xt.at(-1)) > 34) xt.push(x1);
  for (const t of xt) {
    const tx = svg("text", { x: x(t), y: H - 6, "text-anchor": "middle" });
    tx.textContent = String(t);
    grid.appendChild(tx);
  }
  root.appendChild(grid);
  root.appendChild(svg("line", { class: "w-baseline", x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b }));

  const paths = [];
  const ends = [];
  series.forEach((s, i) => {
    let pts = s.points.filter(inX);
    if (opts.hideAfter != null && i === 0) pts = pts.filter((p) => p[0] <= opts.hideAfter);
    if (opts.hideAfter != null && i > 0) pts = [];
    if (opts.log) pts = pts.filter((p) => p[1] > 0);
    if (!pts.length) return;
    // Gaps in the data (a missing decade) break the line instead of bridging it.
    let d = "";
    let prev = null;
    const step = medianStep(pts);
    for (const p of pts) {
      d += `${prev && p[0] - prev[0] <= step * 3 ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`;
      prev = p;
    }
    const faded = opts.highlight && opts.highlight !== s.name;
    const path = svg("path", {
      d,
      fill: "none",
      stroke: seriesVar(i),
      "stroke-width": faded ? 1.5 : 2,
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
      opacity: faded ? 0.3 : 1,
    });
    root.appendChild(path);
    paths.push(path);
    const last = pts.at(-1);
    root.appendChild(
      svg("circle", { cx: x(last[0]), cy: y(last[1]), r: 3.5, fill: seriesVar(i), stroke: "var(--paper)", "stroke-width": 2, opacity: faded ? 0.3 : 1 }),
    );
    if (opts.labelEnds !== false && !(opts.hideAfter != null)) ends.push({ i, y: y(last[1]), text: endText(s), faded });
  });
  // Direct labels, nudged apart when two lines end close together.
  ends.sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 14) ends[k].y = ends[k - 1].y + 14;
  for (const e of ends) {
    const t = svg("text", { class: "w-label", x: W - m.r + 8, y: e.y + 4, opacity: e.faded ? 0.5 : 1 });
    t.textContent = e.text;
    root.appendChild(t);
  }
  host.appendChild(root);

  // Crosshair + tooltip over the plot area.
  if (opts.hover !== false) {
    const tip = tooltip(host);
    const cross = svg("line", { stroke: "var(--rule-strong)", y1: m.t, y2: H - m.b, visibility: "hidden" });
    root.appendChild(cross);
    const dots = series.map((s, i) => {
      const c = svg("circle", { r: 4, fill: seriesVar(i), stroke: "var(--paper)", "stroke-width": 2, visibility: "hidden" });
      root.appendChild(c);
      return c;
    });
    const hit = svg("rect", { x: m.l, y: 0, width: W - m.l - m.r, height: H, fill: "transparent" });
    root.appendChild(hit);
    const move = (ev) => {
      const r = root.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      const yr = Math.round(x0 + ((px - m.l) / (W - m.l - m.r)) * (x1 - x0));
      if (yr < x0 || yr > x1) return;
      cross.setAttribute("x1", x(yr));
      cross.setAttribute("x2", x(yr));
      cross.setAttribute("visibility", "visible");
      let rows = "";
      let any = false;
      series.forEach((s, i) => {
        if (opts.hideAfter != null && (i > 0 || yr > opts.hideAfter)) {
          dots[i].setAttribute("visibility", "hidden");
          return;
        }
        const p = nearest(s.points, yr);
        if (p && Math.abs(p[0] - yr) <= Math.max(1, medianStep(s.points))) {
          any = true;
          dots[i].setAttribute("cx", x(p[0]));
          dots[i].setAttribute("cy", y(p[1]));
          dots[i].setAttribute("visibility", "visible");
          rows += `<div><span class="w-key" style="background:${seriesVar(i)}"></span>${esc(s.name)} <b>${fmtValue(p[1])}</b>${p[0] !== yr ? ` <span class="w-dim">(${p[0]})</span>` : ""}</div>`;
        } else {
          dots[i].setAttribute("visibility", "hidden");
          rows += `<div class="w-dim"><span class="w-key" style="background:${seriesVar(i)}"></span>${esc(s.name)} : pas de donnée</div>`;
        }
      });
      if (!any && opts.hideAfter != null) return tip.hide();
      tip.show(`<b>${yr}</b>${opts.unit ? ` <span class="w-dim">${esc(opts.unit)}</span>` : ""}${rows}`, ev.clientX, null);
    };
    const leave = () => {
      tip.hide();
      cross.setAttribute("visibility", "hidden");
      dots.forEach((d) => d.setAttribute("visibility", "hidden"));
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", leave);
  }
  return { x, y, svg: root, W, H, m, x0, x1 };
}

function medianStep(pts) {
  if (pts.length < 2) return 1;
  const d = [];
  for (let i = 1; i < pts.length; i++) d.push(pts[i][0] - pts[i - 1][0]);
  d.sort((a, b) => a - b);
  return d[Math.floor(d.length / 2)];
}

export function nearest(points, yr) {
  let best = null;
  for (const p of points) if (!best || Math.abs(p[0] - yr) < Math.abs(best[0] - yr)) best = p;
  return best;
}

/** Year × series rows for the "Tableau" tab and the CSV export. */
export function tableRows(series) {
  const years = [...new Set(series.flatMap((s) => s.points.map((p) => p[0])))].sort((a, b) => a - b);
  return years.map((yr) => [yr, ...series.map((s) => s.points.find((p) => p[0] === yr)?.[1] ?? null)]);
}

/** Legend above a chart of two or more series (none for a single one). */
export function legend(series) {
  if (series.length < 2) return null;
  return el(
    "ul",
    { class: "w-legend" },
    series.map((s, i) => el("li", {}, [el("i", { style: `background:${seriesVar(i)}` }), s.name])),
  );
}
