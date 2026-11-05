import { describe, it, expect } from "vitest";
import { markdownToHtml } from "./markdown-lite";

describe("markdownToHtml", () => {
  it("renders bold, italic, and inline code", () => {
    expect(markdownToHtml("**gras** et *italique* et `code`")).toBe(
      "<p><strong>gras</strong> et <em>italique</em> et <code>code</code></p>",
    );
  });

  it("renders a bullet list", () => {
    expect(markdownToHtml("- un\n- deux")).toBe("<ul><li>un</li><li>deux</li></ul>");
  });

  it("renders a numbered list", () => {
    expect(markdownToHtml("1. un\n2. deux")).toBe("<ol><li>un</li><li>deux</li></ol>");
  });

  it("renders http(s) and root-relative links, ignoring other schemes", () => {
    expect(markdownToHtml("[note](/posts/foo/)")).toBe('<p><a href="/posts/foo/">note</a></p>');
    expect(markdownToHtml("[site](https://example.com)")).toBe(
      '<p><a href="https://example.com">site</a></p>',
    );
    expect(markdownToHtml("[bad](javascript:alert(1))")).toBe(
      "<p>[bad](javascript:alert(1))</p>",
    );
  });

  it("joins single newlines within a paragraph with <br>", () => {
    expect(markdownToHtml("ligne 1\nligne 2")).toBe("<p>ligne 1<br>ligne 2</p>");
  });

  it("splits on a blank line into separate paragraphs", () => {
    expect(markdownToHtml("premier\n\nsecond")).toBe("<p>premier</p><p>second</p>");
  });

  it("escapes HTML before recognising any Markdown pattern (no injection)", () => {
    expect(markdownToHtml("<script>alert(1)</script>")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
    // An attacker-controlled string shaped like a link target still only ever
    // produces the literal, escaped text — never a real anchor tag — because
    // escaping runs before the link pattern is matched (the escaped `"` also
    // breaks the URL pattern itself, so this never becomes a link at all).
    expect(markdownToHtml('[x](/a" onmouseover="alert(1))')).toBe(
      "<p>[x](/a&quot; onmouseover=&quot;alert(1))</p>",
    );
  });
});

describe("markdownToHtml hooks", () => {
  const math = (t: string, d: boolean) => `<m${d ? " d" : ""}>${t}</m>`;
  it("hands formulas to math() before escaping", () => {
    expect(markdownToHtml("Le poids $P = m g$ et $$a<b$$", { math })).toBe(
      "<p>Le poids <m>P = m g</m> et <m d>a<b</m></p>",
    );
    expect(markdownToHtml("\\(x\\) puis \\[y\\]", { math })).toBe("<p><m>x</m> puis <m d>y</m></p>");
  });
  it("leaves prices and code alone", () => {
    expect(markdownToHtml("5 $ et 10 $", { math })).toBe("<p>5 $ et 10 $</p>");
    expect(markdownToHtml("`$x$`", { math })).toBe("<p><code>$x$</code></p>");
    expect(markdownToHtml("$x$")).toBe("<p>$x$</p>");
  });
  it("turns [n] into cite() output, only for known sources", () => {
    const cite = (n: number) => (n <= 2 ? `<c>${n}</c>` : null);
    expect(markdownToHtml("Vrai [1]. Aussi [1, 2]. Pas [3].", { cite })).toBe(
      "<p>Vrai<c>1</c>. Aussi<c>1</c><c>2</c>. Pas [3].</p>",
    );
    expect(markdownToHtml("[1](/posts/x/)", { cite })).toBe('<p><a href="/posts/x/">1</a></p>');
  });
  it("never lets math() output be re-escaped or a slot be forged", () => {
    expect(markdownToHtml("a\u00000\u0000b", { math })).toBe("<p>a0b</p>");
  });
});
