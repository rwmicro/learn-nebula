import { describe, it, expect } from "vitest";
import { isMostlyLinear, prereqsToShow, shortNoteTitles } from "./path-titles";

const notes = (titles: string[]) =>
  titles.map((title, i) => ({ slug: `n${i}`, title }));

describe("shortNoteTitles", () => {
  it("drops a suffix shared by several notes", () => {
    const m = shortNoteTitles(
      "Arabe libanais : des premiers mots à la culture",
      notes([
        "Salutations — Arabe Libanais",
        "Verbes — Arabe Libanais",
        "Culture — Liban et Arabe Libanais",
      ]),
    );
    expect([...m.values()]).toEqual(["Salutations", "Verbes", "Culture"]);
  });

  it("drops a single suffix naming the path's subject", () => {
    const m = shortNoteTitles(
      "Arabe libanais : x",
      notes(["Guerre Civile et Mémoire — Liban", "Intro"]),
    );
    expect(m.get("n0")).toBe("Guerre Civile et Mémoire");
  });

  it("keeps a one-off suffix that adds meaning", () => {
    const m = shortNoteTitles(
      "Allemand : x",
      notes([
        "Culture — Monde Germanophone",
        "Volatility 3 — Analyse de Mémoire",
        "Salutations — Allemand",
      ]),
    );
    expect(m.get("n0")).toBe("Culture — Monde Germanophone");
    expect(m.get("n1")).toBe("Volatility 3 — Analyse de Mémoire");
    expect(m.get("n2")).toBe("Salutations");
  });

  it("keeps full titles that would collide", () => {
    const m = shortNoteTitles(
      "X : y",
      notes([
        "Vocabulaire — A",
        "Vocabulaire — B",
        "Grammaire — A",
        "Grammaire — B",
      ]),
    );
    expect([...m.values()]).toEqual([
      "Vocabulaire — A",
      "Vocabulaire — B",
      "Grammaire — A",
      "Grammaire — B",
    ]);
  });

  it("leaves titles without a dash alone", () => {
    const m = shortNoteTitles(
      "Indonésien : x",
      notes(["Salutations (Salam)", "Structure de Phrase en Indonésien"]),
    );
    expect([...m.values()]).toEqual([
      "Salutations (Salam)",
      "Structure de Phrase en Indonésien",
    ]);
  });
});

describe("prereqsToShow", () => {
  it("hides the line just above when it is the only prerequisite", () => {
    expect(prereqsToShow(["a"], "a")).toEqual([]);
    expect(prereqsToShow(["b"], "a")).toEqual(["b"]);
    expect(prereqsToShow(["a", "b"], "a")).toEqual(["a", "b"]);
    expect(prereqsToShow([], null)).toEqual([]);
  });
});

describe("isMostlyLinear", () => {
  const col = (ys: number[]) => ys.map((y) => ({ y }));
  it("spots a single column", () => {
    expect(isMostlyLinear(col([0, 1, 2, 3, 4, 5, 6]))).toBe(true);
  });
  it("rejects a branching graph", () => {
    expect(isMostlyLinear(col([0, 1, 1, 2, 2, 3, 4]))).toBe(false);
  });
  it("ignores tiny paths", () => {
    expect(isMostlyLinear(col([0, 1, 2]))).toBe(false);
  });
});
