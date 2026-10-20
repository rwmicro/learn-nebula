import { describe, expect, it } from "vitest";
import {
  ALGOS_TRI,
  CLIENTS,
  COMMANDES,
  GRAPHE,
  bienPlaces,
  chemin,
  etapesGraphe,
  etapesTri,
  graine,
  jointure,
  melange,
  parseAlgoGraphe,
  parseAlgoTri,
  parseJointure,
  parseListe,
  parsePaires,
  tableau,
} from "./sci-algo";

describe("sci-algo: tri", () => {
  const a = tableau(12, 7);
  it("the array is a deterministic permutation of 1..n", () => {
    expect(tableau(12, 7)).toEqual(a);
    expect(a.slice().sort((x, y) => x - y)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });
  it("every algorithm ends sorted, with every index placed", () => {
    for (const [algo] of ALGOS_TRI) {
      const f = etapesTri(a, algo);
      const last = f[f.length - 1];
      expect(last.a).toEqual(a.slice().sort((x, y) => x - y));
      expect(last.places).toHaveLength(12);
      expect(f[0].a).toEqual(a);
    }
  });
  it("bubble sort compares n(n-1)/2 times at worst, insertion fewer on a sorted array", () => {
    const desc = Array.from({ length: 8 }, (_, i) => 8 - i);
    expect(etapesTri(desc, "bulles").at(-1)!.comparaisons).toBe(28);
    const asc = Array.from({ length: 8 }, (_, i) => i + 1);
    expect(etapesTri(asc, "insertion").at(-1)!.comparaisons).toBe(7);
    expect(etapesTri(asc, "bulles").at(-1)!.comparaisons).toBe(7);
  });
  it("merge sort stays near n log n comparisons", () => {
    const big = tableau(32, 3);
    expect(etapesTri(big, "fusion").at(-1)!.comparaisons).toBeLessThanOrEqual(32 * 5);
    expect(etapesTri(big, "selection").at(-1)!.comparaisons).toBe((32 * 31) / 2);
  });
  it("parses French and English names", () => {
    expect(parseAlgoTri("Sélection")).toBe("selection");
    expect(parseAlgoTri("quicksort")).toBe("rapide");
    expect(parseAlgoTri("?")).toBe("bulles");
  });
});

describe("sci-algo: graphes", () => {
  it("breadth-first visits by layers", () => {
    const f = etapesGraphe(GRAPHE, "A", "largeur");
    const last = f.at(-1)!;
    expect(last.visites).toEqual(["A", "B", "C", "D", "F", "E", "G", "H"]);
    expect(last.dist).toMatchObject({ A: 0, B: 1, C: 1, D: 2, F: 2, E: 2, G: 3, H: 3 });
  });
  it("depth-first goes deep before wide", () => {
    const last = etapesGraphe(GRAPHE, "A", "profondeur").at(-1)!;
    expect(last.visites).toEqual(["A", "B", "D", "C", "E", "G", "H", "F"]);
  });
  it("Dijkstra finds the shortest weighted distances", () => {
    const last = etapesGraphe(GRAPHE, "A", "dijkstra").at(-1)!;
    expect(last.dist).toEqual({ A: 0, B: 4, C: 2, D: 9, E: 12, F: 11, G: 14, H: 14 });
    expect(chemin(last.parent, "A", "H")).toEqual(["A", "B", "D", "F", "H"]);
    expect(last.visites).toHaveLength(8);
  });
  it("parses algorithm names", () => {
    expect(parseAlgoGraphe("BFS")).toBe("largeur");
    expect(parseAlgoGraphe("dfs")).toBe("profondeur");
    expect(parseAlgoGraphe("Dijkstra")).toBe("dijkstra");
  });
});

describe("sci-algo: jointures", () => {
  const run = (t: "inner" | "left" | "right" | "full") => jointure(CLIENTS, COMMANDES, "id", "client_id", t).lignes;
  it("INNER keeps only matches", () => {
    expect(run("inner")).toEqual([
      [0, 0],
      [0, 1],
      [2, 2],
    ]);
  });
  it("LEFT keeps every client, RIGHT every order, FULL both", () => {
    expect(run("left")).toHaveLength(5);
    expect(run("left").filter((r) => r[1] === null).map((r) => r[0])).toEqual([1, 3]);
    expect(run("right")).toEqual([
      [0, 0],
      [0, 1],
      [2, 2],
      [null, 3],
    ]);
    expect(run("full")).toHaveLength(6);
  });
  it("parses join names", () => {
    expect(parseJointure("LEFT JOIN")).toBe("left");
    expect(parseJointure("full outer")).toBe("full");
  });
});

describe("sci-algo: ordonner, associer", () => {
  it("parses bar- or comma-separated lists", () => {
    expect(parseListe("a | b|c ")).toEqual(["a", "b", "c"]);
    expect(parseListe("1789, 1830, 1848")).toEqual(["1789", "1830", "1848"]);
    expect(parseListe("")).toEqual([]);
  });
  it("parses pairs with =, → or ::", () => {
    expect(parsePaires("Zeus = Jupiter | Héra → Junon | Arès :: Mars | rien")).toEqual([
      ["Zeus", "Jupiter"],
      ["Héra", "Junon"],
      ["Arès", "Mars"],
    ]);
  });
  it("never deals the answer as the starting order", () => {
    for (let s = 0; s < 200; s++) {
      for (const n of [2, 3, 5]) {
        const p = melange(n, s);
        expect(p.slice().sort()).toEqual(Array.from({ length: n }, (_, i) => i));
        expect(p.some((v, i) => v !== i)).toBe(true);
      }
    }
    expect(melange(4, graine("x"))).toEqual(melange(4, graine("x")));
  });
  it("marks the right positions", () => {
    expect(bienPlaces([0, 2, 1])).toEqual([true, false, false]);
  });
});
