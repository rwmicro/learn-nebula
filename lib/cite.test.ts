import { describe, expect, it } from "vitest";
import { citeBibtex, citeText } from "./cite";
import { carteClass } from "./carte";

const note = { slug: "social-sciences/history/france/la-commune", title: "La Commune", author: ["Martin"], date: new Date("2026-03-02") };
const today = new Date("2026-10-11T00:00:00Z");

describe("citeText", () => {
  it("names the author, the title, the year, the URL and the access date", () => {
    const s = citeText(note, today);
    expect(s).toMatch(/^Martin\. « La Commune »\. Garden of Knowledge, 2026\. https?:\/\/\S+\/posts\/social-sciences\/history\/france\/la-commune\/ \(consulté le 11 octobre 2026\)\.$/);
  });
});

describe("citeBibtex", () => {
  it("builds a @misc entry keyed by slug and year", () => {
    const b = citeBibtex(note, today);
    expect(b.split("\n")[0]).toBe("@misc{lacommune2026,");
    expect(b).toContain("urldate = {2026-10-11}");
  });
});

describe("carteClass", () => {
  it("bins counts geometrically", () => {
    expect([1, 2, 3, 9, 10, 29, 30, 99, 100, 500].map(carteClass)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});
