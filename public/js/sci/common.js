// Small pieces shared by the "sci" widgets (public/js/widgets-sci.js):
// prop parsing, readout tables, segmented buttons, sliders, and a line-chart
// frame. Visual grammar is main.css's .w-* plus widgets-extra.css's chart
// classes; anything specific lives in assets/css/widgets-sci.css.
import { el, svg, niceTicks, fmtShort } from "../widget-kit.js";

/** A numeric prop (every prop arrives as a string): French decimal comma
 *  accepted, clamped to [min, max], `def` when missing or unreadable. */
export function num(v, def, min = -Infinity, max = Infinity) {
  const x = Number(
    String(v ?? "")
      .replace(",", ".")
      .trim(),
  );
  if (v == null || String(v).trim() === "" || !Number.isFinite(x)) return def;
  return Math.max(min, Math.min(max, x));
}

/** Readout table: rows of [label, value]. */
export function table(rows) {
  return el(
    "table",
    { class: "w-table" },
    rows.map((r) =>
      el("tr", {}, [el("th", { scope: "row" }, [r[0]]), el("td", {}, [r[1]])]),
    ),
  );
}

/** A labelled slider with its live value next to it. Returns { node, input, set }. */
export function slider({ label, min, max, step, value, format, onInput }) {
  const input = el("input", {
    type: "range",
    min: String(min),
    max: String(max),
    step: String(step),
    value: String(value),
    class: "w-range",
    "aria-label": label,
  });
  const out = el("output", { class: "sci-val" });
  const show = () =>
    (out.textContent = format ? format(Number(input.value)) : input.value);
  input.addEventListener("input", () => {
    show();
    onInput(Number(input.value));
  });
  show();
  return {
    node: el("label", { class: "sci-slider" }, [
      el("span", { class: "sci-slider-l" }, [label]),
      input,
      out,
    ]),
    input,
    set(v) {
      input.value = String(v);
      show();
    },
  };
}

/** Segmented buttons (one active). Returns { node, set }. */
export function segmented(label, options, value, onChange) {
  const btns = options.map(([v, text]) =>
    el(
      "button",
      {
        type: "button",
        class: "w-btn",
        "aria-pressed": String(v === value),
        onclick: () => {
          set(v);
          onChange(v);
        },
      },
      [text],
    ),
  );
  function set(v) {
    options.forEach(([ov], i) => {
      btns[i].classList.toggle("is-active", ov === v);
      btns[i].setAttribute("aria-pressed", String(ov === v));
    });
  }
  set(value);
  return {
    node: el(
      "div",
      { class: "sci-seg", role: "group", "aria-label": label },
      btns,
    ),
    set,
  };
}

let uidN = 0;
/** Unique id for SVG defs (several widgets can share a page). */
export const uid = (p) => `${p}-${++uidN}`;

/**
 * Line-chart frame: axes, gridlines, tick labels. Returns { root, X, Y, plot }
 * where `plot` is the <g> to draw the marks into, clipped to the plot area.
 */
export function chart({
  W,
  H,
  x,
  y,
  xTicks,
  yTicks,
  xFmt = fmtShort,
  yFmt = fmtShort,
  xLabel,
  yLabel,
  label,
  padL = 40,
}) {
  const P = { l: padL, r: 12, t: yLabel ? 24 : 12, b: xLabel ? 40 : 26 };
  const X = (v) => P.l + ((v - x[0]) / (x[1] - x[0])) * (W - P.l - P.r);
  const Y = (v) => H - P.b - ((v - y[0]) / (y[1] - y[0])) * (H - P.t - P.b);
  const xt = xTicks || niceTicks(x[0], x[1], Math.max(3, Math.floor(W / 90)));
  const yt = yTicks || niceTicks(y[0], y[1], 4);
  const axis = svg("g", { class: "w-axis" });
  for (const t of yt) {
    axis.appendChild(
      svg("line", {
        class: "w-gridline",
        x1: P.l,
        x2: W - P.r,
        y1: Y(t),
        y2: Y(t),
      }),
    );
    axis.appendChild(
      svg("text", { x: P.l - 5, y: Y(t) + 4, "text-anchor": "end" }, [yFmt(t)]),
    );
  }
  for (const t of xt) {
    axis.appendChild(
      svg("text", { x: X(t), y: H - P.b + 15, "text-anchor": "middle" }, [
        xFmt(t),
      ]),
    );
  }
  axis.appendChild(
    svg("line", {
      class: "w-baseline",
      x1: P.l,
      x2: W - P.r,
      y1: H - P.b,
      y2: H - P.b,
    }),
  );
  axis.appendChild(
    svg("line", {
      class: "w-baseline",
      x1: P.l,
      x2: P.l,
      y1: P.t,
      y2: H - P.b,
    }),
  );
  if (xLabel)
    axis.appendChild(
      svg(
        "text",
        { x: (P.l + W - P.r) / 2, y: H - 6, "text-anchor": "middle" },
        [xLabel],
      ),
    );
  if (yLabel)
    axis.appendChild(
      svg(
        "text",
        { x: P.l - 5, y: 11, "text-anchor": "start", class: "sci-ylabel" },
        [yLabel],
      ),
    );
  const clip = uid("clip");
  const plot = svg("g", { "clip-path": `url(#${clip})` });
  const root = svg(
    "svg",
    {
      viewBox: `0 0 ${W} ${H}`,
      role: "img",
      "aria-label": label || "graphique",
    },
    [
      svg("defs", {}, [
        svg("clipPath", { id: clip }, [
          svg("rect", {
            x: P.l,
            y: P.t - 6,
            width: W - P.l - P.r + 6,
            height: H - P.t - P.b + 6,
          }),
        ]),
      ]),
      axis,
      plot,
    ],
  );
  return { root, X, Y, plot, P };
}

/** "x1,y1 x2,y2 …" for a polyline from parallel arrays, skipping points
 *  closer than a pixel to the last one kept. */
export function points(xs, ys, X, Y) {
  let s = "";
  let lx = -Infinity;
  let ly = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    const px = X(xs[i]);
    const py = Y(ys[i]);
    if (i !== xs.length - 1 && Math.abs(px - lx) + Math.abs(py - ly) < 1)
      continue;
    lx = px;
    ly = py;
    s += px.toFixed(1) + "," + py.toFixed(1) + " ";
  }
  return s;
}

/** Safe localStorage JSON read/write (private mode, blocked storage…). */
export function lsGet(key, def) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : def;
  } catch {
    return def;
  }
}
export function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the widget still works, it just forgets.
  }
}
