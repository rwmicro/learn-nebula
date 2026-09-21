// Generates responsive AVIF/WebP variants for the vault's raster images and
// writes content/vault-images.json, which lib/vault-assets.ts reads so
// rehypeVaultAssets can emit a <picture> with a srcset — and, just as valuable,
// intrinsic width/height on the <img> so an image no longer shifts the page
// when it loads.
//
// Runs after copy-vault-images.mjs (which populates public/vault/) and before
// `next build`, which needs the manifest at render time.
//
// Encoding settings come from measuring, not from the defaults: AVIF at
// effort 4 took 4535ms for a 1200×950 photo and effort 2 took 481ms for a byte
// -identical 68 KB. Nine times faster for nothing given up, so effort 2 it is.
//
// Even at 481ms a vault of a few thousand images would add hours to every
// build, so every variant is cached by content hash under .cache/vault-images.
// CI already caches .cache/pensine; this directory wants the same treatment or
// the first build of each run pays full price.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import sharp from "sharp";

const ROOT = process.cwd();
const VAULT = path.join(ROOT, "public", "vault");
const POSTS = path.join(ROOT, "content", "posts");
const CACHE = path.join(ROOT, ".cache", "vault-images");
const MANIFEST = path.join(ROOT, "content", "vault-images.json");

// SVG is already resolution-independent; GIF is usually animated and sharp
// would flatten it to a still.
const RASTER = new Set([".png", ".jpg", ".jpeg", ".webp"]);

// The article column is ~644px, ~880px in wide-text mode, and a figure may run
// the full width; doubled for dense screens. Anything at or above the source's
// own width is skipped, so a small image simply gets fewer variants.
const WIDTHS = [480, 960, 1440];

// Below this there is nothing to reclaim: the variants would weigh about as
// much as the original and cost a round trip to discover.
const MIN_SOURCE_BYTES = 30 * 1024;

// Bump when the encoder settings change, so cached variants are regenerated
// rather than silently kept at the old quality.
const RECIPE = "v1-avif-q50-e2-webp-q78";

const ENCODERS = {
  avif: (p) => p.avif({ quality: 50, effort: 2 }),
  webp: (p) => p.webp({ quality: 78 }),
};

// File names any note actually points at. The vault carries working material no
// note embeds — earlier drafts, scratch exports — and encoding three AVIF and
// three WebP sizes for each of those is build time and image weight spent on
// bytes nobody requests. Matching on the bare basename is the same rule
// lib/vault-assets.ts's resolveVaultAssetByName uses for Obsidian wikilinks, so
// a reference by any spelling (`![[x.png]]`, `![](sub/x.png)`, an <img src>)
// puts the name in this set.
//
// A miss here is cheap on purpose: the image still gets its manifest entry with
// intrinsic width/height, so the page keeps its <img> and its reserved space —
// it just loads the original, exactly as before this script existed.
const REFERENCE = /!?\[\[([^[\]\n|]+)/g; // ![[asset]] / [[asset|alias]]
const MD_LINK = /!?\[[^\]]*\]\(([^)\s]+)/g; // ![alt](path) / [text](path)
const HTML_SRC = /\b(?:src|href)=["']([^"']+)["']/g;

function basename(ref) {
  try {
    ref = decodeURIComponent(ref);
  } catch {
    /* leave as written */
  }
  return (ref.split(/[?#]/)[0].split("/").pop() || "").trim().toLowerCase();
}

function referencedNames() {
  const names = new Set();
  const walkMd = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walkMd(full);
      else if (entry.name.endsWith(".md")) {
        const src = fs.readFileSync(full, "utf8");
        for (const re of [REFERENCE, MD_LINK, HTML_SRC]) {
          re.lastIndex = 0;
          for (const m of src.matchAll(re)) {
            const b = basename(m[1]);
            if (b) names.add(b);
          }
        }
      }
    }
  };
  walkMd(POSTS);
  return names;
}

function walk(dir, base = "", out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(path.join(dir, entry.name), rel, out);
    else if (RASTER.has(path.extname(entry.name).toLowerCase())) out.push(rel);
  }
  return out;
}

const encodePath = (p) => p.split("/").map(encodeURIComponent).join("/");

async function variantsFor(rel, referenced) {
  const src = path.join(VAULT, rel);
  const stat = fs.statSync(src);

  let meta;
  try {
    meta = await sharp(src).metadata();
  } catch {
    return null; // not a readable raster after all
  }
  if (!meta.width || !meta.height) return null;

  const entry = { w: meta.width, h: meta.height, avif: [], webp: [] };
  if (stat.size < MIN_SOURCE_BYTES) return entry; // dimensions only
  if (!referenced.has(path.basename(rel).toLowerCase())) {
    entry.unused = true; // dimensions only — see referencedNames()
    return entry;
  }

  const hash = crypto
    .createHash("sha1")
    .update(fs.readFileSync(src))
    .update(RECIPE)
    .digest("hex")
    .slice(0, 16);

  const targets = WIDTHS.filter((w) => w < meta.width);
  if (!targets.length) targets.push(meta.width); // re-encode at native size only

  const base = rel.replace(/\.[^.]+$/, "");
  for (const format of ["avif", "webp"]) {
    for (const w of targets) {
      const outRel = `${base}.${w}.${format}`;
      const outAbs = path.join(VAULT, outRel);
      const cached = path.join(CACHE, `${hash}-${w}.${format}`);

      if (!fs.existsSync(cached)) {
        const buf = await ENCODERS[format](
          sharp(src).resize({ width: w, withoutEnlargement: true }),
        ).toBuffer();
        fs.mkdirSync(CACHE, { recursive: true });
        fs.writeFileSync(cached, buf);
      }
      // A variant heavier than the source helps nobody.
      if (fs.statSync(cached).size >= stat.size) continue;
      fs.mkdirSync(path.dirname(outAbs), { recursive: true });
      fs.copyFileSync(cached, outAbs);
      entry[format].push([w, `/vault/${encodePath(outRel)}`]);
    }
  }
  return entry;
}

/** Run `task` over `items` with at most `limit` in flight. */
async function pool(items, limit, task) {
  const results = new Map();
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const rel = items[next++];
        try {
          const r = await task(rel);
          if (r) results.set(rel, r);
        } catch (e) {
          console.warn(`  ⚠ ${rel}: ${String(e).split("\n")[0]}`);
        }
      }
    }),
  );
  return results;
}

const files = walk(VAULT);
if (!files.length) {
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  fs.writeFileSync(MANIFEST, "{}\n");
  console.log(
    "build-image-variants: no vault images; wrote an empty manifest.",
  );
  process.exit(0);
}

const started = Date.now();
const referenced = referencedNames();
const results = await pool(files, Math.max(1, os.cpus().length), (rel) =>
  variantsFor(rel, referenced),
);

const manifest = {};
let variants = 0;
let unused = 0;
for (const rel of files.sort()) {
  const e = results.get(rel);
  if (!e) continue;
  if (e.unused) {
    unused++;
    delete e.unused;
  }
  manifest[rel] = e;
  variants += e.avif.length + e.webp.length;
}
fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 0)}\n`);

console.log(
  `build-image-variants: ${files.length} image(s), ${variants} variant(s) in ` +
    `${((Date.now() - started) / 1000).toFixed(1)}s → content/vault-images.json` +
    (unused ? ` (${unused} unreferenced, sized but not re-encoded)` : ""),
);
