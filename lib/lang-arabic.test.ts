import { describe, expect, it } from "vitest";
import { ALPHABET, ZWJ, analyse, forms } from "./lang-arabic";

const pos = (w: string) => analyse(w).map((l) => l.position);

describe("contextual positions", () => {
  it("a fully joined word", () => {
    expect(pos("كتب")).toEqual(["initiale", "médiane", "finale"]);
  });
  it("non-connectors break the word", () => {
    expect(pos("دار")).toEqual(["isolée", "isolée", "isolée"]);
    expect(pos("مدرسة")).toEqual(["initiale", "finale", "isolée", "initiale", "finale"]);
    expect(analyse("مدرسة").map((l) => l.breaks)).toEqual([false, true, true, false, false]);
  });
  it("harakat stay on their letter and do not break joining", () => {
    const a = analyse("كَتَبَ");
    expect(a.map((l) => l.position)).toEqual(["initiale", "médiane", "finale"]);
    expect(a[0].marks).toBe("َ");
  });
  it("words are split on spaces", () => {
    expect(pos("بيت كبير")).toEqual(["initiale", "médiane", "finale", "initiale", "médiane", "médiane", "finale"]);
  });
  it("hamza on the line joins nothing", () => {
    expect(pos("ماء")).toEqual(["initiale", "finale", "isolée"]);
  });
});

describe("forms", () => {
  it("uses ZWJ on the joining sides", () => {
    expect(forms("ب")).toEqual({ isolée: "ب", initiale: "ب" + ZWJ, médiane: ZWJ + "ب" + ZWJ, finale: ZWJ + "ب" });
    expect(forms("د").initiale).toBe("د");
    expect(forms("د").médiane).toBe(ZWJ + "د");
  });
  it("28 letters plus hamza, six non-connectors", () => {
    expect(ALPHABET).toHaveLength(29);
    expect(ALPHABET.filter((l) => l.join === "R").map((l) => l.ch).join("")).toBe("ادذرزو");
  });
});
