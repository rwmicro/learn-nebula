import { describe, expect, it } from "vitest";
import {
  diagramme,
  figure,
  nomDuMode,
  regionsVisees,
  verifier,
  type Forme,
  type Proposition,
  type Terme,
} from "./sci-syllogism";

const P = (forme: Forme, sujet: Terme, predicat: Terme): Proposition => ({
  forme,
  sujet,
  predicat,
});
const FORMES: Forme[] = ["A", "E", "I", "O"];
const FIG: [Terme, Terme, Terme, Terme][] = [
  ["M", "P", "S", "M"],
  ["P", "M", "S", "M"],
  ["M", "P", "M", "S"],
  ["P", "M", "M", "S"],
];

function all(importation: boolean): string[] {
  const out: string[] = [];
  for (const [i, f] of FIG.entries())
    for (const a of FORMES)
      for (const b of FORMES)
        for (const c of FORMES) {
          const maj = P(a, f[0], f[1]);
          const min = P(b, f[2], f[3]);
          if (
            verifier([maj, min], P(c, "S", "P"), {
              importationExistentielle: importation,
            }).valide
          )
            out.push(`${i + 1}${a}${b}${c}`);
        }
  return out;
}

describe("sci-syllogism", () => {
  it("regions", () => {
    // Tous les S sont P empties S∧¬P: regions 1 (S) and 3 (S,M).
    expect(regionsVisees(P("A", "S", "P"))).toEqual([1, 3]);
    expect(regionsVisees(P("I", "S", "M"))).toEqual([3, 7]);
  });
  it("Barbara is valid, the undistributed middle is not", () => {
    expect(
      verifier([P("A", "M", "P"), P("A", "S", "M")], P("A", "S", "P")).valide,
    ).toBe(true);
    const v = verifier([P("A", "P", "M"), P("A", "S", "M")], P("A", "S", "P"));
    expect(v.valide).toBe(false);
    expect(v.contreExemple).not.toBeNull();
  });
  it("15 valid moods in Boole's reading, 24 in Aristotle's", () => {
    const modern = all(false);
    expect(modern).toHaveLength(15);
    const trad = all(true);
    expect(trad).toHaveLength(24);
    // Darapti needs the middle term to exist.
    expect(modern).not.toContain("3AAI");
    expect(trad).toContain("3AAI");
  });
  it("every traditionally valid mood has its medieval name", () => {
    for (const code of all(true)) {
      const f = FIG[Number(code[0]) - 1];
      const name = nomDuMode(
        P(code[1] as Forme, f[0], f[1]),
        P(code[2] as Forme, f[2], f[3]),
        P(code[3] as Forme, "S", "P"),
      );
      expect(name, code).toBeTruthy();
    }
    expect(
      nomDuMode(P("A", "M", "P"), P("A", "S", "M"), P("A", "S", "P")),
    ).toBe("Barbara");
    expect(figure(P("E", "P", "M"), P("A", "S", "M"))).toBe(2);
  });
  it("diagram: shading, then × in one region or on a line", () => {
    // Darii: Tous les M sont P, Quelques S sont M.
    const d = diagramme([P("A", "M", "P"), P("I", "S", "M")]);
    expect(d.vides).toEqual([2, 3]);
    expect(d.croix).toEqual([[7]]);
    // Quelques S sont M with nothing shaded: × on the P line between 3 and 7.
    expect(diagramme([P("I", "S", "M")]).croix).toEqual([[3, 7]]);
  });
});
