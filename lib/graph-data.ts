import { getPostTree, getWikiLinkEdges, type TreeNode } from "./content";
import { folderAnchor } from "./slug";

export type GraphKind = "root" | "dir" | "note" | "asset";

export interface GraphNode {
  id: string;
  /** Display label (folder name or note title). */
  label: string;
  kind: GraphKind;
  /** Click target for note/asset nodes; absent for folders. */
  href?: string;
  /** Folder path used to colour-group children (e.g. "Applied Sciences/Architecture"). */
  group: string;
  /** "Grand thème" the node lives under — the discipline (level-2 folder, e.g.
   *  "Mathematics", "History"), which drives the per-theme colouring. Falls back
   *  to the top-level folder for shallower nodes; "" for the root, "root" for
   *  notes sitting directly at the vault root. */
  theme: string;
  /** Tree depth from the root (0 = synthetic root). */
  depth: number;
  /** Frontmatter `lang` (notes only) — drives the /graph language filter. */
  lang?: string;
}

export interface GraphLink {
  source: string;
  target: string;
  /** "tree" = folder containment (drives the radial DAG); "wikilink" = a
   *  note→note [[link]], drawn but excluded from the layout. */
  kind?: "tree" | "wikilink";
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/** Build a containment graph from the on-disk folder tree:
 *   root → top folders → sub-folders → notes / assets
 * The synthetic root sits at the centre so the force layout fans out radially.
 * `foldersOnly` drops the leaf note/asset nodes — used for the lightweight home
 * preview (~hundreds of nodes instead of ~1000). */
export function buildGraph(opts: { foldersOnly?: boolean } = {}): GraphData {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const noteIds = new Set<string>();
  const ROOT_ID = "__root__";

  nodes.push({
    id: ROOT_ID,
    label: "Garden",
    kind: "root",
    group: "",
    theme: "",
    depth: 0,
  });

  function walk(
    children: TreeNode[],
    parentId: string,
    parentPath: string,
    depth: number,
    theme: string,
  ) {
    for (const node of children) {
      if (node.type === "dir") {
        const path = parentPath ? `${parentPath}/${node.name}` : node.name;
        const id = `dir:${path}`;
        // The discipline (level-2 folder) is the "grand thème": folders at depth
        // 1-2 name their own theme, everything deeper inherits the level-2 one.
        const nodeTheme = depth <= 2 ? node.name : theme;
        nodes.push({
          id,
          label: node.name,
          kind: "dir",
          // Clicking a folder opens its note list on the home browse tree —
          // same target as the note-page breadcrumb (/#<folderAnchor>).
          href: `/#${folderAnchor(path)}`,
          group: parentPath || node.name,
          theme: nodeTheme,
          depth,
        });
        links.push({ source: parentId, target: id, kind: "tree" });
        walk(node.children, id, path, depth + 1, nodeTheme);
      } else {
        if (opts.foldersOnly) continue;
        const id = `file:${node.href}`;
        if (!node.asset) noteIds.add(id);
        nodes.push({
          id,
          label: node.title,
          kind: node.asset ? "asset" : "note",
          href: node.href,
          group: parentPath || "root",
          theme: theme || "root",
          depth,
          lang: node.lang,
        });
        links.push({ source: parentId, target: id, kind: "tree" });
      }
    }
  }

  walk(getPostTree(), ROOT_ID, "", 1, "");

  // [[wikilink]] edges between notes (full graph only). Excluded from the home
  // folders-only preview, which has no note nodes.
  if (!opts.foldersOnly) {
    const seen = new Set<string>();
    for (const [s, t] of getWikiLinkEdges()) {
      const source = `file:/posts/${s}/`;
      const target = `file:/posts/${t}/`;
      if (!noteIds.has(source) || !noteIds.has(target)) continue;
      const key = `${source}|${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ source, target, kind: "wikilink" });
    }
  }

  return { nodes, links };
}
