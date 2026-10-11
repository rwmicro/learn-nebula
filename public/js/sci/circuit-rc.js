// Widget "circuit-rc": charge and discharge of a capacitor through a resistor
// (lib/sci-rc.ts). Time axis in units the reader can read (µs, ms, s) and
// marks at τ, 63 % / 37 % and 5τ.
import { el, svg, fmt, drawWidth } from "../widget-kit.js";
import {
  courant,
  formatDuree,
  tau as tauRC,
  tempsFraction,
  uC,
  uniteTemps,
} from "../../../lib/sci-rc.ts";
import { chart, num, segmented, slider, table, points } from "./common.js";

/** "4,7 kΩ", "220 Ω", "1 MΩ". */
function ohms(r) {
  if (r >= 1e6) return fmt(r / 1e6, r % 1e6 ? 2 : 0) + " MΩ";
  if (r >= 1e3) return fmt(r / 1e3, r >= 1e4 ? 0 : 1) + " kΩ";
  return fmt(r, 0) + " Ω";
}
/** "100 µF", "2,2 mF". */
function farads(c) {
  if (c >= 1000) return fmt(c / 1000, 1) + " mF";
  if (c < 1) return fmt(c * 1000, 0) + " nF";
  return fmt(c, c >= 10 ? 0 : 1) + " µF";
}
/** Slider positions are log10 values rounded to the E-series feel of a 1-2-5 step. */
/** "u" with subscript C, then `rest`. */
const uc = (rest) => el("span", {}, ["u", el("sub", {}, ["C"]), rest]);
const snap = (v) => {
  const e = Math.floor(v);
  const m = 10 ** (v - e);
  const nice = [1, 1.5, 2.2, 3.3, 4.7, 6.8, 10].reduce((a, b) =>
    Math.abs(b - m) < Math.abs(a - m) ? b : a,
  );
  return nice * 10 ** e;
};

