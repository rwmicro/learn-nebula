import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkSmartypants from "remark-smartypants";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeStringify from "rehype-stringify";
import { visit, SKIP } from "unist-util-visit";
import { fromHtml } from "hast-util-from-html";
import { toString as mdToString } from "mdast-util-to-string";
import katex from "katex";
import type { Root, Element, ElementContent, RootContent } from "hast";
import { rehypeShiki } from "./highlight";
import { resolveWikiLink } from "./content";
import { resolveVaultAsset } from "./vault-assets";

// ---------------------------------------------------------------------------
// Preprocessing (runs on the raw Markdown, before the unified pipeline so that
// LaTeX backslashes and Hugo shortcodes survive Markdown's own escaping).
// ---------------------------------------------------------------------------

// CommonMark backslash-unescaping, applied inside math so the author's
// goldmark-oriented escaping (\_, \\{, \\}) yields valid KaTeX input.
const PUNCT = /\\([!-/:-@[-`{-~])/g;
const unescapeMath = (s: string) => s.replace(PUNCT, "$1");

interface Placeholders {
  map: Map<string, string>;
  next: () => string;
}

function newPlaceholders(): Placeholders {
  const map = new Map<string, string>();
  let n = 0;
  return { map, next: () => `ph${n++}` };
}

function preprocessMath(raw: string, ph: Placeholders): string {
  const render = (tex: string, displayMode: boolean) =>
    katex.renderToString(unescapeMath(tex), {
      displayMode,
      throwOnError: false,
      strict: false,
    });

  // Display math \[ … \] first, then inline \( … \).
  let out = raw.replace(/\\\\\[([\s\S]*?)\\\\\]/g, (_m, tex) => {
    const id = ph.next();
    ph.map.set(id, render(tex, true));
    return `\n\n<div data-ph="${id}"></div>\n\n`;
  });
  out = out.replace(/\\\\\(([\s\S]*?)\\\\\)/g, (_m, tex) => {
    const id = ph.next();
    ph.map.set(id, render(tex, false));
    return `<span data-ph="${id}"></span>`;
  });
  return out;
}

// ---------------------------------------------------------------------------
// rehype plugins
// ---------------------------------------------------------------------------

function hastText(node: any): string {
  if (node.type === "text") return node.value;
  if (Array.isArray(node.children)) return node.children.map(hastText).join("");
  return "";
}

/** Replace <div|span data-ph="…"> placeholders with their stored HTML. */
function rehypePlaceholders(map: Map<string, string>) {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      const id = node.properties?.dataPh;
      if (typeof id !== "string" || !parent || index == null) return;
      const html = map.get(id) ?? "";
      const frag = fromHtml(html, { fragment: true });
      parent.children.splice(index, 1, ...(frag.children as RootContent[]));
      return [SKIP, index + frag.children.length];
    });
  };
}

/** Pull explicit `{#id}` ids out of heading text (Hugo/goldmark syntax). */
function rehypeHeadingIds() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (!/^h[1-6]$/.test(node.tagName)) return;
      const last = node.children[node.children.length - 1];
      if (last && last.type === "text") {
        const m = last.value.match(/\s*\{#([^}]+)\}\s*$/);
        if (m) {
          node.properties = node.properties ?? {};
          node.properties.id = m[1];
          last.value = last.value.slice(0, m.index).trimEnd();
        }
      }
    });
  };
}

/** Point relative note assets (images, PDFs…) at the served copies in
 * public/vault; leave remote/absolute references untouched. */
function rehypeVaultAssets(dir: string) {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName === "img") {
        const src = node.properties?.src;
        if (typeof src !== "string") return;
        node.properties = node.properties ?? {};
        node.properties.loading = "lazy";
        node.properties.decoding = "async";
        if (/^(https?:|data:)/i.test(src)) return; // external / data URIs
        const resolved = resolveVaultAsset(src, dir);
        if (resolved) node.properties.src = resolved;
      } else if (node.tagName === "a") {
        const href = node.properties?.href;
        if (typeof href !== "string") return;
        // Skip external, absolute (/…, incl. wikilink output), anchors, mailto.
        if (/^(https?:|mailto:|tel:|#|\/)/i.test(href)) return;
        const resolved = resolveVaultAsset(href, dir);
        if (resolved) node.properties.href = resolved;
      }
    });
  };
}

const isBackref = (n: ElementContent) =>
  n.type === "element" && n.properties?.dataFootnoteBackref !== undefined;

function unwrapParagraphs(nodes: ElementContent[]): ElementContent[] {
  const out: ElementContent[] = [];
  for (const n of nodes) {
    if (n.type === "element" && n.tagName === "p") {
      out.push(...n.children.filter((c) => !isBackref(c)));
    } else if (!isBackref(n)) {
      out.push(n);
    }
  }
  return out;
}

/**
 * Convert GFM footnotes into Tufte-style margin notes, mirroring
 * layouts/partials/processed-content.html: each reference becomes
 *   <sup>N</sup><span class="side" data-nosnippet><sup>N</sup>…content…</span>
 * and the footnotes section at the bottom is removed.
 */
