import { describe, it, expect } from "vitest";
import { unified } from "unified";
import rehypeStringify from "rehype-stringify";
import { fromHtml } from "hast-util-from-html";
import type { Root } from "hast";
import {
  acceptableTerm,
  buildMatcher,
  definitionAnchor,
  definitionTerm,
  definitionText,
  entriesForNote,
  extractDefinitions,
  firstMatch,
  glossaryDiscipline,
  isDefinitionTitle,
  rehypeGlossary,
  termPattern,
  texToText,
  type GlossaryEntry,
} from "./glossary";

const entry = (term: string, over: Partial<GlossaryEntry> = {}): GlossaryEntry => ({
  term,
  def: `Définition de ${term}.`,
  href: `/posts/maths/def/#${definitionAnchor(term)}`,
  noteTitle: "Def",
  noteUrl: "/posts/maths/def/",
  discipline: "Applied Sciences/Mathematics",
  ...over,
});

describe("definitionTerm", () => {
  it("reads the term from an explicit 'Définition — X' title", () => {
    expect(definitionTerm("abstract", "Définition — Matrice de passage")).toBe(
      "Matrice de passage",
    );
    expect(definitionTerm("important", "Définition -- Wronskien")).toBe("Wronskien");
    expect(definitionTerm("abstract", "Définition – Suite de Cauchy")).toBe(
      "Suite de Cauchy",
    );
    expect(definitionTerm("note", "Définition : Famille libre")).toBe("Famille libre");
  });
  it("takes a [!definition] callout's title as the term", () => {
    expect(definitionTerm("definition", "Primitive")).toBe("Primitive");
    expect(definitionTerm("definition", "Définition")).toBeNull();
  });
  it("ignores bare 'Définition' titles and other callouts", () => {
    expect(definitionTerm("abstract", "Définition")).toBeNull();
    expect(definitionTerm("abstract", "Théorème — Taylor-Young")).toBeNull();
    expect(definitionTerm("important", "Idée clé")).toBeNull();
  });
  it("drops parentheticals and refuses math or ambiguous words", () => {
    expect(
      definitionTerm("abstract", "Définition — Isométrie vectorielle (automorphisme orthogonal)"),
    ).toBe("Isométrie vectorielle");
    expect(definitionTerm("abstract", "Définition — Limite en $+\\infty$")).toBeNull();
    expect(definitionTerm("abstract", "Définition — Somme")).toBeNull();
    expect(definitionTerm("important", "Définition — Équation cartésienne")).toBeNull();
  });
});

describe("acceptableTerm / isDefinitionTitle", () => {
  it("rejects too short, too long or markup-bearing terms", () => {
    expect(acceptableTerm("abc")).toBe(false);
    expect(acceptableTerm("un deux trois quatre cinq six")).toBe(false);
    expect(acceptableTerm("x = 2")).toBe(false);
    expect(acceptableTerm("Matrice")).toBe(true);
  });
  it("recognises definition callouts, titled or bare", () => {
    expect(isDefinitionTitle("abstract", "Définition")).toBe(true);
    expect(isDefinitionTitle("abstract", "Définitions")).toBe(true);
    expect(isDefinitionTitle("important", "Définition — Loi normale")).toBe(true);
    expect(isDefinitionTitle("definition", "")).toBe(true);
    expect(isDefinitionTitle("important", "Définitivement")).toBe(false);
  });
});

describe("texToText / definitionText", () => {
  it("turns common TeX into readable symbols", () => {
    expect(texToText("a \\in \\mathbb{R}")).toBe("a ∈ ℝ");
    expect(texToText("\\text{Re}(z)")).toBe("Re(z)");
    expect(texToText("\\det(A) \\neq 0")).toBe("det (A) ≠ 0");
  });
  it("elides matrices and long display formulas, keeps short ones", () => {
    expect(
      definitionText("Un tableau :\n$$A = \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$$"),
    ).toBe("Un tableau : …");
    expect(definitionText("Elle vaut :\n$$x \\in \\mathbb{R}$$")).toBe("Elle vaut : x ∈ ℝ");
  });
  it("strips markdown and truncates on a word", () => {
    const md = "Une **matrice** $A$ est un tableau. " + "mot ".repeat(100);
    const out = definitionText(md, 60);
    expect(out.startsWith("Une matrice A est un tableau.")).toBe(true);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(61);
  });
});

