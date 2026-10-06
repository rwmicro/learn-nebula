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
import { normaliseMermaid, polishSvg, MERMAID_CONFIG } from "../lib/mermaid-source.js";

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
    svgs.set(h, polishSvg(svg, normalized));
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
    return `<figure class="mermaid-diagram keep-light" tabindex="0" data-pagefind-ignore>${svg}</figure>`;
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
