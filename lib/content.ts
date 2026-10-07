import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import * as TOML from "smol-toml";
import { INCLUDE_DRAFTS } from "./site";
import { resolveVaultAssetByName, listVaultAssets } from "./vault-assets";
import { joinNotePath } from "./vault-health";
import { getAnkiManifest } from "./anki";
import { tagKey, tagSlug } from "./slug";
import {
  definitionAnchor,
  glossaryDiscipline,
  entriesForNote,
  extractDefinitions,
  type GlossaryEntry,
} from "./glossary";
import {
  buildPrereqComponents,
  parsePrereqField,
  prereqCycles,
  MIN_PATH_NOTES,
  type PrereqEdge,
} from "./prereq-graph";

const CONTENT_DIR = path.join(process.cwd(), "content");
const POSTS_DIR = path.join(CONTENT_DIR, "posts");

/** Growth stages, seedling → budding → evergreen (Maggie Appleton's
 *  convention, now the common vocabulary across digital gardens). */
export const NOTE_STAGES = ["seedling", "budding", "evergreen"] as const;
export type NoteStage = (typeof NOTE_STAGES)[number];

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
  /** When the note was last meaningfully revised ("last tended"). Read from
   *  `updated` / `modified` / `lastmod` / `last-tended`, whichever the vault
   *  note carries — Obsidian plugins disagree on the name. The vault clone is
   *  shallow (`git clone --depth 1` in scripts/fetch-notes.mjs), so per-file
   *  git history is not available to derive this instead. */
  updated?: Date;
  /** Growth stage, the digital-garden convention: a note is published early
   *  as a `seedling` and matures in public. Read from `stage` / `growth` /
   *  `maturity`; absent means the note simply doesn't declare one. */
  stage?: NoteStage;
  /** BCP-47-ish language code (e.g. "es", "de") for a note whose content is
   *  substantially in that language — a full-immersion or reading-practice
   *  note, say, as opposed to a French note that just embeds a few foreign
   *  vocabulary words. Drives `<main lang>` (SinglePage), the TTS voice pick
   *  (/js/audio.js reads `main[lang]`), OG locale (lib/seo.ts) and the home
   *  "Langues" search facet / /graph language filter. Independent of the
   *  site's own UI locale (lib/i18n.ts). */
  lang?: string;
  /** The historical year this note is ABOUT — e.g. a note on the French
   *  Revolution sets `year: 1789`, not today's date (that's `date` above).
   *  Negative for BCE (`year: -509` for 509 BCE). Powers /frise/; a note
   *  without it just doesn't appear there. */
  year?: number;
  /** For a note covering a span rather than a single year (e.g. 1789–1799):
   *  draws a bar instead of a point on the timeline. */
  yearEnd?: number;
  /** Display label when the bare year doesn't read naturally on its own
   *  ("Antiquité tardive" rather than "476") — cosmetic only, sorting always
   *  goes by `year`. */
  period?: string;
  /** Notes to read first, raw from the frontmatter (`prerequis`, or its
   *  English spelling `prerequisites`): wikilinks or plain titles/paths, one
   *  or a list. Parsed by parsePrereqField and resolved like a [[wikilink]];
   *  see getPrerequisites(). */
  prerequis?: unknown;
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

// YAML/TOML parse an unquoted `year: -509` as a number already; this only
// exists to tolerate a quoted `year: "1789"` (a string) without silently
// dropping the note from the timeline.
function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

// Authors write the stage in whatever vocabulary their vault settled on; map
// the common synonyms onto the three canonical stages and ignore anything else
// rather than inventing a stage the author never claimed.
const STAGE_ALIAS: Record<string, NoteStage> = {
  seed: "seedling",
  seeds: "seedling",
  seedling: "seedling",
  sprout: "seedling",
  graine: "seedling",
  semis: "seedling",
  bud: "budding",
  budding: "budding",
  growing: "budding",
  sapling: "budding",
  bourgeon: "budding",
  pousse: "budding",
  evergreen: "evergreen",
  mature: "evergreen",
  grown: "evergreen",
  ripe: "evergreen",
  perenne: "evergreen",
};

