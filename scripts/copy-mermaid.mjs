// Copy the mermaid UMD bundle into public/js so note pages can lazily
// client-render any ```mermaid diagrams that the build-time pre-render
// (scripts/render-mermaid.mjs, which needs a Chromium) didn't handle — e.g.
// on Cloudflare Pages' native build, which has no Playwright browser.
// Git-ignored; regenerated on predev/build.
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(
  process.cwd(),
  "node_modules",
  "mermaid",
  "dist",
  "mermaid.min.js",
);
const DEST = path.join(process.cwd(), "public", "js", "mermaid.min.js");

if (!fs.existsSync(SRC)) {
  console.warn("copy-mermaid: mermaid dist not found — skipping.");
  process.exit(0);
}
fs.mkdirSync(path.dirname(DEST), { recursive: true });
fs.copyFileSync(SRC, DEST);
console.log(
  `copy-mermaid: mermaid.min.js -> public/js/ (${(
    fs.statSync(DEST).size / 1e6
  ).toFixed(1)} MB)`,
);
