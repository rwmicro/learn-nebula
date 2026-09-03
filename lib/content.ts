import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import * as TOML from "smol-toml";
import { INCLUDE_DRAFTS } from "./site";
import { resolveVaultAssetByName, listVaultAssets } from "./vault-assets";
import { getAnkiManifest } from "./anki";

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
  /** Taxonomy from the Obsidian frontmatter (see sources/YAML_TAGS_GUIDE). */
  domain?: string;
  subdomain?: string;
  /** BCP-47-ish language code (e.g. "es", "de") for a note whose content is
   *  substantially in that language — a full-immersion or reading-practice
   *  note, say, as opposed to a French note that just embeds a few foreign
   *  vocabulary words. Drives `<main lang>` (SinglePage), the TTS voice pick
   *  (/js/audio.js reads `main[lang]`), OG locale (lib/seo.ts) and the home
   *  "Langues" search facet / /graph language filter. Independent of the
   *  site's own UI locale (lib/i18n.ts). */
  lang?: string;
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

// Folders hidden from the frontend (Obsidian internals / source material /
// attachment caches). Their files are still copied to public/vault/ by
// copy-vault-images.mjs, so notes embedding `_manim/*.mp4` or `audios/*.mp3`
// keep working — they're just kept out of the browse tree, graph and search.
const IGNORE_DIRS = new Set([
  "sources",
  ".obsidian",
  ".trash",
  "audio", // per-word pronunciation clips (thousands of ![word](audio/*.mp3))
  "_manim", // obsidian-manim render cache (_manim/*.mp4)
]);
// The note used as the site index (rendered on the home page, not as a post).
export const INDEX_NOTE = "Garden of Knowledge";

