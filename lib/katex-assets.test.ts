import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The notes' math is rendered at build by the `katex` package, but the
// stylesheet is a checked-in copy in public/katex/. When the two drift, the
// markup changes under a stale stylesheet: KaTeX 0.18 drew \vec arrows
// through the letters with the 0.16 CSS. Recopy node_modules/katex/dist
// (katex.min.css + fonts/*.woff2) whenever this fails.
describe("public/katex", () => {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), "node_modules/katex/package.json"), "utf8"));
  const css = readFileSync(join(process.cwd(), "public/katex/katex.min.css"), "utf8");

  it("has the stylesheet of the installed katex version", () => {
    const shipped = /katex-version:after\{content:"([^"]+)"\}/.exec(css)?.[1];
    expect(shipped).toBe(pkg.version);
  });

  it("ships every woff2 font the stylesheet names", () => {
    const fonts = new Set(readdirSync(join(process.cwd(), "public/katex/fonts")));
    const named = [...css.matchAll(/url\(fonts\/([^)]+\.woff2)\)/g)].map((m) => m[1]);
    expect(named.length).toBeGreaterThan(10);
    expect(named.filter((f) => !fonts.has(f))).toEqual([]);
  });
});
