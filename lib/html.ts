import { NAV } from "./site";
import { INDEX_NOTE, type TreeNode, type SiblingNav } from "./content";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** URL-encode each slug segment (spaces, accents…) while keeping the slashes. */
export function encodeSlug(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

/** Site navigation, rendered inside <main> as in layouts/baseof.html. */
export function navHtml(): string {
  const items = NAV.map((n) => `<li><a href="${n.href}">${escapeHtml(n.name)}</a></li>`).join("");
  return `<nav class="site-nav" data-pagefind-ignore><ul>${items}</ul></nav>`;
}

/**
 * Dropcap setup for single pages (layouts/single.html): the ::first-letter rule
 * plus, when enabled and the first letter is A–Z, the matching Goudy font.
 */
export function dropcapHtml(plain: string, dropcap: boolean | undefined): string {
  const base = `<style>main > p:first-of-type::first-letter { font-family: "GoudyInitialen", "Alegreya", "Alegreya Fallback", serif; float: left; font-size: 6.6rem; line-height: 0.8; padding: 0.43rem 0.3rem 0 0; }</style>`;
  const first = plain
    .replace(/^[^A-Za-z]*/, "")
    .charAt(0)
    .toUpperCase();
  const enabled = dropcap !== false && first >= "A" && first <= "Z";
  if (!enabled) return base;
  const font =
    `<link rel="preload" href="/fonts/GoudyInitialen-${first}.woff2" as="font" type="font/woff2" crossorigin>` +
    `<style>@font-face { font-family: "GoudyInitialen"; src: url("/fonts/GoudyInitialen-${first}.woff2") format("woff2"); font-weight: 400; font-style: normal; font-display: swap; }</style>`;
  return font + base;
}

export function signatureHtml(author: string): string {
  return `<div class="signature">&mdash;${escapeHtml(author)}</div>`;
}

/** Small page header for notes: link home + folder breadcrumb. */
export function noteHeaderHtml(rawPath: string): string {
  const folders = rawPath.split("/").slice(0, -1);
  const crumbs = folders.length
    ? `<span class="crumbs">${folders.map(escapeHtml).join(" › ")}</span>`
    : "";
  return `<header class="note-header" data-pagefind-ignore><a href="/">${escapeHtml(INDEX_NOTE)}</a>${crumbs}</header>`;
}

/** Build a right-margin table of contents from the rendered headings (h2/h3). */
export function buildToc(html: string): string {
  const re = /<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g;
  const items: { level: string; id: string; text: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    // Heading text is already HTML-escaped; just drop the anchor and any tags.
    const text = m[3]
      .replace(/<a class="anchor"[\s\S]*?<\/a>/g, "")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (text) items.push({ level: m[1], id: m[2], text });
  }
  if (items.length < 2) return "";
  const lis = items
    .map((i) => `<li class="toc-h${i.level}"><a href="#${i.id}">${i.text}</a></li>`)
    .join("");
  return `<nav class="toc" data-pagefind-ignore aria-label="Table of contents"><p class="toc-title">Contents</p><ul>${lis}</ul></nav>`;
}

/** Bottom-of-page navigation between notes in the same folder (prev/next + list). */
export function siblingNavHtml(nav: SiblingNav): string {
  if (nav.siblings.length <= 1) return "";
  const link = (s: { title: string; slug: string }, arrow: "prev" | "next") =>
    arrow === "prev"
      ? `<a class="sib-prev" href="/posts/${encodeSlug(s.slug)}/">← ${escapeHtml(s.title)}</a>`
      : `<a class="sib-next" href="/posts/${encodeSlug(s.slug)}/">${escapeHtml(s.title)} →</a>`;
  const arrows =
    `<div class="sib-arrows">` +
    (nav.prev ? link(nav.prev, "prev") : `<span></span>`) +
    (nav.next ? link(nav.next, "next") : `<span></span>`) +
    `</div>`;
  const folderName = nav.folder.split("/").pop() ?? "";
  const heading = folderName ? `More in ${prettyFolder(folderName)}` : "More notes";
  const items = nav.siblings
    .map((s) =>
      s.current
        ? `<li class="sib-current">${escapeHtml(s.title)}</li>`
        : `<li><a href="/posts/${encodeSlug(s.slug)}/">${escapeHtml(s.title)}</a></li>`,
    )
    .join("");
  return (
    `<nav class="siblings" data-pagefind-ignore aria-label="Notes in this folder">` +
    arrows +
    `<p class="sib-title">${escapeHtml(heading)}</p>` +
    `<ul>${items}</ul>` +
    `</nav>`
  );
}

function prettyFolder(name: string): string {
  const words = name.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function renderNode(node: TreeNode, parentPath = ""): string {
  if (node.type === "dir") {
    const path = parentPath ? `${parentPath}/${node.name}` : node.name;
    return (
      `<li><details data-path="${escapeHtml(path)}"><summary>${escapeHtml(prettyFolder(node.name))}</summary>` +
      `<ul>${node.children.map((c) => renderNode(c, path)).join("")}</ul>` +
      `</details></li>`
    );
  }
  const cls = node.asset ? ' class="tree-asset"' : "";
  return `<li${cls}><a href="${escapeHtml(node.href)}">${escapeHtml(node.title)}</a></li>`;
}

/** Collapsible folder tree of notes for the home page. */
export function renderNoteTree(nodes: TreeNode[]): string {
  if (!nodes.length) return "<p>No notes yet.</p>";
  return `<ul class="note-tree" data-pagefind-ignore>${nodes.map((n) => renderNode(n)).join("")}</ul>`;
}
