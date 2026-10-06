import { describe, it, expect } from "vitest";
import matter from "gray-matter";
import { addPrereqLinks, toWikilink } from "./prereq-frontmatter";
import { parsePrereqField } from "./prereq-graph";

/** What the site will read back from the edited file. */
const prereqsOf = (text: string) => {
  const fm = matter(text).data as Record<string, unknown>;
  return parsePrereqField(fm.prerequis ?? fm.prerequisites);
};

const note = (fm: string, body = "\n# Titre\n\nTexte.\n") => `---\n${fm}\n---\n${body}`;

describe("toWikilink", () => {
  it("wraps bare targets and keeps existing wikilinks", () => {
    expect(toWikilink("Suites")).toBe("[[Suites]]");
    expect(toWikilink("A/B/Note.md")).toBe("[[A/B/Note]]");
    expect(toWikilink("[[Note|alias]]")).toBe("[[Note|alias]]");
    expect(toWikilink(' "[[Note]]" ')).toBe("[[Note]]");
  });
});

describe("addPrereqLinks — flow lists", () => {
  it("appends inside a quoted flow list, leaving the rest untouched", () => {
    const src = note('title: "Suites"\nprerequis: ["[[Fonctions]]"]\ntags: [maths]');
    const r = addPrereqLinks(src, ["Limites et Continuité"]);
    expect(r.added).toEqual(["[[Limites et Continuité]]"]);
    expect(r.text).toBe(
      note('title: "Suites"\nprerequis: ["[[Fonctions]]", "[[Limites et Continuité]]"]\ntags: [maths]'),
    );
    expect(prereqsOf(r.text)).toEqual(["Fonctions", "Limites et Continuité"]);
  });

  it("fills an empty flow list", () => {
    const r = addPrereqLinks(note("prerequis: []"), ["A", "B"]);
    expect(r.text).toBe(note('prerequis: ["[[A]]", "[[B]]"]'));
  });

  it("keeps a trailing comment and handles a trailing comma", () => {
    const r = addPrereqLinks(note('prerequis: ["[[A]]",] # à revoir'), ["B"]);
    expect(r.text).toBe(note('prerequis: ["[[A]]", "[[B]]"] # à revoir'));
    expect(prereqsOf(r.text)).toEqual(["A", "B"]);
  });

  it("handles single-quoted and plain entries", () => {
    const r = addPrereqLinks(note("prerequis: ['[[A]]', Lycée/B]"), ["C"]);
    expect(r.text).toBe(note("prerequis: ['[[A]]', Lycée/B, \"[[C]]\"]"));
    expect(prereqsOf(r.text)).toEqual(["A", "Lycée/B", "C"]);
  });

  it("handles a flow list spread over several lines", () => {
    const src = note('prerequis: [\n  "[[A]]",\n  "[[B]]"\n]\ntitle: x');
    const r = addPrereqLinks(src, ["C"]);
    expect(prereqsOf(r.text)).toEqual(["A", "B", "C"]);
    expect(matter(r.text).data.title).toBe("x");
  });
});

describe("addPrereqLinks — block lists", () => {
  it("appends a `- ` item with the same indentation and quoting", () => {
    const src = note('title: x\nprerequis:\n  - "[[A]]"\n  - "[[B]]"\ndate: 2024-01-01');
    const r = addPrereqLinks(src, ["C"]);
    expect(r.text).toBe(note('title: x\nprerequis:\n  - "[[A]]"\n  - "[[B]]"\n  - "[[C]]"\ndate: 2024-01-01'));
  });

  it("follows unquoted and single-quoted items", () => {
    expect(addPrereqLinks(note("prerequis:\n- [[A]]"), ["B"]).text).toBe(note("prerequis:\n- [[A]]\n- [[B]]"));
    expect(addPrereqLinks(note("prerequis:\n  - '[[A]]'"), ["B"]).text).toBe(
      note("prerequis:\n  - '[[A]]'\n  - '[[B]]'"),
    );
  });

  it("is read back by the site", () => {
    const r = addPrereqLinks(note("prerequis:\n  - [[A]]\nother: 1"), ["B", "C"]);
    expect(prereqsOf(r.text)).toEqual(["A", "B", "C"]);
  });

  it("accepts the English key", () => {
    const r = addPrereqLinks(note('prerequisites:\n  - "[[A]]"'), ["B"]);
    expect(r.text).toBe(note('prerequisites:\n  - "[[A]]"\n  - "[[B]]"'));
  });
});

