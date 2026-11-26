// Widget "memoire-llm": what fills a GPU's memory. For inference, weights at
// the chosen precision plus the KV cache, which grows with the context and
// depends on the attention (MHA keeps K and V for every head, GQA shares
// them, MLA compresses them). For fine-tuning, full training with Adam costs
// about 16 bytes per parameter, LoRA freezes the weights, QLoRA also stores
// them in 4 bits. Activations are left out: real runs need some headroom.
// Model: lib/calcul.ts (MODELS, memoryGB, kvBytesPerToken, kvBytesIfMha).
import { el, svg, fmt, drawWidth } from "../widget-kit.js";
import { num, segmented, slider, table } from "../sci/common.js";
import { MODELS, kvBytesIfMha, kvBytesPerToken, memoryGB } from "../../../lib/calcul.ts";

const GPUS = [
  [8, "8 Go (portable)"],
  [24, "24 Go (RTX 4090)"],
  [32, "32 Go (RTX 5090)"],
  [80, "80 Go (H100)"],
  [640, "8 × H100"],
];
const METHODS = [
  ["inference", "Faire tourner"],
  ["full", "Fine-tuning complet"],
  ["lora", "LoRA"],
  ["qlora", "QLoRA"],
];
const go = (x) => (x >= 100 ? fmt(x) : fmt(x, x >= 10 ? 0 : 1)) + " Go";

