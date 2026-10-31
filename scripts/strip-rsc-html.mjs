// Stops every note from shipping its text twice.
//
// A note's <main> is one HTML string (components/note/SinglePage.tsx,
// dangerouslySetInnerHTML), and Next inlines the page's whole React tree in
// the HTML for hydration (`self.__next_f.push(…)` scripts) — that string
// included. On a long note the copy was more than half the file: 260 KB of a
// 460 KB page, parsed and kept in memory by every reader for nothing.
//
// React never writes a dangerouslySetInnerHTML while hydrating — the server's
// DOM is kept as it is — and nothing on the client re-renders <main> (the site
// navigates between documents, never with the App Router). So the copy can be
// emptied: this rewrites the flight row that holds it (`<id>:T<hex length>,…`)
// to an empty one. The one way React could render <main> again is the error
// boundary's "Réessayer", and components/layout/ErrorView.tsx reloads the page there
// instead.
//
// Narrow on purpose: only the row the note's <main data-pagefind-body> points
// to, only when nothing else references it, and the page is left untouched
// whenever the payload doesn't look exactly as expected. Runs after
// prune-rsc, before precompress.

import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");
const POSTS = path.join(OUT, "posts");

const PUSH = /<script>self\.__next_f\.push\((\[1,"(?:[^"\\]|\\.)*"\])\)<\/script>/g;
const MAIN_REF = /"data-pagefind-body":"","dangerouslySetInnerHTML":\{"__html":"\$([0-9a-f]+)"\}/;

/** JSON for an inline script: `<` escaped so the text can never close it. */
const scriptJson = (value) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

/**
 * The page with its note text emptied from the flight payload, or null when
 * there is nothing (safe) to strip. Exported for the tests.
 * @param {string} html
 */
export function stripNoteCopy(html) {
  const pushes = [...html.matchAll(PUSH)];
  if (pushes.length === 0) return null;
  let flight = "";
  for (const m of pushes) {
    const arg = JSON.parse(m[1]);
    if (arg[0] !== 1 || typeof arg[1] !== "string") return null;
    flight += arg[1];
  }
  const ref = MAIN_REF.exec(flight);
  if (!ref) return null;
  const id = ref[1];
  // Referenced exactly once: emptying it can't blank anything else.
  if (flight.split(`"$${id}"`).length !== 2) return null;

  // T rows give their length in UTF-8 bytes, so cut in bytes.
  const bytes = Buffer.from(flight, "utf8");
  const head = new RegExp(`(?:^|\\n)${id}:T([0-9a-f]+),`).exec(flight);
  if (!head) return null;
  const headBytes = Buffer.byteLength(flight.slice(0, head.index + head[0].length), "utf8");
  const len = parseInt(head[1], 16);
  if (headBytes + len > bytes.length) return null;
  const prefix = flight.slice(0, head.index) + head[0].replace(/T[0-9a-f]+,$/, "T0,");
  const next = prefix + bytes.subarray(headBytes + len).toString("utf8");

  // One push in place of the first, the others dropped: React reads the
  // stream as one string, wherever it was cut.
  let i = 0;
  return html.replace(PUSH, () =>
    i++ === 0 ? `<script>self.__next_f.push(${scriptJson([1, next])})</script>` : "",
  );
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === "index.html") out.push(full);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!fs.existsSync(POSTS)) {
    console.log("strip-rsc-html: no out/posts/; skipping.");
    process.exit(0);
  }
  let pages = 0;
  let saved = 0;
  let skipped = 0;
  for (const file of walk(POSTS)) {
    const html = fs.readFileSync(file, "utf8");
    const next = stripNoteCopy(html);
    if (next == null) {
      skipped++;
      continue;
    }
    fs.writeFileSync(file, next);
    pages++;
    saved += Buffer.byteLength(html) - Buffer.byteLength(next);
  }
  console.log(
    `strip-rsc-html: emptied the note copy in ${pages} page(s), ${(saved / 1048576).toFixed(1)} MB` +
      (skipped ? ` (${skipped} left as is)` : ""),
  );
}
