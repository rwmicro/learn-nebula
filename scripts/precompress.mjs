// Writes a .br and a .gz next to every compressible file in out/, so nginx can
// serve them with `brotli_static on; gzip_static on;` and spend no CPU per
// request. Compressing once at build beats compressing on every response, and
// it buys the highest brotli quality (11) — far too slow to run on the fly, but
// free here and the best ratio available for static bytes.
//
// No .zst: zstd's advantage is speed at a given ratio, which matters for
// dynamic responses, not for bytes we compress once and keep. Brotli 11 wins on
// size, and gzip covers whatever doesn't take brotli.
//
// MUST run last in the build: pagefind writes its index into out/ and
// render-mermaid rewrites the HTML in place, so anything compressed before them
// would ship stale.
//
// Brotli 11 over the whole export is by far the slowest step of the build
// (~12 of ~17 minutes on a hosted runner), so two knobs keep it in check:
//
//   PRECOMPRESS_BROTLI_QUALITY — 0–11, default 11. CI's check build sets a low
//     one: nothing there serves the variants (the browser tests use
//     `npx serve`), it only needs this script to run.
//   PRECOMPRESS_CACHE_DIR — default .cache/precompress. Variants keyed by the
//     source bytes' hash and the settings, so a file unchanged since the last
//     build is copied, not recompressed. CI restores/saves it like the vault
//     clone. Entries this build didn't use are pruned at the end, so the cache
//     only ever holds the current site.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";
import { promisify } from "node:util";

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

const OUT = path.join(process.cwd(), "out");

const BROTLI_QUALITY = (() => {
  const q = Number(process.env.PRECOMPRESS_BROTLI_QUALITY ?? 11);
  return Number.isInteger(q) && q >= 0 && q <= 11 ? q : 11;
})();
const GZIP_LEVEL = 9;
const CACHE_DIR =
  process.env.PRECOMPRESS_CACHE_DIR ||
  path.join(process.cwd(), ".cache", "precompress");

// Text-ish formats only. Anything already compressed (woff2, png, webp, avif,
// mp3, mp4, pdf…) gains ~nothing and costs CPU and disk to try.
const EXTS = new Set([
  ".html",
  ".css",
  ".js",
  ".mjs",
  ".json",
  ".svg",
  ".txt",
  ".xml",
  ".map",
  ".webmanifest",
  // WebAssembly is not pre-compressed by its build: the chess engine
  // (public/engine/, 7.3 MB) comes down 25 % smaller in brotli, an ONNX
  // runtime far more.
  ".wasm",
]);

// Below this, the HTTP round trip dominates and the variants are mostly
// overhead — nginx's own gzip_min_length default is in the same spirit.
const MIN_BYTES = 1024;

// Next emits an RSC flight payload beside every page (`index.txt`,
// `__next.*.txt`) for the App Router's client-side navigation. Nothing here
// ever asks for them: the site imports next/link nowhere, navigates with plain
// <a> (the speculation rules prerender those as whole documents), and the service
// worker precaches only "/" and the offline page. They are a third of out/ by
// weight, so compressing them would be the bulk of this step's cost for bytes
// no one downloads. `robots.txt` and `llms.txt` are real, served files — the
// check has to be narrower than "*.txt".
//
// If the site ever adopts <Link>, drop this and they get variants like
// anything else; until then they would only ever be served uncompressed.
const isDeadRscPayload = (file) => {
  const name = path.basename(file);
  return name === "index.txt" || name.startsWith("__next.");
};

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (
      EXTS.has(path.extname(entry.name).toLowerCase()) &&
      !isDeadRscPayload(full)
    )
      out.push(full);
  }
  return out;
}

// Cache entries this run read or wrote; everything else is pruned at the end.
const used = new Set();
let hits = 0;

// A cached variant that wasn't smaller than its source is stored as an empty
// file: real output for an input of MIN_BYTES or more is never empty.
function readCached(name) {
  try {
    return fs.readFileSync(path.join(CACHE_DIR, name));
  } catch {
    return null;
  }
}

async function compressOne(file) {
  const raw = fs.readFileSync(file);
  if (raw.length < MIN_BYTES) return null;

  const key =
    crypto.createHash("sha256").update(raw).digest("hex") +
    `-b${BROTLI_QUALITY}-g${GZIP_LEVEL}`;
  used.add(`${key}.br`);
  used.add(`${key}.gz`);

  let br = readCached(`${key}.br`);
  let gz = br && readCached(`${key}.gz`);
  if (br && gz) {
    hits++;
  } else {
    [br, gz] = await Promise.all([
      brotli(raw, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY,
          // Lets brotli size its window to the input instead of guessing.
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
        },
      }),
      gzip(raw, { level: GZIP_LEVEL }),
    ]);
    if (br.length >= raw.length) br = Buffer.alloc(0);
    if (gz.length >= raw.length) gz = Buffer.alloc(0);
    fs.writeFileSync(path.join(CACHE_DIR, `${key}.br`), br);
    fs.writeFileSync(path.join(CACHE_DIR, `${key}.gz`), gz);
  }

  // A variant that isn't smaller is worse than no variant: nginx would serve
  // more bytes than the original for the same content.
  let wroteBr = 0;
  let wroteGz = 0;
  if (br.length > 0) {
    fs.writeFileSync(`${file}.br`, br);
    wroteBr = br.length;
  }
  if (gz.length > 0) {
    fs.writeFileSync(`${file}.gz`, gz);
    wroteGz = gz.length;
  }
  return { raw: raw.length, br: wroteBr, gz: wroteGz };
}

/** Run `task` over `items` with at most `limit` in flight. */
async function pool(items, limit, task) {
  const results = [];
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await task(items[i]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

if (!fs.existsSync(OUT)) {
  console.log("precompress: no out/ directory; skipping.");
  process.exit(0);
}

fs.mkdirSync(CACHE_DIR, { recursive: true });
const files = walk(OUT);
const started = Date.now();
// brotli 11 is CPU-bound and zlib runs it off the main thread, so one job per
// core keeps every core busy without oversubscribing the threadpool.
const results = await pool(files, Math.max(1, os.cpus().length), compressOne);

let pruned = 0;
for (const name of fs.readdirSync(CACHE_DIR)) {
  if (!used.has(name)) {
    fs.rmSync(path.join(CACHE_DIR, name), { force: true });
    pruned++;
  }
}

let raw = 0;
let br = 0;
let gz = 0;
let count = 0;
for (const r of results) {
  if (!r) continue;
  count++;
  raw += r.raw;
  br += r.br || r.raw;
  gz += r.gz || r.raw;
}

const mb = (n) => (n / 1048576).toFixed(1);
const pct = (n) => (raw ? Math.round((1 - n / raw) * 100) : 0);
console.log(
  `precompress: ${count} file(s) in ${((Date.now() - started) / 1000).toFixed(1)}s — ` +
    `${mb(raw)} MB → br ${mb(br)} MB (−${pct(br)}%), gz ${mb(gz)} MB (−${pct(gz)}%) ` +
    `[brotli ${BROTLI_QUALITY}; ${hits} from cache, ${pruned} stale entr${pruned === 1 ? "y" : "ies"} pruned]`,
);
