import { describe, expect, it } from "vitest";
import {
  analyser,
  attributDangereux,
  compterElements,
  urlDangereuse,
  type Noeud,
} from "./sci-xss";

const E = (
  tag: string,
  attrs: [string, string][] = [],
  enfants: Noeud[] = [],
): Noeud => ({ type: "element", tag, attrs, enfants });
const T = (texte: string): Noeud => ({ type: "texte", texte });

describe("sci-xss", () => {
  it("javascript: URLs, however disguised", () => {
    expect(urlDangereuse("javascript:alert(1)")).toBe(true);
    expect(urlDangereuse("  JaVa\tScRiPt:alert(1)")).toBe(true);
    expect(urlDangereuse("data:text/html,<script>")).toBe(true);
    expect(urlDangereuse("https://exemple.org/javascript:")).toBe(false);
    expect(urlDangereuse("/recherche?q=javascript:")).toBe(false);
  });
  it("event handlers and URL attributes", () => {
    expect(attributDangereux("onerror", "alert(1)")).toBe("gestionnaire");
    expect(attributDangereux("ONCLICK", "x")).toBe("gestionnaire");
    expect(attributDangereux("href", "javascript:x")).toBe("url-js");
    expect(attributDangereux("href", "https://a.b")).toBeNull();
    expect(attributDangereux("title", "javascript:x")).toBeNull();
  });
  it("plain markup is harmless", () => {
    expect(analyser([E("b", [], [T("gras")])])).toEqual([]);
    expect(compterElements([E("b", [], [T("gras")]), T("x")])).toBe(1);
  });
  it("<img onerror> runs on its own, <a href=javascript:> on click", () => {
    const img = analyser([
      E("img", [
        ["src", "x"],
        ["onerror", "alert(1)"],
      ]),
    ]);
    expect(img).toHaveLength(1);
    expect(img[0]).toMatchObject({
      danger: "gestionnaire",
      ou: "img[onerror]",
      executeSeul: true,
    });
    const a = analyser([
      E("a", [["href", "javascript:alert(1)"]], [T("lien")]),
    ]);
    expect(a[0]).toMatchObject({ danger: "url-js", executeSeul: false });
    const s = analyser([E("script", [], [T("alert(1)")])]);
    expect(s[0]).toMatchObject({ danger: "script", executeSeul: false });
    const focus = analyser([
      E("input", [
        ["autofocus", ""],
        ["onfocus", "x()"],
      ]),
    ]);
    expect(focus[0].executeSeul).toBe(true);
    const nested = analyser([E("div", [], [E("svg", [["onload", "x()"]])])]);
    expect(nested[0].ou).toBe("svg[onload]");
  });
});
