import { describe, expect, it } from "vitest";
import { joinSpeech } from "./speech-text";

describe("joinSpeech", () => {
  it("glues inline pieces as the HTML has them", () => {
    expect(joinSpeech([null, "Le ", "jard", "in", " pousse.", null])).toBe("Le jardin pousse.");
  });

  it("ends a block without punctuation with a full stop", () => {
    expect(joinSpeech(["Introduction", null, "Une phrase.", null, "Un point", null])).toBe(
      "Introduction. Une phrase. Un point.",
    );
  });

  it("keeps the block's own punctuation, closing quotes included", () => {
    expect(joinSpeech(["Pourquoi ?", null, "Ainsi :", null, "« Dit-il. »", null])).toBe(
      "Pourquoi ? Ainsi : « Dit-il. »",
    );
  });

  it("collapses whitespace and drops empty blocks", () => {
    expect(joinSpeech([null, "  \n ", null, "a\n\n  b", null, null])).toBe("a b.");
  });
});
