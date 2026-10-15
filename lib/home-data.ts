import crypto from "node:crypto";
import {
  getAllPosts,
  getDisciplines,
  getHomeTree,
  getPost,
  getReadingPaths,
  getPdfAssets,
  getTags,
  homeFolderLabel,
  type HomeTreeNode,
} from "./content";
import { buildGraph, type GraphData } from "./graph-data";
import type { NoteIndexEntry } from "./note-suggest";
import { disciplineKey } from "./i18n";
import { extractPlain } from "./markdown";
import { readingMinutes } from "./path-extras";
import { pathFamily, type PathFamily } from "./path-family";

/**
 * What the home page needs beyond its first paint: the full browse tree (every
 * note) and the folder-graph preview. (Its search is the command palette,
 * which reads /notes-index.json and /palette-extra.json.) Inlined as
 * props they were ~670 KB of RSC payload in index.html, re-downloaded on every
 * visit because documents are revalidated; as /home-data.json they are fetched
 * once per build (the URL carries a content hash) and then served from cache.
 */
export interface HomeData {
  tree: HomeTreeNode[];
  graph: GraphData;
  /** For the phone dashboard's "Reprendre" card: every reading path with its
   *  notes in reading order as [slug, title, minutes]. */
  paths: { slug: string; name: string; family: PathFamily | null; notes: [string, string, number][] }[];
}

let cache: { data: HomeData; json: string; version: string } | null = null;
function load() {
  if (cache) return cache;
  const data: HomeData = {
    tree: getHomeTree(),
    graph: buildGraph({ foldersOnly: true }),
    paths: getReadingPaths().map((p) => ({
      slug: p.slug,
      name: p.name,
      family: pathFamily(p.discipline),
      notes: p.notes.map((n): [string, string, number] => [
        n.slug,
        n.title,
        readingMinutes(extractPlain(getPost(n.slug).body)),
      ]),
    })),
  };
  const json = JSON.stringify(data);
  const version = crypto
    .createHash("sha1")
    .update(json)
    .digest("hex")
    .slice(0, 12);
  cache = { data, json, version };
  return cache;
}

export const homeDataJson = () => load().json;
/** Content hash of /home-data.json, appended to its URL as a cache key. */
export const homeDataVersion = () => load().version;

/**
 * The tree the home renders before /home-data.json arrives: the two top
 * groups and their disciplines with note counts, no notes. That is exactly
 * what the first paint shows (top groups open, disciplines closed), so the
 * swap to the full tree changes nothing on screen.
 */
export function homeTreeShell(): HomeTreeNode[] {
  return load().data.tree.map((n) =>
    n.type === "dir"
      ? {
          ...n,
          children: n.children.map((c) =>
            c.type === "dir" ? { ...c, children: [] } : c,
          ),
        }
      : n,
  );
}

let graphJson: string | null = null;
/** The full note graph for /graph/, served as /graph-data.json (2.4 MB inline before). */
export function graphDataJson(): string {
  graphJson ??= JSON.stringify(buildGraph());
  return graphJson;
}
export const graphDataVersion = () =>
  crypto.createHash("sha1").update(graphDataJson()).digest("hex").slice(0, 12);

let notesIndex: { json: string; version: string } | null = null;
function loadNotesIndex() {
  if (notesIndex) return notesIndex;
  const notes: NoteIndexEntry[] = getAllPosts().map((p) => {
    const folder = homeFolderLabel(p.rawPath);
    return { title: p.frontmatter.title, href: `/posts/${p.slug}/`, ...(folder ? { folder } : {}) };
  });
  const json = JSON.stringify(notes);
  notesIndex = {
    json,
    version: crypto.createHash("sha1").update(json).digest("hex").slice(0, 12),
  };
  return notesIndex;
}
/** /notes-index.json — {title, href, folder} for every published note. */
export const notesIndexJson = () => loadNotesIndex().json;
/** Its content hash: the command palette fetches /notes-index.json?v=<hash>
 *  (exposed on <meta name="gk-notes-index"> by app/layout.tsx), so a new
 *  build never reads last build's list from the cache. */
export const notesIndexVersion = () => loadNotesIndex().version;

/**
 * /palette-extra.json — what the command palette finds besides notes, so it
 * covers everything the home search did: disciplines and tags with a page
 * ("Thèmes"), PDF attachments and Anki decks ("Documents"). Tuples to stay
 * small (~30 KB); fetched with /notes-index.json on the palette's first open.
 *
 * themes: [title, href, note count, discipline i18n key or ""]
 * docs:   [title, href, folder breadcrumb, "pdf" | "deck"]
 * paths:  [name, slug (/parcours/<slug>/), colour family or "", its notes as
 *          indexes into /notes-index.json, in reading order]
 * nv:     the /notes-index.json version those indexes refer to
 */
export interface PaletteExtra {
  themes: [string, string, number, string][];
  docs: [string, string, string, "pdf" | "deck"][];
  paths: [string, string, string, number[]][];
  nv: string;
}

let paletteExtra: { json: string; version: string } | null = null;
function loadPaletteExtra() {
  if (paletteExtra) return paletteExtra;
  const decks: PaletteExtra["docs"] = [];
  const walk = (nodes: HomeTreeNode[], parents: string[]) => {
    for (const n of nodes) {
      if (n.type === "dir") walk(n.children, [...parents, n.name]);
      else if (n.deck) decks.push([n.title, n.href, parents.slice(1).join(" › "), "deck"]);
    }
  };
  walk(getHomeTree(), []);
  // Same order as /notes-index.json (loadNotesIndex), so an index is a note.
  const at = new Map(getAllPosts().map((p, i) => [p.slug, i]));
  const data: PaletteExtra = {
    themes: [
      ...getDisciplines().map((d): PaletteExtra["themes"][number] => [
        d.name,
        `/disciplines/${d.slug}/`,
        d.count,
        disciplineKey(d.name) ?? "",
      ]),
      ...getTags().map((g): PaletteExtra["themes"][number] => [g.name, `/themes/${g.slug}/`, g.notes.length, ""]),
    ],
    docs: [
      ...getPdfAssets().map((p): PaletteExtra["docs"][number] => [p.title, p.href, p.where.replace(/ · /g, " › "), "pdf"]),
      ...decks,
    ],
    paths: getReadingPaths().map((p): PaletteExtra["paths"][number] => [
      p.name,
      p.slug,
      pathFamily(p.discipline) ?? "",
      p.notes.map((n) => at.get(n.slug)).filter((i): i is number => i !== undefined),
    ]),
    nv: notesIndexVersion(),
  };
  const json = JSON.stringify(data);
  paletteExtra = {
    json,
    version: crypto.createHash("sha1").update(json).digest("hex").slice(0, 12),
  };
  return paletteExtra;
}
export const paletteExtraJson = () => loadPaletteExtra().json;
/** Its content hash, on <meta name="gk-palette-extra"> (app/layout.tsx). */
export const paletteExtraVersion = () => loadPaletteExtra().version;
