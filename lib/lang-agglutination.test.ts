import { describe, expect, it } from "vitest";
import { allowed, build, frenchGloss, harmI, type SuffixId } from "./lang-agglutination";

const tr = (root: string, ...chain: SuffixId[]) => build(root, chain, "tr").word;
const az = (root: string, ...chain: SuffixId[]) => build(root, chain, "az").word;

describe("Turkish", () => {
  it("builds the classic chains", () => {
    expect(tr("ev", "pl", "p1s", "loc", "ki")).toBe("evlerimdeki");
    expect(tr("kitap", "pl", "p1p", "abl")).toBe("kitaplarımızdan");
    expect(tr("okul", "loc")).toBe("okulda");
    expect(tr("sokak", "loc")).toBe("sokakta");
  });
  it("possessives from Bases.md (ev)", () => {
    expect(["p1s", "p2s", "p3s", "p1p", "p2p", "p3p"].map((p) => tr("ev", p as SuffixId))).toEqual([
      "evim",
      "evin",
      "evi",
      "evimiz",
      "eviniz",
      "evleri",
    ]);
  });
  it("four-way harmony", () => {
    expect(harmI("göz", "tr")).toBe("ü");
    expect(tr("göz", "p1s")).toBe("gözüm");
    expect(tr("yol", "gen")).toBe("yolun");
    expect(tr("kapı", "p1s")).toBe("kapım");
  });
  it("buffer letters y, n, s after a vowel", () => {
    expect(tr("araba", "acc")).toBe("arabayı");
    expect(tr("araba", "dat")).toBe("arabaya");
    expect(tr("araba", "gen")).toBe("arabanın");
    expect(tr("araba", "p3s")).toBe("arabası");
  });
  it("voicing assimilation of -DA / -DAn", () => {
    expect(tr("kitap", "loc")).toBe("kitapta");
    expect(tr("arkadaş", "abl")).toBe("arkadaştan");
    expect(tr("ev", "abl")).toBe("evden");
  });
  it("final consonant softening before a vowel", () => {
    expect(tr("kitap", "acc")).toBe("kitabı");
    expect(tr("sokak", "acc")).toBe("sokağı");
    expect(tr("çocuk", "p1s")).toBe("çocuğum");
    expect(tr("kitap", "pl")).toBe("kitaplar");
  });
  it("pronominal n after a 3rd-person possessive and after -ki", () => {
    expect(tr("ev", "p3s", "loc")).toBe("evinde");
    expect(tr("ev", "p3s", "acc")).toBe("evini");
    expect(tr("araba", "p3s", "dat")).toBe("arabasına");
    expect(tr("ev", "loc", "ki", "acc")).toBe("evdekini");
    expect(tr("ev", "loc", "ki", "pl", "dat")).toBe("evdekilere");
  });
  it("plural + 3pl possessive reduces to -I", () => {
    expect(tr("ev", "pl", "p3p")).toBe("evleri");
  });
  it("order of slots", () => {
    expect(allowed([], "tr")).toContain("pl");
    expect(allowed(["pl", "p1s"], "tr")).not.toContain("pl");
    expect(allowed(["loc"], "tr")).toEqual(["ki"]);
    expect(allowed(["dat"], "tr")).toEqual([]);
  });
});

describe("Azerbaijani", () => {
  it("ev-lər-im-də from the vault's grammar", () => {
    expect(az("ev", "pl", "p1s", "loc")).toBe("evlərimdə");
    expect(az("ev", "pl", "p1s", "loc", "ki")).toBe("evlərimdəki");
  });
  it("cases of ev (Azéri/03-Grammaire)", () => {
    expect(["gen", "dat", "acc", "loc", "abl"].map((c) => az("ev", c as SuffixId))).toEqual([
      "evin",
      "evə",
      "evi",
      "evdə",
      "evdən",
    ]);
  });
  it("plurals and possessives", () => {
    expect(az("kitab", "pl")).toBe("kitablar");
    expect(az("uşaq", "pl")).toBe("uşaqlar");
    expect(az("ev", "p3p")).toBe("evləri");
  });
  it("no d/t assimilation, accusative -nI after a vowel", () => {
    expect(az("dost", "loc")).toBe("dostda");
    expect(az("küçə", "acc")).toBe("küçəni");
    expect(az("küçə", "dat")).toBe("küçəyə");
    expect(az("maşın", "loc", "ki")).toBe("maşındakı");
  });
  it("q → ğ and k → y before a vowel", () => {
    expect(az("uşaq", "acc")).toBe("uşağı");
    expect(az("çörək", "p1s")).toBe("çörəyim");
  });
});

describe("French gloss", () => {
  it("renders the chain", () => {
    expect(frenchGloss("ev", ["pl", "p1s", "loc", "ki"], "tr")).toBe("ce qui est dans mes maisons");
    expect(frenchGloss("kitap", ["pl", "p1p", "abl"], "tr")).toBe("de nos livres (provenance)");
    expect(frenchGloss("okul", ["loc"], "tr")).toBe("dans l'école");
    expect(frenchGloss("okul", ["p1s"], "tr")).toBe("mon école");
    expect(frenchGloss("göz", ["pl"], "tr")).toBe("les yeux");
    expect(frenchGloss("xyz", [], "tr")).toBeNull();
  });
});
