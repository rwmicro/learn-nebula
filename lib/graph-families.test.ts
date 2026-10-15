import { describe, expect, it } from "vitest";
import { buildClusters, familyOf } from "./graph-families";
import type { GraphData } from "./graph-data";

describe("familyOf", () => {
  it("places the vault's folder names, accents and separators as on disk", () => {
    expect(familyOf("Computer Science")).toBe("informatique");
    expect(familyOf("Languages - Dialects")).toBe("langues");
    expect(familyOf("Litterature")).toBe("arts");
    expect(familyOf("Echecs")).toBe("jeux");
    expect(familyOf("Something New")).toBe("societe");
  });
});

describe("buildClusters", () => {
  const note = (i: number, theme: string) => ({
    id: `n${i}`, label: `Note ${i}`, kind: "note" as const, group: "", theme, depth: 3, href: `/posts/${i}/`,
  });
  const data: GraphData = {
    nodes: [
      { id: "root", label: "Garden", kind: "root", group: "", theme: "", depth: 0 },
      ...Array.from({ length: 60 }, (_, i) => note(i, "Computer Science")),
      ...Array.from({ length: 20 }, (_, i) => note(100 + i, "History")),
      ...Array.from({ length: 5 }, (_, i) => note(200 + i, "Biology")),
    ],
    links: [],
  };
  it("draws one hub per family with notes, none overlapping", () => {
    const c = buildClusters(data);
    expect(c.hubs.map((h) => h.family).sort()).toEqual(["informatique", "pensee", "vivant"]);
    expect(c.notes).toHaveLength(85);
    for (const a of c.hubs)
      for (const b of c.hubs)
        if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r);
  });
});
