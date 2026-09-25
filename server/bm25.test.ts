import { describe, it, expect } from "vitest";
import { Bm25, tokenize } from "./bm25";

describe("tokenize", () => {
  it("folds case and accents", () => {
    expect(tokenize("Présent, bshūf !")).toEqual(["present", "bshuf"]);
  });

  it("drops Arabic harakat so vowelled and bare spellings match", () => {
    expect(tokenize("شفتِ")).toEqual(tokenize("شفت"));
  });

  it("splits Han text per character", () => {
    expect(tokenize("你好 world")).toEqual(["你", "好", "world"]);
  });
});

describe("Bm25", () => {
  const docs = [
    "Le présent se forme avec le préfixe b- : bshūf, btshūf.",
    "La Mecque est un centre de pèlerinage.",
    "Le futur se forme avec rah : rah shūf.",
  ];
  const idx = new Bm25(docs);

  it("ranks the document holding the rare word first", () => {
    expect(idx.search("bshuf", 3)[0].i).toBe(0);
    expect(idx.search("rah", 3)[0].i).toBe(2);
  });

  it("returns nothing for unknown words", () => {
    expect(idx.search("zzz", 3)).toEqual([]);
  });

  it("honours the keep filter", () => {
    const hits = idx.search("forme", 3, (i) => i !== 0);
    expect(hits.map((h) => h.i)).toEqual([2]);
  });

  it("flags matches on rare terms only", () => {
    const big = new Bm25([...Array(200)].map((_, i) => (i === 7 ? "le mot bshuf" : "le mot")));
    const hits = big.search("le bshuf", 5);
    expect(hits[0]).toMatchObject({ i: 7, rare: true });
    expect(hits.slice(1).every((h) => !h.rare)).toBe(true);
  });
});
