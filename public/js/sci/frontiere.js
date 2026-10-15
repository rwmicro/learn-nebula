// Widget "frontiere": a decision boundary learned on points in the plane,
// by Rosenblatt's perceptron (one correction per misclassified point) or by
// logistic regression (gradient descent on the log loss, a probability per
// region). The XOR set shows what a straight line cannot do, and the x1·x2
// feature what one extra variable changes. Model: lib/ml-train.ts.
import { el, svg, fmt, drawWidth, reducedMotion } from "../widget-kit.js";
import { erreurs, jeu, logistiquePas, logLoss, perceptronPas, score, sigmoide } from "../../../lib/ml-train.ts";
import { chart, num, segmented, slider, table } from "./common.js";

const ZERO = { w1: 0, w2: 0, w3: 0, b: 0 };
const MAX_CORR = 400; // perceptron corrections before giving up
const MAX_PAS = 3000; // logistic steps
const TAUX_LOG = 3;
const GRID = 26; // background cells per side
const ISO = 40; // marching-squares cells per side for the boundary

export function frontiere(props, fig, ctx) {
  let modele = props.modele === "logistique" ? "logistique" : "perceptron";
  let nomJeu = ["separables", "melange", "xor", "vide"].includes(props.jeu) ? props.jeu : "separables";
  let pts = nomJeu === "vide" ? [] : jeu(nomJeu);
  let produit = props.produit === "oui";
  let seuil = num(props.seuil, 0.5, 0.05, 0.95);
  let classe = 1;
  let p = { ...ZERO };
  let cursor = 0;
  let corr = 0;
  let nPas = 0;
  let dernier = -1;
  let converge = false;
  let timer = 0;

  const z0 = () => (modele === "logistique" ? Math.log(seuil / (1 - seuil)) : 0);
  const nErr = () => erreurs(p, pts, produit, modele === "logistique" ? seuil : 0.5);
  const abandon = () => (modele === "perceptron" ? corr >= MAX_CORR : nPas >= MAX_PAS);
  const fini = () => !pts.length || converge || abandon();

  // --- controls
  const segModele = segmented(
    "Modèle",
    [
      ["perceptron", "Perceptron"],
      ["logistique", "Régression logistique"],
    ],
    modele,
    (v) => {
      modele = v;
      raz();
    },
  );
  const segJeu = segmented(
    "Points",
    [
      ["separables", "Séparables"],
      ["melange", "Mêlés"],
      ["xor", "XOR"],
      ["vide", "Vide"],
    ],
    nomJeu,
    (v) => {
      nomJeu = v;
      pts = v === "vide" ? [] : jeu(v);
      raz();
    },
  );
  const segClasse = segmented(
    "Classe des points posés",
    [
      [0, "● bleu"],
      [1, "▲ orange"],
    ],
    classe,
    (v) => (classe = v),
  );
  const chkProduit = el("input", { type: "checkbox" });
  chkProduit.checked = produit;
  chkProduit.addEventListener("change", () => {
    produit = chkProduit.checked;
    raz();
  });
  const sSeuil = slider({
    label: "Seuil de décision",
    min: 0.1,
    max: 0.9,
    step: 0.05,
    value: seuil,
    format: (v) => fmt(v, 2),
    onInput: (v) => {
      seuil = v;
      draw();
    },
  });

  const btnRun = el("button", { type: "button", class: "w-btn sci-cta", onclick: () => (timer ? stop() : lance()) }, [
    "Entraîner",
  ]);
  const btnPas = el("button", { type: "button", class: "w-btn", onclick: () => (stop(), avance(1)) }, ["Un pas"]);
  const btnRaz = el("button", { type: "button", class: "w-btn", onclick: () => raz() }, ["Remettre à zéro"]);

  const plotWrap = el("div", { class: "w-plot-wrap ml-plane" });
  const out = el("div", { class: "w-out" });
  const seuilRow = el("div", { class: "sci-sliders" }, [sSeuil.node]);

  function avance(k) {
    for (let i = 0; i < k && !fini(); i++) {
      if (modele === "perceptron") {
        const r = perceptronPas(p, pts, cursor, produit);
        if (r.index < 0) {
          converge = true;
          dernier = -1;
        } else {
          p = r.poids;
          dernier = r.index;
          cursor = r.index + 1;
          corr++;
        }
      } else {
        p = logistiquePas(p, pts, produit, TAUX_LOG);
        nPas++;
        dernier = -1;
      }
    }
    // Perceptron: a pass with no mistake left is convergence. Logistic: stop
    // once the log loss no longer moves, or every point is classed with
    // confidence (on separable points the loss would shrink forever).
    if (modele === "perceptron" && !converge && pts.length && perceptronPas(p, pts, 0, produit).index < 0) {
      converge = true;
      dernier = -1;
    }
    if (modele === "logistique" && nPas > 50 && !converge) {
      const l = logLoss(p, pts, produit);
      const q = logistiquePas(p, pts, produit, TAUX_LOG);
      if (l - logLoss(q, pts, produit) < 1e-6 || (l < 0.05 && erreurs(p, pts, produit) === 0)) converge = true;
    }
    draw();
  }

  function lance() {
    if (fini()) raz(false);
    if (reducedMotion()) {
      avance(MAX_PAS);
      return;
    }
    btnRun.textContent = "Pause";
    timer = setInterval(() => {
      avance(modele === "perceptron" ? 1 : nPas < 60 ? 2 : nPas < 300 ? 10 : 40);
      if (fini()) stop();
    }, modele === "perceptron" ? 140 : 40);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = 0;
    btnRun.textContent = "Entraîner";
  }

  /** Back to zero weights (or just the counters, when points changed). */
  function raz(poids = true) {
    stop();
    if (poids) p = { ...ZERO };
    cursor = 0;
    corr = 0;
    nPas = 0;
    dernier = -1;
    converge = false;
    draw();
  }

  /** Marching squares on score − z0: the boundary as one path, any shape. */
  function boundary(X, Y) {
    if (!p.w1 && !p.w2 && !p.w3 && !p.b) return "";
    const t = z0();
    const v = [];
    for (let j = 0; j <= ISO; j++) {
      const row = [];
      for (let i = 0; i <= ISO; i++) row.push(score(p, -1 + (2 * i) / ISO, -1 + (2 * j) / ISO, produit) - t);
      v.push(row);
    }
    const at = (i, j) => [-1 + (2 * i) / ISO, -1 + (2 * j) / ISO];
    const lerp = (a, b, va, vb) => {
      const k = va / (va - vb);
      return [a[0] + k * (b[0] - a[0]), a[1] + k * (b[1] - a[1])];
    };
    let d = "";
    for (let j = 0; j < ISO; j++) {
      for (let i = 0; i < ISO; i++) {
        const c = [
          [at(i, j), v[j][i]],
          [at(i + 1, j), v[j][i + 1]],
          [at(i + 1, j + 1), v[j + 1][i + 1]],
          [at(i, j + 1), v[j + 1][i]],
        ];
        const hits = [];
        for (let e = 0; e < 4; e++) {
          const [a, va] = c[e];
          const [b, vb] = c[(e + 1) % 4];
          if (va < 0 !== vb < 0) hits.push(lerp(a, b, va, vb));
        }
        for (let h = 0; h + 1 < hits.length; h += 2) {
          d += `M${X(hits[h][0]).toFixed(1)},${Y(hits[h][1]).toFixed(1)}L${X(hits[h + 1][0]).toFixed(1)},${Y(hits[h + 1][1]).toFixed(1)}`;
        }
      }
    }
    return d;
  }

  function draw() {
    const S = Math.min(drawWidth(fig, 440, 280), 440);
    const a = chart({
      W: S,
      H: S,
      x: [-1, 1],
      y: [-1, 1],
      xTicks: [-1, -0.5, 0, 0.5, 1],
      yTicks: [-1, -0.5, 0, 0.5, 1],
      xLabel: "x₁",
      yLabel: "x₂",
      label: "points des deux classes et frontière de décision",
      padL: 34,
    });

    // Background: the class each region gets (perceptron), or the
    // probability of the orange class, darker where the model is surer.
    const live = p.w1 || p.w2 || p.w3 || p.b;
    if (live) {
      const t = z0();
      const cw = (a.X(1) - a.X(-1)) / GRID;
      for (let j = 0; j < GRID; j++) {
        for (let i = 0; i < GRID; i++) {
          const x1 = -1 + (2 * (i + 0.5)) / GRID;
          const x2 = -1 + (2 * (j + 0.5)) / GRID;
          const z = score(p, x1, x2, produit);
          const un = z >= t;
          const op = modele === "logistique" ? 0.06 + 0.32 * Math.abs(sigmoide(z) - 0.5) * 2 : 0.16;
          a.plot.appendChild(
            svg("rect", {
              x: (a.X(x1) - cw / 2).toFixed(2),
              y: (a.Y(x2) - cw / 2).toFixed(2),
              width: (cw + 0.5).toFixed(2),
              height: (cw + 0.5).toFixed(2),
              // Opaque tint (no fill-opacity): overlapping cells leave no seams.
              style: `fill:color-mix(in srgb, ${un ? "var(--w-s2)" : "var(--w-s1)"} ${Math.round(op * 100)}%, var(--paper))`,
            }),
          );
        }
      }
      a.plot.appendChild(svg("path", { d: boundary(a.X, a.Y), class: "ml-boundary" }));
    }

    const t = z0();
    pts.forEach((q, k) => {
      const px = a.X(q.x1);
      const py = a.Y(q.x2);
      const faux = live && (score(p, q.x1, q.x2, produit) >= t ? 1 : 0) !== q.c;
      const cls = "ml-pt ml-c" + q.c + (faux ? " is-wrong" : "");
      a.plot.appendChild(
        q.c === 0
          ? svg("circle", { cx: px, cy: py, r: 5, class: cls })
          : svg("path", { d: `M${px},${py - 6}L${px + 5.6},${py + 4}L${px - 5.6},${py + 4}Z`, class: cls }),
      );
      if (k === dernier) a.plot.appendChild(svg("circle", { cx: px, cy: py, r: 10, class: "ml-ring" }));
    });

    a.root.style.cursor = "crosshair";
    a.root.addEventListener("click", (ev) => {
      const r = a.root.getBoundingClientRect();
      const sx = ((ev.clientX - r.left) / r.width) * S;
      const sy = ((ev.clientY - r.top) / r.height) * S;
      const x1 = -1 + ((sx - a.P.l) / (S - a.P.l - a.P.r)) * 2;
      const x2 = -1 + ((S - a.P.b - sy) / (S - a.P.t - a.P.b)) * 2;
      if (Math.abs(x1) > 1 || Math.abs(x2) > 1) return;
      const near = pts.findIndex((q) => Math.hypot(q.x1 - x1, q.x2 - x2) < 0.07);
      if (near >= 0) pts.splice(near, 1);
      else pts.push({ x1, x2, c: classe });
      raz(false);
    });
    plotWrap.replaceChildren(a.root);

    const e = nErr();
    // Orange classed blue (missed) and blue classed orange (false alarm).
    let fn = 0;
    let fp = 0;
    for (const q of pts) {
      const un = score(p, q.x1, q.x2, produit) >= z0();
      if (q.c === 1 && !un) fn++;
      if (q.c === 0 && un) fp++;
    }
    const prec = pts.length ? Math.round((100 * (pts.length - e)) / pts.length) : 0;
    let etat;
    if (!pts.length) etat = "posez des points en touchant le plan";
    else if (modele === "perceptron") {
      etat = converge
        ? "convergé : plus aucun point du mauvais côté"
        : corr >= MAX_CORR
          ? "ne converge pas après " + MAX_CORR + " corrections : aucune droite ne sépare ces points"
          : corr
            ? "en cours"
            : "poids à zéro";
    } else {
      etat = converge ? "stabilisée après " + nPas + " pas" : nPas >= MAX_PAS ? "arrêtée après " + MAX_PAS + " pas" : nPas ? "en cours" : "poids à zéro";
    }
    const poids =
      fmt(p.w1, 2) + " ; " + fmt(p.w2, 2) + (produit ? " ; " + fmt(p.w3, 2) : "") + " ; b = " + fmt(p.b, 2);
    const rows = [
      [modele === "perceptron" ? "Corrections" : "Pas de descente", String(modele === "perceptron" ? corr : nPas)],
      ["Points du mauvais côté", pts.length ? e + " sur " + pts.length + " (" + prec + " % bien classés)" : "—"],
      [produit ? "Poids w₁ ; w₂ ; w₃" : "Poids w₁ ; w₂", poids],
    ];
    if (modele === "logistique" && pts.length) rows.push(["Perte logistique", fmt(logLoss(p, pts, produit), 3)]);
    rows.push(["État", etat]);
    out.replaceChildren(
      table(rows),
      el("p", { class: "w-note" }, [
        modele === "perceptron"
          ? "Le perceptron classe un point selon le signe de w₁x₁ + w₂x₂ + b. Chaque fois qu'il se trompe sur un point (cerclé), il ajoute ce point à ses poids (ou le retranche), ce qui fait pivoter la droite vers lui. Sur des points séparables par une droite, il finit toujours par converger ; sur le XOR, il tourne en rond indéfiniment."
          : "La régression logistique donne une probabilité : σ(w₁x₁ + w₂x₂ + b), où σ est la sigmoïde. Le fond est d'autant plus foncé que le modèle est sûr de lui. La frontière est l'endroit où la probabilité vaut le seuil : le baisser fait classer plus de points en orange. Sur le XOR, la meilleure droite reste à peu près au hasard.",
        " Cochez x₁·x₂ : avec cette variable en plus, la frontière peut se courber, et le XOR devient séparable. C'est ce que fait une couche cachée, sans qu'on choisisse la variable à la main.",
      ]),
    );
    seuilRow.hidden = modele !== "logistique";
    btnPas.disabled = fini();

    ctx?.report({
      modele,
      jeu: nomJeu,
      produit: produit ? 1 : 0,
      points: pts.length,
      erreurs: e,
      fn,
      fp,
      precision: prec,
      corrections: corr,
      pas: nPas,
      converge: converge ? 1 : 0,
      abandon: abandon() ? 1 : 0,
      seuil,
    });
  }

  draw();
  return el("div", { class: "w-root ml-fr" }, [
    el("div", { class: "w-controls" }, [segModele.node]),
    el("div", { class: "w-controls" }, [el("span", { class: "sci-slider-l" }, ["Points :"]), segJeu.node]),
    el("div", { class: "w-controls" }, [
      el("span", { class: "sci-slider-l" }, ["Toucher le plan pose un point"]),
      segClasse.node,
      el("label", { class: "sci-check" }, [chkProduit, "Ajouter la variable x₁·x₂"]),
    ]),
    seuilRow,
    el("div", { class: "w-controls" }, [btnRun, btnPas, btnRaz]),
    el("div", { class: "ml-fr-body" }, [plotWrap, out]),
  ]);
}
