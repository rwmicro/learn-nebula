// Widget "tri": a sorting algorithm step by step on a row of bars. The two
// bars being compared are outlined, the ones just written are filled, the
// ones in their final place turn green; counters show why bubble sort and
// merge sort are not in the same league. Model: lib/sci-algo.ts.
import { el, svg, drawWidth, reducedMotion } from "../widget-kit.js";
import { ALGOS_TRI, etapesTri, parseAlgoTri, tableau } from "../../../lib/sci-algo.ts";
import { num, segmented, slider, table } from "./common.js";

const NOTES = {
  bulles:
    "Le tri à bulles compare chaque paire voisine et l'échange si elle est dans le désordre : le plus grand élément remonte au bout à chaque passage. Environ n²/2 comparaisons.",
  insertion:
    "Le tri par insertion prend les éléments un à un et fait reculer chacun jusqu'à sa place parmi ceux déjà triés, comme on range des cartes dans sa main. Très rapide sur un tableau presque trié, n²/2 comparaisons au pire.",
  selection:
    "Le tri par sélection cherche le plus petit élément restant et le met au début, puis recommence. Toujours n²/2 comparaisons, mais au plus n échanges.",
  fusion:
    "Le tri fusion coupe le tableau en deux, trie chaque moitié, puis fusionne les deux moitiés triées en avançant dans chacune. Environ n log₂ n comparaisons, quel que soit l'ordre de départ.",
  rapide:
    "Le tri rapide choisit un pivot (ici le dernier élément), place à sa gauche tout ce qui est plus petit, à sa droite le reste, puis recommence de chaque côté. En moyenne n log₂ n comparaisons, n²/2 dans le pire cas (tableau déjà trié).",
};

export function tri(props, fig, ctx) {
  let algo = parseAlgoTri(props.algo);
  let n = Math.round(num(props.n, 12, 5, 40));
  let graineN = 1;
  let ordre = String(props.ordre || "").toLowerCase();
  let depart = ordreInitial();
  let frames = etapesTri(depart, algo);
  let k = 0;
  let timer = 0;

  function ordreInitial() {
    if (ordre.startsWith("tri") || ordre.startsWith("crois")) return Array.from({ length: n }, (_, i) => i + 1);
    if (ordre.startsWith("inv") || ordre.startsWith("decr") || ordre.startsWith("décr"))
      return Array.from({ length: n }, (_, i) => n - i);
    return tableau(n, graineN);
  }

  const seg = segmented("Algorithme", ALGOS_TRI, algo, (v) => {
    algo = v;
    restart();
  });
  const sN = slider({
    label: "Taille",
    min: 5,
    max: 40,
    step: 1,
    value: n,
    onInput: (v) => {
      n = v;
      depart = ordreInitial();
      restart();
    },
  });
  const btnRun = el("button", { type: "button", class: "w-btn sci-cta", onclick: () => (timer ? stop() : lance()) }, [
    "Lancer",
  ]);
  const btnPas = el("button", { type: "button", class: "w-btn", onclick: () => (stop(), avance(1)) }, ["Un pas"]);
  const btnMel = el(
    "button",
    {
      type: "button",
      class: "w-btn",
      onclick: () => {
        graineN++;
        ordre = "";
        depart = ordreInitial();
        restart();
      },
    },
    ["Mélanger"],
  );
  const btnInv = el(
    "button",
    {
      type: "button",
      class: "w-btn",
      onclick: () => {
        ordre = "inverse";
        depart = ordreInitial();
        restart();
      },
    },
    ["Ordre inverse"],
  );
  const plot = el("div", { class: "w-plot-wrap" });
  const out = el("div", { class: "w-out" });

  function restart() {
    stop();
    frames = etapesTri(depart, algo);
    k = 0;
    draw();
  }
  function avance(d) {
    k = Math.min(frames.length - 1, k + d);
    draw();
  }
  function lance() {
    if (k >= frames.length - 1) k = 0;
    if (reducedMotion()) {
      k = frames.length - 1;
      draw();
      return;
    }
    btnRun.textContent = "Pause";
    const vitesse = Math.max(1, Math.round(frames.length / 220));
    timer = setInterval(() => {
      avance(vitesse);
      if (k >= frames.length - 1) stop();
    }, 40);
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = 0;
    btnRun.textContent = "Lancer";
  }

  function draw() {
    const f = frames[k];
    const W = drawWidth(fig, 640, 300);
    const H = 170;
    const gap = n > 25 ? 1 : 3;
    const bw = (W - gap * (n - 1)) / n;
    const placed = new Set(f.places);
    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "barres du tableau à trier" });
    f.a.forEach((v, i) => {
      const h = (v / n) * (H - 18) + 4;
      const cls = f.ecrit?.includes(i)
        ? "algo-bar is-write"
        : f.cmp?.includes(i)
          ? "algo-bar is-cmp"
          : placed.has(i)
            ? "algo-bar is-done"
            : "algo-bar";
      root.appendChild(svg("rect", { x: i * (bw + gap), y: H - h, width: Math.max(1, bw), height: h, rx: 1.5, class: cls }));
      if (n <= 16)
        root.appendChild(
          svg("text", { x: i * (bw + gap) + bw / 2, y: H - h - 3, "text-anchor": "middle", class: "w-label" }, [String(v)]),
        );
    });
    plot.replaceChildren(root);
    const fini = k >= frames.length - 1;
    out.replaceChildren(
      table([
        ["Étape", `${k} / ${frames.length - 1}`],
        ["Comparaisons", String(f.comparaisons)],
        ["Écritures", String(f.ecritures)],
        ["Repère n²/2 ; n log₂ n", `${Math.round((n * (n - 1)) / 2)} ; ${Math.round(n * Math.log2(n))}`],
        ["État", fini ? "trié" : k ? "en cours" : "au départ"],
      ]),
      el("p", { class: "w-note" }, [NOTES[algo]]),
    );
    btnPas.disabled = fini;
    ctx?.report({ comparaisons: f.comparaisons, ecritures: f.ecritures, trie: fini ? 1 : 0, n, algo });
  }

  draw();
  return el("div", { class: "w-root algo-tri" }, [
    el("div", { class: "w-controls" }, [seg.node]),
    el("div", { class: "sci-sliders" }, [sN.node]),
    el("div", { class: "w-controls" }, [btnRun, btnPas, btnMel, btnInv]),
    el("div", { class: "algo-legend" }, [
      el("span", { class: "algo-key is-cmp" }, ["comparés"]),
      el("span", { class: "algo-key is-write" }, ["déplacés"]),
      el("span", { class: "algo-key is-done" }, ["à leur place"]),
    ]),
    plot,
    out,
  ]);
}
