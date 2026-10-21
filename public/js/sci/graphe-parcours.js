// Widget "graphe-parcours": breadth-first search, depth-first search and
// Dijkstra on the same small weighted graph, one step at a time. Visited
// nodes fill in, the frontier (queue, stack or priority list) is shown under
// the drawing, and the search tree is drawn in the link colour. Clicking a
// node starts from there. Model: lib/sci-algo.ts.
import { el, svg, drawWidth, reducedMotion } from "../widget-kit.js";
import { GRAPHE, chemin, etapesGraphe, parseAlgoGraphe } from "../../../lib/sci-algo.ts";
import { segmented, table } from "./common.js";

const ALGOS = [
  ["largeur", "Largeur (BFS)"],
  ["profondeur", "Profondeur (DFS)"],
  ["dijkstra", "Dijkstra"],
];

const FRONTIERE = { largeur: "File (premier entré, premier sorti)", profondeur: "Pile (dernier entré, premier sorti)", dijkstra: "À traiter, par distance croissante" };

const NOTES = {
  largeur:
    "Le parcours en largeur explore le graphe par couches : d'abord tous les voisins du départ, puis leurs voisins, et ainsi de suite, grâce à une file. Il trouve le chemin qui passe par le moins d'arêtes, mais ignore les poids.",
  profondeur:
    "Le parcours en profondeur s'enfonce le plus loin possible avant de revenir en arrière, grâce à une pile. Il sert à détecter des cycles, à trouver les composantes d'un graphe ou à sortir d'un labyrinthe, pas à trouver le plus court chemin.",
  dijkstra:
    "Dijkstra traite toujours le nœud non visité le plus proche du départ, puis met à jour les distances de ses voisins si passer par lui est plus court. Avec des poids positifs, la distance d'un nœud est définitive dès qu'il est traité.",
};

