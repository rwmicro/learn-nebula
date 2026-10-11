// Widget "lotka-volterra": prey and predators over time and in the phase
// plane (lib/sci-lotka.ts, RK4).
import { el, svg, fmt, drawWidth } from "../widget-kit.js";
import {
  equilibre,
  integrer,
  periode,
  periodeLineaire,
} from "../../../lib/sci-lotka.ts";
import { chart, num, slider, table, points } from "./common.js";

const PROIE = "var(--w-s1)";
const PRED = "var(--w-s2)";

export function lotkaVolterra(props, fig) {
  const p = {
    alpha: num(props.alpha, 1.1, 0.1, 3),
    beta: num(props.beta, 0.4, 0.02, 2),
    delta: num(props.delta, 0.1, 0.01, 1),
    gamma: num(props.gamma, 0.4, 0.05, 3),
  };
  let x0 = num(props.proies, 8, 0.5, 100);
  let y0 = num(props.predateurs, 5, 0.5, 100);
  const duree = num(props.duree, 50, 10, 200);

  const plots = el("div", { class: "sci-two" });
  const out = el("div", { class: "w-out" });
  const f2 = (v) => fmt(v, 2);
  const sliders = [
    slider({
      label: "α naissances (proies)",
      min: 0.1,
      max: 2.5,
      step: 0.05,
      value: p.alpha,
      format: f2,
      onInput: (v) => ((p.alpha = v), draw()),
    }),
    slider({
      label: "β prédation",
      min: 0.05,
      max: 1,
      step: 0.01,
      value: p.beta,
      format: f2,
      onInput: (v) => ((p.beta = v), draw()),
    }),
    slider({
      label: "δ conversion",
      min: 0.02,
      max: 0.5,
      step: 0.01,
      value: p.delta,
      format: f2,
      onInput: (v) => ((p.delta = v), draw()),
    }),
    slider({
      label: "γ mortalité (prédateurs)",
      min: 0.1,
      max: 2,
      step: 0.05,
      value: p.gamma,
      format: f2,
      onInput: (v) => ((p.gamma = v), draw()),
    }),
    slider({
      label: "Proies à t = 0",
      min: 1,
      max: 60,
      step: 1,
      value: x0,
      format: (v) => fmt(v, 0),
      onInput: (v) => ((x0 = v), draw()),
    }),
    slider({
      label: "Prédateurs à t = 0",
      min: 1,
      max: 30,
      step: 0.5,
      value: y0,
      format: (v) => fmt(v, 1),
      onInput: (v) => ((y0 = v), draw()),
    }),
  ];

  function draw() {
    const r = integrer(p, x0, y0, duree, 0.01);
    const eq = equilibre(p);
    let xMax = 0;
    let yMax = 0;
    for (let i = 0; i < r.x.length; i++) {
      if (r.x[i] > xMax) xMax = r.x[i];
      if (r.y[i] > yMax) yMax = r.y[i];
    }
    const wide = (fig.clientWidth || 640) >= 600;
    const full = drawWidth(fig, 640, 300);
    const W = wide ? Math.floor((full - 16) / 2) : full;
    const H = wide ? 250 : 220;
    const top = Math.max(xMax, yMax) * 1.08;

    // Time series: both populations on one axis, labelled at their line ends.
    const a = chart({
      W,
      H,
      x: [0, duree],
      y: [0, top],
      xLabel: "temps",
      label: "proies et prédateurs au fil du temps",
      padL: 36,
    });
    a.plot.appendChild(
      svg("polyline", {
        points: points(r.t, r.x, a.X, a.Y),
        fill: "none",
        stroke: PROIE,
        "stroke-width": 2,
      }),
    );
    a.plot.appendChild(
      svg("polyline", {
        points: points(r.t, r.y, a.X, a.Y),
        fill: "none",
        stroke: PRED,
        "stroke-width": 2,
      }),
    );
    // Direct labels at the highest peak of each series.
    const peakIdx = (arr) => {
      let k = 0;
      for (let i = 0; i < arr.length; i++) if (arr[i] > arr[k]) k = i;
      return k;
    };
    const kx = peakIdx(r.x);
    const ky = peakIdx(r.y);
    const lx = Math.min(a.X(r.t[kx]) + 6, W - 70);
    let lyX = a.Y(r.x[kx]) + 4;
    const lxY = Math.min(a.X(r.t[ky]) + 6, W - 90);
    let lyY = a.Y(r.y[ky]) + 4;
    if (Math.abs(lyX - lyY) < 14 && Math.abs(lx - lxY) < 80) lyY = lyX + 15;
    lyX = Math.max(14, lyX);
    a.root.appendChild(
      svg("text", { x: lx, y: lyX, class: "w-label sci-lab-1" }, ["proies"]),
    );
    a.root.appendChild(
      svg(
        "text",
        { x: lxY, y: Math.max(14, lyY), class: "w-label sci-lab-2" },
        ["prédateurs"],
      ),
    );

    // Phase portrait: prey on x, predators on y; equilibrium and start marked.
    const b = chart({
      W,
      H,
      x: [0, xMax * 1.08],
      y: [0, yMax * 1.1],
      xLabel: "proies",
      yLabel: "prédateurs",
      label: "portrait de phase : prédateurs en fonction des proies",
      padL: 36,
    });
    b.plot.appendChild(
      svg("line", {
        x1: b.X(eq.x),
        x2: b.X(eq.x),
        y1: b.Y(0),
        y2: b.Y(yMax * 1.1),
        class: "sci-dash",
      }),
    );
    b.plot.appendChild(
      svg("line", {
        x1: b.X(0),
        x2: b.X(xMax * 1.08),
        y1: b.Y(eq.y),
        y2: b.Y(eq.y),
        class: "sci-dash",
      }),
    );
    b.plot.appendChild(
      svg("polyline", {
        points: points(r.x, r.y, b.X, b.Y),
        fill: "none",
        stroke: "var(--link)",
        "stroke-width": 1.8,
      }),
    );
    b.plot.appendChild(
      svg("circle", { cx: b.X(eq.x), cy: b.Y(eq.y), r: 4, fill: "var(--ink)" }),
    );
    b.plot.appendChild(
      svg("circle", {
        cx: b.X(x0),
        cy: b.Y(y0),
        r: 4,
        fill: "var(--paper)",
        stroke: "var(--link)",
        "stroke-width": 2,
      }),
    );
    const eqRight = b.X(eq.x) < W * 0.6;
    b.root.appendChild(
      svg(
        "text",
        {
          x: b.X(eq.x) + (eqRight ? 7 : -7),
          y: b.Y(eq.y) - 7,
          "text-anchor": eqRight ? "start" : "end",
          class: "w-label",
        },
        ["équilibre"],
      ),
    );
    b.root.appendChild(
      svg(
        "text",
        { x: Math.min(b.X(x0) + 7, W - 40), y: b.Y(y0) + 15, class: "w-label" },
        ["départ"],
      ),
    );

    plots.replaceChildren(
      el("div", { class: "w-plot-wrap" }, [
        el("p", { class: "sci-cap" }, ["Au fil du temps"]),
        a.root,
      ]),
      el("div", { class: "w-plot-wrap" }, [
        el("p", { class: "sci-cap" }, ["Portrait de phase"]),
        b.root,
      ]),
    );

    const T = periode(r.t, r.x);
    out.replaceChildren(
      el("ul", { class: "w-legend" }, [
        el("li", {}, [el("i", { class: "sci-key-1" }), "proies x"]),
        el("li", {}, [el("i", { class: "sci-key-2" }), "prédateurs y"]),
      ]),
      table([
        [
          "Équilibre (γ/δ ; α/β)",
          fmt(eq.x, 2) + " proies ; " + fmt(eq.y, 2) + " prédateurs",
        ],
        [
          "Période des cycles",
          T
            ? "≈ " +
              fmt(T, 1) +
              " (petites oscillations : 2π/√(αγ) = " +
              fmt(periodeLineaire(p), 1) +
              ")"
            : "plus longue que la durée simulée",
        ],
        ["Proies : min – max", fmt(Math.min(...r.x), 2) + " – " + fmt(xMax, 1)],
        [
          "Prédateurs : min – max",
          fmt(Math.min(...r.y), 2) + " – " + fmt(yMax, 1),
        ],
      ]),
      el("p", { class: "w-note" }, [
        "dx/dt = αx − βxy et dy/dt = δxy − γy, intégrées pas à pas (Runge-Kutta d'ordre 4). Remarque le décalage : le pic des prédateurs suit toujours celui des proies, parce qu'ils ont besoin de proies abondantes pour se multiplier, puis les font chuter. Dans le portrait de phase, la trajectoire est une boucle fermée qui tourne autour de l'équilibre (γ/δ, α/β) : sans perturbation, le cycle se répète à l'identique. Pars exactement de l'équilibre et plus rien ne bouge ; pars loin et les oscillations deviennent violentes. Curiosité du modèle : rendre les prédateurs plus voraces (β) ne change pas le nombre moyen de proies, mais fait baisser celui des prédateurs.",
      ]),
    );
  }

  draw();
  return el("div", { class: "w-root sci-lv" }, [
    el(
      "div",
      { class: "sci-sliders sci-sliders-2" },
      sliders.map((s) => s.node),
    ),
    plots,
    out,
  ]);
}
