// Widget "supercompensation": the reader places training sessions on a
// calendar and sees the fitness-fatigue model's performance curve
// (lib/sci-fitness.ts: Banister impulse-response + Busso's variable fatigue).
import { el, svg, fmt, drawWidth } from "../widget-kit.js";
import {
  CHARGE,
  INTENSITE_LABEL,
  PARAMS,
  courbe,
  parseIntensite,
  parseSeances,
  picIsole,
  timings,
} from "../../../lib/sci-fitness.ts";
import { chart, num, segmented, table, points } from "./common.js";

const COULEUR = {
  legere: "var(--w-s3)",
  moderee: "var(--w-s2)",
  intense: "var(--danger)",
};
/** Where a session lands on the curve left by the previous ones (table label). */
const TIMING = {
  "trop-tot": "séances trop tôt (encore fatigué)",
  fenetre: "séances dans la fenêtre de surcompensation",
  "trop-tard": "séances trop tard (gain presque dissipé)",
};

export function supercompensation(props, fig) {
  const jours = Math.round(num(props.jours, 21, 14, 28));
  let intensite = parseIntensite(props.intensite, "intense");
  const depart =
    props.seances != null
      ? parseSeances(props.seances, jours, intensite)
      : parseSeances("1,5,9,13", jours, intensite);
  /** day → intensity */
  const plan = new Map(depart.map((s) => [s.jour, s.intensite]));

  const cal = el("div", {
    class: "sci-cal",
    role: "group",
    "aria-label": "jours d'entraînement",
  });
  const plot = el("div", { class: "w-plot-wrap w-plot" });
  const out = el("div", { class: "w-out" });
  const note = el("p", { class: "w-note" });

  const seg = segmented(
    "intensité de la prochaine séance",
    [
      ["legere", "légère"],
      ["moderee", "modérée"],
      ["intense", "intense"],
    ],
    intensite,
    (v) => (intensite = v),
  );

  function seances() {
    return [...plan.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([jour, i]) => ({ jour, intensite: i }));
  }

  function drawCal() {
    cal.replaceChildren(
      ...Array.from({ length: jours }, (_, k) => {
        const d = k + 1;
        const i = plan.get(d);
        return el(
          "button",
          {
            type: "button",
            class: "sci-day" + (i ? " is-" + i : ""),
            "aria-pressed": String(!!i),
            "aria-label": `jour ${d}${i ? ", séance " + INTENSITE_LABEL[i] : ""}`,
            onclick: () => {
              if (plan.get(d) === intensite) plan.delete(d);
              else plan.set(d, intensite);
              draw();
            },
          },
          [
            el("span", { class: "sci-day-n" }, [String(d)]),
            el("span", { class: "sci-day-i" }, [
              i ? INTENSITE_LABEL[i][0].toUpperCase() : "",
            ]),
          ],
        );
      }),
    );
  }

  function draw() {
    drawCal();
    const s = seances();
    const t1 = jours + 1;
    const c = courbe(s, 1, t1, 0.05);
    const lo = Math.min(96, ...c.map((p) => p.perf));
    const hi = Math.max(104, ...c.map((p) => p.perf));
    const W = drawWidth(fig, 640, 300);
    const H = 230;
    const yLo = Math.floor(lo - 1);
    const ch = chart({
      W,
      H,
      x: [1, t1],
      y: [yLo, Math.ceil(hi + 1)],
      xFmt: (v) => String(v),
      xTicks: Array.from(
        { length: Math.floor(jours / 7) + 1 },
        (_, k) => 1 + 7 * k,
      ).filter((v) => v <= t1),
      yFmt: (v) => fmt(v, 0),
      xLabel: "jour (début de journée)",
      label: "indice de performance au fil des jours",
    });
    const { X, Y, plot: g } = ch;
    // Baseline 100 and the areas above (supercompensation) / below (fatigue).
    g.appendChild(
      svg("rect", {
        x: X(1),
        y: Y(100),
        width: X(t1) - X(1),
        height: Y(yLo) - Y(100),
        class: "sci-zone-bas",
      }),
    );
    g.appendChild(
      svg("line", {
        x1: X(1),
        x2: X(t1),
        y1: Y(100),
        y2: Y(100),
        class: "sci-base",
      }),
    );
    g.appendChild(
      svg(
        "text",
        {
          x: X(t1) - 4,
          y: Y(100) + 14,
          "text-anchor": "end",
          class: "w-label",
        },
        ["niveau de base"],
      ),
    );
    for (const x of s) {
      g.appendChild(
        svg("line", {
          x1: X(x.jour),
          x2: X(x.jour),
          y1: ch.P.t,
          y2: H - ch.P.b,
          stroke: COULEUR[x.intensite],
          class: "sci-tick",
        }),
      );
    }
    g.appendChild(
      svg("polyline", {
        points: points(
          c.map((p) => p.t),
          c.map((p) => p.perf),
          X,
          Y,
        ),
        fill: "none",
        stroke: "var(--link)",
        "stroke-width": 2.2,
      }),
    );
    plot.replaceChildren(
      ch.root,
      el("ul", { class: "w-legend" }, [
        el("li", {}, [
          el("i", { class: "sci-leg-line" }),
          "performance (indice, 100 = sans entraînement)",
        ]),
        ...["legere", "moderee", "intense"].map((k) =>
          el("li", {}, [
            el("i", { class: "sci-leg-tick is-" + k }),
            "séance " + INTENSITE_LABEL[k],
          ]),
        ),
      ]),
    );

    const tm = timings(s);
    const fin = c[c.length - 1].perf;
    const min = c.reduce((a, b) => (b.perf < a.perf ? b : a));
    const max = c.reduce((a, b) => (b.perf > a.perf ? b : a));
    const nTot = tm.filter((x) => x.timing === "trop-tot").length;
    const nTard = tm.filter((x) => x.timing === "trop-tard").length;
    const charge = s.reduce((a, x) => a + CHARGE[x.intensite], 0);
    out.replaceChildren(
      table([
        [
          "Séances",
          s.length
            ? s.length + " (charge totale " + charge + ")"
            : "aucune — touche un jour",
        ],
        [
          "Meilleur niveau",
          max.perf > 100.05
            ? fmt(max.perf, 1) + " le jour " + Math.floor(max.t)
            : "jamais au-dessus du niveau de base",
        ],
        [
          "Creux le plus bas",
          min.perf < 99.95
            ? fmt(min.perf, 1) + " le jour " + Math.floor(min.t)
            : "—",
        ],
        ["Niveau au jour " + t1, fmt(fin, 1)],
        ...Object.keys(TIMING)
          .map((k) => [k, tm.filter((x) => x.timing === k).map((x) => x.jour)])
          .filter(([, days]) => days.length)
          .map(([k, days]) => [
            TIMING[k][0].toUpperCase() + TIMING[k].slice(1),
            (days.length > 1 ? "jours " : "jour ") + days.join(", "),
          ]),
      ]),
    );
    const pic = picIsole();
    note.textContent =
      (s.length === 0
        ? "Place des séances sur le calendrier. "
        : nTot >= 3
          ? "Les séances arrivent avant la fin de la fatigue : elle s'accumule et la courbe s'enfonce, c'est le surmenage (overreaching). Quelques jours de repos la font remonter ; en vrai, un surentraînement prolongé demande des semaines ou des mois. "
          : nTard > 0 && nTot === 0
            ? "Des séances trop espacées tombent quand le gain est presque effacé : chaque séance repart presque de zéro. "
            : "Une séance placée pendant la surcompensation part d'un niveau plus haut que la précédente : les gains s'additionnent. ") +
      `Modèle utilisé (Banister, 1975, avec la fatigue variable de Busso, 2003) : chaque séance ajoute une « forme » qui s'efface lentement (constante de ${fmt(PARAMS.tauForme, 1)} j) et une « fatigue » plus forte qui s'efface vite (${fmt(PARAMS.tauFatigue, 2)} j), et la fatigue d'une séance est d'autant plus forte, et lente à se dissiper, que la charge des jours précédents est élevée. Une séance isolée fait passer sous le niveau de base pendant ${fmt(pic.tZero * 24, 0)} h, puis culmine ${fmt(pic.tPic, 1)} jours après. Ces constantes sont choisies pour l'illustration ; ajustées sur de vrais athlètes, elles valent plutôt 40 à 50 jours pour la forme et 7 à 15 jours pour la fatigue, et décrivent des semaines d'entraînement, pas une séance.`;
  }

  const presets = [
    ["Bien espacées", "1,5,9,13,17", "intense"],
    ["Tous les jours", "1,2,3,4,5,6,7,8,9,10", "intense"],
    ["Trop espacées", "1,12", "intense"],
    ["Légères chaque jour", "1,2,3,4,5,6,7,8,9,10", "legere"],
  ].map(([lbl, days, i]) =>
    el(
      "button",
      {
        type: "button",
        class: "w-btn",
        onclick: () => {
          plan.clear();
          for (const x of parseSeances(days, jours, i))
            plan.set(x.jour, x.intensite);
          intensite = i;
          seg.set(i);
          draw();
        },
      },
      [lbl],
    ),
  );

  draw();
  return el("div", { class: "w-root sci-super" }, [
    el("div", { class: "w-controls" }, [
      el("span", { class: "w-hint" }, ["Intensité :"]),
      seg.node,
    ]),
    cal,
    el("p", { class: "w-hint sci-cal-hint" }, [
      "Touche un jour pour y placer une séance, touche-le encore pour l'enlever. L = légère, M = modérée, I = intense.",
    ]),
    plot,
    el("div", { class: "w-controls" }, [
      el("span", { class: "w-hint" }, ["Exemples :"]),
      ...presets,
    ]),
    out,
    note,
  ]);
}
