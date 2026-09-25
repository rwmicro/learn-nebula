// Renders ```mermaid blocks to static SVG at build time (no client-side JS).
// Replaces `<pre class="mermaid">source</pre>` in out/**/*.html with the SVG.
// Requires a Chromium (Playwright) since mermaid needs a DOM.
//
// Failing loudly when Chromium is missing is the whole point of this file's
// error handling. A block left unrendered is not cosmetic: public/js/
// mermaid-render.js picks it up in the browser and pulls /js/mermaid.min.js —
// 3.4 MB — on every page that has one. This used to exit 0 with a warning, so a
// broken `playwright install` (docker.yml runs it with `|| true`) would have
// shipped that silently across every diagram page. An infrastructure failure
// now stops the build; set MERMAID_ALLOW_SKIP=1 to opt out locally.
//
// A diagram that mermaid itself rejects is different — that's one note's syntax,
// not the toolchain, and it shouldn't block a deploy of a thousand others. Those
// stay a warning naming the files to fix.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { chromium } from "@playwright/test";
import { normaliseMermaid } from "../lib/mermaid-source.js";

const OUT = path.join(process.cwd(), "out");
const MERMAID = path.join(process.cwd(), "node_modules", "mermaid", "dist", "mermaid.min.js");
const RE = /<pre\b[^>]*class="mermaid"[^>]*>([\s\S]*?)<\/pre>/g;

function decode(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
const hash = (s) => crypto.createHash("sha1").update(s).digest("hex");

function* htmlFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* htmlFiles(p);
    else if (e.name.endsWith(".html")) yield p;
  }
}

if (!fs.existsSync(OUT)) process.exit(0);

// Pass 1: collect every unique diagram source.
const files = [...htmlFiles(OUT)];
const sources = new Map(); // hash -> code
for (const f of files) {
  const html = fs.readFileSync(f, "utf8");
  if (!html.includes('class="mermaid"')) continue;
  for (const m of html.matchAll(RE)) {
    const code = decode(m[1]).trim();
    sources.set(hash(code), code);
  }
}
if (sources.size === 0) {
  console.log("No mermaid diagrams found.");
  process.exit(0);
}

let browser;
try {
  browser = await chromium.launch();
} catch (e) {
  const reason = String(e).split("\n")[0];
  if (process.env.MERMAID_ALLOW_SKIP === "1") {
    console.warn(
      `render-mermaid: Chromium unavailable, skipping ${sources.size} diagram(s) ` +
        `because MERMAID_ALLOW_SKIP=1 (${reason}).\n` +
        "  Those pages will load /js/mermaid.min.js (3.4 MB) in the browser instead.",
    );
    process.exit(0);
  }
  console.error(
    `render-mermaid: Chromium unavailable and ${sources.size} diagram(s) need it — ${reason}\n` +
      "  Every page holding one would fall back to a 3.4 MB client-side render, so this is a\n" +
      "  build failure, not a warning. Install it with `pnpm exec playwright install chromium`,\n" +
      "  or set MERMAID_ALLOW_SKIP=1 if you genuinely want the client-side fallback.",
  );
  process.exit(1);
}

