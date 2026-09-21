import { describe, it, expect } from "vitest";
// Plain JS on purpose — scripts/render-mermaid.mjs imports it with bare node.
import { normaliseMermaid as n } from "./mermaid-source.js";

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

  // Anything that needs a guess about intent stays untouched — render-mermaid
  // reports it instead of silently drawing something else.
  it("leaves a malformed edge for the author to fix", () => {
    const typo = "Roches -.->|nouveau soulèvement.-> Relief";
    expect(n(typo)).toBe(typo);
  });
});
