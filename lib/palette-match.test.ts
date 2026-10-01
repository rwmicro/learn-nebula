import { describe, expect, it } from "vitest";
import { fold, rankItems, scoreItem, tokenScore } from "./palette-match";

describe("fold", () => {
  it("drops accents, case and ligatures", () => {
    expect(fold("Œuvre Économique")).toBe("oeuvre economique");
    expect(fold("Dérivation")).toBe("derivation");
    expect(fold("L’Être")).toBe("l'etre");
  });
});

describe("tokenScore", () => {
  it("ranks prefix > word start > substring > subsequence", () => {
    const prefix = tokenScore("lim", "limites et continuite")!;
    const word = tokenScore("cont", "limites et continuite")!;
    const sub = tokenScore("ites", "limites et continuite")!;
    const subseq = tokenScore("lmts", "limites et continuite")!;
    expect(prefix).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(sub);
    expect(sub).toBeGreaterThan(subseq);
    expect(subseq).toBeGreaterThan(0);
  });

  it("rejects missing letters and over-scattered subsequences", () => {
    expect(tokenScore("xyz", "derivation")).toBeNull();
    expect(tokenScore("dn", "derivation")).toBeNull(); // 7 letters apart
    expect(tokenScore("z", "derivation")).toBeNull();
  });
});

describe("scoreItem", () => {
  it("is accent-insensitive in both directions", () => {
    expect(scoreItem("derivation", { title: "Dérivation" })).not.toBeNull();
    expect(scoreItem("économie", { title: "Economie politique" })).not.toBeNull();
  });

  it("requires every token, from title, hint or keywords", () => {
    expect(scoreItem("lim cont", { title: "Limites et Continuité" })).not.toBeNull();
    expect(scoreItem("lycee deriv", { title: "Dérivation", hint: "Mathematics › Lycée" })).not.toBeNull();
    expect(scoreItem("lim zzz", { title: "Limites et Continuité" })).toBeNull();
    expect(scoreItem("sombre", { title: "Thème : sombre" })).not.toBeNull();
    expect(scoreItem("dark", { title: "Thème : sombre", keywords: "dark nuit" })).not.toBeNull();
  });

  it("weighs the title over the hint", () => {
    const inTitle = scoreItem("bio", { title: "Biologie cellulaire", hint: "Sciences" })!;
    const inHint = scoreItem("bio", { title: "Cellule", hint: "Biologie" })!;
    expect(inTitle).toBeGreaterThan(inHint);
  });
});

describe("rankItems", () => {
  const notes = [
    { title: "Dérivation", hint: "Mathematics › Lycée" },
    { title: "Dérivées partielles", hint: "Mathematics › Math Spé" },
    { title: "Conduite de projet", hint: "Management" },
    { title: "Primitives et Intégrales", hint: "Mathematics › Lycée" },
    { title: "Indépendance des variables", hint: "Mathematics" },
  ];

  it("puts the best match first", () => {
    expect(rankItems("deriv", notes).map((n) => n.title)).toEqual([
      "Dérivation",
      "Dérivées partielles",
    ]);
    expect(rankItems("integrales", notes)[0].title).toBe("Primitives et Intégrales");
  });

  it("prefers an exact title, then shorter titles on ties", () => {
    const items = [{ title: "Suites et séries" }, { title: "Suites" }, { title: "Suites numériques" }];
    expect(rankItems("suites", items).map((i) => i.title)).toEqual([
      "Suites",
      "Suites et séries",
      "Suites numériques",
    ]);
  });

  it("respects the limit and returns nothing for no match", () => {
    expect(rankItems("e", notes, 2)).toHaveLength(2);
    expect(rankItems("qwxz", notes)).toEqual([]);
  });

  it("returns everything for an empty query (in title order on ties)", () => {
    expect(rankItems("", [{ title: "b" }, { title: "a" }]).map((i) => i.title)).toEqual(["a", "b"]);
  });
});

describe("rankItems substring-first", () => {
  it("drops scattered-letter matches when a real substring match exists", () => {
    const items = [
      { title: "Emmanuel Kant (1724-1804)" },
      { title: "Pronoms (Kata Ganti)" },
      { title: "Work and Study" },
    ];
    expect(rankItems("kant", items).map((i) => i.title)).toEqual(["Emmanuel Kant (1724-1804)"]);
  });
  it("still falls back to subsequences when nothing contains the query", () => {
    expect(rankItems("drvt", [{ title: "Dérivation" }, { title: "Suites" }]).map((i) => i.title)).toEqual([
      "Dérivation",
    ]);
  });
});
