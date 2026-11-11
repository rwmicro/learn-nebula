import { describe, expect, it } from "vitest";
import { starterDecks } from "./deck-starters";

const d = (slug: string, group: string, family: string | null, count: number) => ({ slug, group, family, count, label: slug });

describe("starterDecks", () => {
  const vault = [
    d("toeic", "Anglais", "langues", 16656),
    d("speaking", "Arabe libanais", "langues", 9246),
    d("sample", "Arabe libanais", "langues", 45),
    d("for-ls", "Arabe libanais", "langues", 151),
    d("presidents", "Histoire", "pensee", 78),
    d("figures", "Littérature", "arts", 78),
    d("arts", "Arts", "arts", 1448),
    d("capitales", "Géographie", null, 416),
  ];

  it("offers short decks, one per family, the shortest first", () => {
    expect(starterDecks(vault).map((x) => x.slug)).toEqual(["figures", "presidents", "for-ls"]);
  });

  it("never offers a sample while longer decks remain", () => {
    expect(starterDecks(vault, 5).map((x) => x.slug)).not.toContain("sample");
  });

  it("falls back to long decks when nothing short exists", () => {
    expect(starterDecks([d("a", "A", "langues", 5000), d("b", "B", "langues", 9000)]).map((x) => x.slug)).toEqual(["a", "b"]);
  });

  it("returns at most n decks, each once", () => {
    const out = starterDecks(vault, 20);
    expect(out).toHaveLength(vault.length);
    expect(new Set(out).size).toBe(vault.length);
  });
});
