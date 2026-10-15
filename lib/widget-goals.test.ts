import { describe, expect, it } from "vitest";
import { holds, parseConds, parseGoals } from "./widget-goals";

describe("widget-goals", () => {
  it("parses goals with suffixes, hints and error messages", () => {
    const g = parseGoals({
      objectif: "Converge en moins de 40 pas.",
      cible: "atteint=1, pas<=40",
      indice: "Monte le taux.",
      erreur: "diverge=1 → Trop grand. ;; pas>40 -> Trop lent.",
      "objectif-2": "Fais diverger.",
      "cible-2": "diverge=1",
      "objectif-3": "Sans cible, ignoré.",
    });
    expect(g).toHaveLength(2);
    expect(g[0].conds).toEqual([
      { key: "atteint", op: "=", val: "1" },
      { key: "pas", op: "<=", val: "40" },
    ]);
    expect(g[0].errors.map((e) => e.msg)).toEqual(["Trop grand.", "Trop lent."]);
    expect(g[1].text).toBe("Fais diverger.");
  });
  it("compares numbers as numbers and text exactly", () => {
    const st = { pas: 12, perte: 0.31, modele: "perceptron" };
    expect(holds(st, parseConds("pas<=40, perte<0.5"))).toBe(true);
    expect(holds(st, parseConds("perte<0.3"))).toBe(false);
    expect(holds(st, parseConds("modele=perceptron"))).toBe(true);
    expect(holds(st, parseConds("modele=Perceptron"))).toBe(false);
    expect(holds(st, parseConds("absent=1"))).toBe(false);
    expect(holds(undefined, parseConds("pas=1"))).toBe(false);
  });
});
