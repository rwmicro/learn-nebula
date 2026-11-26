// Widget "anniversaire": the birthday bound. With 365 days, 23 people give
// better than even odds that two share a birthday; with an n-bit hash,
// about 2^(n/2) random inputs give the same odds of a collision. Hence
// 256-bit hashes for 128-bit security. A "Tirer au hasard" button draws
// values until two coincide, to compare a real run with the curve.
// Model: lib/calcul.ts (collisionProb, halfChance).
import { el, svg, fmt, drawWidth } from "../widget-kit.js";
import { chart, num, segmented, slider, table } from "../sci/common.js";
import { collisionProb, halfChance } from "../../../lib/calcul.ts";

const pct = (x) => (x > 0.9999 ? "≈ 100 %" : x < 1e-4 && x > 0 ? "< 0,01 %" : fmt(x * 100, x < 0.1 ? 2 : 1) + " %");

export function anniversaire(props, fig, ctx) {
  let mode = props.bits ? "bits" : "jours";
  let bits = Math.round(num(props.bits, 32, 8, 256) / 8) * 8 || 32;
  let k = Math.round(num(props.k, 23, 2, 120)); // jours: people
  let ex = num(props.exposant, bits / 2, 0, 256); // bits: k = 2^ex
  let runs = [];

  const seg = segmented("Ensemble", [["jours", "365 jours"], ["bits", "Empreinte de n bits"]], mode, (v) => ((mode = v), (runs = []), build()));
  const host = el("div", {});

  function build() {
    host.replaceChildren(mode === "jours" ? buildJours() : buildBits());
  }

  function buildJours() {
    const sk = slider({ label: "Personnes", min: 2, max: 100, step: 1, value: Math.min(100, k), onInput: (v) => ((k = v), draw()) });
    const plot = el("div", { class: "w-plot-wrap" });
    const out = el("div", { class: "w-out" });
    const sim = el("p", { class: "w-note" });
    const go = el("button", { type: "button", class: "sci-cta", onclick: () => {
      const seen = new Set();
      let n = 0;
      for (;;) {
        n++;
        const d = Math.floor(Math.random() * 365);
        if (seen.has(d)) break;
        seen.add(d);
      }
      runs.push(n);
      draw();
    } }, ["Faire entrer des gens jusqu'à un doublon"]);
    function draw() {
      const N = 365;
      const W = drawWidth(fig, 560, 300);
      const H = 220;
      const c = chart({ W, H, x: [2, 100], y: [0, 1], yFmt: (v) => fmt(v * 100) + " %", xLabel: "personnes dans la pièce", label: "probabilité d'un anniversaire commun" });
      let d = "";
      for (let i = 2; i <= 100; i++) d += (i === 2 ? "M" : "L") + c.X(i).toFixed(1) + "," + c.Y(collisionProb(i, N)).toFixed(1);
      c.plot.appendChild(svg("path", { d, class: "ca-prob" }));
      c.plot.appendChild(svg("line", { x1: c.X(2), x2: c.X(100), y1: c.Y(0.5), y2: c.Y(0.5), class: "ca-half" }));
      c.plot.appendChild(svg("circle", { cx: c.X(k), cy: c.Y(collisionProb(k, N)), r: 5, class: "ca-dot" }));
      for (const r of runs.slice(-30)) c.plot.appendChild(svg("line", { x1: c.X(Math.min(r, 100)), x2: c.X(Math.min(r, 100)), y1: c.Y(0), y2: c.Y(0.06), class: "ca-run" }));
      plot.replaceChildren(c.root);
      const p = collisionProb(k, N);
      const pairs = (k * (k - 1)) / 2;
      out.replaceChildren(table([
        ["Probabilité d'un doublon", pct(p)],
        ["Paires possibles", `${fmt(pairs)} paires parmi ${k} personnes : c'est le nombre de paires, pas de personnes, qui compte`],
        ["50 % atteint à", `${Math.ceil(halfChance(N))} personnes (≈ 1,18 × √365)`],
      ]));
      sim.textContent = runs.length
        ? `Dernier tirage : doublon à la ${runs[runs.length - 1]}e personne. Moyenne sur ${runs.length} tirage${runs.length > 1 ? "s" : ""} : ${fmt(runs.reduce((a, b) => a + b, 0) / runs.length, 1)} (théorie : ≈ 24,6). Les traits en bas du graphique sont vos tirages.`
        : "";
      ctx?.report({ mode: "jours", k, proba: Math.round(p * 1000) / 1000 });
    }
    draw();
    return el("div", {}, [el("div", { class: "sci-sliders" }, [sk.node]), plot, el("div", { class: "w-controls" }, [go]), sim, out]);
  }

  function buildBits() {
    const sb = slider({ label: "Taille de l'empreinte", min: 8, max: 256, step: 8, value: bits, format: (v) => v + " bits", onInput: (v) => {
      bits = v;
      ex = Math.min(ex, bits);
      se.input.max = String(bits);
      se.set(ex);
      runs = [];
      draw();
    } });
    const se = slider({ label: "Essais", min: 0, max: bits, step: 0.5, value: Math.min(ex, bits), format: (v) => "2^" + fmt(v, v % 1 ? 1 : 0), onInput: (v) => ((ex = v), draw()) });
    const plot = el("div", { class: "w-plot-wrap" });
    const out = el("div", { class: "w-out" });
    const sim = el("p", { class: "w-note" });
    const go = el("button", { type: "button", class: "sci-cta", onclick: () => {
      if (bits > 32) return;
      const N = 2 ** bits;
      const seen = new Set();
      let n = 0;
      for (;;) {
        n++;
        const v = Math.floor(Math.random() * N);
        if (seen.has(v)) break;
        seen.add(v);
      }
      runs.push(n);
      draw();
    } }, ["Hacher au hasard jusqu'à une collision"]);
    function draw() {
      const N = 2 ** bits;
      const W = drawWidth(fig, 560, 300);
      const H = 220;
      const c = chart({ W, H, x: [0, bits], y: [0, 1], xFmt: (v) => "2^" + fmt(v), yFmt: (v) => fmt(v * 100) + " %", xLabel: "nombre d'empreintes calculées (échelle log)", label: "probabilité de collision" });
      let d = "";
      for (let i = 0; i <= 200; i++) {
        const e = (bits * i) / 200;
        d += (i ? "L" : "M") + c.X(e).toFixed(1) + "," + c.Y(collisionProb(2 ** e, N)).toFixed(1);
      }
      c.plot.appendChild(svg("path", { d, class: "ca-prob" }));
      c.plot.appendChild(svg("line", { x1: c.X(bits / 2), x2: c.X(bits / 2), y1: c.Y(0), y2: c.Y(1), class: "ca-half" }));
      c.plot.appendChild(svg("text", { x: c.X(bits / 2) + 4, y: c.Y(0.92), class: "ca-lbl" }, ["2^" + bits / 2]));
      c.plot.appendChild(svg("circle", { cx: c.X(ex), cy: c.Y(collisionProb(2 ** ex, N)), r: 5, class: "ca-dot" }));
      for (const r of runs.slice(-30)) c.plot.appendChild(svg("line", { x1: c.X(Math.log2(r)), x2: c.X(Math.log2(r)), y1: c.Y(0), y2: c.Y(0.06), class: "ca-run" }));
      plot.replaceChildren(c.root);
      const p = collisionProb(2 ** ex, N);
      out.replaceChildren(table([
        ["Valeurs possibles", `2^${bits}`],
        ["Probabilité de collision", pct(p)],
        ["50 % atteint vers", `2^${fmt(Math.log2(halfChance(N)), 1)} essais, à peu près 2^${bits / 2} : la racine carrée`],
        ["Retrouver une entrée donnée", `≈ 2^${bits} essais (seconde préimage) : le carré du précédent`],
      ]));
      sim.textContent = bits > 32
        ? "Le tirage réel est limité à 32 bits : au-delà, il faudrait trop de mémoire et de temps, c'est tout le propos."
        : runs.length
          ? `Collision au ${fmt(runs[runs.length - 1])}e essai. Moyenne de vos ${runs.length} tirage${runs.length > 1 ? "s" : ""} : ${fmt(runs.reduce((a, b) => a + b, 0) / runs.length)} (théorie : ≈ ${fmt(Math.sqrt((Math.PI / 2) * N))}).`
          : "";
      go.disabled = bits > 32;
      ctx?.report({ mode: "bits", bits, exposant: ex, proba: Math.round(p * 1000) / 1000 });
    }
    draw();
    return el("div", {}, [el("div", { class: "sci-sliders" }, [sb.node, se.node]), plot, el("div", { class: "w-controls" }, [go]), sim, out]);
  }

  build();
  return el("div", { class: "w-root ca-root ca-bd" }, [el("div", { class: "w-controls" }, [seg.node]), host]);
}
