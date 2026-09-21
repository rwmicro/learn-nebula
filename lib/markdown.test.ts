import { describe, it, expect } from "vitest";
import { renderMarkdown, extractPlain, truncate } from "./markdown";
import { listVaultAssets, getVaultImage } from "./vault-assets";

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
    const { html } = await renderMarkdown(
      "![clip](https://example.com/demo.mp4)",
    );
    expect(html).toContain("<video");
    expect(html).toContain("controls");
    expect(html).toContain("https://example.com/demo.mp4");
    // No broken <img> for the same src.
    expect(html).not.toContain("<img");
  });

  it("converts ![word](clip.mp3) to a pronunciation player", async () => {
    const { html } = await renderMarkdown(
      "![bonjour](https://example.com/bonjour-fr.mp3)",
    );
    expect(html).toContain('class="pron"');
    expect(html).toContain('class="pron-btn"');
    expect(html).toContain(
      'data-pron-src="https://example.com/bonjour-fr.mp3"',
    );
    expect(html).toContain('class="pron-label"');
    expect(html).toContain("bonjour");
    // No broken <img> for the same src.
    expect(html).not.toContain("<img");
  });

  it("renders an icon-only pronunciation player when there is no alt text", async () => {
    const { html } = await renderMarkdown("![](https://example.com/clip.mp3)");
    expect(html).toContain('class="pron-btn"');
    expect(html).not.toContain('class="pron-label"');
  });

  it("strips script-execution vectors from note-authored raw HTML", async () => {
    const { html } = await renderMarkdown(
      'Text\n\n<script>alert(1)</script>\n\n<img src="x" onerror="alert(2)">\n\n[go](javascript:alert(3))',
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
    // Benign markup survives.
    expect(html).toContain("<img");
    expect(html).toContain("Text");
  });

  it("keeps KaTeX and math placeholders intact through the sanitizer", async () => {
    const { html, hasMath } = await renderMarkdown(
      String.raw`Inline $a^2+b^2$ math.`,
    );
    expect(hasMath).toBe(true);
    expect(html).toContain("katex");
    expect(html).not.toContain("data-ph");
  });
});

describe("figures", () => {
  // Remote URLs keep these independent of content/posts, which is fetched at
  // build time and absent from the unit-test job.
  const IMG = "https://example.com/photo.png";

  it("wraps a standalone image in a figure", async () => {
    const { html } = await renderMarkdown(`![Un schéma](${IMG})`);
    expect(html).toContain('<figure class="note-figure">');
    expect(html).not.toMatch(/<p>\s*<img/);
  });

  it("captions from the title, keeping alt for screen readers", async () => {
    const { html } = await renderMarkdown(
      `![texte alternatif](${IMG} "La légende")`,
    );
    expect(html).toContain("<figcaption>La légende</figcaption>");
    expect(html).toContain('alt="texte alternatif"');
    // The title would otherwise also show as a browser tooltip over the image.
    expect(html).not.toContain('title="La légende"');
  });

  it("falls back to the alt text when there is no title", async () => {
    const { html } = await renderMarkdown(`![Le potager](${IMG})`);
    expect(html).toContain("<figcaption>Le potager</figcaption>");
  });

  it("gives a decorative image no caption", async () => {
    const { html } = await renderMarkdown(`![](${IMG})`);
    expect(html).toContain('<figure class="note-figure">');
    expect(html).not.toContain("<figcaption>");
  });

  it("leaves an image inside a sentence inline", async () => {
    const { html } = await renderMarkdown(`Du texte ![alt](${IMG}) au milieu.`);
    expect(html).not.toContain("<figure");
    expect(html).toContain("<p>");
  });

  it("leaves a paragraph holding two images alone", async () => {
    const { html } = await renderMarkdown(`![a](${IMG}) ![b](${IMG})`);
    expect(html).not.toContain("<figure");
  });

  it("treats an italic line right under the image (no blank line) as its caption", async () => {
    const { html } = await renderMarkdown(
      `![Un schéma](${IMG})\n*La légende écrite à la main.*`,
    );
    expect(html).toContain('<figure class="note-figure">');
    expect(html).toContain(
      "<figcaption>La légende écrite à la main.</figcaption>",
    );
    expect(html).not.toMatch(/<p>\s*<img/);
  });

  it("keeps a link inside the hand-written caption clickable", async () => {
    const { html } = await renderMarkdown(
      `![Un schéma](${IMG})\n*Source : [Wikimedia](https://example.com/wiki).*`,
    );
    expect(html).toContain(
      '<figcaption>Source : <a href="https://example.com/wiki">Wikimedia</a>.</figcaption>',
    );
  });

  it("prefers the hand-written caption over alt text", async () => {
    const { html } = await renderMarkdown(
      `![Texte alternatif](${IMG})\n*La vraie légende.*`,
    );
    expect(html).toContain("<figcaption>La vraie légende.</figcaption>");
    expect(html).not.toContain("<figcaption>Texte alternatif</figcaption>");
  });

  it("does not treat a paragraph with unrelated trailing text as a caption", async () => {
    const { html } = await renderMarkdown(`![alt](${IMG})\nDu texte normal.`);
    expect(html).not.toContain("<figure");
  });

  it("captions a promoted video from its aria-label", async () => {
    const { html } = await renderMarkdown(
      "![Une animation](https://example.com/clip.mp4)",
    );
    expect(html).toContain("<video");
    expect(html).toContain("<figcaption>Une animation</figcaption>");
  });

  it("does not turn a pronunciation clip into a figure", async () => {
    const { html } = await renderMarkdown(
      "![mot](https://example.com/clip.mp3)",
    );
    expect(html).toContain('class="pron"');
    expect(html).not.toContain("<figure");
  });
});