function rehypeSidenotes() {
  return (tree: Root) => {
    const defs = new Map<string, ElementContent[]>();

    // 1. Collect and remove the footnotes section.
    visit(tree, "element", (node: Element, index, parent) => {
      const isSection =
        node.tagName === "section" &&
        (node.properties?.dataFootnotes !== undefined ||
          (Array.isArray(node.properties?.className) &&
            (node.properties.className as string[]).includes("footnotes")));
      if (!isSection || !parent || index == null) return;
      visit(node, "element", (li: Element) => {
        const id = li.tagName === "li" ? li.properties?.id : undefined;
        if (typeof id === "string") {
          defs.set(id, unwrapParagraphs(li.children as ElementContent[]));
        }
      });
      parent.children.splice(index, 1);
      return [SKIP, index];
    });

    // 2. Replace each reference with the inline number + margin note.
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "sup" || !parent || index == null) return;
      const a = node.children.find(
        (c): c is Element => c.type === "element" && c.properties?.dataFootnoteRef !== undefined,
      );
      if (!a) return;
      const num = hastText(a);
      const href = String(a.properties?.href ?? "");
      const content = defs.get(href.replace(/^#/, "")) ?? [];

      const numSup: Element = {
        type: "element",
        tagName: "sup",
        properties: {},
        children: [{ type: "text", value: num }],
      };
      const side: Element = {
        type: "element",
        tagName: "span",
        properties: { className: ["side"], dataNosnippet: "" },
        children: [
          {
            type: "element",
            tagName: "sup",
            properties: {},
            children: [{ type: "text", value: num }],
          },
          ...content,
        ],
      };
      parent.children.splice(index, 1, numSup, side);
      return [SKIP, index + 2];
    });
  };
}

/**
 * Convert Obsidian wikilinks to real links, operating on mdast text nodes only
 * so that `[[ … ]]` inside (bash) code blocks is left untouched. Unresolved
 * targets are left as literal text.
 */
function splitWikiLinks(value: string): unknown[] | null {
  const re = /\[\[([^[\]\n]+?)\]\]/g;
  const out: unknown[] = [];
  let last = 0;
  let found = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    const inner = m[1];
    const pipe = inner.indexOf("|");
    const alias = pipe >= 0 ? inner.slice(pipe + 1).trim() : null;
    const beforePipe = pipe >= 0 ? inner.slice(0, pipe) : inner;
    const hash = beforePipe.indexOf("#");
    const target = (hash >= 0 ? beforePipe.slice(0, hash) : beforePipe).trim();
    const url = resolveWikiLink(target);
    if (!url) continue;
    found = true;
    if (m.index > last) out.push({ type: "text", value: value.slice(last, m.index) });
    const display = (alias ?? target.split("/").pop() ?? target).trim();
    out.push({ type: "link", url, children: [{ type: "text", value: display }] });
    last = re.lastIndex;
  }
  if (!found) return null;
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

function remarkWikiLinks() {
  return (tree: Root) => {
    visit(tree as any, "text", (node: any, index, parent: any) => {
      if (parent == null || index == null || !node.value.includes("[[")) return;
      const replaced = splitWikiLinks(node.value);
      if (!replaced) return;
      parent.children.splice(index, 1, ...replaced);
      return index + replaced.length;
    });
  };
}

// ---------------------------------------------------------------------------
// Processors
// ---------------------------------------------------------------------------

export interface Rendered {
  html: string;
  plain: string;
}

export async function renderMarkdown(raw: string, opts: { dir?: string } = {}): Promise<Rendered> {
  const dir = opts.dir ?? "";
  const ph = newPlaceholders();
  const text = preprocessMath(raw, ph);

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkWikiLinks)
    .use(remarkSmartypants)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeShiki)
    .use(rehypePlaceholders, ph.map)
    .use(rehypeHeadingIds)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: "append",
      properties: { className: ["anchor"] },
      content: { type: "text", value: "§" },
    })
    .use(rehypeVaultAssets, dir)
    .use(rehypeSidenotes)
    .use(rehypeStringify, { allowDangerousHtml: true });

  const html = String(await processor.process(text));
  return { html, plain: extractPlain(raw) };
}

/** Plain-text rendering for meta descriptions and list excerpts. */
export function extractPlain(raw: string): string {
  // Strip math/figures/shortcodes before parsing for text.
  const cleaned = raw
    .replace(/\\\\\[[\s\S]*?\\\\\]/g, "")
    .replace(/\\\\\([\s\S]*?\\\\\)/g, "")
    .replace(/\{\{<[\s\S]*?>\}\}/g, "")
    .replace(/<[^>]+>/g, " ");
  const tree = unified().use(remarkParse).use(remarkGfm).parse(cleaned);
  visit(tree as unknown as Root, (node: any, index, parent: any) => {
    if (
      (node.type === "footnoteDefinition" || node.type === "footnoteReference") &&
      parent &&
      typeof index === "number"
    ) {
      parent.children.splice(index, 1);
      return [SKIP, index];
    }
  });
  return mdToString(tree as any)
    .replace(/\s+/g, " ")
    .trim();
}

/** Word-boundary truncation with an ellipsis, like Hugo's `truncate`. */
export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const sp = cut.lastIndexOf(" ");
  return (sp > 0 ? cut.slice(0, sp) : cut) + "…";
}
