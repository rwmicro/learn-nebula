import { describe, it, expect } from "vitest";
import { linkHeaderFrom } from "./early-hints";

describe("linkHeaderFrom", () => {
  it("preloads the layout's stylesheets and font, in order", () => {
    const html = `<head>
      <link rel="preload" href="/fonts/alegreya-normal-latin.woff2" as="font" crossorigin="anonymous" type="font/woff2"/>
      <link rel="stylesheet" href="/_next/static/chunks/a.css" data-precedence="next"/>
      <link rel="stylesheet" href="/_next/static/chunks/b.css" data-precedence="next"/>
      <link rel="preload" as="script" href="/js/h/i18n.0123.js"/>
      <link rel="icon" href="/icon.png"/>`;
    expect(linkHeaderFrom(html)).toBe(
      '</fonts/alegreya-normal-latin.woff2>; rel=preload; as=font; type="font/woff2"; crossorigin, ' +
        "</_next/static/chunks/a.css>; rel=preload; as=style, " +
        "</_next/static/chunks/b.css>; rel=preload; as=style",
    );
  });

  it("lists a font linked twice once", () => {
    const tag = '<link rel="preload" href="/fonts/x.woff2" as="font"/>';
    expect(linkHeaderFrom(tag + tag)).toBe(
      '</fonts/x.woff2>; rel=preload; as=font; type="font/woff2"; crossorigin',
    );
  });

  it("skips other origins and anything that would break the header", () => {
    const html =
      '<link rel="stylesheet" href="https://cdn.example/x.css"/>' +
      '<link rel="stylesheet" href="/a,b.css"/>' +
      '<link rel="stylesheet" href="//evil/x.css"/>';
    expect(linkHeaderFrom(html)).toBeNull();
  });
});
