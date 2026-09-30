import { describe, expect, it } from "vitest";
import { tagSlug } from "./slug";

describe("tagSlug", () => {
  it("folds accents instead of dropping the letters", () => {
    expect(tagSlug("sécurité")).toBe("securite");
    expect(tagSlug("Économie comportementale")).toBe("economie-comportementale");
  });
  it("merges spellings of one tag", () => {
    expect(tagSlug("Sécurité")).toBe(tagSlug("securite"));
  });
  it("keeps dotted numeric tags readable", () => {
    expect(tagSlug("802.11")).toBe("802-11");
  });
});
