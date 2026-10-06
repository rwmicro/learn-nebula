import { describe, expect, it } from "vitest";
import {
  buildPrereqComponents,
  buildReadingPaths,
  cleanPrereqTarget,
  connectedComponents,
  parsePrereqField,
  prereqCycles,
  topoOrder,
  type PrereqEdge,
  type PrereqNode,
} from "./prereq-graph";

describe("cleanPrereqTarget", () => {
  it("strips wikilink brackets, alias, heading and .md", () => {
    expect(cleanPrereqTarget("[[Limites et Continuité|limites]]")).toBe("Limites et Continuité");
    expect(cleanPrereqTarget(" [[Dérivation#Définition]] ")).toBe("Dérivation");
    expect(cleanPrereqTarget("Lycée/Fonctions.md")).toBe("Lycée/Fonctions");
    expect(cleanPrereqTarget("Plain title")).toBe("Plain title");
  });
});

describe("parsePrereqField", () => {
  it("accepts a single string, quoted wikilinks and plain titles", () => {
    expect(parsePrereqField("[[A]]")).toEqual(["A"]);
    expect(parsePrereqField("[[A]], [[B|bee]]")).toEqual(["A", "B"]);
    expect(parsePrereqField(["[[A]]", "Dossier/B", "C"])).toEqual(["A", "Dossier/B", "C"]);
  });

  it("flattens the nested arrays YAML makes of unquoted [[links]]", () => {
    // `prerequis: [[A]]` and a block list of `- [[A]]` items.
    expect(parsePrereqField([["A"]])).toEqual(["A"]);
    expect(parsePrereqField([["A"], ["B"]])).toEqual(["A", "B"]);
  });

  it("drops blanks, non-strings and duplicates (case-insensitive)", () => {
    expect(parsePrereqField(["", "  ", null, { x: 1 }, "A", "[[a]]"])).toEqual(["A"]);
    expect(parsePrereqField(undefined)).toEqual([]);
    expect(parsePrereqField(42)).toEqual(["42"]);
  });
});

describe("connectedComponents", () => {
  it("groups nodes linked in either direction", () => {
    const edges: PrereqEdge[] = [
      ["a", "b"],
      ["c", "b"],
      ["x", "y"],
    ];
    expect(connectedComponents(edges)).toEqual([
      ["a", "b", "c"],
      ["x", "y"],
    ]);
  });
});