const page = await browser.newPage();
await page.addScriptTag({ path: MERMAID });
// Theme tuned to the site palette (assets/css): #fcfcfc page, #111 text,
// #003366 accent (the `a` colour), #f0f7ff tint, #ccc hairlines. Built on
// mermaid's "base" theme because only that one reads themeVariables; "neutral"
// ignores them. Flat fills and 1px borders so a diagram sits in the page like
// a table does, rather than arriving with its own visual identity.
const MERMAID_CONFIG = {
  startOnLoad: false,
  securityLevel: "strict",
  theme: "base",
  fontFamily: '"Alegreya Sans", sans-serif',
  themeVariables: {
    fontFamily: '"Alegreya Sans", sans-serif',
    fontSize: "15px",
    background: "#fcfcfc",
    textColor: "#111",
    lineColor: "#6f6f6f",
    // Nodes: tinted fill, accent border.
    primaryColor: "#f0f7ff",
    primaryBorderColor: "#003366",
    primaryTextColor: "#111",
    mainBkg: "#f0f7ff",
    nodeBorder: "#003366",
    nodeTextColor: "#111",
    // Secondary/tertiary surfaces (subgraphs, clusters): page-coloured, hairline.
    secondaryColor: "#fcfcfc",
    secondaryBorderColor: "#ccc",
    secondaryTextColor: "#111",
    tertiaryColor: "#fcfcfc",
    tertiaryBorderColor: "#ccc",
    tertiaryTextColor: "#555",
    clusterBkg: "#fcfcfc",
    clusterBorder: "#ccc",
    titleColor: "#111",
    edgeLabelBackground: "#fcfcfc",
    // sequenceDiagram.
    actorBkg: "#f0f7ff",
    actorBorder: "#003366",
    actorTextColor: "#111",
    actorLineColor: "#ccc",
    signalColor: "#111",
    signalTextColor: "#111",
    labelBoxBkgColor: "#f0f7ff",
    labelBoxBorderColor: "#003366",
    labelTextColor: "#111",
    loopTextColor: "#111",
    noteBkgColor: "#f7f7f5",
    noteBorderColor: "#ccc",
    noteTextColor: "#555",
    sequenceNumberColor: "#fcfcfc",
    altBackground: "#fcfcfc",
    // mindmap / timeline sections cycle through cScale*; git0 is also what
    // mindmap paints its root with, hence a light value rather than an accent.
    cScale0: "#f0f7ff", cScaleLabel0: "#111",
    cScale1: "#e7eef6", cScaleLabel1: "#111",
    cScale2: "#eef3ee", cScaleLabel2: "#111",
    cScale3: "#f5f1e9", cScaleLabel3: "#111",
    cScale4: "#f0f7ff", cScaleLabel4: "#111",
    cScale5: "#e7eef6", cScaleLabel5: "#111",
    cScale6: "#eef3ee", cScaleLabel6: "#111",
    cScale7: "#f5f1e9", cScaleLabel7: "#111",
    git0: "#e7eef6", git1: "#2d6cc0", git2: "#009b8f", git3: "#3f6b4a",
    // pie/quadrant: the callout accent series from main.css.
    pie1: "#003366", pie2: "#2d6cc0", pie3: "#009b8f",
    pie4: "#3f6b4a", pie5: "#b8740f", pie6: "#6b4fbb",
    pieTitleTextColor: "#111",
    pieSectionTextColor: "#fcfcfc",
    pieStrokeColor: "#fcfcfc",
    pieOuterStrokeColor: "#ccc",
  },
  flowchart: { useMaxWidth: true, htmlLabels: true, curve: "basis" },
  sequence: { useMaxWidth: true, mirrorActors: false, messageAlign: "left" },
  packet: { useMaxWidth: true },
};

await page.evaluate((cfg) => {
  window.mermaid.initialize(cfg);
}, MERMAID_CONFIG);

// Render each unique diagram to SVG.
const svgs = new Map(); // hash -> svg
let failed = 0;
for (const [h, code] of sources) {
  const normalized = normaliseMermaid(code);
  try {
    const svg = await page.evaluate(async (c) => {
      const id = "m" + Math.random().toString(36).slice(2);
      const { svg } = await window.mermaid.render(id, c);
      return svg;
    }, normalized);
    svgs.set(h, svg);
  } catch (e) {
    failed++;
    console.warn(`  diagram error: ${String(e).split("\n")[0].slice(0, 120)}`);
  }
}
await browser.close();

// Pass 2: inline the SVGs.
let replaced = 0;
const failedFiles = new Set();
for (const f of files) {
  const html = fs.readFileSync(f, "utf8");
  if (!html.includes('class="mermaid"')) continue;
  const out = html.replace(RE, (whole, inner) => {
    const svg = svgs.get(hash(decode(inner).trim()));
    if (!svg) return whole;
    replaced++;
    // tabindex: .mermaid-diagram is an overflow-x:auto box (a wide diagram
    // scrolls rather than being squashed), and a scrollable region that isn't
    // focusable can't be scrolled from the keyboard at all — axe flags it as
    // serious, WCAG 2.1 2.1.1. Focusable is all the rule needs; the diagram's
    // own <text> is what a screen reader then reads.
    return `<figure class="mermaid-diagram" tabindex="0" data-pagefind-ignore>${svg}</figure>`;
  });
  if (out !== html) fs.writeFileSync(f, out);
  if (out.includes('class="mermaid"')) failedFiles.add(path.relative(OUT, f));
}

console.log(
  `Rendered ${svgs.size} diagram(s) to SVG, inlined ${replaced} block(s)${failed ? `, ${failed} failed` : ""}.`,
);
if (failedFiles.size) {
  console.warn(
    `\n${failedFiles.size} note(s) have invalid mermaid (e.g. unquoted labels) — fix the source.\n` +
      "  Each one makes a reader download /js/mermaid.min.js (3.4 MB) to render it client-side:",
  );
  for (const f of failedFiles) console.warn(`  ${f}`);
}