function toStage(value: unknown): NoteStage | undefined {
  if (typeof value !== "string") return undefined;
  const key = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return STAGE_ALIAS[key];
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

// Above this, a browsable asset gets its weight printed next to its name. The
// vault holds a few genuinely huge originals — a 12022x8364 history timeline is
// 15 MB — and those links go to the file itself, not a resized variant, because
// zooming into them is the point. 2 MB is roughly where a download stops being
// instant on a phone.
export const HEAVY_ASSET_BYTES = 2 * 1024 * 1024;

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

/**
 * Resolve a relative markdown link to another note — `[x](q01-foo.md)`,
 * `[x](../Other/Note.md#part)`, as Obsidian and GitHub both write them — from
 * the folder `dir` of the note that holds it. Returns the page URL (with the
 * `#anchor` kept) or null when the href isn't a relative `.md` link or names
 * no note in the vault.
 */
export function resolveRelativeNoteLink(dir: string, href: string): string | null {
  if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(href)) return null; // external, anchor, absolute
  const hashAt = href.indexOf("#");
  const pathPart = hashAt === -1 ? href : href.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : href.slice(hashAt);
  if (!/\.md$/i.test(pathPart)) return null;
  let decoded = pathPart;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    /* keep as written */
  }
  const url = wikiIndex().byPath.get(joinNotePath(dir, decoded).toLowerCase());
  return url ? url + hash : null;
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
      updated: toDate(
        fm.updated ?? fm.modified ?? fm.lastmod ?? fm["last-tended"],
      ),
      stage: toStage(fm.stage ?? fm.growth ?? fm.maturity),
      year: toNumber(fm.year),
      yearEnd: toNumber(fm.yearEnd ?? fm["year-end"]),
      period: typeof fm.period === "string" ? fm.period.trim() || undefined : undefined,
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

export interface RecentNote {
  title: string;
  href: string;
  /** Whichever of `updated`/`date` this note was ranked on. */
  at: Date;
  /** True when `at` came from `updated`, i.e. the note was re-tended rather
   *  than freshly planted — the two read differently to a gardener. */
  tended: boolean;
  stage?: NoteStage;
}

/** The most recently touched notes, newest first. A garden is not a blog, so
 *  "recent" means last *tended* where the note says so (frontmatter `updated`),
 *  falling back to its planting date. Notes carrying neither are skipped
 *  rather than being pinned to the epoch at the bottom of the list. */
