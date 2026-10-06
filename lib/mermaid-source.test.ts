import { describe, it, expect } from "vitest";
// Plain JS on purpose — scripts/render-mermaid.mjs imports it with bare node.
import fs from "node:fs";
import { normaliseMermaid as n, diagramType, MERMAID_CONFIG } from "./mermaid-source.js";

describe("normaliseMermaid", () => {
  it("turns Obsidian's literal \\n into a line break", () => {
    expect(n("v[Nœud v\\nh]")).toBe('v["Nœud v<br/>h"]');
  });

  it("quotes a node label mermaid would read as syntax", () => {
    expect(n("A[Calcul (approché)]")).toBe('A["Calcul (approché)"]');
  });

  // Measured against mermaid 11: raw parentheses fail inside the cylinder and
  // subroutine shapes exactly as they do in a plain rectangle, and quoting the
  // label inside the shape's own brackets fixes it while keeping the shape.
  it("quotes inside the cylinder and subroutine shapes, keeping the shape", () => {
    expect(n("db[(Base (SQL))]")).toBe('db[("Base (SQL)")]');
    expect(n("s[[Sous-routine (x)]]")).toBe('s[["Sous-routine (x)"]]');
  });

  it("leaves those shapes alone when the label needs nothing", () => {
    expect(n("db[(Base)]")).toBe("db[(Base)]");
    expect(n("s[[Sous-routine]]")).toBe("s[[Sous-routine]]");
  });

  // This is the rule that was missing: an annotated arrow is most of what an
  // explanatory flowchart is made of, and a parenthesis in one killed the
  // whole diagram.
  it("quotes an edge label with parentheses", () => {
    expect(n("A -->|RPO<br/>(données perdues)| B")).toBe(
      'A -->|"RPO<br/>(données perdues)"| B',
    );
  });

  it("leaves a plain edge label unquoted", () => {
    expect(n("A -->|message| B")).toBe("A -->|message| B");
  });

  it("does not double-quote what is already quoted", () => {
    expect(n('A -->|"déjà (quoté)"| B')).toBe('A -->|"déjà (quoté)"| B');
    expect(n('A["déjà (quoté)"]')).toBe('A["déjà (quoté)"]');
  });

  it("quotes a subgraph title with parentheses", () => {
    expect(n("subgraph Formes (glaciaires)")).toBe('subgraph "Formes (glaciaires)"');
  });

  // A bare-pipe version of the rule above quoted the set-cardinality bars in a
  // maths note into nonsense and silently broke three diagrams that had been
  // rendering. Edge labels only ever follow a link, so the rule is anchored to
  // one.
  it("never touches a pipe inside a node label", () => {
    const card = 'Note["|A∪B∪C| = |A|+|B|+|C|<br/>− |A∩B|"]';
    expect(n(card)).toBe(card);
  });

  it("quotes edge labels on every link shape", () => {
    expect(n("A -.->|(bruit)| B")).toBe('A -.->|"(bruit)"| B');
    expect(n("A ==>|(fort)| B")).toBe('A ==>|"(fort)"| B');
    expect(n("A ---|(faible)| B")).toBe('A ---|"(faible)"| B');
  });

  // The rule that broke a live diagram: a French open-interval ends in "[", and
  // the rectangle rule latched onto that bracket, found the "]" of the *next*
  // interval, and wrapped the <br/> between them. Nothing inside a quoted label
  // is syntax, so no rule may enter one.
  it("never reaches inside a label the author already quoted", () => {
    const interval =
      'INV --> |"Hyperbole"| P4["Décroissante sur ]-inf, 0[<br/>sur ]0, +inf["]';
    expect(n(interval)).toBe(interval);
    const card = 'Note["|A∪B∪C| = |A|+|B|+|C|<br/>− |A∩B|"]';
    expect(n(card)).toBe(card);
    const parens = 'A["déjà (quoté) et [crocheté]"]';
    expect(n(parens)).toBe(parens);
  });

  // …while still quoting what is genuinely bare on the same line.
  it("still fixes a bare label beside a quoted one", () => {
    expect(n('A[Calcul (x)] --> B["déjà (quoté)"]')).toBe(
      'A["Calcul (x)"] --> B["déjà (quoté)"]',
    );
  });

  // Anything that needs a guess about intent stays untouched — render-mermaid
  // reports it instead of silently drawing something else.
  it("leaves a malformed edge for the author to fix", () => {
    const typo = "Roches -.->|nouveau soulèvement.-> Relief";
    expect(n(typo)).toBe(typo);
  });
});

describe("timeline", () => {
  it("uses the bare <br> its word-wrapper splits on, not <br/>", () => {
    expect(n("timeline\n    1661 : Boyle\\nThe Sceptical Chymist")).toBe(
      "timeline\n    1661 : Boyle<br>The Sceptical Chymist",
    );
    expect(n("timeline\n  1789 : Lavoisier<br/>masse")).toBe("timeline\n  1789 : Lavoisier<br>masse");
  });

  it("never quotes timeline text", () => {
    const src = "%% frise\ntimeline\n    XVIe siècle : Paracelse (iatrochimie) & co [x]";
    expect(n(src)).toBe(src);
  });

  it("still gives other diagrams <br/>", () => {
    expect(n("flowchart LR\n  A[x\\ny]")).toBe('flowchart LR\n  A["x<br/>y"]');
  });
});

describe("diagramType", () => {
  it("skips blank lines, comments and front matter", () => {
    expect(diagramType("\n%% c\ntimeline\n  a : b")).toBe("timeline");
    expect(diagramType("---\ntitle: x\n---\nflowchart TD")).toBe("flowchart");
  });
});

// The theme once lived only in scripts/render-mermaid.mjs while the client
// fallback kept mermaid's grey "neutral", so the handful of diagrams that fall
// back to the browser came out looking like they belonged to another site.
// Both paths read this object now; these guard the two of them from drifting
// apart again.
describe("MERMAID_CONFIG", () => {
  it("is the themed config, not a mermaid default", () => {
    // Only "base" reads themeVariables — "neutral" silently ignores them.
    expect(MERMAID_CONFIG.theme).toBe("base");
    expect(MERMAID_CONFIG.themeVariables.background).toBe("#fcfcfc");
    expect(MERMAID_CONFIG.securityLevel).toBe("strict");
  });

  it("is the only place either renderer names a theme", () => {
    for (const file of [
      "scripts/render-mermaid.mjs",
      "public/js/mermaid-render.js",
    ]) {
      const src = fs.readFileSync(file, "utf8");
      expect(src, `${file} sets its own theme`).not.toMatch(/theme:\s*["']/);
      expect(src, `${file} does not read the shared config`).toContain(
        "MERMAID_CONFIG",
      );
    }
  });
});
