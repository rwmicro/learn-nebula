// Small helpers shared by the "lang" widgets (public/js/widgets-lang.js).
// widget-kit.js stays the cross-pack kit; what only these widgets need lives here.
import { el, svg } from "../widget-kit.js";

/** A two-column readout table, as in widgets.js: [[label, value], …]. */
export function readout(rows) {
  return el(
    "table",
    { class: "w-table" },
    rows.filter(Boolean).map((r) => el("tr", {}, [el("th", {}, [r[0]]), el("td", {}, [r[1]])])),
  );
}

/** A row of toggle buttons; `onPick(value)` on click. Returns { node, set(value) }. */
export function choice(options, value, onPick, label) {
  const node = el("div", { class: "w-controls l-choice", role: "group", "aria-label": label || null });
  const btns = options.map(([v, text, title]) => {
    const b = el("button", { type: "button", class: "w-btn", title: title || null, onclick: () => onPick(v) }, [text]);
    b.dataset.v = v;
    return b;
  });
  if (label) node.appendChild(el("span", { class: "w-hint l-choice-label" }, [label]));
  btns.forEach((b) => node.appendChild(b));
  const set = (v) =>
    btns.forEach((b) => {
      const on = b.dataset.v === String(v);
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  set(value);
  return { node, set, btns };
}

/**
 * Served URL of a vault asset given by its vault-relative path, the way
 * lib/vault-assets.ts resolves it: `/vault/` + the path, each segment
 * URI-encoded (scripts/copy-vault-images.mjs copies the files there). An
 * absolute URL or a path already starting with "/" is kept as is.
 */
export function vaultUrl(p) {
  const s = String(p || "").trim();
  if (!s || s === "-") return "";
  if (/^(https?:)?\//i.test(s)) return s;
  return "/vault/" + s.replace(/^\.?\//, "").split("/").map(encodeURIComponent).join("/");
}

/**
 * Pronunciation button with the same markup as the note's `.pron` players
 * (lib/markdown.ts pronPlayer), so /js/pronounce.js — loaded site-wide and
 * delegated on document — plays it with no extra code.
 */
export function pronButton(url, label) {
  if (!url) return null;
  const icon = svg("svg", { class: "pron-icon", viewBox: "0 0 24 24", width: "16", height: "16", "aria-hidden": "true" }, [
    svg("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round", d: "M4 9v6h4l5 4V5L8 9H4z" }),
    svg("path", { class: "pron-wave", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", d: "M15.5 8.5a5 5 0 0 1 0 7" }),
    svg("path", { class: "pron-wave", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", d: "M18.2 5.8a9 9 0 0 1 0 12.4" }),
  ]);
  const b = el("button", { type: "button", class: "pron-btn", "data-state": "idle", "data-pron-src": url, "aria-label": "Écouter" + (label ? " : " + label : "") }, [icon]);
  return el("span", { class: "pron" }, [b]);
}

/**
 * Text with *starred* segments turned into <mark>: the vault prop syntax for
 * "this is where the varieties differ".
 */
export function marked(text, attrs) {
  const parts = String(text).split("*");
  return el(
    "span",
    attrs || {},
    parts.map((p, i) => (i % 2 ? el("mark", { class: "l-diff" }, [p]) : p)).filter((p) => p !== ""),
  );
}

/** Numbered props (`phrase1`, `phrase2`…) in order. */
export function numbered(props, key) {
  return Object.keys(props)
    .map((k) => {
      const m = new RegExp("^" + key + "(\\d+)$").exec(k);
      return m ? [Number(m[1]), props[k]] : null;
    })
    .filter(Boolean)
    .sort((a, b) => a[0] - b[0])
    .map((x) => ({ n: x[0], v: x[1] }));
}

/** replaceChildren that skips null/false children (replaceChildren would print "null"). */
export function fill(node, ...kids) {
  node.replaceChildren(...kids.filter((k) => k != null && k !== false));
  return node;
}
