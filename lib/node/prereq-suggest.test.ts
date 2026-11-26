import { describe, expect, it } from "vitest";
import {
  folderOrder,
  introEnd,
  isHub,
  prereqYaml,
  sameCollection,
  scanLinks,
  suggestPrereqs,
  titleYear,
  type SuggestNote,
} from "./prereq-suggest";

const cueOf = (body: string, target: string) =>
  scanLinks(body).find((l) => l.target === target);

describe("introEnd / intro detection", () => {
  it("skips the leading H1 and stops at the first section heading", () => {
    const body =
      "# Titre\n\nIntro avec [[A]].\n\n## Section\n\nPlus loin [[B]].";
    expect(body.slice(0, introEnd(body))).toContain("[[A]]");
    expect(cueOf(body, "A")?.intro).toBe(true);
    expect(cueOf(body, "B")?.intro).toBe(false);
  });
  it("caps a heading-less note", () => {
    const body = "x".repeat(3000) + " [[Late]]";
    expect(cueOf(body, "Late")?.intro).toBe(false);
  });
});

describe("scanLinks cues", () => {
  it("reads prior cues, including link lists after them", () => {
    expect(cueOf("Prérequis : [[A]], [[B]]", "B")?.cue).toBe("prior");
    expect(
      cueOf(
        "les protections modernes vues en [[Binary Exploitation]]",
        "Binary Exploitation",
      )?.cue,
    ).toBe("prior");
    expect(
      cueOf(
        "Déjà introduit dans [[Prompt Engineering]] — approfondi ici",
        "Prompt Engineering",
      )?.cue,
    ).toBe("prior");
    expect(
      cueOf("Cette note prolonge [[Arithmétique]] (Math Sup)", "Arithmétique")
        ?.cue,
    ).toBe("prior");
  });
  it("reads a Prérequis callout or section for the links under it", () => {
    expect(cueOf("> [!quote] Prérequis\n> [[A]], [[B]]", "B")?.cue).toBe(
      "prior",
    );
    expect(cueOf("## Voir aussi\n\n- [[A]]", "A")?.cue).toBe("away");
    expect(cueOf("## À lire ensuite\n\n- [[A]]", "A")?.cue).toBe("next");
  });
  it("tells forward and sideways pointers apart from plain 'voir'", () => {
    expect(
      cueOf("Avant le [[CNN]], le [[GAN]], il y a le neurone", "GAN")?.cue,
    ).toBe("next");
    expect(
      cueOf(
        "Elle sert de socle à [[Binary Exploitation]]",
        "Binary Exploitation",
      )?.cue,
    ).toBe("next");
    expect(
      cueOf(
        "les recherches présentées dans [[Sociologie des Migrations]]",
        "Sociologie des Migrations",
      )?.cue,
    ).toBe("away");
    expect(
      cueOf(
        "une sociologie que prolongeront l'école de Chicago et l'[[Interactionnisme]]",
        "Interactionnisme",
      )?.cue,
    ).toBe("next");
    expect(
      cueOf(
        "Contemporain de [[Max Weber]] et d'[[Émile Durkheim]]",
        "Émile Durkheim",
      )?.cue,
    ).toBe("away");
    expect(cueOf("*Voir aussi* : [[A]] | [[B]]", "B")?.cue).toBe("away");
    expect(cueOf("le faux AP (cf. [[Evil Twin]])", "Evil Twin")?.cue).toBe(
      "see",
    );
    expect(cueOf("**Voir**: [[A]] | [[B]]", "B")?.cue).toBe("see");
  });
  it("lets the closest cue win", () => {
    expect(cueOf("Voir aussi la note, déjà vue dans [[A]]", "A")?.cue).toBe(
      "prior",
    );
    expect(cueOf("Prérequis pour la suite : avant le [[A]]", "A")?.cue).toBe(
      "next",
    );
  });
  it("ignores code, embeds and assets", () => {
    const links = scanLinks(
      "```\n[[InCode]]\n```\n![[Embed]] [[photo.png]] `[[inline]]` [[Real]]",
    );
    expect(links.map((l) => l.target)).toEqual(["Real"]);
  });
  it("reads relative markdown note links", () => {
    expect(scanLinks("Voir [la note](../Autre%20Note.md#x)")[0]).toMatchObject({
      kind: "markdown",
      target: "../Autre Note.md",
      cue: "see",
    });
  });
});

