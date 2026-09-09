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