describe("Obsidian embeds", () => {
  it("never leaves the embed's bang loose in the prose", async () => {
    // The old behaviour emitted `!` + a link, so an embedded image read as
    // "!photo.png" in the text. An unresolved target stays fully literal.
    const { html } = await renderMarkdown("![[some-missing-file.png]]");
    expect(html).not.toMatch(/>!<a /);
  });

  // `![[file.png]]` resolves against the real vault (content/posts), fetched at
  // build time and absent from the unit-test job — so assert against whatever
  // image the vault actually has, and skip when there is none.
  const asset = listVaultAssets().find((a) =>
    /\.(png|jpe?g|gif|webp|avif)$/i.test(a.rel),
  );

  it.skipIf(!asset)("embeds a vault image as a captioned figure", async () => {
    const name = asset!.rel.split("/").pop()!;
    const { html } = await renderMarkdown(`![[${name}|Une légende]]`);
    expect(html).toContain('<figure class="note-figure">');
    expect(html).toContain(`src="${asset!.url}"`);
    expect(html).toContain("<figcaption>Une légende</figcaption>");
  });

  it.skipIf(!asset)(
    "uses the file name as alt but not as a caption",
    async () => {
      const name = asset!.rel.split("/").pop()!;
      const { html } = await renderMarkdown(`![[${name}]]`);
      expect(html).toContain('<figure class="note-figure">');
      expect(html).toContain(`alt="${name}"`);
      expect(html).not.toContain("<figcaption>");
      // The internal marker must never reach the page.
      expect(html).not.toContain("alt-is-filename");
    },
  );

  it.skipIf(!asset)(
    "reads a numeric alias as a width, not a caption",
    async () => {
      const name = asset!.rel.split("/").pop()!;
      const { html } = await renderMarkdown(`![[${name}|300]]`);
      expect(html).toContain('width="300"');
      expect(html).not.toContain("<figcaption>300</figcaption>");
    },
  );
});

describe("responsive images", () => {
  // Variants come from content/vault-images.json, written by
  // build-image-variants.mjs — absent in the unit-test job, so assert the
  // contract in both states rather than requiring a built vault.
  const asset = listVaultAssets().find((a) =>
    /\.(png|jpe?g|webp)$/i.test(a.rel),
  );
  const meta = asset ? getVaultImage(asset.url) : null;

  it("falls back to a plain <img> when there is no manifest entry", async () => {
    const { html } = await renderMarkdown(
      "![alt](https://example.com/photo.png)",
    );
    // A remote image is never in the manifest: no <picture>, and it must still
    // render rather than disappear.
    expect(html).toContain("<img");
    expect(html).not.toContain("<picture>");
  });

  it.skipIf(!meta)(
    "wraps a vault image in a <picture> with intrinsic size",
    async () => {
      const name = asset!.rel.split("/").pop()!;
      const { html } = await renderMarkdown(`![[${name}|Une légende]]`);
      expect(html).toContain(`width="${meta!.w}"`);
      expect(html).toContain(`height="${meta!.h}"`);
      if (meta!.avif.length) {
        expect(html).toContain("<picture>");
        expect(html).toContain('type="image/avif"');
        expect(html).toContain("srcset=");
        // The figure still forms around the picture, caption included.
        expect(html).toContain('<figure class="note-figure">');
        expect(html).toContain("<figcaption>Une légende</figcaption>");
      }
    },
  );
});
