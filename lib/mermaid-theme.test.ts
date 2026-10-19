import { describe, it, expect } from "vitest";
// Plain JS on purpose — scripts/render-mermaid.mjs imports it with bare node.
import { hoistMermaidStyles, splitRules, themeColors } from "./mermaid-theme.js";
import { pinLabelInk } from "./mermaid-source.js";

const svg = (id: string, type: string, style: string, body = "<g></g>") =>
  `<svg id="${id}" aria-roledescription="${type}"><style>${style}</style>${body}</svg>`;

const base = (id: string) =>
  `#${id}{fill:#111;}@keyframes dash{to{stroke-dashoffset:0;}}#${id} .node rect{fill:#f0f7ff;stroke:#003366;}`;

describe("themeColors", () => {
  it("swaps the theme's hex for the site tokens, and leaves other colours", () => {
    expect(themeColors("a{fill:#F0F7FF;stroke:#003366;color:#e74c3c}")).toBe(
      "a{fill:var(--link-wash);stroke:var(--link);color:#e74c3c}",
    );
  });

  it("maps rgb() and keeps rgba()'s alpha as a mix", () => {
    expect(themeColors("a{fill:rgb(0, 51, 102);background:rgba(252, 252, 252, 0.5)}")).toBe(
      "a{fill:var(--link);background:color-mix(in srgb, var(--paper) 50%, transparent)}",
    );
  });
});

describe("splitRules", () => {
  it("keeps a @keyframes block whole", () => {
    expect(splitRules("a{x:1}@keyframes k{from{o:0}to{o:1}}b{y:2}")).toEqual([
      "a{x:1}",
      "@keyframes k{from{o:0}to{o:1}}",
      "b{y:2}",
    ]);
  });
});

describe("hoistMermaidStyles", () => {
  it("moves the rules every diagram of a type shares into one themed sheet", () => {
    const { css, svgs } = hoistMermaidStyles([
      svg("ma", "flowchart-v2", base("ma")),
      svg("mb", "flowchart-v2", base("mb")),
    ]);
    const scope = '.mermaid-diagram svg[aria-roledescription="flowchart-v2"]';
    expect(css).toContain(`${scope}{fill:var(--ink);}`);
    expect(css).toContain(`${scope} .node rect{fill:var(--link-wash);stroke:var(--link);}`);
    expect(css.match(/@keyframes dash/g)).toHaveLength(1);
    expect(svgs[0]).not.toContain("<style>");
    expect(svgs[1]).toBe('<svg id="mb" aria-roledescription="flowchart-v2"><g></g></svg>');
  });

  it("leaves an author's classDef rules in their own SVG, colours untouched", () => {
    const own = "#mb .warn>*{fill:#C8E6C9!important;color:#111!important;}";
    const { css, svgs } = hoistMermaidStyles([
      svg("ma", "flowchart-v2", base("ma")),
      svg("mb", "flowchart-v2", base("mb") + own),
    ]);
    expect(svgs[1]).toContain(`<style>${own}</style>`);
    expect(css).not.toContain(".warn");
  });

  it("never shares a rule across types, nor one naming the SVG's id", () => {
    const grad = (id: string) => `#${id} .x{stroke:url(#${id}-gradient);}`;
    const { css, svgs } = hoistMermaidStyles([
      svg("ma", "flowchart-v2", base("ma") + grad("ma")),
      svg("mc", "timeline", base("mc")),
    ]);
    expect(svgs[0]).toContain("url(#ma-gradient)");
    expect(css).toContain('svg[aria-roledescription="timeline"] .node rect');
  });

  it("drops the unused neo-look rules, keeps them where the look is used", () => {
    const neo = (id: string) => `#${id} [data-look="neo"].node rect{stroke:url(#${id}-gradient);}`;
    const { svgs } = hoistMermaidStyles([
      svg("ma", "flowchart-v2", base("ma") + neo("ma")),
      svg("mb", "flowchart-v2", base("mb") + neo("mb"), '<g data-look="neo"></g>'),
    ]);
    expect(svgs[0]).not.toContain("neo");
    expect(svgs[1]).toContain("url(#mb-gradient)");
  });

  it("themes the colours mermaid writes as attributes", () => {
    const { css } = hoistMermaidStyles([svg("ma", "pie", base("ma"))]);
    expect(css).toContain('.mermaid-diagram [fill="#003366" i]{fill:var(--link)}');
    expect(css).toContain('.mermaid-diagram [style*="fill: rgb(0, 51, 102)"]{fill:var(--link)!important}');
  });
});

describe("pinLabelInk", () => {
  it("gives a pale fill dark text, so it stays legible in dark mode", () => {
    expect(pinLabelInk("  style F fill:#C8E6C9")).toBe("  style F fill:#C8E6C9,color:#111");
    expect(pinLabelInk("classDef ok fill:#fff2e6,stroke:#cc6600;")).toBe(
      "classDef ok fill:#fff2e6,stroke:#cc6600,color:#111;",
    );
  });

  it("leaves a text colour the author chose, and a dark fill", () => {
    expect(pinLabelInk("style A fill:#4caf50,color:#fff")).toBe("style A fill:#4caf50,color:#fff");
    expect(pinLabelInk("style X fill:#673AB7")).toBe("style X fill:#673AB7");
    expect(pinLabelInk("A --> B")).toBe("A --> B");
  });
});