describe("path helpers", () => {
  it("orders sibling numbered files and folders", () => {
    expect(folderOrder("S/WiFi/03 - PSK", "S/WiFi/11 - Defense")).toEqual({
      a: "03",
      b: "11",
    });
    expect(
      folderOrder("C/PNPT/02-linux/notes", "C/PNPT/11-privesc/notes"),
    ).toEqual({ a: "02", b: "11" });
    expect(folderOrder("S/WiFi/11 - Defense", "S/WiFi/03 - PSK")).toBeNull();
    expect(folderOrder("S/WiFi/Intro", "S/WiFi/03 - PSK")).toBeNull();
    expect(folderOrder("S/A/01 - x", "S/B/02 - y")).toBeNull();
  });
  it("spots hubs", () => {
    expect(isHub("Sec/WiFi/00 - Index WiFi", "Index WiFi")).toBe(true);
    expect(isHub("Religion/Judaisme/Judaïsme", "Judaïsme")).toBe(true);
    expect(isHub("Garden of Knowledge", "Garden")).toBe(true);
    expect(isHub("Math/Sup/Polynômes", "Polynômes")).toBe(false);
  });
  it("keeps language collections apart", () => {
    const L = "Social Sciences/Languages - Dialects";
    expect(sameCollection(`${L}/Turc/01/A`, `${L}/Arabe/04/B`)).toBe(false);
    expect(sameCollection(`${L}/Arabe/01/A`, `${L}/Arabe/04/B`)).toBe(true);
    expect(sameCollection("Physics/A", "Math/B")).toBe(true);
  });
  it("reads a title's first year", () => {
    expect(titleYear("Max Weber (1864-1920)")).toBe(1864);
    expect(titleYear("Réalisme (XIXe siècle, ~1830-1890)")).toBe(1830);
    expect(titleYear("Thermodynamique")).toBeNull();
  });
  it("writes a YAML flow list of wikilinks", () => {
    expect(prereqYaml(["A", "[[B]]", 'C "x"'])).toBe(
      'prerequis: ["[[A]]", "[[B]]", "[[C \\"x\\"]]"]',
    );
  });
});

describe("suggestPrereqs", () => {
  const note = (
    slug: string,
    links: SuggestNote["links"] = [],
    extra: Partial<SuggestNote> = {},
  ): SuggestNote => ({
    slug,
    title: slug.toUpperCase(),
    rawPath: `Dom/Sub/${slug}`,
    linkName: slug.toUpperCase(),
    prereqTargets: [],
    links,
    ...extra,
  });
  const intro = (slug: string) => ({ slug, intro: true, cue: null });
  const prior = (slug: string) => ({
    slug,
    intro: false,
    cue: "prior" as const,
  });
  const see = (slug: string) => ({ slug, intro: false, cue: "see" as const });

  it("ranks by combined evidence with reasons and a YAML line", () => {
    const { suggestions } = suggestPrereqs(
      [
        note("a"),
        note("b", [intro("a"), prior("a")], { prereqTargets: ["Z"] }),
        note("c", [intro("a")]),
      ],
      [],
    );
    expect(suggestions.map((s) => [s.prereq, s.note, s.confidence])).toEqual([
      ["a", "b", 0.78],
      ["a", "c", 0.45],
    ]);
    expect(suggestions[0].reasons.join(" ")).toMatch(/introduction/);
    expect(suggestions[0].yaml).toBe('prerequis: ["[[Z]]", "[[A]]"]');
  });

  it("needs more than a lone 'voir' or a lone basics title", () => {
    const { suggestions } = suggestPrereqs(
      [note("a", [], { title: "Fondamentaux" }), note("b", [see("a")])],
      [],
    );
    expect(suggestions).toEqual([]);
  });

  it("uses folder order next to a link", () => {
    const { suggestions } = suggestPrereqs(
      [
        note("p", [], { rawPath: "S/WiFi/03 - PSK" }),
        note("d", [{ slug: "p", intro: false, cue: null }], {
          rawPath: "S/WiFi/11 - Defense",
        }),
      ],
      [],
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].reasons).toContain("dossier 03 avant 11");
  });

  it("drops forward and sideways-only mentions, hubs and later thinkers", () => {
    const { suggestions } = suggestPrereqs(
      [
        note("a"),
        note("b", [intro("a"), { slug: "a", intro: false, cue: "next" }]),
        note("c", [{ slug: "a", intro: true, cue: "away" }]),
        note("h", [], { rawPath: "Dom/Sub/00 - Index" }),
        note("d", [intro("h")]),
        note("w", [], { title: "Weber (1864-1920)" }),
        note("t", [intro("w")], { title: "Tocqueville (1805-1859)" }),
      ],
      [],
    );
    expect(suggestions).toEqual([]);
  });

  it("skips edges already there, implied, cycling, or two-way toss-ups", () => {
    const { suggestions, stats } = suggestPrereqs(
      [
        note("a"),
        note("b", [prior("a")]),
        note("c", [prior("a"), prior("b")]),
        note("x", [intro("y")]),
        note("y", [intro("x")]),
        note("z", [intro("c")]),
      ],
      [
        ["a", "b"],
        ["b", "c"],
        ["z", "c"],
      ],
    );
    expect(suggestions).toEqual([]);
    expect(stats).toMatchObject({
      already: 2,
      implied: 1,
      cycle: 1,
      reverse: 2,
    });
  });

  it("keeps the accepted set acyclic and tags the path it extends", () => {
    const { suggestions } = suggestPrereqs(
      [
        note("a", [intro("b")]),
        note("b", [prior("c")]),
        note("c", [intro("a")]),
      ],
      [],
      [{ slug: "p", name: "Parcours P", notes: ["c"] }],
    );
    // c→b (0.6) first, then b→a (0.45, ties by note slug); a→c would then
    // close c→b→a→c.
    expect(suggestions.map((s) => `${s.prereq}>${s.note}`)).toEqual([
      "c>b",
      "b>a",
    ]);
    expect(suggestions[0].path).toEqual({ slug: "p", name: "Parcours P" });
  });
});
