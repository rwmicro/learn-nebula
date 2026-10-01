import { describe, expect, it } from "vitest";
import {
  frequentQuestions,
  isWeak,
  normalizeQuestion,
  weakQuestions,
  type QuestionLike,
} from "./questions-agg.ts";

const row = (question: string, at: number, extra: Partial<QuestionLike> = {}): QuestionLike => ({
  question,
  scope: null,
  created_at: at,
  top_score: null,
  hits: null,
  ...extra,
});

describe("normalizeQuestion", () => {
  it("folds case, accents, punctuation and whitespace", () => {
    expect(normalizeQuestion("  Qu'est-ce que le Dharma ?  ")).toBe("qu est ce que le dharma");
    expect(normalizeQuestion("qu est ce que le dharma")).toBe("qu est ce que le dharma");
    expect(normalizeQuestion("Où  est «  Élam » ?!")).toBe("ou est elam");
  });
  it("keeps non-Latin scripts", () => {
    expect(normalizeQuestion("مرحبا؟")).toBe("مرحبا");
  });
  it("is empty for punctuation-only input", () => {
    expect(normalizeQuestion("?!…")).toBe("");
  });
});

describe("isWeak", () => {
  it("is unknown when retrieval wasn't measured", () => {
    expect(isWeak({ hits: null, top_score: null })).toBeNull();
  });
  it("flags no hits and low scores", () => {
    expect(isWeak({ hits: 0, top_score: null })).toBe(true);
    expect(isWeak({ hits: 2, top_score: 0.42 })).toBe(true);
    expect(isWeak({ hits: 5, top_score: 0.71 })).toBe(false);
  });
});

describe("frequentQuestions", () => {
  it("groups variants, counts them and keeps the latest wording", () => {
    const rows = [
      row("Qu'est-ce que le karma ?", 1),
      row("qu'est ce que le karma", 3),
      row("QU'EST-CE QUE LE KARMA", 2),
      row("Une seule fois", 4),
      row("Deux fois", 5),
      row("deux fois !", 6, { scope: "arabe" }),
    ];
    const f = frequentQuestions(rows);
    expect(f.map((g) => [g.question, g.count])).toEqual([
      ["qu'est ce que le karma", 3],
      ["deux fois !", 2],
    ]);
    expect(f[1].scopes).toEqual(["arabe"]);
  });
});

describe("weakQuestions", () => {
  it("keeps groups where most measured asks were weak, ignoring unmeasured ones", () => {
    const rows = [
      row("trou", 1, { hits: 0 }),
      row("trou ?", 2, { hits: 1, top_score: 0.41 }),
      row("bien couvert", 3, { hits: 5, top_score: 0.8 }),
      row("inconnu", 4),
      row("mitigé", 5, { hits: 5, top_score: 0.8 }),
      row("mitigé", 6, { hits: 5, top_score: 0.75 }),
      row("mitigé", 7, { hits: 0 }),
    ];
    const w = weakQuestions(rows);
    expect(w.map((g) => g.key)).toEqual(["trou"]);
    expect(w[0]).toMatchObject({ count: 2, weak: 2, measured: 2, top_score: 0.41 });
  });
});
