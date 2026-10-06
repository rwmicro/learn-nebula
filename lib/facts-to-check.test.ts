import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { factTarget, groupOpenFacts, parseFactsChecklist } from "./facts-to-check";

// A copy of the vault's sources/a-verifier.md as first written (49 open lines).
const FIXTURE = fs.readFileSync(path.join(__dirname, "__fixtures__", "a-verifier.md"), "utf8");

describe("parseFactsChecklist — the real file", () => {
  const lines = parseFactsChecklist(FIXTURE);

  it("finds every checklist line and nothing else", () => {
    expect(lines).toHaveLength(49);
    expect(lines.every((l) => !l.done)).toBe(true);
    // The format line in the intro is inline code, not a checklist item.
    expect(lines.some((l) => l.target === "Note")).toBe(false);
  });

  it("splits link, claim and sources", () => {
    const first = lines[0];
    expect(first.target).toBe("Exponentielle et Logarithme");
    expect(first.claim).toBe("citation « fonction la plus importante des mathématiques » attribuée à Feynman");
    expect(first.sources).toMatch(/^la formule bien documentée vient de Walter Rudin/);
    expect(first.urls).toEqual([
      "https://ahilado.wordpress.com/2017/01/16/the-most-important-function-in-mathematics/",
    ]);
    expect(first.section).toBe("Mathématiques");
    expect(FIXTURE.split("\n")[first.line - 1]).toContain("Feynman");
  });

  it("keeps vault-path links whole", () => {
    expect(lines.map((l) => l.target)).toContain(
      "Applied Sciences/Computer Science/Software/Security/Certifications/LFCS/notes",
    );
    expect(lines.map((l) => l.target)).toContain(
      "Social Sciences/Languages - Dialects/Indonésien/06-Ressources/Culture",
    );
  });

  it("lines without a URL have none", () => {
    const noUrl = lines.find((l) => l.claim.includes("nombre de chiffres"));
    expect(noUrl?.urls).toEqual([]);
    expect(noUrl?.sources).toMatch(/partie entière/);
  });

  it("groups open lines by note in order of appearance", () => {
    const groups = groupOpenFacts(lines);
    expect(groups[0].target).toBe("Exponentielle et Logarithme");
    expect(groups[0].items).toHaveLength(3);
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(49);
  });
});

describe("parseFactsChecklist — edge cases", () => {
  it("reads done items, aliases, headings and CRLF", () => {
    const md = [
      "## Histoire",
      "- [x] [[Empire byzantin|Byzance]] — date de chute — 1453 (https://example.org/a)",
      "* [ ] [[Note#Section]] — une affirmation — rien",
      "- [X] [[Autre.md]] — b — c",
    ].join("\r\n");
    const lines = parseFactsChecklist(md);
    expect(lines.map((l) => [l.done, l.target, l.section])).toEqual([
      [true, "Empire byzantin", "Histoire"],
      [false, "Note", "Histoire"],
      [true, "Autre", "Histoire"],
    ]);
    expect(lines[0].urls).toEqual(["https://example.org/a"]);
    expect(groupOpenFacts(lines).map((g) => g.target)).toEqual(["Note"]);
  });

  it("does not split hyphenated words or date ranges", () => {
    const [l] = parseFactsChecklist("- [ ] [[N]] — Jean-Paul Sartre, 1914–1918 — source -- autre");
    expect(l.claim).toBe("Jean-Paul Sartre, 1914–1918");
    expect(l.sources).toBe("source — autre");
  });

  it("keeps a line that names no note", () => {
    const [l] = parseFactsChecklist("- [ ] une affirmation sans note — ce qu'on sait");
    expect(l.target).toBeNull();
    expect(l.claim).toBe("une affirmation sans note");
  });

  it("ignores frontmatter, code fences, plain list items and an empty file", () => {
    const md = "---\nnote: \"- [ ] [[X]] — y\"\n---\n```\n- [ ] [[Y]] — z\n```\n- pas une case\n- [ ] [[Z]] — ok";
    expect(parseFactsChecklist(md).map((l) => l.target)).toEqual(["Z"]);
    expect(parseFactsChecklist("")).toEqual([]);
  });

  it("strips trailing punctuation from URLs, keeps parentheses inside them", () => {
    const [l] = parseFactsChecklist(
      "- [ ] [[N]] — c — voir https://en.wikipedia.org/wiki/Mercury_(planet). et https://a.example/x, fin",
    );
    expect(l.urls).toEqual(["https://en.wikipedia.org/wiki/Mercury_(planet)", "https://a.example/x"]);
  });

  it("factTarget cleans a link target", () => {
    expect(factTarget(" A/B.md|alias ")).toBe("A/B");
  });
});
