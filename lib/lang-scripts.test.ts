import { describe, expect, it } from "vitest";
import { kabLettersUsed, kabToLatin, kabToTifinagh, uyConvert, uyLettersUsed } from "./lang-scripts";

describe("Uyghur ULY → UEY", () => {
  it("examples from the vault", () => {
    // Ouighour/01-Phonologie/01-Alphabet.md
    expect(uyConvert("alma", "uly", "uey")).toBe("ئالما");
    // Ouighour/00-Sommaire.md: uyghurchä / ئۇيغۇرچە
    expect(uyConvert("uyghurchä", "uly", "uey")).toBe("ئۇيغۇرچە");
    expect(uyConvert("uyghurche", "uly", "uey")).toBe("ئۇيغۇرچە");
  });
  it("hamza only on syllable-initial vowels", () => {
    expect(uyConvert("ata", "uly", "uey")).toBe("ئاتا");
    expect(uyConvert("ikki", "uly", "uey")).toBe("ئىككى");
    expect(uyConvert("köz", "uly", "uey")).toBe("كۆز");
    expect(uyConvert("sa'et", "uly", "uey")).toBe("سائەت");
  });
  it("digraphs ch, sh, gh, ng, zh are one letter", () => {
    expect(uyConvert("chay", "uly", "uey")).toBe("چاي");
    expect(uyConvert("bash", "uly", "uey")).toBe("باش");
    expect(uyConvert("aghiz", "uly", "uey")).toBe("ئاغىز");
    expect(uyConvert("mëning", "uly", "uey")).toBe("مېنىڭ");
    expect(uyConvert("n'g", "uly", "uey")).toBe("نگ");
  });
  it("vault spellings with ä and é", () => {
    expect(uyConvert("räxmät", "uly", "uey")).toBe("رەخمەت");
    expect(uyConvert("yéshil", "uly", "uey")).toBe("يېشىل");
  });
});

describe("Uyghur round trips and Cyrillic", () => {
  it("UEY → ULY", () => {
    expect(uyConvert("ئۇيغۇرچە", "uey", "uly")).toBe("uyghurche");
    expect(uyConvert("سائەت", "uey", "uly")).toBe("sa'et");
    expect(uyConvert("نگ", "uey", "uly")).toBe("n'g");
    expect(uyConvert("قىزىل", "uey", "uly")).toBe("qizil");
  });
  it("ULY ↔ USY", () => {
    expect(uyConvert("uyghur", "uly", "usy")).toBe("уйғур");
    expect(uyConvert("yaxshi", "uly", "usy")).toBe("яхши");
    expect(uyConvert("köz", "uly", "usy")).toBe("көз");
    expect(uyConvert("rexmet", "uly", "usy")).toBe("рәхмәт");
    expect(uyConvert("яхши", "usy", "uly")).toBe("yaxshi");
    expect(uyConvert("Уйғур", "usy", "uey")).toBe("ئۇيغۇر");
  });
  it("round trip through the three scripts", () => {
    for (const w of ["bügün", "tünügün", "qulaq", "yürek", "chong ata", "toqquz", "hajetxana"]) {
      const uey = uyConvert(w, "uly", "uey");
      const usy = uyConvert(uey, "uey", "usy");
      expect(uyConvert(usy, "usy", "uly")).toBe(w);
    }
  });
  it("letters used", () => {
    expect(uyLettersUsed("chay", "uly").map((l) => l.uly)).toEqual(["a", "ch", "y"]);
  });
});

describe("Kabyle", () => {
  it("examples from the vault (Kabyle/02-Communication)", () => {
    expect(kabToTifinagh("Tanemmirt")).toBe("ⵜⴰⵏⴻⵎⵎⵉⵔⵜ");
    expect(kabToTifinagh("yemma")).toBe("ⵢⴻⵎⵎⴰ");
    expect(kabToTifinagh("sin")).toBe("ⵙⵉⵏ");
  });
  it("special letters", () => {
    expect(kabToTifinagh("azul")).toBe("ⴰⵣⵓⵍ");
    expect(kabToTifinagh("axxam")).toBe("ⴰⵅⵅⴰⵎ");
    expect(kabToTifinagh("aγrum")).toBe("ⴰⵖⵔⵓⵎ");
    expect(kabToTifinagh("aɣrum")).toBe("ⴰⵖⵔⵓⵎ");
    expect(kabToTifinagh("tameṭṭut")).toBe("ⵜⴰⵎⴻⵟⵟⵓⵜ");
    expect(kabToLatin("ⵜⴰⵎⴻⵟⵟⵓⵜ")).toBe("tameṭṭut");
  });
  it("letters used", () => {
    expect(kabLettersUsed("azul").map((l) => l.latin)).toEqual(["a", "l", "u", "z"]);
    expect(kabLettersUsed("ⴰⵣⵓⵍ").map((l) => l.tif)).toEqual(["ⴰ", "ⵍ", "ⵓ", "ⵣ"]);
  });
});
