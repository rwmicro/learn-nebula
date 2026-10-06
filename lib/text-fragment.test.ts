import { describe, it, expect } from "vitest";
import {
  encodeFragmentTerm,
  selectionEligible,
  textFragment,
  textFragmentUrl,
  wordCount,
} from "./text-fragment";

describe("selectionEligible", () => {
  it("needs at least three words and at most 1000 chars", () => {
    expect(selectionEligible("deux mots")).toBe(false);
    expect(selectionEligible("  trois   petits mots ")).toBe(true);
    expect(selectionEligible("mot ".repeat(300))).toBe(false);
    expect(wordCount("a\nb  c")).toBe(3);
  });
});

describe("text fragments", () => {
  it("encodes the reserved characters, dash included", () => {
    expect(encodeFragmentTerm("a-b, c&d é")).toBe("a%2Db%2C%20c%26d%20%C3%A9");
  });
  it("uses the exact form for a short one-block selection", () => {
    expect(textFragment("la  matrice de passage")).toBe("la%20matrice%20de%20passage");
  });
  it("uses start,end for long or multi-block selections", () => {
    const long =
      "Une matrice est un tableau de nombres rangés en lignes et en colonnes, à coefficients dans un corps quelconque.";
    expect(textFragment(long)).toBe(
      "Une%20matrice%20est%20un,dans%20un%20corps%20quelconque.",
    );
    expect(textFragment("Premier paragraphe ici.\nSecond paragraphe là.")).toBe(
      "Premier%20paragraphe%20ici.%20Second,ici.%20Second%20paragraphe%20l%C3%A0.",
    );
  });
  it("replaces any existing hash on the URL", () => {
    expect(textFragmentUrl("https://x.org/posts/a/#intro", "un deux trois")).toBe(
      "https://x.org/posts/a/#:~:text=un%20deux%20trois",
    );
  });
});
