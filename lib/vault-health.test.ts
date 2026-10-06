import { describe, expect, it } from "vitest";
import {
  bodyTextLength,
  extractAudioRefs,
  extractNoteLinks,
  isLfsPointer,
  isMostlyEnglish,
  joinNotePath,
  missingFields,
  stopwordScore,
  stripCode,
} from "./vault-health";

describe("extractNoteLinks", () => {
  it("finds wikilinks without alias or heading, including table-escaped aliases", () => {
    const body = [
      "Voir [[Bouddhisme]], [[Religion/Taoïsme|le Tao]] et [[Karma#Origines]].",
      "| a | [[Laïcité\\|laïcité]] |",
      "Transclusion : ![[Autre note]]",
    ].join("\n");
    expect(extractNoteLinks(body)).toEqual([
      { kind: "wikilink", target: "Bouddhisme" },
      { kind: "wikilink", target: "Religion/Taoïsme" },
      { kind: "wikilink", target: "Karma" },
      { kind: "wikilink", target: "Laïcité" },
      { kind: "wikilink", target: "Autre note" },
    ]);
  });

  it("skips assets, same-note anchors and code", () => {
    const body = [
      "![[photo.png]] [[schema.pdf]] [[#Plus bas]]",
      "```bash",
      "[[ -f x ]] && echo [[Pas un lien]]",
      "```",
      "Inline `[[Non plus]]`.",
    ].join("\n");
    expect(extractNoteLinks(body)).toEqual([]);
  });

  it("finds relative markdown links to .md files only", () => {
    const body =
      "[Q1](q01-kernel.md) [ext](https://x.org/a.md) [abs](/posts/x/) " +
      "[ancre](#a) [img](![x](a.png)) [esp](<Ma%20note.md#titre>) ![embed](z.md)";
    expect(extractNoteLinks(body)).toEqual([
      { kind: "markdown", target: "q01-kernel.md" },
      { kind: "markdown", target: "Ma note.md" },
    ]);
  });
});

describe("extractAudioRefs", () => {
  it("collects markdown and wikilink audio embeds", () => {
    const body = "![bonjour](audio/fr_1.mp3) ![[clip.ogg|x]] ![img](a.png) [lien](b.mp3) ![url](https://x/c.mp3)";
    expect(extractAudioRefs(body)).toEqual(["audio/fr_1.mp3", "clip.ogg"]);
  });
});

describe("joinNotePath", () => {
  it("resolves note-relative paths", () => {
    expect(joinNotePath("A/B", "c.md")).toBe("A/B/c");
    expect(joinNotePath("A/B", "../C/d.md")).toBe("A/C/d");
    expect(joinNotePath("", "./e.md")).toBe("e");
  });
});

describe("bodyTextLength", () => {
  it("ignores comments and collapses whitespace", () => {
    expect(bodyTextLength("  a\n\n   b <!-- caché -->  ")).toBe(3);
  });
});

describe("missingFields", () => {
  it("reports absent and blank required fields", () => {
    expect(
      missingFields({ title: "T", domain: " ", subdomain: "S", tags: [], date: new Date() }),
    ).toEqual(["domain", "tags"]);
    expect(missingFields({})).toEqual(["title", "domain", "subdomain", "tags", "date"]);
  });
});

describe("language heuristic", () => {
  const en =
    "The kernel is the core of the system and it manages the hardware. This is what the scheduler does: " +
    "it decides which process will run, when it runs and for how long. These are the basics of the topic, " +
    "and they are also covered by the exam.";
  const fr =
    "Le noyau est le cœur du système et il gère le matériel. C'est ce que fait l'ordonnanceur : il décide " +
    "quel processus sera exécuté, pour combien de temps et dans quel ordre. Les bases sont dans cette note.";

  it("scores stopwords per language", () => {
    const s = stopwordScore(en);
    expect(s.en).toBeGreaterThan(15);
    expect(s.fr).toBe(0);
    expect(stopwordScore(fr).fr).toBeGreaterThan(s.fr);
  });

  it("flags English notes but not French ones quoting English", () => {
    expect(isMostlyEnglish(en)).toBe(true);
    expect(isMostlyEnglish(fr)).toBe(false);
    expect(isMostlyEnglish(`${fr} ${fr} ${fr} « The kernel is the core of the system. »`)).toBe(false);
    expect(isMostlyEnglish("The end.")).toBe(false); // too little text to judge
  });

  it("ignores English inside code blocks", () => {
    expect(stripCode("```\nthe and of to\n```\nfin").trim()).toBe("fin");
    expect(isMostlyEnglish(`${fr}\n\`\`\`\n${en}\n${en}\n\`\`\``)).toBe(false);
  });
});

describe("isLfsPointer", () => {
  it("detects git-lfs pointer stubs", () => {
    expect(isLfsPointer("version https://git-lfs.github.com/spec/v1\noid sha256:abc")).toBe(true);
    expect(isLfsPointer("ID3\u0004")).toBe(false);
  });
});
