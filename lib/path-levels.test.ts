import { describe, expect, it } from "vitest";
import { depths, pathLevels, type LevelNote } from "./path-levels";

const chain = (n: number): LevelNote[] =>
  Array.from({ length: n }, (_, i) => ({
    slug: `n${i}`,
    prereqs: i ? [`n${i - 1}`] : [],
  }));

const sizes = (notes: LevelNote[]) =>
  pathLevels(notes).map((l) => l.to - l.from);

describe("depths", () => {
  it("is the longest chain of prerequisites", () => {
    const d = depths([
      { slug: "a", prereqs: [] },
      { slug: "b", prereqs: ["a"] },
      { slug: "c", prereqs: [] },
      { slug: "d", prereqs: ["b", "c"] },
    ]);
    expect([...d.values()]).toEqual([0, 1, 0, 2]);
  });
});

describe("pathLevels", () => {
  it("keeps a short path in one level", () => {
    expect(pathLevels(chain(11))).toEqual([{ n: 1, from: 0, to: 11 }]);
    expect(pathLevels([])).toEqual([]);
  });

  it("covers every note once, in order, with no tiny level", () => {
    for (const n of [12, 14, 19, 20, 22, 35, 48, 60]) {
      const levels = pathLevels(chain(n));
      expect(levels[0].from).toBe(0);
      expect(levels[levels.length - 1].to).toBe(n);
      levels.forEach((l, i) => {
        expect(l.n).toBe(i + 1);
        if (i) expect(l.from).toBe(levels[i - 1].to);
        expect(l.to - l.from).toBeGreaterThanOrEqual(3);
        expect(l.to - l.from).toBeLessThanOrEqual(11);
      });
    }
  });

  it("aims at about seven notes a level", () => {
    expect(sizes(chain(35))).toEqual([7, 7, 7, 7, 7]);
    expect(sizes(chain(14))).toEqual([7, 7]);
  });

  it("prefers to cut where the graph goes one step deeper", () => {
    // Three roots, then a fan of six notes on the third, then a fan of six on
    // a note of the first fan: the cut lands before a deeper note.
    const notes: LevelNote[] = [
      { slug: "a", prereqs: [] },
      { slug: "b", prereqs: ["a"] },
      { slug: "c", prereqs: ["b"] },
      ...["d", "e", "f", "g", "h", "i"].map((s) => ({
        slug: s,
        prereqs: ["c"],
      })),
      ...["j", "k", "l", "m", "n"].map((s) => ({ slug: s, prereqs: ["i"] })),
    ];
    const [first] = pathLevels(notes);
    // Not in the middle of the d…i fan (all depth 3): after it, before j.
    expect(first.to).toBe(9);
  });
});
