import { describe, expect, it } from "vitest";
import type { PrereqEdge } from "./prereq-graph";
import { topoOrder } from "./prereq-graph";
import { DEFAULT_LAYOUT, edgePath, layoutPrereqGraph, wrapTitle, type GraphLayout } from "./prereq-layout";

const title = (s: string) => s.toUpperCase();

function layout(slugs: string[], edges: PrereqEdge[]): GraphLayout {
  const { order } = topoOrder(slugs, edges, title);
  return layoutPrereqGraph(order, edges, title);
}

function expectNoOverlap(g: GraphLayout) {
  for (let i = 0; i < g.nodes.length; i++) {
    for (let j = i + 1; j < g.nodes.length; j++) {
      const a = g.nodes[i];
      const b = g.nodes[j];
      const apart =
        a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      expect(apart, `${a.slug} overlaps ${b.slug}`).toBe(true);
    }
  }
  for (const n of g.nodes) {
    expect(n.x).toBeGreaterThanOrEqual(0);
    expect(n.y).toBeGreaterThanOrEqual(0);
    expect(n.x + n.w).toBeLessThanOrEqual(g.width + 0.01);
    expect(n.y + n.h).toBeLessThanOrEqual(g.height + 0.01);
  }
}

function expectDownward(g: GraphLayout) {
  const at = new Map(g.nodes.map((n) => [n.slug, n]));
  for (const e of g.edges) {
    const a = at.get(e.from)!;
    const b = at.get(e.to)!;
    expect(b.layer).toBeGreaterThan(a.layer);
    expect(e.points[0][1]).toBe(a.y + a.h);
    expect(e.points.at(-1)![1]).toBe(b.y);
    for (let i = 1; i < e.points.length; i++) {
      expect(e.points[i][1]).toBeGreaterThan(e.points[i - 1][1]);
    }
  }
}

// The Lycée analysis path: fonctions, suites → limites → dérivation → exp → intégrales.
const MATHS: PrereqEdge[] = [
  ["fonctions", "limites"],
  ["suites", "limites"],
  ["fonctions", "derivation"],
  ["limites", "derivation"],
  ["derivation", "exp"],
  ["limites", "exp"],
  ["derivation", "integrales"],
  ["exp", "integrales"],
];
const MATHS_NODES = ["integrales", "exp", "derivation", "limites", "suites", "fonctions"];

describe("layoutPrereqGraph", () => {
  it("layers by longest path", () => {
    const g = layout(MATHS_NODES, MATHS);
    const layer = Object.fromEntries(g.nodes.map((n) => [n.slug, n.layer]));
    expect(layer).toEqual({ fonctions: 0, suites: 0, limites: 1, derivation: 2, exp: 3, integrales: 4 });
    expect(g.layers).toBe(5);
  });

  it("never overlaps boxes and every edge points down", () => {
    const g = layout(MATHS_NODES, MATHS);
    expectNoOverlap(g);
    expectDownward(g);
    // fonctions → derivation skips a layer: one waypoint between the ends.
    const skip = g.edges.find((e) => e.from === "fonctions" && e.to === "derivation")!;
    expect(skip.points).toHaveLength(3);
  });

  it("is deterministic whatever the input order", () => {
    const a = layout(MATHS_NODES, MATHS);
    const b = layout([...MATHS_NODES].reverse(), [...MATHS].reverse());
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(JSON.stringify(layout(MATHS_NODES, MATHS))).toBe(JSON.stringify(a));
  });

  it("keeps a straight chain straight", () => {
    const g = layout(["a", "b", "c", "d"], [
      ["a", "b"],
      ["b", "c"],
      ["c", "d"],
    ]);
    expect(new Set(g.nodes.map((n) => n.x)).size).toBe(1);
    expect(g.width).toBe(DEFAULT_LAYOUT.nodeWidth + 2 * DEFAULT_LAYOUT.padding);
  });

  it("removes avoidable crossings", () => {
    // Two independent chains whose input order would cross them.
    const edges: PrereqEdge[] = [
      ["a1", "b2"],
      ["a2", "b1"],
    ];
    const g = layoutPrereqGraph(["a1", "a2", "b1", "b2"], edges, title);
    const x = Object.fromEntries(g.nodes.map((n) => [n.slug, n.x]));
    expect(Math.sign(x.a1 - x.a2)).toBe(Math.sign(x.b2 - x.b1));
    expectNoOverlap(g);
  });

  it("handles a wide fan without overlap", () => {
    const leaves = Array.from({ length: 9 }, (_, i) => `leaf${i}`);
    const edges: PrereqEdge[] = leaves.map((l) => ["root", l]);
    edges.push(["leaf0", "end"], ["leaf8", "end"], ["root", "end"]);
    const g = layout(["root", ...leaves, "end"], edges);
    expectNoOverlap(g);
    expectDownward(g);
  });

  it("ignores backward and unknown edges", () => {
    const g = layoutPrereqGraph(["a", "b"], [["b", "a"], ["a", "zz"], ["a", "b"]], title);
    expect(g.edges.map((e) => `${e.from}>${e.to}`)).toEqual(["a>b"]);
  });

  it("lays out an empty graph", () => {
    expect(layoutPrereqGraph([], [], title)).toMatchObject({ nodes: [], edges: [], height: 0 });
  });
});

describe("wrapTitle", () => {
  it("wraps to two lines and ellipsises the rest", () => {
    expect(wrapTitle("Dérivation", 22)).toEqual(["Dérivation"]);
    expect(wrapTitle("Exponentielle et Logarithme", 22)).toEqual(["Exponentielle et", "Logarithme"]);
    const long = wrapTitle("Formes Bilinéaires et Quadratiques sur un espace vectoriel", 22);
    expect(long).toHaveLength(2);
    expect(long[1].endsWith("…")).toBe(true);
    expect(long[1].length).toBeLessThanOrEqual(22);
  });
});

describe("edgePath", () => {
  it("draws cubic segments through every point", () => {
    expect(edgePath([[0, 0], [10, 20]])).toBe("M0,0 C0,10 10,10 10,20");
    expect(edgePath([[0, 0], [0, 10], [5, 30]]).match(/C/g)).toHaveLength(2);
  });
});
