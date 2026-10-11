// Widget "datation": 400 atoms decaying at random with a chosen isotope's
// half-life, then the dating formula t = T½·log2(N0/N) (lib/sci-decay.ts).
import { el, svg, fmt, drawWidth, reducedMotion } from "../widget-kit.js";
import {
  ISOTOPES,
  age,
  formatAns,
  parseIsotope,
  restant,
  tiragesVies,
} from "../../../lib/sci-decay.ts";
import { chart, num, segmented, slider, table, points } from "./common.js";

const N = 400;
/** "du carbone 14", "de l'uranium 238". */
const du = (nom) => (/^[aeiouy]/i.test(nom) ? "de l'" : "du ") + nom;
const COLS = 20;
const MAX_T = 6; // half-lives shown on the time slider

export function datation(props, fig) {
  let iso = ISOTOPES[parseIsotope(props.isotope)];
  let seed = Math.round(num(props.graine, 17, 1, 1e9));
  let vies = tiragesVies(N, seed);
  let t = 0; // in half-lives
  let reste = num(props.restant, 25, 0.1, 100); // % of parent left, dating mode
  let timer = 0;

  const grid = el("div", { class: "sci-atoms-wrap" });
  const curve = el("div", { class: "w-plot-wrap w-plot" });
  const counts = el("div", { class: "w-out" });

  const sT = slider({
    label: "Temps écoulé",
    min: 0,
    max: MAX_T,
    step: 0.01,
    value: 0,
    format: (v) => fmt(v, 2) + " T½",
    onInput: (v) => {
      stop();
      t = v;
      drawSim();
    },
  });
  const play = el(
    "button",
    {
      type: "button",
      class: "w-btn",
      onclick: () => (timer ? stop() : start()),
    },
    ["▶ Lancer"],
  );
  const redraw = el(
    "button",
    {
      type: "button",
      class: "w-btn",
      onclick: () => {
        seed = (seed * 48271) % 2147483647;
        vies = tiragesVies(N, seed);
        drawSim();
      },
    },
    ["Nouveau tirage"],
  );
  const seg = segmented(
    "isotope",
    Object.values(ISOTOPES).map((x) => [x.id, x.nom]),
    iso.id,
    (v) => {
      iso = ISOTOPES[v];
      drawSim();
      drawDating();
    },
  );

  function start() {
    if (t >= MAX_T) t = 0;
    play.textContent = "❚❚ Pause";
    if (reducedMotion()) {
      // No animation: jump by one half-life per press.
      t = Math.min(MAX_T, Math.floor(t + 1));
      sT.set(t);
      drawSim();
      play.textContent = "▶ +1 demi-vie";
      return;
    }
    let last = performance.now();
    const step = (now) => {
      t = Math.min(MAX_T, t + ((now - last) / 1000) * 0.6);
      last = now;
      sT.set(t);
      drawSim();
      if (t >= MAX_T) return stop();
      timer = requestAnimationFrame(step);
    };
    timer = requestAnimationFrame(step);
  }
  function stop() {
    if (timer) cancelAnimationFrame(timer);
    timer = 0;
    play.textContent = reducedMotion() ? "▶ +1 demi-vie" : "▶ Lancer";
  }

  // Atom grid: one SVG with 400 circles, recoloured in place.
  const S = 14;
  const dots = [];
  const atomSvg = svg("svg", {
    viewBox: `0 0 ${COLS * S} ${(N / COLS) * S}`,
    class: "sci-atoms",
    role: "img",
    "aria-label": "400 atomes : pleins = noyaux pères, creux = noyaux fils",
  });
  for (let i = 0; i < N; i++) {
    const c = svg("circle", {
      cx: (i % COLS) * S + S / 2,
      cy: Math.floor(i / COLS) * S + S / 2,
      r: S * 0.36,
    });
    dots.push(c);
    atomSvg.appendChild(c);
  }
  grid.appendChild(atomSvg);

  function drawSim() {
    let parents = 0;
    for (let i = 0; i < N; i++) {
      const alive = vies[i] > t;
      if (alive) parents++;
      dots[i].setAttribute("class", alive ? "sci-atom" : "sci-atom is-fils");
    }
    // Curve: theory vs this draw.
    const full = drawWidth(fig, 640, 300);
    const wide = (fig.clientWidth || 640) >= 600;
    const W = wide ? Math.floor((full - 16) / 2) : full;
    const H = wide ? 250 : 200;
    const ch = chart({
      W,
      H,
      x: [0, MAX_T],
      y: [0, N],
      xTicks: [0, 1, 2, 3, 4, 5, 6],
      xFmt: (v) => (v === 0 ? "0" : v + " T½"),
      yFmt: (v) => fmt(v, 0),
      label: "noyaux pères restants en fonction du temps",
    });
    const xs = [];
    const th = [];
    const obs = [];
    const sorted = [...vies].sort((a, b) => a - b);
    for (let i = 0; i <= 240; i++) {
      const u = (i / 240) * MAX_T;
      xs.push(u);
      th.push(N * restant(u, 1));
    }
    // Staircase of the actual draw.
    let k = 0;
    const sx = [];
    for (let i = 0; i <= 480; i++) {
      const u = (i / 480) * MAX_T;
      while (k < N && sorted[k] <= u) k++;
      sx.push(u);
      obs.push(N - k);
    }
    ch.plot.appendChild(
      svg("polyline", {
        points: points(xs, th, ch.X, ch.Y),
        fill: "none",
        class: "sci-theory",
      }),
    );
    ch.plot.appendChild(
      svg("polyline", {
        points: points(sx, obs, ch.X, ch.Y),
        fill: "none",
        stroke: "var(--link)",
        "stroke-width": 1.8,
      }),
    );
    ch.plot.appendChild(
      svg("line", {
        x1: ch.X(t),
        x2: ch.X(t),
        y1: ch.P.t,
        y2: H - ch.P.b,
        class: "sci-now",
      }),
    );
    ch.plot.appendChild(
      svg("circle", {
        cx: ch.X(t),
        cy: ch.Y(parents),
        r: 4,
        fill: "var(--link)",
      }),
    );
    curve.replaceChildren(
      ch.root,
      el("ul", { class: "w-legend" }, [
        el("li", {}, [el("i", { class: "sci-leg-line" }), "ce tirage"]),
        el("li", {}, [el("i", { class: "sci-leg-theory" }), "N₀ · 2^(−t/T½)"]),
      ]),
    );
    const years = t * iso.demiVie;
    counts.replaceChildren(
      table([
        [
          "Temps écoulé",
          fmt(t, 2) +
            " demi-vie" +
            (t >= 2 ? "s" : "") +
            " = " +
            formatAns(years),
        ],
        [
          "Noyaux pères (" + iso.nom + ")",
          parents + " sur " + N + " (" + fmt((parents / N) * 100, 1) + " %)",
        ],
        ["Noyaux fils (" + iso.filsCourt + ")", String(N - parents)],
        [
          "Prévu par la loi",
          fmt(N * restant(t, 1), 1) +
            " pères (" +
            fmt(restant(t, 1) * 100, 1) +
            " %)",
        ],
      ]),
    );
  }

  const ageOut = el("div");
  const sR = slider({
    label: "Part du père restante",
    min: -1,
    max: 2,
    step: "any",
    value: Math.log10(reste),
    format: (v) => fmt(10 ** v, 10 ** v < 1 ? 2 : 1) + " %",
    onInput: (v) => {
      reste = 10 ** v;
      drawDating();
    },
  });
  function drawDating() {
    const f = reste / 100;
    const a = age(f, iso.demiVie);
    const n = Math.log2(1 / f);
    const tooOld = iso.id === "c14" && a > 50000;
    // The Solar System is about 4,57 billion years old.
    const avantSoleil = a > 4.57e9;
    ageOut.replaceChildren(
      table([
        [
          "Mesure",
          "il reste " +
            fmt(reste, reste < 1 ? 2 : 1) +
            " % " +
            du(iso.nom) +
            " initial",
        ],
        [
          "Calcul",
          "t = T½ · log₂(N₀/N) = " + iso.demiVieTexte + " × " + fmt(n, 2),
        ],
        [
          "Âge",
          formatAns(a) +
            (tooOld
              ? " — hors de portée en pratique"
              : avantSoleil
                ? " — plus vieux que le Système solaire : la mesure serait à revoir"
                : ""),
        ],
      ]),
      el("p", { class: "w-note" }, [
        "Désintégration " +
          du(iso.nom) +
          " (" +
          iso.symbole +
          ", demi-vie " +
          iso.demiVieTexte +
          ") en " +
          iso.fils +
          ". Usage : " +
          iso.usage +
          ".",
      ]),
    );
  }

  drawSim();
  drawDating();
  return el("div", { class: "w-root sci-dat" }, [
    el("div", { class: "w-controls" }, [
      el("span", { class: "w-hint" }, ["Isotope :"]),
      seg.node,
    ]),
    el("div", { class: "w-controls" }, [sT.node, play, redraw]),
    el("div", { class: "sci-dat-top" }, [grid, curve]),
    el("div", { class: "w-legend sci-atom-key" }, [
      el("span", {}, [el("span", { class: "sci-dot" }), "noyau père"]),
      el("span", {}, [el("span", { class: "sci-dot is-fils" }), "noyau fils"]),
    ]),
    counts,
    el("p", { class: "w-note" }, [
      "Chaque atome a, à chaque instant, la même probabilité de se désintégrer, sans mémoire : impossible de prédire lequel partira, mais sur un grand nombre la moitié a disparu au bout d'une demi-vie, la moitié du reste au bout de la suivante, et ainsi de suite. Avec 400 atomes la courbe réelle tremble autour de la loi ; avec les milliards de milliards d'atomes d'un échantillon, l'écart devient invisible. Fais un nouveau tirage pour le voir.",
    ]),
    el("h4", { class: "sci-sub" }, ["Dater un échantillon"]),
    el("div", { class: "w-controls" }, [sR.node]),
    ageOut,
  ]);
}
