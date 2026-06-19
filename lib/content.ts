import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import * as TOML from "smol-toml";
import { INCLUDE_DRAFTS } from "./site";
import { resolveVaultAssetByName, listVaultAssets } from "./vault-assets";

const CONTENT_DIR = path.join(process.cwd(), "content");
const POSTS_DIR = path.join(CONTENT_DIR, "posts");

export interface Frontmatter {
  title: string;
  author?: string[];
  date?: Date;
  tags?: string[];
  draft?: boolean;
  subtitle?: string;
  seotitle?: string;
  noindex?: boolean;
  latex?: boolean;
  dropcap?: boolean;
}

export interface Doc {
  /** ASCII URL slug, e.g. "applied-sciences/agriculture/permaculture". */
  slug: string;
  /** On-disk path without extension, e.g. "Applied Sciences/Agriculture/Permaculture". */
  rawPath: string;
  body: string;
  frontmatter: Frontmatter;
}

// `+++ … +++` blocks are parsed as TOML; the default `--- … ---` blocks as YAML
// (Obsidian-style notes), which gray-matter handles out of the box.
const tomlOptions = {
  delimiters: "+++",
  language: "toml",
  engines: {
    toml: {
      parse: (s: string) => TOML.parse(s) as Record<string, unknown>,
      stringify: () => {
        throw new Error("TOML stringify is not supported");
      },
    },
  },
} as const;

function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return undefined;
}

function slugifySegment(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function slugifyPath(rel: string): string {
  return rel.split("/").map(slugifySegment).filter(Boolean).join("/");
}

// Folders excluded from publishing (Obsidian internals / source material).
const IGNORE_DIRS = new Set(["sources", ".obsidian", ".trash"]);
// The note used as the site index (rendered on the home page, not as a post).
export const INDEX_NOTE = "Garden of Knowledge";

// Recursively list post files as paths without extension (forward slashes).
function walkPosts(dir = POSTS_DIR, base = ""): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      out.push(...walkPosts(path.join(dir, entry.name), rel));
    } else if (entry.name.endsWith(".md")) {
      const slugless = rel.replace(/\.md$/, "");
      if (slugless !== INDEX_NOTE) out.push(slugless);
    }
  }
  return out;
}

// slug -> on-disk path (without extension). Built once; ASCII slugs sidestep the
// encoding pitfalls of spaces/accents in `output: export` catch-all routes.
let slugMapCache: Map<string, string> | null = null;
function slugMap(): Map<string, string> {
  if (slugMapCache) return slugMapCache;
  const map = new Map<string, string>();
  for (const rel of walkPosts().sort()) {
    const base = slugifyPath(rel) || "note";
    let slug = base;
    for (let i = 2; map.has(slug); i++) slug = `${base}-${i}`;
    map.set(slug, rel);
  }
  slugMapCache = map;
  return map;
}

// --- Wikilink resolution ([[Note]], [[path/Note|alias]], [[Note#heading]]) ---
let wikiCache: {
  byPath: Map<string, string>;
  byBase: Map<string, string>;
} | null = null;
function wikiIndex() {
  if (wikiCache) return wikiCache;
  const byPath = new Map<string, string>(); // rawPath (lower) -> url
  const byBase = new Map<string, string>(); // basename (lower) -> url
  for (const [slug, rawPath] of slugMap()) {
    const url = `/posts/${slug}/`;
    byPath.set(rawPath.toLowerCase(), url);
    const base = (rawPath.split("/").pop() ?? "").toLowerCase();
    if (!byBase.has(base)) byBase.set(base, url);
  }
  // The index note lives at the home page.
  byPath.set(INDEX_NOTE.toLowerCase(), "/");
  byBase.set(INDEX_NOTE.toLowerCase(), "/");
  wikiCache = { byPath, byBase };
  return wikiCache;
}

/** Resolve a wikilink target to a URL, or null if no matching note exists. */
export function resolveWikiLink(target: string): string | null {
  const t = target.trim().replace(/\.md$/i, "");
  if (!t) return null;
  const { byPath, byBase } = wikiIndex();
  const tl = t.toLowerCase();
  if (t.includes("/")) {
    if (byPath.has(tl)) return byPath.get(tl)!;
    for (const [rawLower, url] of byPath) {
      if (rawLower.endsWith(`/${tl}`)) return url; // partial path match
    }
    return (
      byBase.get(tl.split("/").pop() ?? tl) ??
      resolveVaultAssetByName(target) ??
      null
    );
  }
  // Fall back to a vault asset (e.g. [[file.pdf]], [[image.png]]).
  return byBase.get(tl) ?? resolveVaultAssetByName(target) ?? null;
}

