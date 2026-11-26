import fs from "node:fs";
import path from "node:path";

// Resolves asset references in notes (images, PDFs…) to files served from
// public/vault/. References may be vault-relative ("sources/images/x.jpg"),
// note-relative ("x.png", "img/x.png"), or a bare file name (Obsidian wikilink).

const POSTS_DIR = path.join(process.cwd(), "content", "posts");
const EXTS = new Set([
  // Images
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".avif",
  // Documents
  ".pdf",
  // Video — Manim cache outputs (_manim/*.mp4) and direct ![](clip.mp4) embeds.
  ".mp4",
  ".webm",
  ".mov",
  ".ogv",
  // Audio — pronunciation clips embedded as ![word](clip.mp3).
  ".mp3",
  ".wav",
  ".ogg",
  ".oga",
  ".m4a",
  ".opus",
  ".flac",
  ".aac",
]);

export const VIDEO_EXTS = new Set([".mp4", ".webm", ".mov", ".ogv"]);
export function isVideoSrc(src: string): boolean {
  const dot = src.lastIndexOf(".");
  if (dot < 0) return false;
  const ext = src.slice(dot).toLowerCase().split(/[?#]/)[0];
  return VIDEO_EXTS.has(ext);
}

export const AUDIO_EXTS = new Set([
  ".mp3",
  ".wav",
  ".ogg",
  ".oga",
  ".m4a",
  ".opus",
  ".flac",
  ".aac",
]);
/** True for the pronunciation-clip extensions rehypeVaultAssets promotes
 * `![word](clip.mp3)` into the `.pron` player instead of a broken `<img>`. */
export function isAudioSrc(src: string): boolean {
  const dot = src.lastIndexOf(".");
  if (dot < 0) return false;
  const ext = src.slice(dot).toLowerCase().split(/[?#]/)[0];
  return AUDIO_EXTS.has(ext);
}

/** One vault raster image, as build-image-variants.mjs recorded it. */
export interface VaultImage {
  /** Intrinsic pixel size, so the <img> can reserve its box and not shift. */
  w: number;
  h: number;
  /** [width, url] pairs, ascending; empty when the source was too small to
   *  be worth re-encoding. */
  avif: [number, string][];
  webp: [number, string][];
}

const MANIFEST = path.join(process.cwd(), "content", "vault-images.json");
let imageCache: Record<string, VaultImage> | null = null;

function imageManifest(): Record<string, VaultImage> {
  if (imageCache) return imageCache;
  try {
    imageCache = JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as Record<
      string,
      VaultImage
    >;
  } catch {
    // No manifest yet (a `next dev` before the build step, or a runtime that
    // has no vault on disk): every image simply renders as a plain <img>.
    imageCache = {};
  }
  return imageCache;
}

/** Variants and intrinsic size for a served URL like `/vault/a/b.png`. */
export function getVaultImage(url: string): VaultImage | null {
  if (!url.startsWith("/vault/")) return null;
  const rel = decodeURIComponent(url.slice("/vault/".length));
  return imageManifest()[rel] ?? null;
}

let cache: Map<string, string> | null = null;
function index(): Map<string, string> {
  if (cache) return cache;
  const map = new Map<string, string>(); // lowercased rel -> actual rel
  const walk = (dir: string, base = "") => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else if (EXTS.has(path.extname(entry.name).toLowerCase()))
        map.set(rel.toLowerCase(), rel);
    }
  };
  if (fs.existsSync(POSTS_DIR)) walk(POSTS_DIR);
  cache = map;
  return map;
}

function normalize(p: string): string {
  const parts: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

const encodePath = (p: string) =>
  p.split("/").map(encodeURIComponent).join("/");

/** Served URL for a relative asset reference, or null if no such file exists. */
export function resolveVaultAsset(src: string, noteDir: string): string | null {
  const cleaned = decodeURIComponent(src.replace(/^file:\/+/i, "").trim());
  const candidates = [
    normalize(noteDir ? `${noteDir}/${cleaned}` : cleaned), // note-relative
    normalize(cleaned), // vault-relative
  ];
  const idx = index();
  for (const c of candidates) {
    const hit = idx.get(c.toLowerCase());
    if (hit) return `/vault/${encodePath(hit)}`;
  }
  return null;
}

/**
 * All vault assets as { relative path, served URL, size } triples.
 *
 * The size is what makes the browse tree able to warn before a click. These
 * links go straight to the original file on purpose — a 12022x8364 history
 * timeline is *meant* to be opened and zoomed, so swapping in the 1440px
 * variant would defeat the asset — but 15 MB with no warning is not a choice
 * the reader got to make.
 */
export function listVaultAssets(): { rel: string; url: string; bytes: number }[] {
  return [...index().values()].map((rel) => {
    let bytes = 0;
    try {
      bytes = fs.statSync(path.join(POSTS_DIR, rel)).size;
    } catch {
      /* listed from the index but gone from disk — treat as unknown */
    }
    return { rel, url: `/vault/${encodePath(rel)}`, bytes };
  });
}

/** Served URL for an asset matched by file name only (Obsidian wikilinks). */
export function resolveVaultAssetByName(name: string): string | null {
  const base = (name.split("/").pop() ?? "").toLowerCase();
  if (!base) return null;
  for (const [rel, actual] of index()) {
    if ((rel.split("/").pop() ?? "") === base)
      return `/vault/${encodePath(actual)}`;
  }
  return null;
}