export function circuitRc(props, fig) {
  let r = num(props.r, 1000, 10, 1e6);
  let c = num(props.c, 100, 0.01, 10000);
  let e = num(props.e, 5, 0.5, 30);
  let mode = /^d/i.test(String(props.mode || "")) ? "decharge" : "charge";

  const plot = el("div", { class: "w-plot-wrap w-plot" });
  const out = el("div", { class: "w-out" });
  const schema = el("div", { class: "sci-rc-schema" });

  const sR = slider({
    label: "R",
    min: 1,
    max: 6,
    step: 0.01,
    value: Math.log10(r),
    format: (v) => ohms(snap(v)),
    onInput: (v) => ((r = snap(v)), draw()),
  });
  const sC = slider({
    label: "C",
    min: -2,
    max: 4,
    step: 0.01,
    value: Math.log10(c),
    format: (v) => farads(snap(v)),
    onInput: (v) => ((c = snap(v)), draw()),
  });
  const sE = slider({
    label: "E",
    min: 1,
    max: 24,
    step: 0.5,
    value: e,
    format: (v) => fmt(v, 1) + " V",
    onInput: (v) => ((e = v), draw()),
  });
  const seg = segmented(
    "charge ou décharge",
    [
      ["charge", "Charge"],
      ["decharge", "Décharge"],
    ],
    mode,
    (v) => ((mode = v), draw()),
  );

  function drawSchema() {
    // Source, switch, R and C in a loop; the switch shows the mode.
    const W = 260;
    const H = 96;
    const k = mode === "charge";
    schema.replaceChildren(
      svg(
        "svg",
        {
          viewBox: `0 0 ${W} ${H}`,
          role: "img",
          "aria-label": k
            ? "schéma : la source E charge C à travers R"
            : "schéma : C se décharge dans R, la source est débranchée",
          class: "sci-rc-svg",
        },
        [
          // left branch: source E
          svg("line", { x1: 30, y1: 18, x2: 30, y2: 38, class: "sci-wire" }),
          svg("line", {
            x1: 18,
            y1: 38,
            x2: 42,
            y2: 38,
            class: "sci-wire sci-thick",
          }),
          svg("line", { x1: 23, y1: 46, x2: 37, y2: 46, class: "sci-wire" }),
          svg("line", { x1: 30, y1: 46, x2: 30, y2: 78, class: "sci-wire" }),
          svg("text", { x: 4, y: 47, class: "sci-sch-t" }, ["E"]),
          // switch between the source (left contact) and the short (right contact)
          svg("line", { x1: 30, y1: 18, x2: 70, y2: 18, class: "sci-wire" }),
          svg("circle", { cx: 70, cy: 18, r: 2.5, class: "sci-node" }),
          svg("circle", { cx: 100, cy: 18, r: 2.5, class: "sci-node" }),
          svg("line", {
            x1: 100,
            y1: 18,
            x2: k ? 72 : 100,
            y2: k ? 18 : 40,
            class: "sci-wire sci-switch",
          }),
          svg("line", {
            x1: 100,
            y1: 40,
            x2: 100,
            y2: 78,
            class: "sci-wire" + (k ? " is-off" : ""),
          }),
          svg("circle", { cx: 100, cy: 40, r: 2.5, class: "sci-node" }),
          svg("line", { x1: 100, y1: 18, x2: 130, y2: 18, class: "sci-wire" }),
          // resistor
          svg("rect", {
            x: 130,
            y: 11,
            width: 40,
            height: 14,
            class: "sci-part",
          }),
          svg(
            "text",
            { x: 150, y: 42, "text-anchor": "middle", class: "sci-sch-t" },
            ["R"],
          ),
          svg("line", { x1: 170, y1: 18, x2: 220, y2: 18, class: "sci-wire" }),
          // capacitor
          svg("line", { x1: 220, y1: 18, x2: 220, y2: 42, class: "sci-wire" }),
          svg("line", {
            x1: 206,
            y1: 42,
            x2: 234,
            y2: 42,
            class: "sci-wire sci-thick",
          }),
          svg("line", {
            x1: 206,
            y1: 52,
            x2: 234,
            y2: 52,
            class: "sci-wire sci-thick",
          }),
          svg("line", { x1: 220, y1: 52, x2: 220, y2: 78, class: "sci-wire" }),
          svg("text", { x: 240, y: 51, class: "sci-sch-t" }, ["C"]),
          svg("text", { x: 182, y: 51, class: "sci-sch-t sci-sch-u" }, [
            "u",
            svg("tspan", { "baseline-shift": "sub", "font-size": "9" }, ["C"]),
          ]),
          svg("line", { x1: 30, y1: 78, x2: 220, y2: 78, class: "sci-wire" }),
        ],
      ),
    );
  }

  function draw() {
    drawSchema();
    const T = tauRC(r, c);
    const tMax = 6 * T;
    const { unite, facteur } = uniteTemps(tMax);
    const W = drawWidth(fig, 640, 300);
    const H = 240;
    const ch = chart({
      W,
      H,
      x: [0, tMax * facteur],
      y: [0, e * 1.08],
      xLabel: "t (" + unite + ")",
      yFmt: (v) => fmt(v, v < 10 && !Number.isInteger(v) ? 1 : 0),
      label:
        mode === "charge"
          ? "tension aux bornes du condensateur pendant la charge"
          : "tension aux bornes du condensateur pendant la décharge",
    });
    const { X, Y, plot: g, P } = ch;
    const ts = [];
    const us = [];
    for (let i = 0; i <= 300; i++) {
      const t = (i / 300) * tMax;
      ts.push(t * facteur);
      us.push(uC(mode, e, t, T));
    }
    const tauX = T * facteur;
    const atTau = uC(mode, e, T, T);
    // Asymptote E (or 0), tangent at the origin (meets the asymptote at t = τ).
    const fin = mode === "charge" ? e : 0;
    g.appendChild(
      svg("line", {
        x1: X(0),
        x2: X(tMax * facteur),
        y1: Y(fin),
        y2: Y(fin),
        class: "sci-dash",
      }),
    );
    g.appendChild(
      svg("line", {
        x1: X(0),
        y1: Y(mode === "charge" ? 0 : e),
        x2: X(tauX),
        y2: Y(fin),
        class: "sci-tangent",
      }),
    );
    // τ mark
    g.appendChild(
      svg("line", {
        x1: X(tauX),
        x2: X(tauX),
        y1: Y(atTau),
        y2: H - P.b,
        class: "sci-dash",
      }),
    );
    g.appendChild(
      svg("line", {
        x1: P.l,
        x2: X(tauX),
        y1: Y(atTau),
        y2: Y(atTau),
        class: "sci-dash",
      }),
    );
    // 5τ: practically steady state
    g.appendChild(
      svg("rect", {
        x: X(5 * tauX),
        y: P.t - 6,
        width: X(tMax * facteur) - X(5 * tauX) + 6,
        height: H - P.b - P.t + 6,
        class: "sci-zone",
      }),
    );
    g.appendChild(
      svg("polyline", {
        points: points(ts, us, X, Y),
        fill: "none",
        stroke: "var(--link)",
        "stroke-width": 2.4,
      }),
    );
    g.appendChild(
      svg("circle", { cx: X(tauX), cy: Y(atTau), r: 4, fill: "var(--link)" }),
    );
    const lbl = svg("g", { class: "w-label" }, [
      svg(
        "text",
        { x: X(tauX) + 7, y: Y(atTau) + (mode === "charge" ? 16 : -8) },
        [(mode === "charge" ? "63 %" : "37 %") + " de E à t = τ"],
      ),
      svg(
        "text",
        {
          x: X(tauX),
          y: H - P.b - 5,
          "text-anchor": "middle",
          class: "sci-mark",
        },
        ["τ"],
      ),
      svg(
        "text",
        {
          x: X(5 * tauX),
          y: H - P.b - 5,
          "text-anchor": "middle",
          class: "sci-mark",
        },
        ["5τ"],
      ),
      svg(
        "text",
        {
          x: X(tMax * facteur) - 4,
          y: Y(e * 0.5),
          "text-anchor": "end",
          class: "sci-mark",
        },
        [
          svg("tspan", { x: X(tMax * facteur) - 4 }, ["régime"]),
          svg("tspan", { x: X(tMax * facteur) - 4, dy: "1.2em" }, [
            "permanent",
          ]),
        ],
      ),
      svg("text", { x: X(0) + 6, y: Y(fin) + (mode === "charge" ? -6 : -6) }, [
        mode === "charge" ? "E = " + fmt(e, 1) + " V" : "0 V",
      ]),
    ]);
    g.appendChild(lbl);
    plot.replaceChildren(
      ch.root,
      el("ul", { class: "w-legend" }, [
        el("li", {}, [
          el("i", { class: "sci-leg-line" }),
          "u",
          el("sub", {}, ["C"]),
          "(t)",
        ]),
        el("li", {}, [
          el("i", { class: "sci-leg-tangent" }),
          "tangente à l'origine",
        ]),
        el("li", {}, [el("i", { class: "sci-leg-zone" }), "au-delà de 5τ"]),
      ]),
    );
    const i0 = courant(mode, e, r, 0, T);
    out.replaceChildren(
      table([
        [
          "Constante de temps τ = RC",
          formatDuree(T) + "  (" + ohms(r) + " × " + farads(c) + ")",
        ],
        [
          uc("(τ)"),
          fmt(atTau, 2) +
            " V, soit " +
            (mode === "charge" ? "63,2 %" : "36,8 %") +
            " de E",
        ],
        [
          mode === "charge"
            ? "Temps pour atteindre 99 % de E"
            : "Temps pour descendre à 1 % de E",
          formatDuree(tempsFraction(0.99, T)) + "  (τ·ln 100 ≈ 4,6 τ)",
        ],
        [
          "Régime permanent (5τ)",
          formatDuree(5 * T) +
            "  — " +
            (mode === "charge" ? "99,3 % de E" : "0,7 % de E"),
        ],
        [
          "Courant à t = 0",
          fmt(Math.abs(i0) * 1000, Math.abs(i0) * 1000 >= 10 ? 0 : 2) +
            " mA" +
            (mode === "decharge" ? " (sens inverse de la charge)" : ""),
        ],
      ]),
      el("p", { class: "w-note" }, [
        uc("(t) = E·"),
        mode === "charge" ? "(1 − e" : "e",
        el("sup", {}, ["−t/τ"]),
        mode === "charge" ? "). " : ". ",
        mode === "charge"
          ? "Au bout d'une constante de temps le condensateur a parcouru 63 % du chemin, et chaque τ supplémentaire réduit l'écart restant d'un facteur e ≈ 2,7. La tangente à l'origine coupe l'asymptote exactement à t = τ : c'est ainsi qu'on lit τ sur un oscillogramme. Double R ou C et τ double ; E ne change que la hauteur, jamais la durée."
          : "Après τ il reste 37 % de la tension, après 5τ moins de 1 % : on considère le condensateur déchargé. Le courant change de sens par rapport à la charge, puisque c'est le condensateur qui le fournit. Double R ou C et la décharge dure deux fois plus longtemps.",
      ]),
    );
  }

  draw();
  return el("div", { class: "w-root sci-rc" }, [
    el("div", { class: "w-controls" }, [seg.node]),
    el("div", { class: "sci-rc-top" }, [
      schema,
      el("div", { class: "sci-sliders" }, [sR.node, sC.node, sE.node]),
    ]),
    plot,
    out,
  ]);
}
