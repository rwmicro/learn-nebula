import { describe, it, expect } from "vitest";
import { escapeHtml, encodeSlug } from "./html";

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
    expect(encodeSlug("applied-sciences/notes")).toBe(
      "applied-sciences/notes",
    );
  });
});
