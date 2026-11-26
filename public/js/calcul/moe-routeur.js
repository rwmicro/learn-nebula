// Widget "moe-routeur": a mixture-of-experts layer seen from the inside. Each
// token of a sentence gets a score per expert from the router; only the
// top-k experts run, their outputs mixed by the renormalised scores. Below,
// a batch of 512 tokens shows the load per expert: an untrained router
// crowds a few experts, and the bias balancing of DeepSeek-V3 (no auxiliary
// loss) evens it out. The parameter readout scales the choice up to experts
// the size of DeepSeek-V3's.
// Model: lib/calcul.ts (routerLogits, softmax, topK, loads, balance, moeParams).
import { el, svg, fmt, drawWidth } from "../widget-kit.js";
import { num, slider, table } from "../sci/common.js";
import { balance, loads, moeParams, routerLogits, softmax, topK } from "../../../lib/calcul.ts";

const VOCAB = "le la les un une de des du et à en dans sur pour avec par pas que qui est sont a ont chat chien maison rouge vert grand petit mange dort court voit dit fait 1 2 3 42 2026 , . ? ( ) def return if for x = + import numpy Paris Tokyo Hugo Marie protéine atome énergie loi impôt prix marché roi guerre".split(" ");

export function moeRouteur(props, fig, ctx) {
  let phrase = String(props.phrase || "Le chat dort sur le canapé rouge depuis 2026 .");
  let E = Math.round(num(props.experts, 8, 4, 32));
  let k = Math.round(num(props.k, 2, 1, 8));
  let shared = Math.round(num(props.partages, 0, 0, 2));
  let balanced = /^(oui|1)$/i.test(props.equilibrage || "");
  let bias = null;

  const sE = slider({ label: "Experts", min: 4, max: 32, step: 1, value: E, onInput: (v) => {
    E = v;
    if (k > E) (k = E), sK.set(k);
    bias = null;
    draw();
  } });
  const sK = slider({ label: "Actifs par token (k)", min: 1, max: 8, step: 1, value: k, onInput: (v) => ((k = Math.min(v, E)), (bias = null), draw()) });
  const sS = slider({ label: "Experts partagés", min: 0, max: 2, step: 1, value: shared, onInput: (v) => ((shared = v), draw()) });
  const input = el("input", { type: "text", class: "w-input ca-phrase", value: phrase, "aria-label": "phrase" });
  input.addEventListener("input", () => ((phrase = input.value), draw()));
  const bal = el("input", { type: "checkbox", checked: balanced });
  bal.addEventListener("change", () => ((balanced = bal.checked), draw()));
  const grid = el("div", { class: "ca-moe-grid" });
  const loadPlot = el("div", { class: "w-plot-wrap" });
  const out = el("div", { class: "w-out" });
  const note = el("p", { class: "w-note" });

  function batch() {
    const words = [];
    for (let i = 0; i < 512; i++) words.push(VOCAB[i % VOCAB.length] + (i >= VOCAB.length ? "·" + Math.floor(i / VOCAB.length) : ""));
    return words.map((w) => softmax(routerLogits(w, E, 2.2)));
  }

  function draw() {
    const toks = phrase.trim().split(/\s+/).filter(Boolean).slice(0, 12);
    const B = batch();
    if (balanced && !bias) bias = balance(B, k, 150).bias;
    const useBias = balanced ? bias : undefined;

    // Token rows
    grid.style.setProperty("--ca-e", String(E));
    const head = el("div", { class: "ca-moe-row is-head" }, [
      el("span", { class: "ca-moe-tok" }, ["token"]),
      el("span", { class: "ca-moe-cells" }, Array.from({ length: E }, (_, e) => el("i", {}, [String(e + 1)]))),
      el("span", { class: "ca-moe-mix" }, ["experts utilisés et poids"]),
    ]);
    const rows = toks.map((t) => {
      const sc = softmax(routerLogits(t, E, 2.2));
      const sel = topK(sc, k, useBias);
      const max = Math.max(...sc);
      return el("div", { class: "ca-moe-row" }, [
        el("span", { class: "ca-moe-tok" }, [t]),
        el("span", { class: "ca-moe-cells" }, sc.map((s, e) => el("i", { class: sel.idx.includes(e) ? "is-on" : "", style: `--s:${(s / max).toFixed(3)}`, title: `expert ${e + 1} : ${fmt(s * 100, 1)} %` }))),
        el("span", { class: "ca-moe-mix" }, [
          ...(shared ? [el("b", { class: "is-shared" }, [shared > 1 ? `P1-P${shared}` : "P"])] : []),
          ...sel.idx.map((e, j) => el("b", {}, [`E${e + 1} ${fmt(sel.w[j] * 100)} %`])),
        ]),
      ]);
    });
    grid.replaceChildren(head, ...rows);

    // Load per expert over the batch
    const { load, imbalance } = loads(B, k, useBias);
    const W = drawWidth(fig, 560, 300);
    const H = 150;
    const mean = (B.length * k) / E;
    const max = Math.max(...load, mean * 1.2);
    const bw = (W - 30) / E;
    const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "charge par expert" });
    load.forEach((l, e) => {
      const h = ((H - 30) * l) / max;
      s.appendChild(svg("rect", { x: 24 + e * bw + 1, y: H - 18 - h, width: Math.max(2, bw - 2), height: h, class: "ca-bar" + (l > mean * 1.5 ? " is-hot" : l < mean * 0.5 ? " is-cold" : "") }));
      if (E <= 16) s.appendChild(svg("text", { x: 24 + e * bw + bw / 2, y: H - 5, "text-anchor": "middle", class: "ca-tick" }, [String(e + 1)]));
    });
    const ym = H - 18 - ((H - 30) * mean) / max;
    s.appendChild(svg("line", { x1: 22, x2: W - 4, y1: ym, y2: ym, class: "ca-half" }));
    s.appendChild(svg("text", { x: W - 6, y: ym - 4, "text-anchor": "end", class: "ca-lbl" }, ["charge idéale"]));
    loadPlot.replaceChildren(el("p", { class: "ca-cap" }, [`Charge sur un lot de ${B.length} tokens (${B.length * k} affectations)`]), s);

    const mp = moeParams({ layers: 58, experts: E, k, shared, expertM: 44, otherB: 14.5 });
    const ds = moeParams({ layers: 58, experts: 256, k: 8, shared: 1, expertM: 44, otherB: 14.5 });
    out.replaceChildren(table([
      ["Déséquilibre", `${fmt(imbalance, 2)} × la charge idéale pour l'expert le plus chargé${imbalance > 1.6 ? " : il ralentit tout le lot" : ""}`],
      ["Calcul par token", `${k + shared} expert${k + shared > 1 ? "s" : ""} sur ${E + shared}, soit ${fmt(((k + shared) / (E + shared)) * 100)} % des experts`],
      ["Avec des experts de la taille de DeepSeek-V3", `${fmt(mp.totalB)} Md de paramètres stockés, ${fmt(mp.activeB, 1)} Md actifs par token (${fmt(mp.ratio * 100, 1)} %). DeepSeek-V3 lui-même : 256 experts, k = 8, 1 partagé → ${fmt(ds.totalB)} Md, ${fmt(ds.activeB)} Md actifs.`],
    ]));
    note.textContent = balanced
      ? "Équilibrage actif : un biais par expert, ajusté après chaque lot (monté si l'expert est sous-employé, baissé s'il est surchargé), change qui est choisi mais pas le poids du mélange."
      : "Sans équilibrage, le routeur favorise quelques experts : ils saturent pendant que d'autres n'apprennent rien. Cochez l'équilibrage.";
    ctx?.report({ experts: E, k, partages: shared, actifs_pct: Math.round(((k + shared) / (E + shared)) * 100), desequilibre: Math.round(imbalance * 100) / 100, equilibrage: balanced ? 1 : 0 });
  }

  draw();
  return el("div", { class: "w-root ca-root ca-moe" }, [
    el("label", { class: "ca-field ca-wide" }, [el("span", {}, ["Phrase"]), input]),
    el("div", { class: "sci-sliders" }, [sE.node, sK.node, sS.node]),
    el("div", { class: "ca-scroll" }, [grid]),
    el("div", { class: "w-controls" }, [el("label", { class: "sci-check" }, [bal, " équilibrer la charge (biais par expert, sans perte auxiliaire)"])]),
    loadPlot,
    note,
    out,
  ]);
}