export function grapheParcours(props, fig, ctx) {
  const g = GRAPHE;
  let algo = parseAlgoGraphe(props.algo);
  let depart = g.noeuds.some((x) => x.id === String(props.depart || "").toUpperCase()) ? String(props.depart).toUpperCase() : "A";
  const cibleProp = String(props.cible || "").toUpperCase();
  let cible = g.noeuds.some((x) => x.id === cibleProp) ? cibleProp : "H";
  let frames = etapesGraphe(g, depart, algo);
  let k = 0;
  let timer = 0;

  const seg = segmented("Algorithme", ALGOS, algo, (v) => {
    algo = v;
    restart();
  });
  const btnRun = el("button", { type: "button", class: "w-btn sci-cta", onclick: () => (timer ? stop() : lance()) }, [
    "Lancer",
  ]);
  const btnPas = el("button", { type: "button", class: "w-btn", onclick: () => (stop(), avance()) }, ["Un pas"]);
  const btnReset = el("button", { type: "button", class: "w-btn", onclick: () => restart() }, ["Recommencer"]);
  const plot = el("div", { class: "w-plot-wrap" });
  const front = el("div", { class: "algo-front" });
  const out = el("div", { class: "w-out" });

  function restart() {
    stop();
    frames = etapesGraphe(g, depart, algo);
    k = 0;
    draw();
  }
  function avance() {
    k = Math.min(frames.length - 1, k + 1);
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
    timer = setInterval(() => {
      avance();
      if (k >= frames.length - 1) stop();
    }, 600);
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = 0;
    btnRun.textContent = "Lancer";
  }

  function draw() {
    const f = frames[k];
    const W = drawWidth(fig, 640, 300);
    const H = Math.round(W * 0.48);
    const R = W < 420 ? 13 : 16;
    const pad = R + 6;
    const pos = Object.fromEntries(
      g.noeuds.map((nd) => [nd.id, [pad + (nd.x / 100) * (W - 2 * pad), pad + (nd.y / 100) * (H - 2 * pad)]]),
    );
    const fini = k >= frames.length - 1;
    const arbre = new Set(Object.entries(f.parent).map(([v, u]) => [u, v].sort().join("-")));
    const route = fini ? chemin(f.parent, depart, cible) : [];
    const surRoute = new Set(route.slice(1).map((v, i) => [route[i], v].sort().join("-")));
    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "graphe et parcours" });
    for (const e of g.aretes) {
      const [x1, y1] = pos[e.a];
      const [x2, y2] = pos[e.b];
      const key = [e.a, e.b].sort().join("-");
      const actif = f.arete && [f.arete[0], f.arete[1]].sort().join("-") === key;
      const cls = surRoute.has(key) ? "algo-edge is-route" : actif ? "algo-edge is-cur" : arbre.has(key) ? "algo-edge is-tree" : "algo-edge";
      root.appendChild(svg("line", { x1, y1, x2, y2, class: cls }));
      if (algo === "dijkstra") {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        root.appendChild(svg("rect", { x: mx - 8, y: my - 8, width: 16, height: 15, rx: 3, class: "algo-wbox" }));
        root.appendChild(svg("text", { x: mx, y: my + 3.5, "text-anchor": "middle", class: "w-label" }, [String(e.w)]));
      }
    }
    for (const nd of g.noeuds) {
      const [x, y] = pos[nd.id];
      const cls =
        nd.id === f.courant
          ? "algo-node is-cur"
          : f.visites.includes(nd.id)
            ? "algo-node is-done"
            : f.frontiere.includes(nd.id)
              ? "algo-node is-front"
              : "algo-node";
      const gN = svg("g", { class: cls, tabindex: "0", role: "button", "aria-label": "partir de " + nd.id });
      gN.appendChild(svg("circle", { cx: x, cy: y, r: R }));
      gN.appendChild(svg("text", { x, y: y + 4.5, "text-anchor": "middle", class: "algo-node-l" }, [nd.id]));
      if (f.dist[nd.id] !== undefined)
        gN.appendChild(svg("text", { x, y: y - R - 4, "text-anchor": "middle", class: "w-label" }, [String(f.dist[nd.id])]));
      const pick = () => {
        depart = nd.id;
        restart();
      };
      gN.addEventListener("click", pick);
      gN.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          pick();
        }
      });
      root.appendChild(gN);
    }
    plot.replaceChildren(root);

    front.replaceChildren(
      el("span", { class: "algo-front-l" }, [FRONTIERE[algo] + " : "]),
      ...(f.frontiere.length
        ? f.frontiere.map((id) => el("span", { class: "algo-chip" }, [algo === "dijkstra" ? `${id} (${f.dist[id]})` : id]))
        : [el("span", { class: "w-hint" }, ["vide"])]),
    );
    const rows = [
      ["Étape", `${k} / ${frames.length - 1}`],
      ["Ordre de visite", f.visites.join(" → ") || "—"],
    ];
    if (fini && route.length)
      rows.push([
        `Chemin ${depart} → ${cible}`,
        route.join(" → ") + (algo === "dijkstra" ? ` (longueur ${f.dist[cible]})` : ` (${route.length - 1} arêtes)`),
      ]);
    out.replaceChildren(
      table(rows),
      el("p", { class: "w-note" }, [NOTES[algo], " Le nombre au-dessus d'un nœud est sa ", algo === "dijkstra" ? "distance connue depuis le départ." : "profondeur dans l'arbre de parcours.", " Touchez un nœud pour en partir."]),
    );
    btnPas.disabled = fini;
    ctx?.report({ visites: f.visites.length, fini: fini ? 1 : 0, distance: f.dist[cible] ?? -1, algo, depart });
  }

  draw();
  return el("div", { class: "w-root algo-graph" }, [
    el("div", { class: "w-controls" }, [seg.node]),
    el("div", { class: "w-controls" }, [btnRun, btnPas, btnReset]),
    plot,
    front,
    out,
  ]);
}
