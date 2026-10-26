// Which page scripts get a content-hashed copy under /js/h/, and how the copy
// is named. Shared by scripts/bundle-js.mjs (writes the copies) and
// lib/js-assets.ts (emits the tags) — they must agree, or a page would point
// at a file that was never written. Plain JS, no TS, so the build script can
// import it with bare `node`.

import crypto from "node:crypto";

/** The scripts every navigation loads; their sources live in public/js/. */
export const HASHED_SCRIPTS = /** @type {const} */ ([
  "error-beacon.js",
  "i18n.js",
  "lightbox.js",
  "theme.js",
  "palette.bundle.js",
  "pronounce-loader.js",
  "sw-register.js",
  "note.bundle.js",
  "note-end.bundle.js",
  "quiz.bundle.js",
  "glossary.bundle.js",
]);

/**
 * "note.bundle.3f2a9c1d0b.js": a short hash of the file's bytes.
 * @param {string} file
 * @param {Buffer | string} bytes
 */
export function hashedScriptName(file, bytes) {
  const hash = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 10);
  return file.replace(/\.js$/, `.${hash}.js`);
}
