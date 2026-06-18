// Copies every asset (images, PDFs…) found in the notes vault
// (content/posts/**) into public/vault/, preserving the relative path so notes
// can reference them.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "content", "posts");
const OUT = path.join(ROOT, "public", "vault");
const EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".pdf"]);

function walk(dir, base = "") {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      count += walk(path.join(dir, entry.name), rel);
    } else if (EXTS.has(path.extname(entry.name).toLowerCase())) {
      const dest = path.join(OUT, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(dir, entry.name), dest);
      count++;
    }
  }
  return count;
}

fs.rmSync(OUT, { recursive: true, force: true });
if (fs.existsSync(SRC)) {
  const n = walk(SRC);
  console.log(`Copied ${n} vault asset(s) -> public/vault/`);
} else {
  console.log("No content/posts directory; skipping vault assets.");
}
