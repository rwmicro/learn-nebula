// Conditional requests and cache lifetimes for the static export.
//
// @hono/node-server's serveStatic sends `Last-Modified` but never *reads*
// `If-Modified-Since` or `If-None-Match`, so a revalidation costs a full body
// every time. Combined with the `no-cache` this server sets on everything that
// isn't content-hashed, that meant a returning reader re-downloaded the page,
// its fonts and its images on every navigation — a 304 is what `no-cache` is
// supposed to buy.
//
// Validating from stat() rather than hashing the body: hono's own etag
// middleware buffers the whole response to digest it, which for a vault image
// is megabytes of copying per request. Size + mtime is what express and nginx
// use and it costs one statSync — the same syscall serveStatic is about to make
// anyway.

import fs from "node:fs";
import path from "node:path";

/** Encodings serveStatic will look for, in its own preference order. */
const ENCODINGS: [string, string][] = [
  ["br", ".br"],
  ["zstd", ".zst"],
  ["gzip", ".gz"],
];

/** serveStatic's own guard against `..`, `//` and backslashes in a URL path. */
const UNSAFE = /(?:^|[/\\])\.{1,2}(?:$|[/\\])|[/\\]{2,}|\\/;

export interface StaticEntry {
  /** Weak validator for the representation actually served. */
  etag: string;
  mtime: Date;
  /** True when a precompressed sibling may be picked, so Vary matters. */
  negotiated: boolean;
}

/**
 * Resolve a URL path to the file serveStatic would send, and derive its
 * validators. Returns null when nothing static matches — the request then falls
 * through untouched (an API route, a 404, a traversal attempt).
 */
export function staticEntry(
  root: string,
  urlPath: string,
  acceptEncoding: string,
): StaticEntry | null {
  let filename: string;
  try {
    filename = decodeURI(urlPath);
  } catch {
    return null;
  }
  if (UNSAFE.test(filename)) return null;

  let file = path.join(root, filename);
  let stats = statOrNull(file);
  // trailingSlash:true means "/foo/" is out/foo/index.html.
  if (stats?.isDirectory()) {
    file = path.join(file, "index.html");
    stats = statOrNull(file);
  }
  if (!stats || !stats.isFile()) return null;

  // The .br and the raw bytes are different representations of one URL, so they
  // must not share a validator: a shared cache keyed on ETag alone would
  // otherwise be free to hand a brotli body to a client that asked for none.
  // Validating against the encoded file's own stats also keeps the ETag and the
  // Last-Modified serveStatic sends describing the same bytes.
  const accepted = new Set(
    acceptEncoding.split(",").map((e) => e.trim().split(";")[0]),
  );
  let suffix = "";
  for (const [name, ext] of ENCODINGS) {
    if (!accepted.has(name)) continue;
    const encoded = statOrNull(file + ext);
    if (encoded) {
      suffix = `-${name}`;
      stats = encoded;
      break;
    }
  }

  return {
    etag: `W/"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}${suffix}"`,
    mtime: stats.mtime,
    negotiated: suffix !== "",
  };
}

/**
 * Whether the client's stored copy is still good. `If-None-Match` wins when
 * present (RFC 9110 §13.1.3); `If-Modified-Since` only has second granularity,
 * so the file's mtime is truncated before comparing or a file rewritten later
 * in the same second would look fresh.
 */
export function isFresh(
  entry: StaticEntry,
  ifNoneMatch: string | undefined,
  ifModifiedSince: string | undefined,
): boolean {
  if (ifNoneMatch) {
    if (ifNoneMatch.trim() === "*") return true;
    return ifNoneMatch
      .split(",")
      .some((tag) => normaliseTag(tag) === normaliseTag(entry.etag));
  }
  if (!ifModifiedSince) return false;
  const since = Date.parse(ifModifiedSince);
  if (Number.isNaN(since)) return false;
  return Math.floor(entry.mtime.getTime() / 1000) * 1000 <= since;
}

/**
 * How long a client may keep a response without asking again.
 *
 * `/_next/static/**` is content-hashed by the build, so its URL changes
 * whenever its bytes do — a year, immutable, is free.
 *
 * `/fonts/**` are generated subsets of the four faces the site ships. Their
 * names aren't hashed, so `immutable` would be a promise this build can't keep;
 * a month is long enough that a reader coming back within it pays nothing, and
 * short enough that a re-subset reaches everyone without a cache-buster. After
 * it lapses the ETag above makes the recheck a 304, not a re-download.
 *
 * `/i18n/**` are the UI message bundles, named `<locale>.<content hash>.js`
 * (lib/i18n-assets.ts), and `/js/h/**` the page scripts, `<name>.<content
 * hash>.js` (lib/js-assets.ts), so they are immutable too, as are the
 * hash-named engine files under `/engine/`.
 *
 * So are the files Pagefind names after their content (`/pagefind/fragment/`,
 * `/pagefind/index/`, `/pagefind/filter/`, `pagefind.<lang>_<hash>.pf_meta`)
 * and the share cards under `/og/` (named by lib/og.ts from what they draw).
 * `pagefind.js`, `pagefind-entry.json` and `wasm.<lang>.pagefind` keep fixed
 * names across builds, so they fall through to the default below.
 *
 * The JSON the pages fetch with `?v=<content hash>` (home-data.json,
 * graph-data.json, palette-extra.json) gets a year too when `versioned`: the
 * hash is in the URL, so a new build asks for a new URL.
 *
 * `/vault/**` (images, PDFs, clips copied from the notes) and `/images/**` keep
 * their names when they change, but rarely change: a day, then served stale
 * while a revalidation runs, so a corrected figure shows up by the next day
 * without every view asking the Pi first.
 *
 * Everything else stays `no-cache`: the notes are a garden, they get retended.
 * `stale-if-error` lets a cache in front (Cloudflare, the browser) keep serving
 * the last copy for a day when this server is down or restarting, instead of a
 * 502 — the copy is always revalidated while the server answers.
 */
export const IMMUTABLE = "public, max-age=31536000, immutable";
export const REVALIDATE = "no-cache, stale-if-error=86400";

export function cacheControlFor(urlPath: string, versioned = false): string | null {
  if (
    urlPath.startsWith("/_next/static/") ||
    urlPath.startsWith("/i18n/") ||
    urlPath.startsWith("/js/h/") ||
    urlPath.startsWith("/og/") ||
    // The chess engine's files carry their build's hash in the name
    // (stockfish-17.1-lite-single-03e3232.wasm, 7 MB): never re-asked for.
    /^\/engine\/[^/]+-[0-9a-f]{7,}\.(?:js|wasm)$/.test(urlPath) ||
    /^\/pagefind\/(?:fragment|index|filter)\//.test(urlPath) ||
    /^\/pagefind\/pagefind\.[a-z-]+_[0-9a-f]+\.pf_meta$/.test(urlPath) ||
    (versioned && /^\/(?:home-data|graph-data|palette-extra)\.json$/.test(urlPath))
  )
    return IMMUTABLE;
  if (urlPath.startsWith("/fonts/")) return "public, max-age=2592000";
  if (urlPath.startsWith("/api/")) return null;
  if (urlPath.startsWith("/vault/") || urlPath.startsWith("/images/"))
    return "public, max-age=86400, stale-while-revalidate=604800, stale-if-error=604800";
  return REVALIDATE;
}

function statOrNull(file: string): fs.Stats | null {
  try {
    return fs.statSync(file);
  } catch {
    return null;
  }
}

function normaliseTag(tag: string): string {
  return tag.trim().replace(/^W\//, "");
}
