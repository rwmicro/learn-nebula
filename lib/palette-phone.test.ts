import { describe, expect, it } from "vitest";
import {
  buildVocabulary,
  cleanFolder,
  editDistance,
  isMultiLanguage,
  noteContext,
  parseRecent,
  pushRecent,
  suggestSpelling,
  topLanguage,
} from "./palette-phone";

describe("noteContext", () => {
  it("names the language and the section, and drops the repeated suffix", () => {
    expect(
      noteContext("Négation — Arabe Libanais", "Languages & Dialects › Arabe › Libanais › 03-Grammaire"),
    ).toEqual({ title: "Négation", discipline: "Languages & Dialects", lang: "Arabe Libanais", topic: "Grammaire" });
  });
  it("uses the variety folder when it already says the language", () => {
    const c = noteContext(
      "Grammaire — Arabe Standard",
      "Languages & Dialects › Arabe › Littéraire › Arabe-Standard › 03-Grammaire",
    );
    expect(c.lang).toBe("Arabe Standard");
    expect(c.title).toBe("Grammaire");
  });
  it("keeps a suffix the folders do not say (a gloss in brackets aside)", () => {
    const c = noteContext("Salutations — Kabyle (Taqbaylit)", "Languages & Dialects › Kabyle › 02-Communication");
    expect(c.title).toBe("Salutations");
    expect(c.lang).toBe("Kabyle");
    expect(c.topic).toBe("Communication");
    expect(noteContext("Salutations — Bahasa Malaysia", "Languages & Dialects › Malais › 02-Communication").title).toBe(
      "Salutations — Bahasa Malaysia",
    );
  });
  it("gives other notes their deepest folder as topic", () => {
    expect(noteContext("La Révolution française (1789-1799)", "History › France")).toEqual({
      title: "La Révolution française (1789-1799)",
      discipline: "History",
      lang: null,
      topic: "France",
    });
    expect(noteContext("Architecture Gothique", "Architecture").topic).toBe("");
    expect(noteContext("Index", "").discipline).toBe("");
  });
  it("ignores decks and theme folders when naming the language", () => {
    expect(noteContext("Arabic for LS", "Languages & Dialects › Arabe › Libanais › Anki").lang).toBe("Arabe Libanais");
  });
});

describe("cleanFolder", () => {
  it("drops numbering and dashes", () => {
    expect(cleanFolder("03-Grammaire")).toBe("Grammaire");
    expect(cleanFolder("Hakka-Khek")).toBe("Hakka Khek");
  });
});

describe("isMultiLanguage / topLanguage", () => {
  it("groups only when many languages answer", () => {
    expect(isMultiLanguage(["Turc", "Hindi", "Azéri", "Malais", null])).toBe(true);
    expect(isMultiLanguage(["Turc", "Hindi", "Azéri"])).toBe(false);
    expect(isMultiLanguage(["Turc", "Hindi", "Azéri", "Malais", null, null, null, null])).toBe(false);
  });
  it("picks the most read language, the latest visit breaking ties", () => {
    expect(
      topLanguage([
        { lang: "Turc", t: 5 },
        { lang: "Arabe Libanais", t: 1 },
        { lang: "Arabe Libanais", t: 2 },
        { lang: null, t: 9 },
      ]),
    ).toBe("Arabe Libanais");
    expect(topLanguage([{ lang: "Turc", t: 1 }, { lang: "Hindi", t: 3 }])).toBe("Hindi");
    expect(topLanguage([])).toBeNull();
  });
});

describe("recent searches", () => {
  it("puts the latest first, without duplicates", () => {
    expect(pushRecent(["kant", "Arabe"], "arabe")).toEqual(["arabe", "kant"]);
    expect(pushRecent(["a", "b"], " x ")).toEqual(["a", "b"]);
    expect(pushRecent(["1", "2", "3"], "new", 3)).toEqual(["new", "1", "2"]);
  });
  it("reads only strings from storage", () => {
    expect(parseRecent('["kant", 3, "", "salut"]')).toEqual(["kant", "salut"]);
    expect(parseRecent("{oops")).toEqual([]);
    expect(parseRecent(null)).toEqual([]);
  });
});

describe("spelling suggestion", () => {
  const vocab = buildVocabulary([
    "Philosophie de l'Antiquité",
    "Philosophie moderne",
    "Salutations — Turc",
    "Pinyin et Tons — Mandarin",
  ]);
  it("measures edits, swaps included, and gives up past the limit", () => {
    expect(editDistance("salut", "salut")).toBe(0);
    expect(editDistance("slaut", "salut")).toBe(1);
    expect(editDistance("philosofie", "philosophie")).toBe(2);
    expect(editDistance("abc", "xyzuvw", 2)).toBe(3);
  });
  it("corrects a misspelt word", () => {
    expect(suggestSpelling("philosofie", vocab)).toBe("philosophie");
    expect(suggestSpelling("salutasions", vocab)).toBe("salutations");
    expect(suggestSpelling("mandarin pinyn", vocab)).toBe("mandarin pinyin");
  });
  it("says nothing when nothing is close or nothing changes", () => {
    expect(suggestSpelling("hangul", vocab)).toBeNull();
    expect(suggestSpelling("mandarin", vocab)).toBeNull();
    expect(suggestSpelling("", vocab)).toBeNull();
  });
});
