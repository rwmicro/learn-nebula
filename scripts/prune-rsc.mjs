// Deletes the RSC flight payloads Next writes beside every exported page
// (`index.txt`, `__next.*.txt`). They exist for the App Router's client-side
// navigation, and nothing here ever asks for them: the site imports next/link
// nowhere, every link is a plain <a> (instantpage.js prefetches whole
// documents through speculation rules), and the service worker precaches only
// "/" and the offline page. On a 600-note build they were a third of out/ by
// weight — dead bytes in the Docker image and on the volume it ships to.
//
// Guarded rather than assumed: if next/link ever shows up in the source, the
// payloads are suddenly load-bearing, so this refuses to run and says so
// instead of quietly breaking navigation.
//
// Runs before precompress, which skips these files anyway; the order only
// keeps the two steps from disagreeing about what exists.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "out");
// Where a <Link> would have to appear for these payloads to matter.
const SOURCE_DIRS = ["app", "components", "lib"];

/** `index.txt` and `__next.*.txt` only — robots.txt and llms.txt are real. */
const isRscPayload = (name) =>
  name === "index.txt" || name.startsWith("__next.");

function usesNextLink() {
  const hit = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(tsx?|jsx?|mjs)$/.test(entry.name)) {
        const src = fs.readFileSync(full, "utf8");
        if (/from\s+["']next\/link["']/.test(src))
          hit.push(path.relative(ROOT, full));
      }
    }
  };
  for (const d of SOURCE_DIRS) walk(path.join(ROOT, d));
  return hit;
}

function collect(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full, out);
    else if (entry.name.endsWith(".txt") && isRscPayload(entry.name))
      out.push(full);
  }
  return out;
}

if (!fs.existsSync(OUT)) {
  console.log("prune-rsc: no out/ directory; skipping.");
  process.exit(0);
}

const linkUsers = usesNextLink();
if (linkUsers.length) {
  console.warn(
    `prune-rsc: next/link is imported (${linkUsers.slice(0, 3).join(", ")}` +
      `${linkUsers.length > 3 ? `, +${linkUsers.length - 3} more` : ""}), so the RSC ` +
      "payloads are now fetched on client navigation. Keeping them.",
  );
  process.exit(0);
}

const files = collect(OUT);
let bytes = 0;
for (const f of files) {
  bytes += fs.statSync(f).size;
  fs.rmSync(f);
}
console.log(
  `prune-rsc: removed ${files.length} unused RSC payload(s), ` +
    `${(bytes / 1048576).toFixed(1)} MB.`,
);