describe("extractDefinitions", () => {
  it("collects titled definition callouts with their body", () => {
    const body = [
      "> [!abstract] Définition — Famille libre",
      "> Une famille est **libre** si $\\lambda_i = 0$.",
      "",
      "> [!abstract] Définition",
      "> Un entier est **premier** si…",
      "",
      "> [!tip] Méthode",
      "> Rien.",
    ].join("\n");
    expect(extractDefinitions(body)).toEqual([
      { term: "Famille libre", def: "Une famille est libre si λi = 0." },
    ]);
  });
});

describe("termPattern / firstMatch", () => {
  const re = (t: string) => new RegExp(termPattern(t), "u");
  it("matches sentence case, plurals and both apostrophes", () => {
    expect(re("Matrice de passage").test("les matrices de passage")).toBe(true);
    expect(re("Famille libre").test("Des familles libres")).toBe(true);
    expect(re("Classe d'équivalence").test("la classe d’équivalence")).toBe(true);
  });
  it("respects word boundaries and the rest of the casing", () => {
    expect(re("Matrice").test("matriciel")).toBe(false);
    expect(re("Projecteur").test("rétroprojecteur")).toBe(false);
    expect(re("Suite de Cauchy").test("suite de cauchy")).toBe(false);
    expect(re("Espace vectoriel").test("sous-espace vectoriel")).toBe(false);
  });
  it("prefers the earliest, then the longest match", () => {
    const m = buildMatcher([entry("Loi normale"), entry("Loi normale centrée réduite")]);
    const hit = firstMatch("Z suit la loi normale centrée réduite.", m, new Set());
    expect(hit).toMatchObject({ entry: 1, index: 10 });
  });
});

describe("glossaryDiscipline / entriesForNote", () => {
  it("is the level-2 folder", () => {
    expect(glossaryDiscipline("Applied Sciences/Mathematics/Math Sup/Intégration")).toBe(
      "Applied Sciences/Mathematics",
    );
    expect(glossaryDiscipline("Applied Sciences/Mathematics")).toBe("Applied Sciences");
  });
  it("keeps the same discipline, skips own terms, picks the nearest definer", () => {
    const all = [
      entry("Produit scalaire", { noteUrl: "/posts/m/lycee/geo/" }),
      entry("Produit scalaire", { noteUrl: "/posts/m/sup/eucl/" }),
      entry("Matrice", { noteUrl: "/posts/m/sup/mat/" }),
      entry("Allèle", { discipline: "Applied Sciences/Biology" }),
    ];
    const got = entriesForNote(all, "/posts/m/sup/spe/", "Applied Sciences/Mathematics");
    expect(got.map((e) => [e.term, e.noteUrl])).toEqual([
      ["Produit scalaire", "/posts/m/sup/eucl/"],
      ["Matrice", "/posts/m/sup/mat/"],
    ]);
    expect(
      entriesForNote(all, "/posts/m/sup/mat/", "Applied Sciences/Mathematics").map((e) => e.term),
    ).toEqual(["Produit scalaire"]);
  });
});

describe("rehypeGlossary", () => {
  const run = (html: string, entries: GlossaryEntry[]) => {
    const proc = unified().use(rehypeGlossary, entries).use(rehypeStringify);
    const tree = proc.runSync(fromHtml(html, { fragment: true }));
    return proc.stringify(tree as Root);
  };

  it("marks the first body occurrence only, never in headings/links/code/math", () => {
    const out = run(
      '<h2>Matrice</h2><p><a href="/x">matrice</a> <code>matrice</code> <span class="katex">matrice</span> Une matrice et une matrice.</p>',
      [entry("Matrice")],
    );
    expect(out.match(/class="gloss"/g)?.length).toBe(1);
    expect(out).toContain('Une <a class="gloss" href="/posts/maths/def/#def-matrice"');
    expect(out).toContain('data-gloss-def="Définition de Matrice."');
    expect(out).toContain("<h2>Matrice</h2>");
  });

  it("leaves definition callouts and quiz cards alone", () => {
    const out = run(
      '<div class="callout" data-definition=""><p>Une matrice.</p></div><div class="callout callout-quiz"><p>matrice</p></div><p>La matrice.</p>',
      [entry("Matrice")],
    );
    expect(out).toContain("<p>Une matrice.</p>");
    expect(out).toContain('La <a class="gloss"');
  });

  it("marks several terms in the same text node", () => {
    const out = run("<p>Une famille libre dans un espace vectoriel.</p>", [
      entry("Espace vectoriel"),
      entry("Famille libre"),
    ]);
    expect(out.match(/class="gloss"/g)?.length).toBe(2);
  });

  it("is a no-op without entries", () => {
    expect(run("<p>Une matrice.</p>", [])).toBe("<p>Une matrice.</p>");
  });
});
