// Widget "cercle-trigo": an angle on the unit circle, its cosine and sine as
// the point's coordinates, the tangent on the line x = 1, and the sine curve
// traced alongside. Drag the point, use the slider, or jump to a remarkable
// angle.
import { el, svg, fmt, drawWidth } from "../widget-kit.js";
import { num, slider, table } from "./common.js";

const REMARQUABLES = [
  [0, "0"],
  [30, "π/6"],
  [45, "π/4"],
  [60, "π/3"],
  [90, "π/2"],
  [120, "2π/3"],
  [135, "3π/4"],
  [150, "5π/6"],
  [180, "π"],
  [270, "3π/2"],
];

const EXACT = {
  0: ["1", "0", "0"],
  30: ["√3/2", "1/2", "√3/3"],
  45: ["√2/2", "√2/2", "1"],
  60: ["1/2", "√3/2", "√3"],
  90: ["0", "1", "non définie"],
  120: ["−1/2", "√3/2", "−√3"],
  135: ["−√2/2", "√2/2", "−1"],
  150: ["−√3/2", "1/2", "−√3/3"],
  180: ["−1", "0", "0"],
  270: ["0", "−1", "non définie"],
};

const RAD = Math.PI / 180;

export function cercleTrigo(props, fig, ctx) {
  let deg = num(props.angle, 30, -360, 360);
  deg = ((deg % 360) + 360) % 360;

  const sA = slider({
    label: "Angle",
    min: 0,
    max: 360,
    step: 1,
    value: deg,
    format: (v) => v + "°",
    onInput: (v) => {
      deg = v;
      draw();
    },
  });
  const btns = el(
    "div",
    { class: "trig-btns" },
    REMARQUABLES.map(([d, lab]) =>
      el(
        "button",
        {
          type: "button",
          class: "w-btn",
          onclick: () => {
            deg = d;
            sA.set(d);
            draw();
          },
        },
        [lab],
      ),
    ),
  );
  const plot = el("div", { class: "sci-two trig-plots" });
  // The circle is redrawn on every change, so dragging listens on a wrapper
  // that stays put and reads the current drawing's box.
  const wrapC = el("div", { class: "w-plot-wrap trig-drag" });
  const fromEvent = (ev) => {
    const s = wrapC.querySelector("svg");
    if (!s) return;
    const b = s.getBoundingClientRect();
    const x = (ev.clientX - b.left) / b.width - 0.5;
    const y = 0.5 - (ev.clientY - b.top) / b.height;
    if (Math.hypot(x, y) < 0.04) return;
    let d = Math.round(Math.atan2(y, x) / RAD);
    if (d < 0) d += 360;
    deg = d;
    sA.set(d);
    draw();
  };
  let dragging = false;
  wrapC.addEventListener("pointerdown", (ev) => {
    dragging = true;
    wrapC.setPointerCapture?.(ev.pointerId);
    fromEvent(ev);
  });
  wrapC.addEventListener("pointermove", (ev) => dragging && fromEvent(ev));
  const end = () => (dragging = false);
  wrapC.addEventListener("pointerup", end);
  wrapC.addEventListener("pointercancel", end);
  const out = el("div", { class: "w-out" });

  function draw() {
    const full = drawWidth(fig, 640, 300);
    const wide = (fig.clientWidth || 640) >= 600;
    const S = wide ? Math.min(300, Math.floor((full - 16) / 2)) : Math.min(300, full);
    const c = S / 2;
    const r = S * 0.36;
    const a = deg * RAD;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const px = c + r * cos;
    const py = c - r * sin;

    const circ = svg("svg", { viewBox: `0 0 ${S} ${S}`, width: S, height: S, role: "img", "aria-label": "cercle trigonométrique" });
    circ.appendChild(svg("line", { x1: 4, y1: c, x2: S - 4, y2: c, class: "trig-axis" }));
    circ.appendChild(svg("line", { x1: c, y1: 4, x2: c, y2: S - 4, class: "trig-axis" }));
    circ.appendChild(svg("circle", { cx: c, cy: c, r, class: "trig-circle" }));
    // Tangent: the line x = 1, met by the extended radius.
    const tanOk = Math.abs(cos) > 0.02;
    circ.appendChild(svg("line", { x1: c + r, y1: 4, x2: c + r, y2: S - 4, class: "trig-tanline" }));
    if (tanOk) {
      const ty = c - r * Math.tan(a);
      if (ty > -S && ty < 2 * S) {
        circ.appendChild(svg("line", { x1: c, y1: c, x2: c + r, y2: ty, class: "trig-ext" }));
        circ.appendChild(svg("line", { x1: c + r, y1: c, x2: c + r, y2: ty, class: "trig-tan" }));
      }
    }
    // Angle arc.
    const ar = r * 0.22;
    const large = deg > 180 ? 1 : 0;
    if (deg > 0)
      circ.appendChild(
        svg("path", { d: `M${c + ar},${c} A${ar},${ar} 0 ${large} 0 ${c + ar * cos},${c - ar * sin}`, class: "trig-arc" }),
      );
    circ.appendChild(svg("line", { x1: c, y1: c, x2: px, y2: py, class: "trig-radius" }));
    circ.appendChild(svg("line", { x1: px, y1: py, x2: px, y2: c, class: "trig-sin" }));
    circ.appendChild(svg("line", { x1: c, y1: c, x2: px, y2: c, class: "trig-cos" }));
    circ.appendChild(svg("text", { x: c + r + 4, y: c - 4, class: "w-label" }, ["1"]));
    const pt = svg("circle", { cx: px, cy: py, r: 7, class: "trig-pt" });
    circ.appendChild(pt);

    // Sine and cosine over one turn, with the current angle marked.
    const W2 = S;
    const H2 = S * 0.7;
    const m = 18;
    const X = (d) => m + (d / 360) * (W2 - 2 * m);
    const Y = (v) => H2 / 2 - v * (H2 / 2 - m);
    const curve = svg("svg", { viewBox: `0 0 ${W2} ${H2}`, width: W2, height: H2, role: "img", "aria-label": "courbes de sinus et cosinus" });
    curve.appendChild(svg("line", { x1: m, y1: Y(0), x2: W2 - m, y2: Y(0), class: "trig-axis" }));
    const pts = (fn) =>
      Array.from({ length: 121 }, (_, i) => i * 3)
        .map((d) => `${X(d).toFixed(1)},${Y(fn(d * RAD)).toFixed(1)}`)
        .join(" ");
    curve.appendChild(svg("polyline", { points: pts(Math.cos), class: "trig-cos-c" }));
    curve.appendChild(svg("polyline", { points: pts(Math.sin), class: "trig-sin-c" }));
    curve.appendChild(svg("line", { x1: X(deg), y1: m / 2, x2: X(deg), y2: H2 - m / 2, class: "trig-mark" }));
    curve.appendChild(svg("circle", { cx: X(deg), cy: Y(sin), r: 4, class: "trig-sin-dot" }));
    curve.appendChild(svg("circle", { cx: X(deg), cy: Y(cos), r: 4, class: "trig-cos-dot" }));
    for (const [d, lab] of [
      [90, "π/2"],
      [180, "π"],
      [270, "3π/2"],
      [360, "2π"],
    ])
      curve.appendChild(svg("text", { x: X(d), y: H2 - 2, "text-anchor": "middle", class: "w-label" }, [lab]));

    plot.replaceChildren(
      (wrapC.replaceChildren(circ), wrapC),
      el("div", { class: "w-plot-wrap" }, [
        el("p", { class: "sci-cap" }, [el("span", { class: "trig-k-sin" }, ["sin"]), " et ", el("span", { class: "trig-k-cos" }, ["cos"]), " sur un tour"]),
        curve,
      ]),
    );

    const ex = EXACT[deg];
    const rad = REMARQUABLES.find((x) => x[0] === deg)?.[1];
    out.replaceChildren(
      table([
        ["Angle", deg + "°" + (rad ? " = " + rad : " ≈ " + fmt(a, 3) + " rad")],
        ["cos (abscisse de M)", ex ? `${ex[0]} ≈ ${fmt(cos, 3)}` : fmt(cos, 3)],
        ["sin (ordonnée de M)", ex ? `${ex[1]} ≈ ${fmt(sin, 3)}` : fmt(sin, 3)],
        ["tan = sin / cos", ex ? (ex[2] === "non définie" ? ex[2] : `${ex[2]} ≈ ${fmt(sin / cos, 3)}`) : tanOk ? fmt(sin / cos, 3) : "non définie"],
        ["cos² + sin²", fmt(cos * cos + sin * sin, 3)],
      ]),
      el("p", { class: "w-note" }, [
        "Sur le cercle de rayon 1, le point M associé à l'angle a pour coordonnées (cos, sin) : d'où cos² + sin² = 1, et des valeurs toujours comprises entre −1 et 1. La tangente se lit sur la droite verticale x = 1, là où le rayon prolongé la coupe ; elle n'existe pas quand le rayon est vertical.",
      ]),
    );
    ctx?.report({ angle: deg, cos: Math.round(cos * 1000) / 1000, sin: Math.round(sin * 1000) / 1000 });
  }

  draw();
  return el("div", { class: "w-root trig" }, [el("div", { class: "sci-sliders" }, [sA.node]), btns, plot, out]);
}