describe("addPrereqLinks — scalars", () => {
  it("turns a quoted scalar into a flow list, keeping the original token", () => {
    const r = addPrereqLinks(note('prerequis: "[[A]], [[B]]"'), ["C"]);
    expect(r.text).toBe(note('prerequis: ["[[A]], [[B]]", "[[C]]"]'));
    expect(prereqsOf(r.text)).toEqual(["A", "B", "C"]);
  });

  it("rewrites bare (nested-list) wikilinks", () => {
    const r = addPrereqLinks(note("prerequis: [[A]]"), ["B"]);
    expect(r.text).toBe(note('prerequis: ["[[A]]", "[[B]]"]'));
  });

  it("quotes a plain scalar", () => {
    const r = addPrereqLinks(note("prerequis: Lycée/Suites"), ["B"]);
    expect(prereqsOf(r.text)).toEqual(["Lycée/Suites", "B"]);
  });

  it("fills an empty value", () => {
    expect(addPrereqLinks(note("prerequis:\ntitle: x"), ["A"]).text).toBe(note('prerequis: ["[[A]]"]\ntitle: x'));
    expect(addPrereqLinks(note("prerequis: ~"), ["A"]).text).toBe(note('prerequis: ["[[A]]"]'));
  });
});

describe("addPrereqLinks — absent field / frontmatter", () => {
  it("appends the field as the frontmatter's last line", () => {
    const r = addPrereqLinks(note('title: "x"\ntags: [a]'), ["A"]);
    expect(r.text).toBe(note('title: "x"\ntags: [a]\nprerequis: ["[[A]]"]'));
  });

  it("creates a frontmatter when there is none", () => {
    const r = addPrereqLinks("# Titre\n\nTexte.\n", ["A"]);
    expect(r.text).toBe('---\nprerequis: ["[[A]]"]\n---\n# Titre\n\nTexte.\n');
    expect(prereqsOf(r.text)).toEqual(["A"]);
  });

  it("does not mistake a body `prerequis:` line for the field", () => {
    const src = note("title: x", "\nprerequis: dans le texte\n");
    const r = addPrereqLinks(src, ["A"]);
    expect(r.text).toBe(note('title: x\nprerequis: ["[[A]]"]', "\nprerequis: dans le texte\n"));
  });
});

describe("addPrereqLinks — duplicates", () => {
  it("skips links already listed, case-insensitively and across spellings", () => {
    const src = note('prerequis: ["[[Fonctions|les fonctions]]", "[[Maths/Suites]]"]');
    const r = addPrereqLinks(src, ["fonctions", "[[Suites]]", "Limites", "Limites"]);
    expect(r.added).toEqual(["[[Limites]]"]);
    expect(r.skipped).toEqual(["[[fonctions]]", "[[Suites]]", "[[Limites]]"]);
    expect(prereqsOf(r.text)).toEqual(["Fonctions", "Maths/Suites", "Limites"]);
  });

  it("returns the source unchanged when nothing is new", () => {
    const src = note("prerequis:\n  - [[A]]");
    const r = addPrereqLinks(src, ["A"]);
    expect(r.text).toBe(src);
    expect(r.added).toEqual([]);
  });

  it("does not treat two different paths with the same basename as one", () => {
    const r = addPrereqLinks(note('prerequis: ["[[X/notes]]"]'), ["Y/notes"]);
    expect(r.added).toEqual(["[[Y/notes]]"]);
  });
});

describe("addPrereqLinks — byte preservation", () => {
  it("keeps CRLF line endings everywhere", () => {
    const src = '---\r\ntitle: x\r\nprerequis:\r\n  - "[[A]]"\r\n---\r\n\r\nTexte\r\n';
    const r = addPrereqLinks(src, ["B"]);
    expect(r.text).toBe('---\r\ntitle: x\r\nprerequis:\r\n  - "[[A]]"\r\n  - "[[B]]"\r\n---\r\n\r\nTexte\r\n');
  });

  it("keeps CRLF when adding to a flow list or an absent field", () => {
    expect(addPrereqLinks('---\r\nprerequis: ["[[A]]"]\r\n---\r\nx', ["B"]).text).toBe(
      '---\r\nprerequis: ["[[A]]", "[[B]]"]\r\n---\r\nx',
    );
    expect(addPrereqLinks("---\r\ntitle: x\r\n---\r\nx", ["B"]).text).toBe(
      '---\r\ntitle: x\r\nprerequis: ["[[B]]"]\r\n---\r\nx',
    );
  });

  it("keeps a BOM and everything around the field", () => {
    const src = '﻿---\ntitle: x # commentaire\nprerequis: ["[[A]]"]\n\n# note\nweird:   spacing\n---\nbody';
    const r = addPrereqLinks(src, ["B"]);
    expect(r.text).toBe(
      '﻿---\ntitle: x # commentaire\nprerequis: ["[[A]]", "[[B]]"]\n\n# note\nweird:   spacing\n---\nbody',
    );
  });

  it("escapes quotes in new entries", () => {
    const r = addPrereqLinks(note("prerequis: []"), ['Le "vrai" titre']);
    expect(prereqsOf(r.text)).toEqual(['Le "vrai" titre']);
  });
});
