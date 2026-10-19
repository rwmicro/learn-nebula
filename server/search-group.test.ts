import { describe, expect, it } from "vitest";
import { groupByNote, normaliseQuery, sectionOf } from "./search-group.ts";

const hit = (url: string, cosine: number, crumb = "T") => ({
  title: "T",
  url,
  text: `${crumb}\nbody`,
  cosine,
});

describe("sectionOf", () => {
  it("drops the title from the breadcrumb", () => {
    expect(sectionOf("Verbes › Conjugaison › Passé\ntext")).toBe("Conjugaison › Passé");
  });
  it("is empty for an intro chunk", () => {
    expect(sectionOf("Verbes\ntext")).toBe("");
    expect(sectionOf("")).toBe("");
  });
});

describe("groupByNote", () => {
  it("keeps one row per note, with its best chunk's section", () => {
    const out = groupByNote([
      hit("/posts/a/", 0.6, "A › Low"),
      hit("/posts/b/", 0.7),
      hit("/posts/a/", 0.8, "A › High"),
    ]);
    expect(out.map((h) => h.url)).toEqual(["/posts/a/", "/posts/b/"]);
    expect(out[0]).toMatchObject({ section: "High", score: 0.8 });
  });
  it("lets several chunks lift a note a little, never past a clearly better one", () => {
    const close = groupByNote([hit("/posts/a/", 0.7), hit("/posts/b/", 0.69), hit("/posts/b/", 0.6), hit("/posts/b/", 0.6)]);
    expect(close[0].url).toBe("/posts/b/");
    const far = groupByNote([hit("/posts/a/", 0.8), hit("/posts/b/", 0.7), hit("/posts/b/", 0.6), hit("/posts/b/", 0.6), hit("/posts/b/", 0.6)]);
    expect(far[0].url).toBe("/posts/a/");
  });
  it("caps the list and skips hits without a URL", () => {
    const many = Array.from({ length: 20 }, (_, i) => hit(`/posts/n${i}/`, 0.9 - i * 0.01));
    expect(groupByNote(many)).toHaveLength(8);
    expect(groupByNote(many, 3).map((h) => h.url)).toEqual(["/posts/n0/", "/posts/n1/", "/posts/n2/"]);
    expect(groupByNote([hit("", 0.9)])).toEqual([]);
  });
  it("keeps input order on ties", () => {
    expect(groupByNote([hit("/posts/x/", 0.5), hit("/posts/y/", 0.5)]).map((h) => h.url)).toEqual(["/posts/x/", "/posts/y/"]);
  });
});

describe("normaliseQuery", () => {
  it("folds spacing and case", () => {
    expect(normaliseQuery("  La  Photo\tSynthèse ")).toBe("la photo synthèse");
  });
});
