import { describe, expect, it } from "vitest";
import { shortTitle, splitRank } from "./folder-label";

describe("splitRank", () => {
  it("keeps the order prefix apart", () => {
    expect(splitRank("01-Phonologie")).toEqual({
      rank: "01",
      label: "Phonologie",
    });
    expect(splitRank("3 Grammaire")).toEqual({ rank: "3", label: "Grammaire" });
  });
  it("leaves other names alone", () => {
    expect(splitRank("Hakka-Khek")).toEqual({
      rank: null,
      label: "Hakka-Khek",
    });
    expect(splitRank("2024")).toEqual({ rank: null, label: "2024" });
  });
});

describe("shortTitle", () => {
  const folders = [
    "Social Sciences",
    "Languages - Dialects",
    "Arabe",
    "Libanais",
    "03-Grammaire",
  ];
  it("drops a suffix the folders already say", () => {
    expect(shortTitle("Négation — Arabe Libanais", folders)).toBe("Négation");
    expect(
      shortTitle("Participes, Actif et Passif – Arabe libanais", folders),
    ).toBe("Participes, Actif et Passif");
  });
  it("keeps a suffix that says something else", () => {
    expect(shortTitle("Négation — Arabe Standard", folders)).toBe(
      "Négation — Arabe Standard",
    );
    expect(shortTitle("Salutations — Tamoul", folders)).toBe(
      "Salutations — Tamoul",
    );
    expect(shortTitle("Platon", folders)).toBe("Platon");
  });
});
