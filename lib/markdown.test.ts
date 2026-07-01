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
    const plain = extractPlain(
      "# Title\n\nHello **world** [link](/x).[^fn:1]\n\n[^fn:1]: note",
    );
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
    const { html } = await renderMarkdown(
      "Body[^fn:1]\n\n[^fn:1]: a side note",
    );
    expect(html).toContain('class="side"');
    expect(html).toContain("a side note");
  });

  it("renders inline math with KaTeX", async () => {
    const { html } = await renderMarkdown(
      String.raw`Euler: \\(e^{i\pi}+1=0\\).`,
    );
    expect(html).toContain("katex");
  });

  it("renders $…$ inline math (Obsidian/KaTeX dollar syntax)", async () => {
    const { html, hasMath } = await renderMarkdown(
      String.raw`Ramsey: $R(k,k) > 2^{k/2}$ for large $k$.`,
    );
    expect(hasMath).toBe(true);
    expect(html).toContain("katex");
    expect(html).not.toContain("$R(k");
  });

  it("renders $$…$$ display math", async () => {
    const { html } = await renderMarkdown(String.raw`$$\binom{k}{2}$$`);
    expect(html).toContain("katex-display");
  });

  it("does not treat $ inside code as math", async () => {
    const { html, hasMath } = await renderMarkdown(
      "```bash\necho $PATH and $HOME\n```",
    );
    expect(hasMath).toBe(false);
    expect(html).toContain("chroma");
    expect(html).toContain("PATH");
  });

  it("leaves prose prices ($5, $10) untouched", async () => {
    const { hasMath } = await renderMarkdown("Between $5 and $10 per item.");
    expect(hasMath).toBe(false);
  });

  it("renders an Obsidian callout with title and body", async () => {
    const { html } = await renderMarkdown(
      "> [!warning] Attention\n> Sois prudent.",
    );
    expect(html).toContain('class="callout callout-warning"');
    expect(html).toContain('class="callout-title"');
    expect(html).toContain("Attention");
    expect(html).toContain("Sois prudent");
  });

  it("uses a default label when the callout has no title", async () => {
    const { html } = await renderMarkdown("> [!tip]\n> Un conseil.");
    expect(html).toContain("callout-tip");
    expect(html).toContain("Astuce");
  });

  it("makes +/- callouts foldable", async () => {
    const { html } = await renderMarkdown("> [!note]- Replié\n> caché");
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
  });

  it("emits mermaid blocks for client/build rendering", async () => {
    const { html } = await renderMarkdown(
      "```mermaid\nflowchart LR\n A --> B\n```",
    );
    expect(html).toContain('class="mermaid"');
  });

  it("does not treat bash [[ … ]] in code as a wikilink", async () => {
    const { html } = await renderMarkdown(
      "```bash\nif [[ $x -gt 0 ]]; then :; fi\n```",
    );
    expect(html).not.toContain('href="/posts');
    expect(html).toContain("chroma");
  });

  it("transforms ```manim blocks into a figure with collapsible source", async () => {
    const { html } = await renderMarkdown(
      "```manim\nfrom manim import *\nclass Hello(Scene):\n    def construct(self):\n        self.play(Create(Circle()))\n```",
    );
    // Figure wrapper + missing-render placeholder (no cached file in tests).
    expect(html).toContain('class="manim-figure"');
    expect(html).toContain("data-manim-hash");
    expect(html).toContain("manim-missing");
    // The source is still present in a <details>, syntax-highlighted as Python.
    expect(html).toContain("manim-source");
    expect(html).toContain("<details");
    // The source code text survives.
    expect(html).toContain("Hello");
  });

  it("includes the per-block directive in the hash (different config → different file)", async () => {
    const baseCode =
      "from manim import *\nclass Hello(Scene):\n    def construct(self):\n        pass";
    const a = await renderMarkdown("```manim\n" + baseCode + "\n```");
    const b = await renderMarkdown(
      "```manim\n# manim: quality=h\n" + baseCode + "\n```",
    );
    const hashA = a.html.match(/data-manim-hash="([0-9a-f]+)"/)?.[1];
    const hashB = b.html.match(/data-manim-hash="([0-9a-f]+)"/)?.[1];
    expect(hashA).toBeDefined();
    expect(hashB).toBeDefined();
    expect(hashA).not.toBe(hashB);
  });

  it("converts ![](video.mp4) to a <video> element", async () => {
    const { html } = await renderMarkdown("![clip](https://example.com/demo.mp4)");
    expect(html).toContain("<video");
    expect(html).toContain("controls");
    expect(html).toContain("https://example.com/demo.mp4");
    // No broken <img> for the same src.
    expect(html).not.toContain("<img");
  });
});
