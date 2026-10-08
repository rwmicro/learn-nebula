import { describe, it, expect } from "vitest";
import { adaptDeckCss, adaptInlineStyles } from "./deck-css";

const S = '[data-deck-scope="d"]';
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

describe("adaptDeckCss", () => {
  it("scopes the deck and drops the card root's frame", () => {
    const out = adaptDeckCss(
      ".card {\n font-family: arial;\n font-size: 20px;\n text-align: center;\n color: black;\n background-color: white;\n}",
      S,
    );
    expect(squash(out)).toBe(
      `@scope (${S}) { .card { font-size: calc(20 * var(--deck-px, 1px)); text-align: center } }`,
    );
  });

  it("reads body and html as the scope root, so nothing leaks onto the page", () => {
    const out = squash(adaptDeckCss("body { background-color: #1a1a1a; color: #fff; padding: 4px } a { color: #cfcfc4 }", S));
    expect(out).toContain(":scope { padding: 4px }");
    expect(out).not.toMatch(/(^|[^-\w])body\b/);
    // A light grey link colour (meant for a dark card) becomes a theme token.
    expect(out).toContain("a { color: var(--ink-2) }");
  });

  it("keeps real fonts, drops plain ones", () => {
    const out = squash(
      adaptDeckCss(
        ".ar { font-family: \"Arial Unicode MS\", Harmattan; } .en { font-family: 'Roboto', 'Helvetica', 'Arial'; font-weight: bold }",
        S,
      ),
    );
    expect(out).toContain('.ar { font-family: "Arial Unicode MS", Harmattan }');
    expect(out).toContain(".en { font-weight: bold }");
  });

  it("scales px and vw font sizes with the card", () => {
    const out = squash(adaptDeckCss(".ar { font-size: 6vw; line-height: 6.5vw } .s { font-size: 16px !important }", S));
    expect(out).toContain(".ar { font-size: 6cqi; line-height: 6.5cqi }");
    expect(out).toContain(".s { font-size: calc(16 * var(--deck-px, 1px)) !important }");
  });

  it("maps neutral greys to theme tokens but keeps hues", () => {
    const out = squash(adaptDeckCss(".a { color: #333 } .b { color: #888 } .c { color: #2980b9 } .d { background: #fff }", S));
    expect(out).toContain(".a { color: var(--ink-2) }");
    expect(out).toContain(".b { color: var(--muted) }");
    expect(out).toContain(".c { color: #2980b9 }");
    expect(out).toContain(".d { background: transparent }");
  });

  it("leaves the text colour of a band whose background the deck keeps", () => {
    const out = squash(adaptDeckCss(".quote { background-color: darkgrey; color: white }", S));
    expect(out).toContain(".quote { background-color: darkgrey; color: white }");
  });

  it("hoists at-rules that can't be scoped and recurses into @media", () => {
    const out = adaptDeckCss(
      "/* x */ .a { color: red }\n@font-face { font-family: X; src: url(x.woff2) }\n@import url('https://f/x.css');\n@media (max-width: 400px) { body { margin: 0 } .b { color: #000 } }",
      S,
    );
    const lines = out.split("\n");
    expect(lines[0]).toBe("@import url('https://f/x.css');");
    expect(lines[1]).toMatch(/^@font-face \{/);
    expect(squash(out)).toContain("@media (max-width: 400px) { :scope { } .b { color: inherit } }");
    expect(out).not.toContain("/* x */");
  });

  it("treats Anki's night-mode selectors as the root", () => {
    const out = squash(
      adaptDeckCss(".night_mode .card, .nightMode .card { background: #1c1c1e; color: #f0ebe3; min-height: 260px } .night_mode .x { color: #e8a838 }", S),
    );
    expect(out).toContain(".night_mode .card, .nightMode .card { min-height: 260px }");
    expect(out).toContain(".night_mode .x { color: #e8a838 }");
  });
});

describe("adaptInlineStyles", () => {
  it("rewrites inline styles like the stylesheet, and keeps the rest", () => {
    expect(
      adaptInlineStyles(
        `<div style='font-family: Arial; font-size: 16px;'>a</div><div style="display:none">b</div><p class="x">c</p>`,
      ),
    ).toBe(
      `<div style='font-size: calc(16 * var(--deck-px, 1px))'>a</div><div style="display: none">b</div><p class="x">c</p>`,
    );
  });
});
