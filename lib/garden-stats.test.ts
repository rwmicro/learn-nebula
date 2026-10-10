import { describe, expect, it } from "vitest";
import { countWords, disciplineOf, gardenStats, monthRange, type StatNote } from "./garden-stats";

const note = (slug: string, rawPath: string, date?: string, body = "un deux trois"): StatNote => ({
  slug,
  rawPath,
  title: slug.toUpperCase(),
  body,
  date: date ? new Date(date) : undefined,
});

describe("disciplineOf", () => {
  it("takes the level-2 folder", () => {
    expect(disciplineOf("Social Sciences/Philosophy/Kant")).toBe("Philosophy");
    expect(disciplineOf("Social Sciences/Kant")).toBe("Social Sciences");
    expect(disciplineOf("Garden of Knowledge")).toBe("");
  });
});

describe("monthRange", () => {
  it("crosses a year", () => {
    expect(monthRange("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("countWords", () => {
  it("skips code and link targets", () => {
    expect(countWords("Bonjour [le monde](http://x.y/z) ```js\nconst a = 1\n``` fin")).toBe(4);
    expect(countWords("[[Kant|le philosophe]] l’homme")).toBe(2);
  });
});

describe("gardenStats", () => {
  const notes = [
    note("kant", "Social Sciences/Philosophy/Kant", "2026-02-10"),
    note("hegel", "Social Sciences/Philosophy/Hegel", "2026-02-20"),
    note("tcp", "Applied Sciences/Computer Science/TCP", "2025-12-01", "a ![x](audio/a.mp3) ![y](audio/a.mp3) ![z](audio/b.mp3)"),
    note("sans-date", "Applied Sciences/Computer Science/X"),
  ];
  const edges: [string, string][] = [
    ["hegel", "kant"],
    ["tcp", "kant"],
    ["hegel", "kant"],
    ["kant", "hegel"],
    ["x", "nope"],
  ];
  const s = gardenStats(notes, edges, new Date("2026-03-15"));

  it("counts notes, disciplines and distinct clips", () => {
    expect(s.notes).toBe(4);
    expect(s.disciplines).toBe(2);
    expect(s.clips).toBe(2);
  });

  it("fills empty months and keeps a running total", () => {
    expect(s.months.map((m) => m.month)).toEqual(["2025-12", "2026-01", "2026-02", "2026-03"]);
    expect(s.months.map((m) => m.planted)).toEqual([1, 0, 2, 0]);
    expect(s.months.at(-1)!.total).toBe(3);
    expect(s.peak?.month).toBe("2026-02");
  });

  it("ranks notes by distinct linking notes", () => {
    expect(s.cited[0]).toEqual({ slug: "kant", title: "KANT", links: 2 });
    expect(s.cited.map((c) => c.slug)).not.toContain("nope");
  });

  it("groups the small disciplines", () => {
    const t = gardenStats(notes, [], new Date("2026-03-15"), { disciplinesShown: 1 });
    expect(t.byDiscipline).toEqual([
      { name: "Computer Science", notes: 2 },
      { name: "", notes: 2 },
    ]);
  });

  it("lists what grew in the last 90 days", () => {
    expect(s.growing).toEqual([{ name: "Philosophy", notes: 2 }]);
  });
});
