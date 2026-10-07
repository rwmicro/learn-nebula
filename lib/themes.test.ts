import { describe, expect, it } from "vitest";
import { TAG_ALIASES, tagKey, tagSlug } from "./slug";

describe("tagSlug", () => {
  it("folds accents instead of dropping the letters", () => {
    expect(tagSlug("sécurité")).toBe("securite");
    expect(tagSlug("Économie comportementale")).toBe(
      "economie-comportementale",
    );
  });
  it("merges spellings of one tag", () => {
    expect(tagSlug("Sécurité")).toBe(tagSlug("securite"));
  });
  it("keeps dotted numeric tags readable", () => {
    expect(tagSlug("802.11")).toBe("802-11");
  });
});

describe("tagKey", () => {
  it("folds synonyms onto one page", () => {
    expect(tagKey("Deutsch")).toBe("allemand");
    expect(tagKey("network")).toBe("reseau");
    expect(tagKey("réseau")).toBe("reseau");
  });
  it("leaves other tags alone", () => {
    expect(tagKey("Sécurité")).toBe("securite");
  });
  it("never points an alias at another alias", () => {
    for (const target of Object.values(TAG_ALIASES)) {
      expect(TAG_ALIASES[target]).toBeUndefined();
    }
  });
});
