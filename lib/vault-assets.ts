import fs from "node:fs";
import path from "node:path";

// Resolves asset references in notes (images, PDFs…) to files served from
// public/vault/. References may be vault-relative ("sources/images/x.jpg"),
// note-relative ("x.png", "img/x.png"), or a bare file name (Obsidian wikilink).

const POSTS_DIR = path.join(process.cwd(), "content", "posts");
const EXTS = new Set([
  // Images
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif",
  // Documents
  ".pdf",
  // Video — Manim cache outputs (_manim/*.mp4) and direct ![](clip.mp4) embeds.
  ".mp4", ".webm", ".mov", ".ogv",
  // Audio — pronunciation clips embedded as ![word](clip.mp3).
  ".mp3", ".wav", ".ogg", ".oga", ".m4a", ".opus", ".flac", ".aac",
]);

export const VIDEO_EXTS = new Set([".mp4", ".webm", ".mov", ".ogv"]);
export function isVideoSrc(src: string): boolean {
  const dot = src.lastIndexOf(".");
  if (dot < 0) return false;
  const ext = src.slice(dot).toLowerCase().split(/[?#]/)[0];
  return VIDEO_EXTS.has(ext);
}

export const AUDIO_EXTS = new Set([
  ".mp3", ".wav", ".ogg", ".oga", ".m4a", ".opus", ".flac", ".aac",
]);
/** True for the pronunciation-clip extensions rehypeVaultAssets promotes
 * `![word](clip.mp3)` into the `.pron` player instead of a broken `<img>`. */
export function isAudioSrc(src: string): boolean {
  const dot = src.lastIndexOf(".");
  if (dot < 0) return false;
  const ext = src.slice(dot).toLowerCase().split(/[?#]/)[0];
  return AUDIO_EXTS.has(ext);
}

// Pronunciation clips are served straight from the vault repo instead of being
// bundled into the Cloudflare Pages deployment: a vault can hold thousands of
// small per-word clips (this project's currently has ~9,500), and Pages hard-
// caps a deployment at 20,000 files — copying them all into public/vault/ blew
// past that. Same repo/branch/subdir env vars as scripts/fetch-notes.mjs (kept
// in sync by hand; a plain Node script can't import this TS module). Assumes
// the vault repo is public (the documented default, README.md) — raw.
// githubusercontent.com needs no auth for a public repo but can't be reached
// anonymously for a private one, so audio would silently fail to load if
// NOTES_REPO_URL/NOTES_REPO_TOKEN are ever pointed at a private vault.
function audioBaseUrl(): string {
  const url = process.env.NOTES_REPO_URL || "https://github.com/rwmicro/pensine.git";
  const branch = process.env.NOTES_REPO_BRANCH || "main";
  const subdir = process.env.NOTES_SUBDIR || "";
  const m = /github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/i.exec(url);
  const owner = m?.[1] ?? "rwmicro";
  const repo = m?.[2] ?? "pensine";
  const base = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;
  return subdir ? `${base}/${subdir}` : base;
}
const AUDIO_BASE_URL = audioBaseUrl();

let cache: Map<string, string> | null = null;
function index(): Map<string, string> {
  if (cache) return cache;
  const map = new Map<string, string>(); // lowercased rel -> actual rel
  const walk = (dir: string, base = "") => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else if (EXTS.has(path.extname(entry.name).toLowerCase())) map.set(rel.toLowerCase(), rel);
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

const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

// Audio goes straight to the vault repo (see audioBaseUrl above); everything
// else (images, PDFs, video) still goes through the copy-vault-images.mjs
// mirror at public/vault/ — those extensions stay in the low tens of files.
function servedUrl(rel: string): string {
  return isAudioSrc(rel) ? `${AUDIO_BASE_URL}/${encodePath(rel)}` : `/vault/${encodePath(rel)}`;
}

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
    if (hit) return servedUrl(hit);
  }
  return null;
}

/** All vault assets as { relative path, served URL } pairs — excludes audio,
 * which is meant to be embedded inline (`![word](clip.mp3)`) via
 * resolveVaultAsset, never listed as a standalone browsable attachment
 * (getPostTree's "loose asset" tree would otherwise gain one leaf per
 * pronunciation clip — thousands of them). */
export function listVaultAssets(): { rel: string; url: string }[] {
  return [...index().values()]
    .filter((rel) => !isAudioSrc(rel))
    .map((rel) => ({ rel, url: `/vault/${encodePath(rel)}` }));
}

/** Served URL for an asset matched by file name only (Obsidian wikilinks). */
export function resolveVaultAssetByName(name: string): string | null {
  const base = (name.split("/").pop() ?? "").toLowerCase();
  if (!base) return null;
  for (const [rel, actual] of index()) {
    if ((rel.split("/").pop() ?? "") === base) return servedUrl(actual);
  }
  return null;
}
