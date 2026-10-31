import {
  getHomeTree,
  getPost,
  getReadingPaths,
  slugifyPath,
  type HomeTreeNode,
} from "./content";
import { shortTitle } from "./folder-label";
import { folderKey, t } from "./i18n";
import { extractPlain } from "./markdown";
import { readingMinutes } from "./path-extras";
import { pathFamily, type PathFamily } from "./path-family";

/**
 * The phone "Notes" tab (/notes/, app/notes/): the vault's folder tree as
 * pages, one per folder, built from the same tree as the desktop home
 * (getHomeTree). A folder page lists its sub-folders, then its own notes in
 * folder order (01-…, 02-…), each with its reading time. Read state is added
 * in the browser (components/explore/NotesBrowse.tsx).
 */

export interface FolderRef {
  /** On-disk name, or its display name for the two top groups and the
   *  disciplines (see folderKey). */
  name: string;
  /** i18n key of the name, when it has one. */
  key: string | null;
  /** Slug path, the page is /notes/<slug>/; also the slug prefix of every
   *  note below it. */
  slug: string;
}

export interface FolderRow extends FolderRef {
  count: number;
  /** Colour family, disciplines only (they get its glyph, not a folder). */
  family?: PathFamily | null;
}

export interface NoteRow {
  title: string;
  href: string;
  /** Note slug (no /posts/), null for decks and attachments. */
  slug: string | null;
  minutes?: number;
  deck?: boolean;
  asset?: boolean;
}

export interface FolderPage extends FolderRef {
  /** Parents, top group first; empty for a top group. */
  crumbs: FolderRef[];
  family: PathFamily | null;
  count: number;
  folders: FolderRow[];
  notes: NoteRow[];
  /** Reading paths whose notes mostly live under this folder. */
  paths: { slug: string; name: string; count: number }[];
}

function ref(node: Extract<HomeTreeNode, { type: "dir" }>): FolderRef {
  const raw = node.path.split("/").pop() ?? node.name;
  return {
    name: node.name,
    key: folderKey(node.name) ?? folderKey(raw),
    slug: slugifyPath(node.path),
  };
}

const minutesCache = new Map<string, number>();
function minutesOf(slug: string): number | undefined {
  if (!minutesCache.has(slug)) {
    try {
      minutesCache.set(slug, readingMinutes(extractPlain(getPost(slug).body)));
    } catch {
      return undefined;
    }
  }
  return minutesCache.get(slug);
}

function slugOfHref(href: string): string | null {
  const m = /^\/posts\/(.+?)\/?$/.exec(href);
  return m ? m[1] : null;
}

let cache: Map<string, FolderPage> | null = null;

/** Every folder of the notes tree, keyed by slug path. */
export function getFolderPages(): Map<string, FolderPage> {
  if (cache) return cache;
  const out = new Map<string, FolderPage>();
  // A path belongs to the deepest folder holding at least 60% of its notes.
  const paths = getReadingPaths();
  const walk = (
    node: HomeTreeNode,
    crumbs: FolderRef[],
    family: PathFamily | null,
  ) => {
    if (node.type !== "dir") return;
    const me = ref(node);
    const fam = crumbs.length === 1 ? pathFamily(node.name) : family;
    const page: FolderPage = {
      ...me,
      crumbs,
      family: fam,
      count: node.count,
      folders: [],
      notes: [],
      paths: [],
    };
    const names = node.path
      .split("/")
      .concat([...crumbs, me].map((f) => f.name));
    for (const c of node.children) {
      if (c.type === "dir") {
        page.folders.push({
          ...ref(c),
          count: c.count,
          ...(crumbs.length === 0 ? { family: pathFamily(c.name) } : {}),
        });
      } else {
        const slug = c.deck || c.asset ? null : slugOfHref(c.href);
        page.notes.push({
          title: c.deck || c.asset ? c.title : shortTitle(c.title, names),
          href: c.href,
          slug,
          ...(slug ? { minutes: minutesOf(slug) } : {}),
          ...(c.deck ? { deck: true } : {}),
          ...(c.asset ? { asset: true } : {}),
        });
      }
    }
    // Disciplines are English folders shown under French names (Law → Droit):
    // order them by what the reader sees. numeric keeps "02-…" before "10-…".
    const shown = (f: FolderRef) => (f.key ? t(f.key) : f.name);
    page.folders.sort((a, b) => shown(a).localeCompare(shown(b), "fr", { numeric: true, sensitivity: "base" }));
    out.set(me.slug, page);
    for (const c of node.children) walk(c, [...crumbs, me], fam);
  };
  for (const top of getHomeTree()) walk(top, [], null);

  for (const p of paths) {
    let best: FolderPage | null = null;
    for (const f of out.values()) {
      if (f.crumbs.length === 0) continue;
      const inside = p.notes.filter((n) =>
        n.slug.startsWith(`${f.slug}/`),
      ).length;
      if (inside / p.notes.length < 0.6) continue;
      if (!best || f.crumbs.length > best.crumbs.length) best = f;
    }
    if (!best) continue;
    best.paths.push({ slug: p.slug, name: p.name, count: p.notes.length });
  }
  cache = out;
  return out;
}

/** The two top groups (Applied / Social Sciences) with their disciplines. */
export function getTopFolders(): FolderPage[] {
  return [...getFolderPages().values()].filter((f) => f.crumbs.length === 0);
}
