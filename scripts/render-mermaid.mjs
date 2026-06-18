// Renders ```mermaid blocks to static SVG at build time (no client-side JS).
// Replaces `<pre class="mermaid">source</pre>` in out/**/*.html with the SVG.
// Requires a Chromium (Playwright) since mermaid needs a DOM; if unavailable,
// it logs a warning and leaves the blocks (hidden by CSS) rather than failing.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { chromium } from "@playwright/test";

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
  console.warn(`render-mermaid: Chromium unavailable, skipping (${String(e).split("\n")[0]})`);
  process.exit(0);
}

const page = await browser.newPage();
await page.addScriptTag({ path: MERMAID });
await page.evaluate(() => {
  window.mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "neutral",
    fontFamily: '"Alegreya Sans", sans-serif',
    flowchart: { useMaxWidth: true, htmlLabels: true },
  });
});

// Render each unique diagram to SVG.
const svgs = new Map(); // hash -> svg
let failed = 0;
for (const [h, code] of sources) {
  // Normalise common Obsidian habits mermaid rejects:
  //  - literal "\n" line breaks -> <br/>
  //  - unquoted [label] with special chars -> ["label"] (but not [( cylinders
  //    or [[ subroutines, whose shape would break)
  //  - unquoted subgraph titles with special chars -> quoted
  const normalized = code
    .replace(/\\n/g, "<br/>")
    .replace(/\[(?![[(])([^[\]"]*[<>(){}+&|][^[\]"]*)\]/g, '["$1"]')
    .replace(/^(\s*subgraph[ \t]+)(?!")([^[\n]*[<>()][^[\n]*?)\s*$/gm, '$1"$2"');
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
    return `<figure class="mermaid-diagram" data-pagefind-ignore>${svg}</figure>`;
  });
  if (out !== html) fs.writeFileSync(f, out);
  if (out.includes('class="mermaid"')) failedFiles.add(path.relative(OUT, f));
}

console.log(
  `Rendered ${svgs.size} diagram(s) to SVG, inlined ${replaced} block(s)${failed ? `, ${failed} failed` : ""}.`,
);
if (failedFiles.size) {
  console.warn(
    `\n${failedFiles.size} note(s) have invalid mermaid (e.g. unquoted labels) — fix the source:`,
  );
  for (const f of failedFiles) console.warn(`  ${f}`);
}