// Recursively list post files as paths without extension (forward slashes).
function walkPosts(dir = POSTS_DIR, base = ""): string[] {
  const out: string[] = [];
  // In the Cloudflare Workers runtime (e.g. /api/translate re-running this
  // build pipeline) content/posts isn't on disk. Degrade to an empty index so
  // resolveWikiLink returns null (links stay literal) instead of throwing —
  // mirrors the existsSync guard in lib/vault-assets.ts.
  if (!fs.existsSync(dir)) return out;
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

export interface DomainGroup {
  /** The frontmatter `domain` value, e.g. "Computer Science". */
  name: string;
  notes: { title: string; href: string }[];
}

/** Notes grouped by their frontmatter `domain`, for the home "Domaines" search
 *  scope. Slugs are already ASCII, so the href needs no further encoding. */
export function getDomains(): DomainGroup[] {
  const map = new Map<string, { title: string; href: string }[]>();
  for (const doc of getAllPosts()) {
    const domain =
      typeof doc.frontmatter.domain === "string"
        ? doc.frontmatter.domain.trim()
        : "";
    if (!domain) continue;
    const list = map.get(domain) ?? [];
    list.push({ title: doc.frontmatter.title, href: `/posts/${doc.slug}/` });
    map.set(domain, list);
  }
  return [...map.entries()]
    .map(([name, notes]) => ({
      name,
      notes: notes.sort((a, b) => a.title.localeCompare(b.title)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export interface LangGroup {
  /** The frontmatter `lang` code, e.g. "es". */
  code: string;
  /** Display name in the site's default locale, e.g. "espagnol". */
  name: string;
  notes: { title: string; href: string }[];
}

// Intl.DisplayNames throws for a code it doesn't recognise; fall back to the
// raw code rather than losing the group.
function langDisplayName(code: string): string {
  try {
    return new Intl.DisplayNames(["fr"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Notes grouped by their frontmatter `lang`, for the home "Langues" search
 *  scope and the /graph language filter. */
export function getLangs(): LangGroup[] {
  const map = new Map<string, { title: string; href: string }[]>();
  for (const doc of getAllPosts()) {
    const code =
      typeof doc.frontmatter.lang === "string" ? doc.frontmatter.lang.trim().toLowerCase() : "";
    if (!code) continue;
    const list = map.get(code) ?? [];
    list.push({ title: doc.frontmatter.title, href: `/posts/${doc.slug}/` });
    map.set(code, list);
  }
  return [...map.entries()]
    .map(([code, notes]) => ({
      code,
      name: langDisplayName(code),
      notes: notes.sort((a, b) => a.title.localeCompare(b.title)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
}

export interface ScopeOption {
  /** Slug path under /posts/, e.g. "social-sciences/languages-dialects/kabyle". */
  slug: string;
  /** Folder name as it stands in the vault, e.g. "Kabyle". */
  label: string;
}

// Vault folder holding one sub-folder per studied language.
const LANGUAGES_DIR = "Languages - Dialects";

/** First directory named `name` within `depth` levels, as a path relative to
 *  content/posts (forward slashes), or null. */
function findDir(name: string, dir = POSTS_DIR, base = "", depth = 2): string | null {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || IGNORE_DIRS.has(entry.name)) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.name === name) return rel;
    if (depth > 1) {
      const found = findDir(name, path.join(dir, entry.name), rel, depth - 1);
      if (found) return found;
    }
  }
  return null;
}

function hasNotes(dir: string): boolean {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name) && hasNotes(path.join(dir, entry.name))) return true;
    } else if (entry.name.endsWith(".md")) return true;
  }
  return false;
}

let languageScopesCache: ScopeOption[] | null = null;

/** The studied-language folders, for the assistant's retrieval scope selector.
 *  Unscoped retrieval is a cosine search over the WHOLE vault, so a question
 *  like "comment se forme la négation ?" happily mixes Hindi and Kabyle chunks
 *  in one answer. That hurts most for the rare languages these notes are the
 *  only trustworthy source on, hence the per-language scope. Empty when the
 *  vault has no such folder (e.g. a partial checkout) — the UI then hides it. */
export function getLanguageScopes(): ScopeOption[] {
  if (languageScopesCache) return languageScopesCache;
  const rel = findDir(LANGUAGES_DIR);
  const out: ScopeOption[] = [];
  if (rel) {
    const abs = path.join(POSTS_DIR, rel);
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (!entry.isDirectory() || IGNORE_DIRS.has(entry.name)) continue;
      if (!hasNotes(path.join(abs, entry.name))) continue;
      out.push({ slug: slugifyPath(`${rel}/${entry.name}`), label: entry.name });
    }
    out.sort((a, b) => a.label.localeCompare(b.label, "fr", { numeric: true }));
  }
  languageScopesCache = out;
  return out;
}

export interface TreeFile {
  type: "file";
  name: string;
  title: string;
  href: string;
  asset?: boolean; // standalone image/PDF file rather than a note
  deck?: boolean; // Anki flashcard deck (links to /cartes/<slug>)
  date?: Date;
  /** Frontmatter `lang`, notes only — carried through to the /graph language filter. */
  lang?: string;
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
      lang: post.frontmatter.lang,
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
  // Anki decks surface in the folder that held their .apkg, linking to the
  // flip-through study page.
  for (const deck of getAnkiManifest()) {
    const parts = (deck.folder ? deck.folder.split("/") : []).concat(deck.name);
    addToTree(root, parts, {
      type: "file",
      name: deck.name,
      title: deck.name,
      href: `/cartes/${deck.slug}/`,
      deck: true,
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

// --- Home page taxonomy -----------------------------------------------------
// The home page renders a collapsible tree of every note, derived from the real
// folder tree rather than hard-coded.

export type HomeTreeNode =
  | {
      type: "dir";
      /** Display name, e.g. "Computer Science" or "Échecs". */
      name: string;
      /** Stable, on-disk path used as the open/closed key (raw, un-prettified). */
      path: string;
      /** Number of notes contained (transitively). */
      count: number;
      children: HomeTreeNode[];
    }
  | {
      type: "note";
      title: string;
      href: string;
      deck?: boolean;
      /** Standalone attachment (image/PDF) rather than a note. */
      asset?: boolean;
    };

// On-disk folder names that lack the accents/symbols we want to display.
const HOME_DISPLAY_NAME: Record<string, string> = {
  Echecs: "Échecs",
  Litterature: "Littérature",
  "Languages - Dialects": "Languages & Dialects",
};
function homeDisplayName(folder: string): string {
  return HOME_DISPLAY_NAME[folder] ?? folder;
}

// Keep notes, decks AND standalone assets (images/PDFs) as leaves, tagging each
// folder with how many items it transitively contains.
function pruneToNotes(node: TreeNode, parentPath: string): HomeTreeNode | null {
  if (node.type === "file") {
    return {
      type: "note",
      title: node.title,
      href: node.href,
      deck: node.deck,
      asset: node.asset,
    };
  }
  const path = parentPath ? `${parentPath}/${node.name}` : node.name;
  const children = node.children
    .map((c) => pruneToNotes(c, path))
    .filter((c): c is HomeTreeNode => c !== null);
  if (children.length === 0) return null;
  const count = children.reduce(
    (n, c) => n + (c.type === "note" ? 1 : c.count),
    0,
  );
  return { type: "dir", name: homeDisplayName(node.name), path, count, children };
}

/** Full notes tree for the home page (assets pruned); top level is the two top
 *  folders (Applied / Social Sciences). */
export function getHomeTree(): HomeTreeNode[] {
  return getPostTree()
    .map((n) => pruneToNotes(n, ""))
    .filter((n): n is HomeTreeNode => n !== null);
}

export interface PdfRef {
  title: string;
  href: string;
  /** Folder breadcrumb (top group dropped), e.g. "Psychologie · Biais". */
  where: string;
}

/** Standalone PDF attachments in the vault, with their folder breadcrumb.
 *  getHomeTree() prunes assets, so the home advanced-search PDF scope reads
 *  this list instead. */
export function getPdfAssets(): PdfRef[] {
  const out: PdfRef[] = [];
  const walk = (nodes: TreeNode[], parents: string[]) => {
    for (const node of nodes) {
      if (node.type === "dir") {
        walk(node.children, [...parents, homeDisplayName(node.name)]);
      } else if (node.asset && /\.pdf$/i.test(node.name)) {
        out.push({
          title: node.name.replace(/\.pdf$/i, ""),
          href: node.href,
          where: parents.slice(1).join(" · "),
        });
      }
    }
  };
  walk(getPostTree(), []);
  return out.sort((a, b) => a.title.localeCompare(b.title));
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

// --- Backlinks: reverse [[wikilink]] index (which notes link to a note) ------
let backlinkCache: Map<string, Set<string>> | null = null;
function backlinkIndex(): Map<string, Set<string>> {
  if (backlinkCache) return backlinkCache;
  const inbound = new Map<string, Set<string>>(); // targetSlug -> source slugs
  for (const post of getAllPosts()) {
    const re = /\[\[([^\]\n]+)\]\]/g;
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(post.body)) !== null) {
      const raw = m[1].split("|")[0].split("#")[0].trim();
      if (!raw) continue;
      const url = resolveWikiLink(raw);
      if (!url || !url.startsWith("/posts/")) continue;
      const target = url.slice("/posts/".length).replace(/\/$/, "");
      if (target === post.slug || seen.has(target)) continue;
      seen.add(target);
      let set = inbound.get(target);
      if (!set) inbound.set(target, (set = new Set()));
      set.add(post.slug);
    }
  }
  backlinkCache = inbound;
  return inbound;
}

/** All note→note [[wikilink]] edges as [sourceSlug, targetSlug] pairs. */
export function getWikiLinkEdges(): [string, string][] {
  const edges: [string, string][] = [];
  for (const [target, sources] of backlinkIndex()) {
    for (const s of sources) edges.push([s, target]);
  }
  return edges;
}

/** Notes that link to `slug` via [[wikilinks]], A→Z by title. */
export function getBacklinks(slug: string): SiblingRef[] {
  const sources = backlinkIndex().get(slug);
  if (!sources) return [];
  const out: SiblingRef[] = [];
  for (const s of sources) {
    try {
      out.push({ title: getPost(s).frontmatter.title, slug: s });
    } catch {
      /* slug no longer resolvable */
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
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
  // Build-time output must match the site default locale (fr): the runtime date
  // swap (/js/i18n.js) only re-runs when a *non-default* locale is stored, so for
  // a default-locale visitor this SSR string is what stays on screen.
  return new Intl.DateTimeFormat("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}
