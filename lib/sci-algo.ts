// Pure models behind the algorithm and self-check widgets of the "sci" pack
// (public/js/sci/tri.js, graphe-parcours.js, jointures-sql.js, ordonner.js,
// associer.js). Each algorithm is recorded as a list of frames the widget
// steps through, so the drawing code never re-implements the algorithm.

// ------------------------------------------------------------------ tri

export type AlgoTri = "bulles" | "insertion" | "selection" | "fusion" | "rapide";

export const ALGOS_TRI: [AlgoTri, string][] = [
  ["bulles", "Bulles"],
  ["insertion", "Insertion"],
  ["selection", "Sélection"],
  ["fusion", "Fusion"],
  ["rapide", "Rapide"],
];

export interface FrameTri {
  /** The array as it stands after this step. */
  a: number[];
  /** Indices compared at this step. */
  cmp?: [number, number];
  /** Indices written at this step (a swap, or a write during a merge). */
  ecrit?: number[];
  /** Indices known to be in their final place. */
  places: number[];
  comparaisons: number;
  ecritures: number;
}

export function parseAlgoTri(v: unknown, def: AlgoTri = "bulles"): AlgoTri {
  const s = String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (s.startsWith("bul")) return "bulles";
  if (s.startsWith("ins")) return "insertion";
  if (s.startsWith("sel")) return "selection";
  if (s.startsWith("fus") || s.startsWith("merge")) return "fusion";
  if (s.startsWith("rap") || s.startsWith("quick")) return "rapide";
  return def;
}

