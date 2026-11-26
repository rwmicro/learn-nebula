import { describe, expect, it } from "vitest";
import { plainText, sanitize } from "../../scripts/anki-html.mjs";

describe("sanitize (Anki card HTML)", () => {
  it("drops scripts and styles, even malformed", () => {
    expect(sanitize("<b>ok</b><script>alert(1)</script>")).toBe("<b>ok</b>");
    expect(sanitize("<p>a</p><script >x</script >")).toBe("<p>a</p>");
    expect(sanitize("<style>body{}</style><i>b</i>")).toBe("<i>b</i>");
    expect(sanitize("<iframe src=x></iframe>c")).toBe("c");
  });
  it("strips event handlers, quoted or bare", () => {
    expect(sanitize("<img src=x onerror=alert(1)>")).toBe('<img src="x">');
    expect(sanitize('<div ONCLICK="x()">t</div>')).toBe("<div>t</div>");
  });
  it("neutralises script URLs", () => {
    expect(sanitize('<a href=" javascript:alert(1)">x</a>')).toBe('<a href="#">x</a>');
    expect(sanitize('<a href="VBScript:x">x</a>')).toBe('<a href="#">x</a>');
  });
  it("keeps ordinary markup", () => {
    expect(sanitize('<div class="c" style="color:red">t<br>u</div>')).toBe(
      '<div class="c" style="color:red">t<br>u</div>',
    );
  });
});

describe("plainText", () => {
  it("decodes entities and turns <br> into spaces", () => {
    expect(plainText("a<br/>b &amp; c&nbsp;d <i>e</i>")).toBe("a b & c d e");
    expect(plainText("&nbsp; <br>")).toBe("");
  });
});