describe("topoOrder", () => {
  const title = (s: string) => s.toUpperCase();

  it("puts prerequisites first, ties by title", () => {
    // limites → derivation → integrales, and fonctions → derivation.
    const r = topoOrder(
      ["integrales", "derivation", "limites", "fonctions"],
      [
        ["limites", "derivation"],
        ["fonctions", "derivation"],
        ["derivation", "integrales"],
      ],
      title,
    );
    expect(r.order).toEqual(["fonctions", "limites", "derivation", "integrales"]);
    expect(r.broken).toEqual([]);
    expect(r.cycles).toEqual([]);
  });

  it("sorts ties with French collation (accents, numbers)", () => {
    const titles: Record<string, string> = { a: "Élan", b: "Zèbre", c: "Chapitre 10", d: "Chapitre 9" };
    const r = topoOrder(["a", "b", "c", "d"], [], (s) => titles[s]);
    expect(r.order).toEqual(["d", "c", "a", "b"]);
  });

  it("breaks a cycle deterministically and reports it", () => {
    // a → b → c → a, and c → d hanging off it.
    const edges: PrereqEdge[] = [
      ["a", "b"],
      ["b", "c"],
      ["c", "a"],
      ["c", "d"],
    ];
    const r1 = topoOrder(["d", "c", "b", "a"], edges, title);
    const r2 = topoOrder(["a", "b", "c", "d"], [...edges].reverse(), title);
    expect(r1).toEqual(r2);
    // "a" is the first title of the source cycle: its incoming edge c→a goes.
    expect(r1.broken).toEqual([["c", "a"]]);
    expect(r1.cycles).toEqual([["a", "b", "c"]]);
    expect(r1.order).toEqual(["a", "b", "c", "d"]);
  });

  it("only breaks source cycles, not notes downstream of one", () => {
    // z depends on the a⇄b cycle but is not part of it.
    const r = topoOrder(
      ["a", "b", "z"],
      [
        ["a", "b"],
        ["b", "a"],
        ["a", "z"],
      ],
      title,
    );
    expect(r.cycles).toEqual([["a", "b"]]);
    expect(r.broken).toEqual([["b", "a"]]);
    expect(r.order).toEqual(["a", "b", "z"]);
  });

  it("reports self-references", () => {
    const r = topoOrder(["a"], [["a", "a"]]);
    expect(r.order).toEqual(["a"]);
    expect(r.broken).toEqual([["a", "a"]]);
    expect(r.cycles).toEqual([["a"]]);
  });

  it("handles a long chain without recursion", () => {
    const n = 5000;
    const slugs = Array.from({ length: n }, (_, i) => `n${i}`);
    const edges: PrereqEdge[] = slugs.slice(1).map((s, i) => [slugs[i], s]);
    edges.push([slugs[n - 1], slugs[0]]); // one giant cycle
    const r = topoOrder(slugs, edges);
    expect(r.order).toHaveLength(n);
    expect(r.cycles).toHaveLength(1);
    expect(r.broken).toHaveLength(1);
  });
});

describe("buildReadingPaths", () => {
  const nodes: PrereqNode[] = [
    { slug: "m/fonctions", title: "Fonctions", discipline: "Mathematics" },
    { slug: "m/limites", title: "Limites et Continuité", discipline: "Mathematics" },
    { slug: "m/derivation", title: "Dérivation", discipline: "Mathematics" },
    { slug: "m/integrales", title: "Primitives et Intégrales", discipline: "Mathematics" },
    { slug: "p/cinematique", title: "Cinématique", discipline: "Physics" },
    { slug: "p/dynamique", title: "Dynamique", discipline: "Physics" },
    { slug: "b/a", title: "Cellule", discipline: "Biology" },
    { slug: "b/b", title: "ADN", discipline: "Biology" },
  ];
  const edges: PrereqEdge[] = [
    ["m/fonctions", "m/limites"],
    ["m/limites", "m/derivation"],
    ["m/derivation", "m/integrales"],
    ["m/derivation", "p/cinematique"],
    ["p/cinematique", "p/dynamique"],
    ["b/a", "b/b"], // only two notes: not a path
    ["m/limites", "ghost"], // unknown node: ignored
  ];

  it("keeps components of 3+ notes, ordered, with a majority discipline", () => {
    const paths = buildReadingPaths(nodes, edges);
    expect(paths).toHaveLength(1);
    expect(paths[0].discipline).toBe("Mathematics");
    expect(paths[0].notes).toEqual([
      "m/fonctions",
      "m/limites",
      "m/derivation",
      // Ready together after Dérivation: ties go by title.
      "p/cinematique",
      "p/dynamique",
      "m/integrales",
    ]);
    expect(paths[0].edges).toHaveLength(5);
  });

  it("sorts paths by discipline and honours minSize", () => {
    const all = buildReadingPaths(nodes, edges, 2);
    expect(all.map((p) => p.discipline)).toEqual(["Biology", "Mathematics"]);
    expect(all[0].notes).toEqual(["b/a", "b/b"]);
  });

  it("collects cycles from every component, small ones included", () => {
    const comps = buildPrereqComponents(nodes, [
      ...edges,
      ["b/b", "b/a"], // two-note cycle
    ]);
    expect(prereqCycles(comps)).toEqual([
      { members: ["b/b", "b/a"], broken: [["b/a", "b/b"]] },
    ]);
  });
});
