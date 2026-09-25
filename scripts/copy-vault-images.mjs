// Copies every asset (images, PDFs…) found in the notes vault
// (content/posts/**) into public/vault/, preserving the relative path so notes
// can reference them.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "content", "posts");
const OUT = path.join(ROOT, "public", "vault");
const EXTS = new Set([
  // Images
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif",
  // Documents
  ".pdf",
  // Video — needed for embedded clips and for the Manim cache (_manim/*.mp4)
  // populated by the obsidian-manim-renderer plugin.
  ".mp4", ".webm", ".mov", ".ogv",
  // Audio — pronunciation clips embedded as ![word](clip.mp3).
  ".mp3", ".wav", ".ogg", ".oga", ".m4a", ".opus", ".flac", ".aac",
]);
// Cloudflare Pages rejects any single asset larger than 25 MiB. Skip those
// (with a warning) so one oversized file can't fail the whole deployment;
// optimise it at the source instead.
const MAX_BYTES = 25 * 1024 * 1024;

const skipped = [];
// Git LFS pointer stubs left behind when `git lfs pull` couldn't fetch the real
// object (e.g. the pensine repo ran out of LFS bandwidth budget). Copying one
// ships a ~130-byte text file under an .mp3/.png name, which the browser
// rejects: the pronunciation button just flips to its error state. Skip them
// and say so, so a missing asset shows up in the build log instead.
const lfsStubs = [];
const LFS_POINTER_MAX_BYTES = 1024;
const LFS_POINTER_PREFIX = "version https://git-lfs.github.com/spec/";

function isLfsPointer(file, size) {
  if (size > LFS_POINTER_MAX_BYTES) return false;
  const head = fs
    .readFileSync(file, "utf8")
    .slice(0, LFS_POINTER_PREFIX.length);
  return head === LFS_POINTER_PREFIX;
}

function walk(dir, base = "") {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      count += walk(path.join(dir, entry.name), rel);
    } else if (EXTS.has(path.extname(entry.name).toLowerCase())) {
      const from = path.join(dir, entry.name);
      const size = fs.statSync(from).size;
      if (size > MAX_BYTES) {
        skipped.push({ rel, mib: size / 1048576 });
        continue;
      }
      if (isLfsPointer(from, size)) {
        lfsStubs.push(rel);
        continue;
      }
      const dest = path.join(OUT, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(from, dest);
      count++;
    }
  }
  return count;
}

fs.rmSync(OUT, { recursive: true, force: true });
if (fs.existsSync(SRC)) {
  const n = walk(SRC);
  console.log(`Copied ${n} vault asset(s) -> public/vault/`);
  for (const { rel, mib } of skipped) {
    console.warn(
      `⚠ Skipped ${rel} (${mib.toFixed(1)} MiB > 25 MiB Cloudflare limit). Optimise it in the pensine repo.`,
    );
  }
  if (lfsStubs.length) {
    console.warn(
      `⚠ Skipped ${lfsStubs.length} Git LFS pointer stub(s) — the real files ` +
        `were never downloaded (git-lfs missing or LFS budget exhausted), so ` +
        `these assets won't load on the site. First few:\n` +
        lfsStubs
          .slice(0, 5)
          .map((r) => `  ${r}`)
          .join("\n"),
    );
  }
} else {
  console.log("No content/posts directory; skipping vault assets.");
}