export function getRecentNotes(limit = 6): RecentNote[] {
  const out: RecentNote[] = [];
  for (const d of getAllPosts()) {
    const { date, updated, title, stage } = d.frontmatter;
    const at = updated ?? date;
    if (!at) continue;
    out.push({
      title,
      href: `/posts/${d.slug}/`,
      at,
      tended: Boolean(updated),
      stage,
    });
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

export interface TimelineEntry {
  title: string;
  href: string;
  /** Historical year the note is about (frontmatter `year`), not when it was
   *  written. Negative for BCE. */
  year: number;
  yearEnd?: number;
  /** Display label; falls back to the bare year when absent. */
  period?: string;
  domain?: string;
}

/** Every note that declares a historical `year`, oldest first. Powers
 *  /frise/. A note without `year` simply never appears — there is no
 *  fallback to `date` (when the note was written) or `updated`, since those
 *  answer a completely different question. */
export function getTimeline(): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  for (const d of getAllPosts()) {
    const { year, yearEnd, period, title, domain } = d.frontmatter;
    if (year === undefined) continue;
    out.push({ title, href: `/posts/${d.slug}/`, year, yearEnd, period, domain });
  }
  return out.sort((a, b) => a.year - b.year);
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

// --- /themes/: notes by tag and by discipline ---------------------------------

/** A tag gets its own page from this many notes up. Two thirds of the vault's
 *  ~1,300 tags sit on a single note, where a page would only repeat that note;
 *  their pills keep linking to the home search instead. */
export const MIN_TAG_NOTES = 2;

export interface ThemeNote {
  title: string;
  href: string;
  /** Discipline display name ("Biology", "Philosophy"), "" for a note that
   *  sits directly under a top folder. */
  discipline: string;
}

export interface TagGroup {
  /** ASCII slug, the page is /themes/<slug>/. */
  slug: string;
  /** The spelling most notes use, when several fold to one slug. */
  name: string;
  notes: ThemeNote[];
}

export interface Discipline {
  /** ASCII slug, the page is /disciplines/<slug>/. */
  slug: string;
  /** Display name, e.g. "Échecs" (see homeDisplayName). */
  name: string;
  /** "Applied Sciences" or "Social Sciences". */
  top: string;
  /** Notes grouped by their sub-folder under the discipline ("" = at its root). */
  sections: { name: string; notes: ThemeNote[] }[];
  count: number;
  /** The discipline's most used tags that have a page, most used first. */
  tags: { slug: string; name: string; count: number }[];
  /** Slug prefix shared by its notes ("applied-sciences/biology/"), for
   *  counting read notes without listing every slug in the page. */
  prefix: string;
}

function disciplineOf(rawPath: string): { top: string; name: string } | null {
  const parts = rawPath.split("/");
  return parts.length >= 3 ? { top: parts[0], name: parts[1] } : null;
}

function themeNote(d: Doc): ThemeNote {
  const disc = disciplineOf(d.rawPath);
  return {
    title: d.frontmatter.title,
    href: `/posts/${d.slug}/`,
    discipline: disc ? homeDisplayName(disc.name) : "",
  };
}

const byTitle = (a: ThemeNote, b: ThemeNote) =>
  a.title.localeCompare(b.title, "fr", { numeric: true });

let tagsCache: TagGroup[] | null = null;
/** Every tag carried by at least MIN_TAG_NOTES notes, most used first. */
export function getTags(): TagGroup[] {
  if (tagsCache) return tagsCache;
  const map = new Map<
    string,
    { spellings: Map<string, number>; notes: Map<string, ThemeNote> }
  >();
  for (const d of getAllPosts()) {
    for (const raw of d.frontmatter.tags ?? []) {
      // YAML turns tokens like `802.11` into numbers.
      const name = String(raw).trim();
      const slug = tagKey(name);
      if (!slug) continue;
      const e = map.get(slug) ?? { spellings: new Map(), notes: new Map() };
      // An alias ("deutsch") joins its page but never names it.
      if (tagSlug(name) === slug) e.spellings.set(name, (e.spellings.get(name) ?? 0) + 1);
      e.notes.set(d.slug, themeNote(d));
      map.set(slug, e);
    }
  }
  tagsCache = [...map.entries()]
    .filter(([, e]) => e.notes.size >= MIN_TAG_NOTES)
    .map(([slug, e]) => ({
      slug,
      name: [...e.spellings.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? slug,
      notes: [...e.notes.values()].sort(byTitle),
    }))
    .sort(
      (a, b) =>
        b.notes.length - a.notes.length || a.name.localeCompare(b.name, "fr"),
    );
  return tagsCache;
}

/** The /themes/ page of a tag, or null when it is too rare to have one. */
export function tagHref(tag: unknown): string | null {
  const slug = tagKey(String(tag));
  return getTags().some((g) => g.slug === slug) ? `/themes/${slug}/` : null;
}

let disciplinesCache: Discipline[] | null = null;
/** The second-level folders (Biology, Philosophy…), A→Z within each top folder. */
export function getDisciplines(): Discipline[] {
  if (disciplinesCache) return disciplinesCache;
  const withPage = new Map(getTags().map((g) => [g.slug, g.name]));
  const map = new Map<
    string,
    {
      top: string;
      folder: string;
      sections: Map<string, ThemeNote[]>;
      tags: Map<string, number>;
      prefix: string;
    }
  >();
  for (const d of getAllPosts()) {
    const disc = disciplineOf(d.rawPath);
    if (!disc) continue;
    const key = `${disc.top}/${disc.name}`;
    const e = map.get(key) ?? {
      top: disc.top,
      folder: disc.name,
      sections: new Map(),
      tags: new Map(),
      prefix: d.slug.split("/").slice(0, 2).join("/") + "/",
    };
    const parts = d.rawPath.split("/");
    const section = parts.length > 3 ? parts[2] : "";
    e.sections.set(section, [...(e.sections.get(section) ?? []), themeNote(d)]);
    for (const raw of d.frontmatter.tags ?? []) {
      const slug = tagKey(String(raw));
      if (withPage.has(slug)) e.tags.set(slug, (e.tags.get(slug) ?? 0) + 1);
    }
    map.set(key, e);
  }
  disciplinesCache = [...map.values()]
    .map((e) => {
      const sections = [...e.sections.entries()]
        .map(([name, notes]) => ({ name, notes: notes.sort(byTitle) }))
        // Root notes first, then sub-folders in natural order.
        .sort((a, b) =>
          a.name === "" ? -1 : b.name === "" ? 1 :
          a.name.localeCompare(b.name, undefined, { numeric: true }),
        );
      const count = sections.reduce((n, s) => n + s.notes.length, 0);
      // A tag on most notes of the discipline, like "philosophie" on
      // Philosophy, says nothing about it; keep the ones that pick a subset.
      const tags = [...e.tags.entries()]
        .filter(([, n]) => n >= MIN_TAG_NOTES && n < count * 0.6)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 24)
        .map(([slug, n]) => ({ slug, name: withPage.get(slug)!, count: n }));
      return {
        slug: tagSlug(`${e.top} ${e.folder}`),
        name: homeDisplayName(e.folder),
        top: e.top,
        sections,
        count,
        tags,
        prefix: e.prefix,
      };
    })
    .sort(
      (a, b) =>
        a.top.localeCompare(b.top) || a.name.localeCompare(b.name, "fr"),
    );
  return disciplinesCache;
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
      typeof doc.frontmatter.lang === "string"
        ? doc.frontmatter.lang.trim().toLowerCase()
        : "";
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
function findDir(
  name: string,
  dir = POSTS_DIR,
  base = "",
  depth = 2,
): string | null {
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
      if (!IGNORE_DIRS.has(entry.name) && hasNotes(path.join(dir, entry.name)))
        return true;
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
      out.push({
        slug: slugifyPath(`${rel}/${entry.name}`),
        label: entry.name,
      });
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
  /** Byte size, assets only and only past HEAVY_ASSET_BYTES — the browse tree
   *  shows it so a 15 MB timeline isn't a surprise on a phone. */
  bytes?: number;
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
      // Only the ones worth warning about; a badge on every thumbnail would be
      // noise, and the tree is long.
      ...(asset.bytes >= HEAVY_ASSET_BYTES ? { bytes: asset.bytes } : {}),
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
      /** Weight in bytes, heavy assets only — see HEAVY_ASSET_BYTES. */
      bytes?: number;
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

/** A note's folder breadcrumb without its top group, display names:
 *  "Applied Sciences/Mathematics/Lycée/Note" → "Mathematics › Lycée". */
export function homeFolderLabel(rawPath: string): string {
  return rawPath.split("/").slice(1, -1).map(homeDisplayName).join(" › ");
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
      bytes: node.bytes,
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
  return {
    type: "dir",
    name: homeDisplayName(node.name),
    path,
    count,
    children,
  };
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

// --- [[wikilink]] index, both directions -------------------------------------
// One pass over the corpus builds both maps: which notes link *to* a note
// (backlinks) and which it links *out* to (the local graph). Both are needed
// per note page, and walking every note's body is far too expensive to redo.
let linkCache: {
  inbound: Map<string, Set<string>>;
  outbound: Map<string, Set<string>>;
} | null = null;
function linkIndex() {
  if (linkCache) return linkCache;
  const inbound = new Map<string, Set<string>>(); // targetSlug -> source slugs
  const outbound = new Map<string, Set<string>>(); // sourceSlug -> target slugs
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
      let out = outbound.get(post.slug);
      if (!out) outbound.set(post.slug, (out = new Set()));
      out.add(target);
    }
  }
  linkCache = { inbound, outbound };
  return linkCache;
}

function backlinkIndex(): Map<string, Set<string>> {
  return linkIndex().inbound;
}

export interface LocalGraph {
  /** Notes that link to this one. */
  incoming: SiblingRef[];
  /** Notes this one links to. */
  outgoing: SiblingRef[];
}

/** The immediate [[wikilink]] neighbourhood of a note, both directions. The
 *  /graph page shows the whole vault; this is the part a reader can actually
 *  act on from the note they are reading. */
export function getLocalGraph(slug: string): LocalGraph {
  // Straight map lookups, not a scan of every edge in the vault: this runs once
  // per note page, so scanning would make the whole build quadratic in the
  // number of notes (measured at ~5s for 4k notes before, ~20ms after).
  const { inbound, outbound } = linkIndex();
  const refs = (slugs: Set<string> | undefined): SiblingRef[] => {
    if (!slugs) return [];
    const out: SiblingRef[] = [];
    for (const s of slugs) {
      try {
        out.push({ title: getPost(s).frontmatter.title, slug: s });
      } catch {
        /* slug no longer resolvable */
      }
    }
    return out.sort((a, b) => a.title.localeCompare(b.title));
  };
  return {
    incoming: refs(inbound.get(slug)),
    outgoing: refs(outbound.get(slug)),
  };
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

// --- Glossary (lib/glossary.ts) ----------------------------------------------
let glossaryCache: GlossaryEntry[] | null = null;
/** Every explicit definition in the vault (a term defined in two notes is
 *  listed twice; getGlossaryFor picks the nearer one per note). */
export function getGlossary(): GlossaryEntry[] {
  if (glossaryCache) return glossaryCache;
  const all: GlossaryEntry[] = [];
  for (const doc of [...getAllPosts()].sort((a, b) =>
    a.rawPath.localeCompare(b.rawPath),
  )) {
    const noteUrl = `/posts/${doc.slug}/`;
    for (const { term, def } of extractDefinitions(doc.body)) {
      all.push({
        term,
        def,
        href: `${noteUrl}#${definitionAnchor(term)}`,
        noteTitle: doc.frontmatter.title,
        noteUrl,
        discipline: glossaryDiscipline(doc.rawPath),
      });
    }
  }
  glossaryCache = all;
  return glossaryCache;
}

/** The glossary terms to mark in `doc` (same discipline, defined elsewhere). */
export function getGlossaryFor(doc: Doc): GlossaryEntry[] {
  return entriesForNote(
    getGlossary(),
    `/posts/${doc.slug}/`,
    glossaryDiscipline(doc.rawPath),
  );
}


// --- Prerequisites (frontmatter `prerequis:`) and reading paths --------------
// A note lists the notes to read before it; the reverse ("pour aller plus
// loin") and the /parcours/ reading paths are derived from those lists. The
// graph logic is pure and lives in lib/prereq-graph.ts.

let prereqCache: {
  /** slug → prerequisite slugs, in the order the frontmatter lists them. */
  prereqs: Map<string, string[]>;
  /** slug → slugs of the notes that list it as a prerequisite. */
  dependents: Map<string, string[]>;
  /** slug → targets that resolve to no published note. */
  unresolved: Map<string, string[]>;
} | null = null;

function prereqIndex() {
  if (prereqCache) return prereqCache;
  const published = new Set(getAllPosts().map((p) => p.slug));
  const prereqs = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();
  const unresolved = new Map<string, string[]>();
  for (const post of getAllPosts()) {
    const fm = post.frontmatter as Frontmatter & { prerequisites?: unknown };
    const targets = parsePrereqField(fm.prerequis ?? fm.prerequisites);
    if (!targets.length) continue;
    const list: string[] = [];
    const missing: string[] = [];
    for (const target of targets) {
      const url = resolveWikiLink(target);
      const slug =
        url && url.startsWith("/posts/")
          ? url.slice("/posts/".length).replace(/\/$/, "")
          : null;
      // A draft (unpublished) note or a vault asset is as good as missing:
      // the page could not link to it.
      if (!slug || !published.has(slug)) missing.push(target);
      // A note listing itself is a cycle of one: kept as an edge so
      // vault-health reports it, never shown on the page.
      else if (!list.includes(slug)) list.push(slug);
    }
    if (list.length) prereqs.set(post.slug, list);
    if (missing.length) unresolved.set(post.slug, missing);
    for (const p of list) {
      if (p === post.slug) continue;
      const d = dependents.get(p) ?? [];
      d.push(post.slug);
      dependents.set(p, d);
    }
  }
  prereqCache = { prereqs, dependents, unresolved };
  return prereqCache;
}

function refsOf(slugs: string[] | undefined): SiblingRef[] {
  const out: SiblingRef[] = [];
  for (const s of slugs ?? []) {
    try {
      out.push({ title: getPost(s).frontmatter.title, slug: s });
    } catch {
      /* slug no longer resolvable */
    }
  }
  return out;
}

/** The notes `slug` asks to read first ("À lire avant"), in frontmatter order. */
export function getPrerequisites(slug: string): SiblingRef[] {
  return refsOf(prereqIndex().prereqs.get(slug)?.filter((s) => s !== slug));
}

/** The notes that list `slug` as a prerequisite ("Pour aller plus loin"), A→Z. */
export function getDependents(slug: string): SiblingRef[] {
  return refsOf(prereqIndex().dependents.get(slug)).sort((a, b) =>
    a.title.localeCompare(b.title, "fr", { numeric: true }),
  );
}

/** `prerequis` entries naming no published note, per note slug (vault-health). */
export function getUnresolvedPrereqs(): Map<string, string[]> {
  return prereqIndex().unresolved;
}

/** Every prerequisite relation, [prerequisite, dependent]. */
export function getPrereqEdges(): PrereqEdge[] {
  const edges: PrereqEdge[] = [];
  for (const [slug, list] of prereqIndex().prereqs) {
    for (const p of list) edges.push([p, slug]);
  }
  return edges;
}

export interface ReadingPathNote {
  slug: string;
  title: string;
  href: string;
  /** Slugs of this note's direct prerequisites within the path. */
  prereqs: string[];
}

export interface ReadingPathView {
  /** URL slug: the page is /parcours/<slug>/. */
  slug: string;
  /** From frontmatter `parcours:` on one of its notes, else its common folder. */
  name: string;
  description?: string;
  /** Majority discipline of the path's notes, "" when none. */
  discipline: string;
  /** In reading (topological) order. */
  notes: ReadingPathNote[];
  /** [prerequisite, dependent] slugs, cycle breaks removed. */
  edges: PrereqEdge[];
}

/** `parcours: "Nom"`, or `parcours: { titre|title: "Nom", description: "…" }`
 *  (plus `parcours-description:` next to the string form). */
function pathMeta(fm: Frontmatter): { name: string; description?: string } | null {
  const raw = (fm as unknown as Record<string, unknown>).parcours;
  const extra = (fm as unknown as Record<string, unknown>)["parcours-description"];
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  if (str(raw)) return { name: str(raw)!, description: str(extra) };
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const name = str(o.titre) ?? str(o.title) ?? str(o.nom) ?? str(o.name);
    if (name) return { name, description: str(o.description) ?? str(extra) };
  }
  return null;
}

/** Display name of the deepest folder all `rawPaths` share, top group
 *  dropped: "Mathematics › Lycée", "Languages & Dialects › Espagnol". */
function commonFolderName(rawPaths: string[]): string {
  const dirs = rawPaths.map((p) => p.split("/").slice(0, -1));
  const common: string[] = [];
  for (let i = 0; dirs.every((d) => i < d.length && d[i] === dirs[0][i]); i++) {
    common.push(dirs[0][i]);
  }
  return common.slice(1).map(homeDisplayName).join(" › ");
}

let prereqComponentsCache: ReturnType<typeof buildPrereqComponents> | null = null;
function prereqComponents() {
  if (prereqComponentsCache) return prereqComponentsCache;
  const nodes = getAllPosts().map((d) => {
    const disc = disciplineOf(d.rawPath);
    return {
      slug: d.slug,
      title: d.frontmatter.title,
      discipline: disc ? homeDisplayName(disc.name) : "",
    };
  });
  prereqComponentsCache = buildPrereqComponents(nodes, getPrereqEdges());
  return prereqComponentsCache;
}

let readingPathsCache: ReadingPathView[] | null = null;
/** The /parcours/ reading paths: connected groups of 3+ notes linked by
 *  `prerequis`, each in reading order (see lib/prereq-graph.ts). */
export function getReadingPaths(): ReadingPathView[] {
  if (readingPathsCache) return readingPathsCache;
  const used = new Set<string>();
  readingPathsCache = prereqComponents()
    .filter((c) => c.notes.length >= MIN_PATH_NOTES)
    .map((c) => {
      const docs = c.notes.map((s) => getPost(s));
      // The first note in reading order that names the path wins.
      const meta = docs.map((d) => pathMeta(d.frontmatter)).find(Boolean) ?? null;
      const name =
        meta?.name || commonFolderName(docs.map((d) => d.rawPath)) || c.discipline || docs[0].frontmatter.title;
      const base = tagSlug(name) || "parcours";
      let slug = base;
      for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`;
      used.add(slug);
      return {
        slug,
        name,
        ...(meta?.description ? { description: meta.description } : {}),
        discipline: c.discipline,
        notes: docs.map((d) => ({
          slug: d.slug,
          title: d.frontmatter.title,
          href: `/posts/${d.slug}/`,
          prereqs: c.edges.filter(([, b]) => b === d.slug).map(([a]) => a),
        })),
        edges: c.edges,
      };
    });
  return readingPathsCache;
}

/** The reading path a note belongs to, if any (for its "À lire avant" block). */
export function getReadingPathOf(slug: string): ReadingPathView | null {
  return getReadingPaths().find((p) => p.notes.some((n) => n.slug === slug)) ?? null;
}

/** Prerequisite cycles (vault-health): each cycle's notes and the `prerequis`
 *  relations the reading order had to ignore to break it. */
export function getPrereqCycles(): {
  members: SiblingRef[];
  broken: [SiblingRef, SiblingRef][];
}[] {
  const ref = (s: string): SiblingRef => ({ slug: s, title: getPost(s).frontmatter.title });
  return prereqCycles(prereqComponents()).map((c) => ({
    members: c.members.map(ref),
    broken: c.broken.map(([a, b]) => [ref(a), ref(b)] as [SiblingRef, SiblingRef]),
  }));
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
