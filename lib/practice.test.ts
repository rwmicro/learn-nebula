import { describe, expect, it } from "vitest";
import { practicePick, shuffled } from "./practice";
import type { CardState } from "./srs";

const st = (o: Partial<CardState>): CardState => ({ s: 1, d: 5, iv: 1, reps: 1, lapses: 0, last: "2026-10-10", due: "2026-10-20", ...o });

describe("practicePick", () => {
  it("errors: missed this week only", () => {
    expect(practicePick("erreurs", st({ reps: 0, last: "2026-10-12" }), "2026-10-14")).toBe(true);
    expect(practicePick("erreurs", st({ reps: 0, last: "2026-10-01" }), "2026-10-14")).toBe(false);
    expect(practicePick("erreurs", st({ reps: 2, last: "2026-10-13" }), "2026-10-14")).toBe(false);
  });
  it("fragile: three lapses or more", () => {
    expect(practicePick("fragiles", st({ lapses: 3 }), "2026-10-14")).toBe(true);
    expect(practicePick("fragiles", st({ lapses: 2 }), "2026-10-14")).toBe(false);
  });
  it("never a new or suspended card", () => {
    expect(practicePick("ecoute", undefined, "2026-10-14")).toBe(false);
    expect(practicePick("ecoute", st({ sus: 1 }), "2026-10-14")).toBe(false);
  });
});

describe("shuffled", () => {
  it("keeps every item", () => {
    expect(shuffled([1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]);
  });
});
