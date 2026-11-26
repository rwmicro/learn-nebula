import { describe, expect, it } from "vitest";
import { deskLines, placeLines, shelfLayout, timeBuckets, type DeskLinePath, type ShelfBook } from "./path-desk";

const p = (slug: string, name: string, extra: Partial<DeskLinePath> = {}): DeskLinePath => ({
  slug,
  name,
  discipline: "Philosophy",
  family: "pensee",
  minutes: 10,
  ...extra,
});

describe("deskLines", () => {
  it("follows `suite:` from the head and drops a shared first word", () => {
    const lines = deskLines([
      p("b", "Philosophie : de l'Antiquité aux modernes", { prev: "a", next: "c" }),
      p("a", "Philosophie en culture générale", { next: "b" }),
      p("c", "Philosophie : les grandes branches", { prev: "b" }),
      p("x", "Seule"),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].stations.map((s) => s.label)).toEqual(["Culture générale", "Antiquité aux modernes", "Grandes branches"]);
    expect(lines[0].minutes).toBe(30);
    expect(lines[0].mixed).toBe(false);
  });

  it("keeps short names when they differ, skips a family, survives a cycle", () => {
    const lines = deskLines(
      [
        p("a", "Réseau : des modèles OSI", { prev: "b", next: "b", family: "informatique" }),
        p("b", "Cloud : sécuriser", { prev: "a", next: "a", family: "informatique", discipline: "Cloud" }),
        p("l", "Malais", { next: "m", family: "langues" }),
        p("m", "Sambas", { prev: "l", family: "langues" }),
      ],
      ["langues"],
    );
    expect(lines).toHaveLength(0); // a ↔ b: no head without a known prev
    const ok = deskLines([p("a", "Réseau : x", { next: "b" }), p("b", "Cloud : y", { prev: "a", discipline: "Other" })]);
    expect(ok[0].stations.map((s) => s.label)).toEqual(["Réseau", "Cloud"]);
    expect(ok[0].mixed).toBe(true);
  });
});

describe("placeLines", () => {
  it("gives a long line a row and packs short ones side by side", () => {
    const st = (n: number) => Array.from({ length: n }, (_, i) => ({ slug: `s${n}-${i}`, label: "", sub: false }));
    const line = (n: number) => ({ family: null, discipline: "", stations: st(n), minutes: 0, mixed: false });
    const { lines, height } = placeLines([line(11), line(5), line(2), line(2)]);
    expect(lines[0].x0).toBe(40);
    expect(new Set(lines.slice(1).map((l) => l.y)).size).toBe(1);
    expect(lines[1].x1).toBeLessThan(lines[2].x0);
    expect(height).toBe(306);
  });
});

describe("timeBuckets", () => {
  it("picks the quickest, those near an hour and the longest, once each", () => {
    const paths = [5, 12, 20, 30, 45, 58, 62, 70, 90, 200, 300, 400, 500].map((m) => ({ slug: `p${m}`, minutes: m }));
    const [quick, hour, long] = timeBuckets(paths);
    expect(quick.map((x) => x.minutes)).toEqual([5, 12, 20, 30]);
    expect(long.map((x) => x.minutes)).toEqual([500, 400, 300, 200]);
    expect(hour.map((x) => x.minutes)).toEqual([45, 58, 62, 70]);
  });
});

describe("shelfLayout", () => {
  const b = (slug: string, family: ShelfBook["family"], notes: number): ShelfBook => ({ slug, family, notes });
  const line = (family: ShelfBook["family"], slugs: string[]) => ({
    family,
    discipline: "x",
    mixed: false,
    minutes: 0,
    stations: slugs.map((slug) => ({ slug, label: slug, sub: false })),
  });

  it("puts a family's line first, in order, then its other books by notes", () => {
    const { rows, lines } = shelfLayout(
      [b("big", "pensee", 50), b("l2", "pensee", 3), b("l1", "pensee", 3), b("small", "pensee", 5), b("s", "sciences", 4)],
      [line("pensee", ["l1", "l2"])],
      ["sciences", "pensee"],
      1,
    );
    expect(rows).toEqual([["s", "l1", "l2", "big", "small"]]);
    expect(lines).toEqual([0]);
  });

  it("draws only the line that placed all its books, and never cuts it", () => {
    const books = [b("a", "informatique", 10), b("b", "informatique", 10), b("c", "informatique", 10), b("d", "informatique", 10), b("x", "informatique", 10), b("z", "langues", 40)];
    const { rows, lines } = shelfLayout(
      books,
      [line("informatique", ["a", "b", "c", "d"]), line("informatique", ["x", "c", "d"])],
      ["informatique", "langues"],
    );
    expect(lines).toEqual([0]);
    expect(rows.flat()).toEqual(["a", "b", "c", "d", "x", "z"]);
    expect(rows.find((r) => r.includes("a"))).toEqual(expect.arrayContaining(["a", "b", "c", "d"]));
    expect(rows).toHaveLength(2);
  });
});
