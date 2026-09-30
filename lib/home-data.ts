import crypto from "node:crypto";
import {
  getDomains,
  getHomeTree,
  type DomainGroup,
  type HomeTreeNode,
} from "./content";
import { buildGraph, type GraphData } from "./graph-data";

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
}

let cache: { data: HomeData; json: string; version: string } | null = null;
function load() {
  if (cache) return cache;
  const data: HomeData = {
    tree: getHomeTree(),
    domains: getDomains(),
    graph: buildGraph({ foldersOnly: true }),
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
