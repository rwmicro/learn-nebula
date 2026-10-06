import crypto from "node:crypto";
import {
  getAllPosts,
  getDomains,
  getHomeTree,
  getTags,
  homeFolderLabel,
  type DomainGroup,
  type HomeTreeNode,
} from "./content";
import { buildGraph, type GraphData } from "./graph-data";
import type { NoteIndexEntry } from "./note-suggest";

/**
 * What the home page needs beyond its first paint: the full browse tree (every
 * note), the "Domaines" search scope and the folder-graph preview. Inlined as
 * props they were ~670 KB of RSC payload in index.html, re-downloaded on every
 * visit because documents are revalidated; as /home-data.json they are fetched
 * once per build (the URL carries a content hash) and then served from cache.
 */
export interface HomeData {
  tree: HomeTreeNode[];
  domains: DomainGroup[];
  graph: GraphData;
  /** Every tag with a /themes/<slug>/ page, as [name, slug, note count]
   *  (most used first) — the home search's "Thèmes" scope matches them.
   *  Tuples, not objects: ~350 entries, a few KB. */
  tags: [string, string, number][];
}

let cache: { data: HomeData; json: string; version: string } | null = null;
function load() {
  if (cache) return cache;
  const data: HomeData = {
    tree: getHomeTree(),
    domains: getDomains(),
    graph: buildGraph({ foldersOnly: true }),
    tags: getTags().map((g) => [g.name, g.slug, g.notes.length]),
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
