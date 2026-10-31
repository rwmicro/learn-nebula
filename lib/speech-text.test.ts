import { describe, expect, it } from "vitest";
import { joinSpeech, speechChunks } from "./speech-text";

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

describe("speechChunks", () => {
  it("packs whole sentences up to the limit", () => {
    expect(speechChunks("Un. Deux trois. Quatre.", 16)).toEqual(["Un. Deux trois.", "Quatre."]);
  });

  it("splits a long sentence on words, and a long word anywhere", () => {
    expect(speechChunks("aaa bbb ccc", 7)).toEqual(["aaa bbb", "ccc"]);
    expect(speechChunks("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });

  it("never returns an empty piece", () => {
    expect(speechChunks("", 10)).toEqual([]);
    expect(speechChunks("Fin.", 10)).toEqual(["Fin."]);
  });
});
