import { describe, it, expect } from "vitest";
import { escapeHtml, encodeSlug, growthHtml, localGraphHtml } from "./html";

describe("escapeHtml", () => {
  it("escapes the four HTML-significant characters", () => {
    expect(escapeHtml("&")).toBe("&amp;");
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml(">")).toBe("&gt;");
    expect(escapeHtml('"')).toBe("&quot;");
  });

  it("neutralises a script/attribute injection attempt", () => {
    expect(escapeHtml('<img src="x" onerror="alert(1)">')).toBe(
      "&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;",
    );
  });

  it("escapes & first so entities are not double-encoded", () => {
    // If < were escaped before &, the resulting &lt; would become &amp;lt;.
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml("a & b < c")).toBe("a &amp; b &lt; c");
  });

  it("leaves safe text untouched", () => {
    expect(escapeHtml("Les jardins de la mémoire")).toBe(
      "Les jardins de la mémoire",
    );
  });
});

describe("encodeSlug", () => {
  it("percent-encodes segments but keeps the slashes", () => {
    expect(encodeSlug("arts/la mémoire")).toBe("arts/la%20m%C3%A9moire");
  });

  it("is a no-op on already-safe slugs", () => {
    expect(encodeSlug("applied-sciences/notes")).toBe("applied-sciences/notes");
  });
});

describe("growthHtml", () => {
  const planted = new Date("2024-03-04T00:00:00Z");
  const tended = new Date("2026-09-10T00:00:00Z");

  it("renders nothing when the note declares neither stage nor update", () => {
    expect(growthHtml(undefined, planted, undefined)).toBe("");
  });

  it("renders the stage badge on its own", () => {
    const html = growthHtml("seedling", planted, undefined);
    expect(html).toContain("growth-seedling");
    expect(html).not.toContain("growth-tended");
  });

  it("renders the tending date when it differs from the planting date", () => {
    const html = growthHtml(undefined, planted, tended);
    expect(html).toContain("growth-tended");
    expect(html).toContain(tended.toISOString());
    expect(html).toContain("data-i18n-date");
  });

  it("omits the tending date when the note was tended the day it was planted", () => {
    expect(
      growthHtml(undefined, planted, new Date("2024-03-04T18:00:00Z")),
    ).toBe("");
  });

  it("links the note's history, separated from the stage", () => {
    const html = growthHtml("seedling", planted, undefined, "https://github.com/o/r/commits/main/A%20B.md");
    expect(html).toContain('class="growth-history"');
    expect(html).toContain("https://github.com/o/r/commits/main/A%20B.md");
    expect(html).toContain("growth-sep");
  });
});

describe("localGraphHtml", () => {
  const ref = (title: string, slug: string) => ({ title, slug });

  it("renders nothing for a note with no neighbours", () => {
    expect(localGraphHtml({ incoming: [], outgoing: [] })).toBe("");
  });

  it("links both directions", () => {
    const html = localGraphHtml({
      incoming: [ref("Compost", "jardin/compost")],
      outgoing: [ref("Semis", "jardin/semis")],
    });
    expect(html).toContain('href="/posts/jardin/compost/"');
    expect(html).toContain('href="/posts/jardin/semis/"');
    expect(html).toContain("<svg");
  });

  it("caps each side and says how many were left out", () => {
    const many = Array.from({ length: 11 }, (_, i) =>
      ref(`Note ${i}`, `n/${i}`),
    );
    const html = localGraphHtml({ incoming: many, outgoing: [] });
    // 8 shown, 3 folded into the overflow label.
    expect(html.match(/href="\/posts\//g)).toHaveLength(8);
    expect(html).toContain("lg-more");
  });

  it("escapes titles rather than trusting them as markup", () => {
    const html = localGraphHtml({
      incoming: [ref('<img src=x onerror="alert(1)">', "x")],
      outgoing: [],
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