export function memoireLlm(props, fig, ctx) {
  const want = String(props.modele || "Llama 3.1 8B").toLowerCase();
  let mi = Math.max(0, MODELS.findIndex((m) => m.name.toLowerCase().startsWith(want)));
  let method = METHODS.some(([m]) => m === props.methode) ? props.methode : "inference";
  let bits = [16, 8, 4].includes(Number(props.bits)) ? Number(props.bits) : 16;
  let ctxExp = Math.log2(num(props.contexte, 8192, 1024, 1048576));
  let gpu = num(props.gpu, 24, 8, 640);

  const sel = el("select", { class: "w-input", "aria-label": "modèle" }, MODELS.map((m, i) => el("option", { value: String(i), selected: i === mi }, [m.name])));
  sel.addEventListener("change", () => ((mi = Number(sel.value)), draw()));
  const segM = segmented("Usage", METHODS, method, (v) => ((method = v), draw()));
  const segB = segmented("Précision des poids", [[16, "16 bits"], [8, "8 bits"], [4, "4 bits"]], bits, (v) => ((bits = v), draw()));
  const sC = slider({ label: "Contexte", min: 10, max: 20, step: 1, value: ctxExp, format: (v) => (2 ** v >= 1048576 ? "1 M" : fmt(2 ** v / 1024) + " k") + " tokens", onInput: (v) => ((ctxExp = v), draw()) });
  const gpuSel = el("select", { class: "w-input", "aria-label": "mémoire du GPU" }, GPUS.map(([v, t]) => el("option", { value: String(v), selected: v === gpu }, [t])));
  gpuSel.addEventListener("change", () => ((gpu = Number(gpuSel.value)), draw()));
  const infOnly = el("div", { class: "sci-sliders" }, [sC.node]);
  const bitsRow = el("div", { class: "w-controls" }, [el("span", { class: "ca-inline" }, ["Poids en "]), segB.node]);
  const plot = el("div", { class: "w-plot-wrap" });
  const out = el("div", { class: "w-out" });
  const note = el("p", { class: "w-note" });

  function draw() {
    const m = MODELS[mi];
    const ctxLen = 2 ** ctxExp;
    const r = memoryGB(m, method, { bits, ctx: ctxLen });
    infOnly.hidden = method !== "inference";
    bitsRow.hidden = method !== "inference";
    const W = drawWidth(fig, 560, 300);
    const H = 92;
    const scale = Math.max(r.total, gpu) * 1.08;
    const X = (v) => 8 + (v / scale) * (W - 16);
    const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "mémoire nécessaire face au GPU" });
    let x0 = 0;
    const parts = [
      ["poids", r.weights, "ca-seg-w"],
      ["cache KV", r.kv, "ca-seg-kv"],
      [method === "full" ? "gradients + Adam" : "adaptateurs + Adam", r.training, "ca-seg-t"],
    ].filter((p) => p[1] > 0);
    for (const [lab, v, cls] of parts) {
      const w = Math.max(1, X(x0 + v) - X(x0));
      s.appendChild(svg("rect", { x: X(x0), y: 18, width: w, height: 34, class: cls }));
      if (w > 60) s.appendChild(svg("text", { x: X(x0) + 6, y: 40, class: "ca-seg-t-l" }, [`${lab} ${go(v)}`]));
      x0 += v;
    }
    const fits = r.total <= gpu;
    s.appendChild(svg("line", { x1: X(gpu), x2: X(gpu), y1: 8, y2: 64, class: "ca-gpu" + (fits ? "" : " is-over") }));
    s.appendChild(svg("text", { x: Math.min(X(gpu), W - 8), y: 80, "text-anchor": X(gpu) > W - 90 ? "end" : "middle", class: "ca-lbl" }, [`GPU : ${go(gpu)}`]));
    plot.replaceChildren(s);

    const kvT = kvBytesPerToken(m);
    const kvM = kvBytesIfMha(m);
    const rows = [
      ["Total estimé", `${go(r.total)} ${fits ? "→ tient" : `→ ne tient pas (${fmt(Math.ceil(r.total / gpu))} fois la mémoire)`}`],
      ["Poids", `${fmt(m.paramsB, 1)} Md de paramètres × ${method === "inference" ? bits / 8 : method === "qlora" ? "≈ 0,55" : 2} octet${method === "inference" && bits === 8 ? "" : "s"} = ${go(r.weights)}`],
    ];
    if (method === "inference")
      rows.push(["Cache KV par token", `${fmt(kvT / 1024)} Kio (${m.attn}${m.attn !== "MHA" ? `, ${fmt(kvM / kvT, 0)} fois moins que si chaque tête gardait ses K et V` : ""})`]);
    if (method === "full") rows.push(["Pourquoi 16 octets par paramètre", "poids bf16 (2) + gradients bf16 (2) + copie fp32 (4) + deux moments d'Adam fp32 (4 + 4)"]);
    if (method === "lora" || method === "qlora") rows.push(["Paramètres entraînés", `≈ 0,5 % du modèle (${fmt(m.paramsB * 5, 0)} M), le reste est gelé`]);
    out.replaceChildren(table(rows));
    note.textContent =
      method === "inference"
        ? "Les activations et la fragmentation ajoutent encore 10 à 20 %. À long contexte, c'est le cache KV qui sature la mémoire, pas les poids."
        : method === "full"
          ? "Sans compter les activations, qui dépendent de la longueur des exemples et de la taille de lot. D'où le recours à plusieurs GPU (ZeRO, FSDP) pour tout ce qui dépasse quelques milliards de paramètres."
          : method === "lora"
            ? "Les poids gelés dominent : LoRA divise surtout le coût de l'optimiseur. Pour un MoE, tous les experts restent en mémoire même si peu servent à chaque token."
            : "QLoRA est le chemin le plus économe pour un modèle dense ; pour les MoE, Unsloth le déconseille pour l'instant (bitsandbytes ne gère pas leurs experts en 4 bits) et recommande LoRA en bf16.";
    ctx?.report({ params: m.paramsB, methode: method, total_go: Math.round(r.total * 10) / 10, gpu, tient: fits ? 1 : 0, kv_kio: Math.round(kvT / 1024), bits, contexte: ctxLen });
  }

  draw();
  return el("div", { class: "w-root ca-root ca-mem" }, [
    el("div", { class: "w-controls" }, [el("label", { class: "ca-inline" }, ["Modèle ", sel]), el("label", { class: "ca-inline" }, ["GPU ", gpuSel])]),
    el("div", { class: "w-controls" }, [segM.node]),
    bitsRow,
    infOnly,
    plot,
    out,
    note,
  ]);
}
