import { describe, expect, it } from "vitest";
import { openingParagraph, vocabFromMarkdown } from "./home-picks";

describe("openingParagraph", () => {
  it("skips headings and lists for the first prose paragraph", () => {
    const md = `# Titre\n\n## Objectifs\n\n- Nommer les parties du corps\n- Décrire un symptôme\n\nCette fiche réunit le vocabulaire du corps et de la santé, pour se débrouiller chez le médecin et à la pharmacie, et demander de l'aide en cas d'urgence.`;
    expect(openingParagraph(md, 80)).toMatch(/^Cette fiche réunit/);
  });
  it("reads a callout's text without its tag", () => {
    const md = `# Q\n\n1. **Une**\n2. **Deux**\n\n> [!important] Idée clé\n> Correspondance, cohérence et pragmatisme ne sont pas trois réponses concurrentes à la même question.`;
    expect(openingParagraph(md, 40)).toBe("Correspondance, cohérence et pragmatisme ne sont pas trois réponses concurrentes à la même question.");
  });
  it("gives nothing for a note that is only lists and tables", () => {
    expect(openingParagraph("# T\n\n- a\n- b\n\n| a | b |\n|---|---|\n| 1 | 2 |")).toBe("");
  });
  it("ignores short paragraphs and frontmatter", () => {
    expect(openingParagraph("---\ntitle: x\n---\n\nCourt.\n\n" + "Un long paragraphe. ".repeat(10), 100)).toMatch(/^Un long/);
  });
});

describe("vocabFromMarkdown", () => {
  it("reads word, gloss and clip from a two-column table", () => {
    const md = `| Espagnol | Français |\n|---|---|\n| ![noviembre](audio/es_1.mp3) | Novembre |\n| ![No conozco a **nadie** en esta ciudad](audio/es_2.mp3) | Je ne connais personne |`;
    expect(vocabFromMarkdown(md)).toEqual([{ w: "noviembre", g: "Novembre", audio: "audio/es_1.mp3" }]);
  });
  it("finds the French column, the transliteration and the example", () => {
    const md = `| Hindi | Translittération | Français |\n|---|---|---|\n| ![होना](audio/hi.mp3) | honā | Être |\n\n| English | Français | Exemple |\n| :---: | :---: | :--- |\n| ![Yet](audio/en.mp3) | Pourtant | He studied hard, yet he failed |`;
    expect(vocabFromMarkdown(md)).toEqual([
      { w: "होना", g: "Être", audio: "audio/hi.mp3", tr: "honā" },
      { w: "Yet", g: "Pourtant", audio: "audio/en.mp3", ex: "He studied hard, yet he failed" },
    ]);
  });
  it("skips tables without a French column and cells holding several clips", () => {
    const md = `| Trait | Exemple | Nom |\n|---|---|---|\n| ![一](a.mp3) (horizontal) | dans ![一](a.mp3) | héng |\n\n| Formel | Français |\n|---|---|\n| ![a](1.mp3) / ![b](2.mp3) | x |`;
    expect(vocabFromMarkdown(md)).toEqual([]);
  });
});
