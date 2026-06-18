import { describe, it, expect } from "vitest";
import { renderMarkdown, extractPlain, truncate } from "./markdown";

describe("truncate", () => {
  it("leaves short strings untouched", () => {
    expect(truncate("short", 100)).toBe("short");
  });
  it("cuts on a word boundary and adds an ellipsis", () => {
    const out = truncate("hello world foobar", 9);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toContain("foobar");
  });
});

describe("extractPlain", () => {
  it("strips markdown syntax and footnotes", () => {
    const plain = extractPlain("# Title\n\nHello **world** [link](/x).[^fn:1]\n\n[^fn:1]: note");
    expect(plain).toContain("Hello world link.");
    expect(plain).not.toContain("**");
    expect(plain).not.toContain("note");
  });
});

describe("renderMarkdown", () => {
  it("gives headings an id and an anchor", async () => {
    const { html } = await renderMarkdown("## Intro {#intro}\n\nText.");
    expect(html).toContain('id="intro"');
    expect(html).toContain('class="anchor"');
  });

  it("turns footnotes into margin notes", async () => {
    const { html } = await renderMarkdown("Body[^fn:1]\n\n[^fn:1]: a side note");
    expect(html).toContain('class="side"');
    expect(html).toContain("a side note");
  });

  it("renders inline math with KaTeX", async () => {
    const { html } = await renderMarkdown(String.raw`Euler: \\(e^{i\pi}+1=0\\).`);
    expect(html).toContain("katex");
  });

  it("emits mermaid blocks for client/build rendering", async () => {
    const { html } = await renderMarkdown("```mermaid\nflowchart LR\n A --> B\n```");
    expect(html).toContain('class="mermaid"');
  });

  it("does not treat bash [[ … ]] in code as a wikilink", async () => {
    const { html } = await renderMarkdown("```bash\nif [[ $x -gt 0 ]]; then :; fi\n```");
    expect(html).not.toContain('href="/posts');
    expect(html).toContain("chroma");
  });
});