function parse(file: string, slug: string, rawPath: string): Doc {
  const raw = fs.readFileSync(file, "utf8");
  const { data, content } = raw.startsWith("+++")
    ? matter(raw, tomlOptions)
    : matter(raw);
  const fm = data as Record<string, unknown>;

  // Notes often have no `title`; fall back to the file name.
  const title =
    typeof fm.title === "string" && fm.title.trim()
      ? fm.title
      : (rawPath.split("/").pop() ?? rawPath);

  // Obsidian notes repeat the title as a leading `# H1`; drop it since the
  // layout renders its own <h1> from the title.
  const body = content.replace(/^\s*#\s+[^\n]*\n?/, "");

  return {
    slug,
    rawPath,
    body,
    frontmatter: {
      ...(fm as unknown as Frontmatter),
      title,
      date: toDate(fm.date),
    },
  };
}

export function getPostSlugs(): string[] {
  return [...slugMap().keys()];
}

// generateMetadata() and the page component both call getPost() for the same
// slug; cache so each note's file is read and parsed once per build.
const postCache = new Map<string, Doc>();

/** `slug` is the ASCII URL slug. */
export function getPost(slug: string): Doc {
  const cached = postCache.get(slug);
  if (cached) return cached;
  const rawPath = slugMap().get(slug);
  if (!rawPath) throw new Error(`Unknown post slug: ${slug}`);
  const doc = parse(path.join(POSTS_DIR, `${rawPath}.md`), slug, rawPath);
  postCache.set(slug, doc);
  return doc;
}

let allPostsCache: Doc[] | null = null;
/** All non-draft posts (draft posts included only when INCLUDE_DRAFTS). */
export function getAllPosts(): Doc[] {
  if (allPostsCache) return allPostsCache;
  allPostsCache = [...slugMap().entries()]
    .map(([slug, rawPath]) =>
      parse(path.join(POSTS_DIR, `${rawPath}.md`), slug, rawPath),
    )
    .filter((p) => INCLUDE_DRAFTS || !p.frontmatter.draft)
    .sort((a, b) => dateValue(b) - dateValue(a));
  return allPostsCache;
}

function dateValue(d: Doc): number {
  return d.frontmatter.date ? d.frontmatter.date.getTime() : 0;
}

export interface TreeFile {
  type: "file";
  name: string;
  title: string;
  href: string;
  asset?: boolean; // standalone image/PDF file rather than a note
  date?: Date;
}
export interface TreeDir {
  type: "dir";
  name: string;
  children: TreeNode[];
}
export type TreeNode = TreeDir | TreeFile;

// Place a file node into the tree, creating intermediate folders as needed.
function addToTree(root: TreeNode[], parts: string[], file: TreeFile): void {
  let level = root;
  for (const dirName of parts.slice(0, -1)) {
    let dir = level.find(
      (n): n is TreeDir => n.type === "dir" && n.name === dirName,
    );
    if (!dir) {
      dir = { type: "dir", name: dirName, children: [] };
      level.push(dir);
    }
    level = dir.children;
  }
  level.push(file);
}

/**
 * Folder tree mirroring content/posts/ on disk: notes plus standalone asset
 * files (images, PDFs) so loose attachments are reachable from the home page.
 */
export function getPostTree(): TreeNode[] {
  const root: TreeNode[] = [];
  for (const post of getAllPosts()) {
    const parts = post.rawPath.split("/");
    addToTree(root, parts, {
      type: "file",
      name: parts[parts.length - 1],
      title: post.frontmatter.title,
      href: `/posts/${post.slug}/`,
      date: post.frontmatter.date,
    });
  }
  for (const asset of listVaultAssets()) {
    const parts = asset.rel.split("/");
    if (parts.some((p) => IGNORE_DIRS.has(p))) continue; // keep sources/ etc. hidden
    addToTree(root, parts, {
      type: "file",
      name: parts[parts.length - 1],
      title: parts[parts.length - 1],
      href: asset.url,
      asset: true,
    });
  }
  sortTree(root);
  return root;
}

// Directories first, then files; both ordered by file name with natural numeric
// sorting so numbered notes (00, 01, … 11) keep their intended order.
function sortTree(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
  for (const n of nodes) if (n.type === "dir") sortTree(n.children);
}

export interface SiblingRef {
  title: string;
  slug: string;
}
export interface SiblingNav {
  folder: string;
  siblings: (SiblingRef & { current: boolean })[];
  prev: SiblingRef | null;
  next: SiblingRef | null;
}

function dirOf(rawPath: string): string {
  return rawPath.includes("/")
    ? rawPath.slice(0, rawPath.lastIndexOf("/"))
    : "";
}

/** Notes in the same folder as `slug`, with previous/next neighbours (A→Z). */
export function getSiblings(slug: string): SiblingNav {
  const all = getAllPosts();
  const current = all.find((p) => p.slug === slug);
  if (!current) return { folder: "", siblings: [], prev: null, next: null };
  const dir = dirOf(current.rawPath);
  const base = (p: Doc) => p.rawPath.split("/").pop() ?? "";
  const sibs = all
    .filter((p) => dirOf(p.rawPath) === dir)
    .sort((a, b) =>
      base(a).localeCompare(base(b), undefined, { numeric: true }),
    );
  const idx = sibs.findIndex((p) => p.slug === slug);
  const ref = (p: Doc): SiblingRef => ({
    title: p.frontmatter.title,
    slug: p.slug,
  });
  return {
    folder: dir,
    siblings: sibs.map((p) => ({ ...ref(p), current: p.slug === slug })),
    prev: idx > 0 ? ref(sibs[idx - 1]) : null,
    next: idx < sibs.length - 1 ? ref(sibs[idx + 1]) : null,
  };
}

/** Top-level single page such as `404`. */
export function getPage(name: string): Doc {
  return parse(path.join(CONTENT_DIR, `${name}.md`), name, name);
}

/** The index note (Garden of Knowledge), rendered on the home page. */
export function getIndexDoc(): Doc {
  return parse(path.join(POSTS_DIR, `${INDEX_NOTE}.md`), "", INDEX_NOTE);
}

export function formatDateLong(date: Date | undefined): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatDateMachine(date: Date | undefined): string {
  return date ? date.toISOString() : "";
}
