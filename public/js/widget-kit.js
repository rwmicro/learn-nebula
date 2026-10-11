// Shared helpers for the widget packs (widgets-data.js, widgets-sci.js,
// widgets-lang.js). Each pack is bundled by scripts/bundle-js.mjs into its own
// *.bundle.js and fetched by widgets-loader.js only on a page that mounts one
// of its widgets. The older library, public/js/widgets.js, keeps its own copy
// of el()/svg() on purpose: it is served raw, not bundled.
//
// Visual grammar is main.css's `.w-*` (hairlines, square corners, page
// surfaces); a pack adds only what it needs in assets/css/widgets-extra.css.

/** Element builder: el("div", { class: "x", onclick: fn }, [child, "text"]). */
export function el(tag, attrs, children) {
  const n = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children || []) {
    if (c == null || c === false) continue;
    n.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  return n;
}

/** SVG builder. `fill`/`stroke` given as var(--token) go through style so the
 *  colour follows a theme switch without a redraw. */
export function svg(tag, attrs, children) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v == null) continue;
    if ((k === "fill" || k === "stroke") && String(v).startsWith("var(")) n.style.setProperty(k, v);
    else n.setAttribute(k, v);
  }
  for (const c of children || []) {
    if (c == null) continue;
    n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return n;
}

/** A palette token resolved to a colour, for <canvas>. Redraw on `theme:change`. */
export function cssColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

const NF = new Map();
/** French number format, cached per precision: fmt(1234.5, 1) → "1 234,5". */
export function fmt(v, digits = 0) {
  let f = NF.get(digits);
  if (!f) {
    f = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    NF.set(digits, f);
  }
  return f.format(v);
}

/** Compact French format for axis ticks and labels: 1,2 Md, 340 M, 12 k. */
export function fmtShort(v) {
  const a = Math.abs(v);
  if (a >= 1e9) return fmt(v / 1e9, a >= 1e10 ? 0 : 1) + " Md";
  if (a >= 1e6) return fmt(v / 1e6, a >= 1e7 ? 0 : 1) + " M";
  if (a >= 1e4) return fmt(v / 1e3, 0) + " k";
  if (a >= 100) return fmt(v, 0);
  if (a >= 10) return fmt(v, Number.isInteger(v) ? 0 : 1);
  return fmt(v, Number.isInteger(v) ? 0 : a >= 1 ? 1 : 2);
}

/** Up to 5 "nice" ticks between lo and hi (1, 2, 2.5, 5 × 10^n steps). */
export function niceTicks(lo, hi, count = 5) {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step) out.push(Number(t.toFixed(10)));
  return out;
}

/** Powers of ten (and 2×, 5× when few) inside [lo, hi], for a log axis. */
export function logTicks(lo, hi) {
  const out = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** e;
      if (v >= lo && v <= hi) out.push(v);
    }
  }
  return out.length > 7 ? out.filter((v) => Math.log10(v) % 1 === 0) : out;
}

/** Categorical series colours, fixed order (never cycled past 6). */
export const SERIES = ["--w-s1", "--w-s2", "--w-s3", "--w-s4", "--w-s5", "--w-s6"];
export const seriesVar = (i) => `var(${SERIES[i] || "--muted"})`;

/** Tooltip box positioned inside `host` (position: relative). */
export function tooltip(host) {
  const tip = el("div", { class: "w-tip", role: "status" });
  tip.hidden = true;
  host.appendChild(tip);
  return {
    show(html, clientX, clientY) {
      tip.innerHTML = html;
      tip.hidden = false;
      const r = host.getBoundingClientRect();
      const x = Math.min(clientX - r.left + 12, r.width - tip.offsetWidth - 4);
      const y = clientY == null ? 6 : Math.max(0, clientY - r.top - tip.offsetHeight - 10);
      tip.style.left = Math.max(0, x) + "px";
      tip.style.top = y + "px";
    },
    hide() {
      tip.hidden = true;
    },
  };
}

/** Escapes text for the innerHTML of a tooltip. */
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/**
 * Hands the browser a file to save (CSV or SVG export). Works on the site,
 * where downloads are allowed; does nothing harmful where they are not.
 */
export function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el("a", { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Width the widget can draw in, clamped: SVGs use it as viewBox width so
 *  text keeps its real size on a phone instead of shrinking with the figure. */
export function drawWidth(node, max = 640, min = 300) {
  const w = node.clientWidth || node.parentNode?.clientWidth || max;
  return Math.round(Math.max(min, Math.min(max, w)));
}

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Mounts every `.widget[data-widget]` whose name is in `builders`, the same
 * way widgets.js does: parse data-props, replace the fallback, mark live.
 * A widget that throws leaves its fallback line in place.
 */
export function mount(builders) {
  for (const fig of document.querySelectorAll(".widget[data-widget]")) {
    const name = fig.getAttribute("data-widget");
    const build = builders[name];
    // A data widget whose numbers could not be had at build keeps the message
    // rehypeWidgets put in its fallback (data-error).
    if (!build || fig.classList.contains("is-live") || fig.hasAttribute("data-error")) continue;
    let props = {};
    try {
      props = JSON.parse(fig.getAttribute("data-props") || "{}");
    } catch {
      // Malformed props: the builder's defaults apply.
    }
    try {
      // The builder gets the figure to measure its width (drawWidth) before
      // its node replaces the fallback; a node may carry an onMount() hook
      // for work that needs to be in the page (observers, measuring text).
      const node = build(props, fig);
      if (!node) continue;
      fig.replaceChildren(node);
      fig.classList.add("is-live");
      if (typeof node.onMount === "function") node.onMount();
    } catch (e) {
      console.warn("widget " + name + ":", e);
    }
  }
}