/** Deterministic pseudo-random generator (mulberry32). */
export function rng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** n distinct values 1..n in a shuffled order. */
export function tableau(n: number, seed: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i + 1);
  const r = rng(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function etapesTri(input: number[], algo: AlgoTri): FrameTri[] {
  const a = input.slice();
  const n = a.length;
  const frames: FrameTri[] = [];
  const places = new Set<number>();
  let comparaisons = 0;
  let ecritures = 0;
  const push = (f: { cmp?: [number, number]; ecrit?: number[] }) =>
    frames.push({ a: a.slice(), ...f, places: [...places].sort((x, y) => x - y), comparaisons, ecritures });
  const swap = (i: number, j: number) => {
    [a[i], a[j]] = [a[j], a[i]];
    ecritures += 2;
    push({ ecrit: [i, j] });
  };
  const less = (i: number, j: number) => {
    comparaisons++;
    push({ cmp: [i, j] });
    return a[i] < a[j];
  };

  push({});
  if (algo === "bulles") {
    for (let end = n - 1; end > 0; end--) {
      let echange = false;
      for (let i = 0; i < end; i++) {
        if (less(i + 1, i)) {
          swap(i, i + 1);
          echange = true;
        }
      }
      places.add(end);
      if (!echange) {
        for (let k = 0; k < end; k++) places.add(k);
        break;
      }
    }
  } else if (algo === "insertion") {
    for (let i = 1; i < n; i++) {
      for (let j = i; j > 0 && less(j, j - 1); j--) swap(j, j - 1);
    }
  } else if (algo === "selection") {
    for (let i = 0; i < n - 1; i++) {
      let m = i;
      for (let j = i + 1; j < n; j++) if (less(j, m)) m = j;
      if (m !== i) swap(i, m);
      places.add(i);
    }
  } else if (algo === "fusion") {
    const merge = (lo: number, mid: number, hi: number) => {
      const left = a.slice(lo, mid);
      const right = a.slice(mid, hi);
      let i = 0;
      let j = 0;
      for (let k = lo; k < hi; k++) {
        let takeLeft: boolean;
        if (i >= left.length) takeLeft = false;
        else if (j >= right.length) takeLeft = true;
        else {
          comparaisons++;
          push({ cmp: [lo + i, mid + j] });
          takeLeft = left[i] <= right[j];
        }
        a[k] = takeLeft ? left[i++] : right[j++];
        ecritures++;
        push({ ecrit: [k] });
      }
    };
    const sort = (lo: number, hi: number) => {
      if (hi - lo < 2) return;
      const mid = (lo + hi) >> 1;
      sort(lo, mid);
      sort(mid, hi);
      merge(lo, mid, hi);
    };
    sort(0, n);
  } else {
    // Lomuto partition, last element as pivot.
    const sort = (lo: number, hi: number) => {
      if (lo > hi) return;
      if (lo === hi) {
        places.add(lo);
        return;
      }
      let p = lo;
      for (let j = lo; j < hi; j++) {
        if (less(j, hi)) {
          if (j !== p) swap(p, j);
          p++;
        }
      }
      if (p !== hi) swap(p, hi);
      places.add(p);
      sort(lo, p - 1);
      sort(p + 1, hi);
    };
    sort(0, n - 1);
  }
  for (let k = 0; k < n; k++) places.add(k);
  push({});
  return frames;
}

// ------------------------------------------------------------ graphes

export type AlgoGraphe = "largeur" | "profondeur" | "dijkstra";

export interface Graphe {
  noeuds: { id: string; x: number; y: number }[];
  aretes: { a: string; b: string; w: number }[];
}

/** Default graph: eight places, positions in a 0-100 box. */
export const GRAPHE: Graphe = {
  noeuds: [
    { id: "A", x: 8, y: 50 },
    { id: "B", x: 30, y: 15 },
    { id: "C", x: 30, y: 85 },
    { id: "D", x: 52, y: 40 },
    { id: "E", x: 55, y: 80 },
    { id: "F", x: 75, y: 15 },
    { id: "G", x: 78, y: 60 },
    { id: "H", x: 95, y: 38 },
  ],
  aretes: [
    { a: "A", b: "B", w: 4 },
    { a: "A", b: "C", w: 2 },
    { a: "B", b: "D", w: 5 },
    { a: "C", b: "D", w: 8 },
    { a: "C", b: "E", w: 10 },
    { a: "B", b: "F", w: 9 },
    { a: "D", b: "F", w: 2 },
    { a: "D", b: "G", w: 6 },
    { a: "E", b: "G", w: 2 },
    { a: "F", b: "H", w: 3 },
    { a: "G", b: "H", w: 1 },
  ],
};

export function parseAlgoGraphe(v: unknown, def: AlgoGraphe = "largeur"): AlgoGraphe {
  const s = String(v ?? "").trim().toLowerCase();
  if (s.startsWith("lar") || s === "bfs") return "largeur";
  if (s.startsWith("pro") || s === "dfs") return "profondeur";
  if (s.startsWith("dij")) return "dijkstra";
  return def;
}

export interface FrameGraphe {
  /** Node taken out of the frontier at this step (null on the first frame). */
  courant: string | null;
  visites: string[];
  /** Queue (largeur), stack top last (profondeur) or nodes still to settle (dijkstra). */
  frontiere: string[];
  /** Best known distance (dijkstra) or depth in edges (largeur, profondeur). */
  dist: Record<string, number>;
  /** Parent of each reached node: the edges of the search tree. */
  parent: Record<string, string>;
  /** Edge examined at this step, if any. */
  arete?: [string, string];
}

export function voisins(g: Graphe, id: string): { id: string; w: number }[] {
  const out: { id: string; w: number }[] = [];
  for (const e of g.aretes) {
    if (e.a === id) out.push({ id: e.b, w: e.w });
    else if (e.b === id) out.push({ id: e.a, w: e.w });
  }
  return out.sort((p, q) => p.id.localeCompare(q.id));
}

export function etapesGraphe(g: Graphe, depart: string, algo: AlgoGraphe): FrameGraphe[] {
  const frames: FrameGraphe[] = [];
  const visites: string[] = [];
  const dist: Record<string, number> = { [depart]: 0 };
  const parent: Record<string, string> = {};
  let frontiere: string[] = [depart];
  const snap = (courant: string | null, arete?: [string, string]) =>
    frames.push({
      courant,
      visites: visites.slice(),
      frontiere: frontiere.slice(),
      dist: { ...dist },
      parent: { ...parent },
      arete,
    });
  snap(null);

  if (algo === "dijkstra") {
    while (frontiere.length) {
      frontiere.sort((p, q) => dist[p] - dist[q] || p.localeCompare(q));
      const u = frontiere.shift() as string;
      visites.push(u);
      snap(u);
      for (const v of voisins(g, u)) {
        if (visites.includes(v.id)) continue;
        const d = dist[u] + v.w;
        if (dist[v.id] === undefined || d < dist[v.id]) {
          dist[v.id] = d;
          parent[v.id] = u;
          if (!frontiere.includes(v.id)) frontiere.push(v.id);
        }
        snap(u, [u, v.id]);
      }
    }
  } else if (algo === "largeur") {
    const vu = new Set([depart]);
    while (frontiere.length) {
      const u = frontiere.shift() as string;
      visites.push(u);
      snap(u);
      for (const v of voisins(g, u)) {
        if (vu.has(v.id)) continue;
        vu.add(v.id);
        dist[v.id] = dist[u] + 1;
        parent[v.id] = u;
        frontiere.push(v.id);
        snap(u, [u, v.id]);
      }
    }
  } else {
    // Iterative depth-first search: neighbours pushed in reverse so the
    // alphabetically first one is explored first.
    while (frontiere.length) {
      const u = frontiere.pop() as string;
      if (visites.includes(u)) {
        snap(null);
        continue;
      }
      visites.push(u);
      snap(u);
      for (const v of voisins(g, u).reverse()) {
        if (visites.includes(v.id)) continue;
        parent[v.id] = u;
        dist[v.id] = dist[u] + 1;
        frontiere.push(v.id);
        snap(u, [u, v.id]);
      }
    }
  }
  return frames;
}

/** Path from the start to `cible` along the parent links, or [] if unreached. */
export function chemin(parent: Record<string, string>, depart: string, cible: string): string[] {
  const out = [cible];
  let cur = cible;
  while (cur !== depart) {
    const p = parent[cur];
    if (!p || out.length > 100) return [];
    out.unshift(p);
    cur = p;
  }
  return out;
}

// ----------------------------------------------------------- jointures

export type TypeJointure = "inner" | "left" | "right" | "full";

export const JOINTURES: [TypeJointure, string][] = [
  ["inner", "INNER JOIN"],
  ["left", "LEFT JOIN"],
  ["right", "RIGHT JOIN"],
  ["full", "FULL OUTER JOIN"],
];

export type Ligne = Record<string, string | number | null>;

export interface Table {
  nom: string;
  colonnes: string[];
  lignes: Ligne[];
}

export const CLIENTS: Table = {
  nom: "clients",
  colonnes: ["id", "nom", "ville"],
  lignes: [
    { id: 1, nom: "Alice", ville: "Lyon" },
    { id: 2, nom: "Bilal", ville: "Lille" },
    { id: 3, nom: "Chloé", ville: "Nantes" },
    { id: 4, nom: "David", ville: "Brest" },
  ],
};

export const COMMANDES: Table = {
  nom: "commandes",
  colonnes: ["num", "client_id", "montant"],
  lignes: [
    { num: 101, client_id: 1, montant: 40 },
    { num: 102, client_id: 1, montant: 15 },
    { num: 103, client_id: 3, montant: 72 },
    { num: 104, client_id: 5, montant: 30 },
  ],
};

export function parseJointure(v: unknown, def: TypeJointure = "inner"): TypeJointure {
  const s = String(v ?? "").trim().toLowerCase();
  if (s.startsWith("inner") || s.startsWith("int")) return "inner";
  if (s.startsWith("left") || s.startsWith("gau")) return "left";
  if (s.startsWith("right") || s.startsWith("dro")) return "right";
  if (s.startsWith("full") || s.startsWith("comp") || s.startsWith("out")) return "full";
  return def;
}

export interface ResultatJointure {
  /** Each result row: index in the left table and in the right one (null = no match). */
  lignes: [number | null, number | null][];
}

export function jointure(g: Table, d: Table, cleG: string, cleD: string, type: TypeJointure): ResultatJointure {
  const lignes: [number | null, number | null][] = [];
  const droitesVues = new Set<number>();
  g.lignes.forEach((lg, i) => {
    let trouve = false;
    d.lignes.forEach((ld, j) => {
      if (lg[cleG] != null && lg[cleG] === ld[cleD]) {
        lignes.push([i, j]);
        droitesVues.add(j);
        trouve = true;
      }
    });
    if (!trouve && (type === "left" || type === "full")) lignes.push([i, null]);
  });
  if (type === "right" || type === "full") {
    d.lignes.forEach((_, j) => {
      if (!droitesVues.has(j)) lignes.push([null, j]);
    });
  }
  if (type === "right") {
    // A RIGHT JOIN reads naturally in the right table's order.
    lignes.sort((p, q) => (p[1] ?? 0) - (q[1] ?? 0));
  }
  return { lignes };
}

// ---------------------------------------- ordonner, associer (auto-tests)

/** "a | b | c" (or one item per comma when there is no bar) → trimmed items. */
export function parseListe(v: unknown): string[] {
  const s = String(v ?? "").trim();
  if (!s) return [];
  const parts = s.includes("|") ? s.split("|") : s.split(",");
  return parts.map((x) => x.trim()).filter(Boolean);
}

/** "Zeus = Jupiter | Héra = Junon" → [["Zeus", "Jupiter"], ["Héra", "Junon"]]. */
export function parsePaires(v: unknown): [string, string][] {
  const out: [string, string][] = [];
  for (const p of parseListe(v)) {
    const m = /^(.*?)\s*(?:=|→|->|::)\s*(.*)$/.exec(p);
    if (m && m[1].trim() && m[2].trim()) out.push([m[1].trim(), m[2].trim()]);
  }
  return out;
}

/** A permutation of 0..n-1 that is never the identity when n ≥ 2. */
export function melange(n: number, seed: number): number[] {
  const r = rng(seed);
  const p = Array.from({ length: n }, (_, i) => i);
  for (let tour = 0; tour < 20; tour++) {
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    if (n < 2 || p.some((v, i) => v !== i)) return p;
  }
  // Fallback: rotate by one.
  return p.map((_, i) => (i + 1) % n);
}

/** Seed from a string, so a widget shuffles the same way on every visit. */
export function graine(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Positions where `ordre` (indices into the correct list) is right. */
export function bienPlaces(ordre: number[]): boolean[] {
  return ordre.map((v, i) => v === i);
}
