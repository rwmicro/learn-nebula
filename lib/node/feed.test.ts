import { describe, it, expect } from "vitest";
import { buildRss, escapeXml, firstParagraph } from "./feed";

describe("escapeXml", () => {
  it("escapes markup and drops forbidden control characters", () => {
    expect(escapeXml(`a & <b> "c" 'd'\u0007`)).toBe(
      "a &amp; &lt;b&gt; &quot;c&quot; &apos;d&apos;",
    );
  });
});

describe("firstParagraph", () => {
  it("skips headings, callouts, code and embeds for the first prose block", () => {
    const body = [
      "# Titre",
      "> [!note] Un encadré qui n'est pas le début du texte.",
      "```js\nconst x = 1;\n\nconst y = 2;\n```",
      "![[schema.png]]",
      "La **permaculture** est une méthode de conception de [[Écosystème|systèmes]] agricoles durables.",
      "Deuxième paragraphe.",
    ].join("\n\n");
    expect(firstParagraph(body)).toBe(
      "La permaculture est une méthode de conception de systèmes agricoles durables.",
    );
  });

  it("truncates on a word boundary", () => {
    const got = firstParagraph("mot ".repeat(200), 50);
    expect(got.length).toBeLessThanOrEqual(51);
    expect(got.endsWith("mot…")).toBe(true);
  });
});

describe("buildRss", () => {
  it("emits an RSS 2.0 channel with escaped, dated items", () => {
    const at = new Date("2026-09-01T12:00:00Z");
    const xml = buildRss(
      {
        title: "T & G",
        link: "https://x.test/",
        self: "https://x.test/feed.xml",
        description: "d",
        language: "fr",
      },
      [{ title: "A < B", url: "https://x.test/posts/a/", at, description: "x & y" }],
    );
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain("<title>T &amp; G</title>");
    expect(xml).toContain("<title>A &lt; B</title>");
    expect(xml).toContain("<pubDate>Tue, 01 Sep 2026 12:00:00 GMT</pubDate>");
    expect(xml).toContain("<lastBuildDate>Tue, 01 Sep 2026 12:00:00 GMT</lastBuildDate>");
    expect(xml).toContain('<guid isPermaLink="false">https://x.test/posts/a/#2026-09-01</guid>');
    expect(xml).toContain("<description>x &amp; y</description>");
  });
});
