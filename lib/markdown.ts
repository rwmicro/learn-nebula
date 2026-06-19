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
  const display = (tex: string) => {
    const id = ph.next();
    ph.map.set(id, render(tex, true));
    return `\n\n<div data-ph="${id}"></div>\n\n`;
  };
  const inline = (tex: string) => {
    const id = ph.next();
    ph.map.set(id, render(tex, false));
    return `<span data-ph="${id}"></span>`;
  };

  // Stash code (fenced + inline) so `$…$` inside it isn't treated as math.
  const code: string[] = [];
  const stash = (m: string) => `@@C${code.push(m) - 1}@@`;
  let out = raw
    .replace(/```[\s\S]*?```/g, stash)
    .replace(/~~~[\s\S]*?~~~/g, stash)
    .replace(/`+[^`]*`+/g, stash);

  // Display first ($$ … $$ and \[ … \]), then inline ($ … $ and \( … \)). The
  // `$ … $` rule avoids currency: the opening `$` can't follow a digit nor lead
  // a space, and the closing `$` can't follow a space nor precede a digit.
  out = out.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex) => display(tex));
  out = out.replace(/\\\\\[([\s\S]*?)\\\\\]/g, (_m, tex) => display(tex));
  out = out.replace(
    /(?<![\d\\$])\$(?![\s$])((?:[^$\n]|\\\$)+?)(?<![\s\\])\$(?!\d)/g,
    (_m, tex) => inline(tex),
  );
  out = out.replace(/\\\\\(([\s\S]*?)\\\\\)/g, (_m, tex) => inline(tex));

  // Restore code untouched.
  out = out.replace(/@@C(\d+)@@/g, (_m, i) => code[Number(i)]);
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

// --- Obsidian callouts ( > [!type] Title ) ---------------------------------
const calloutSvg = (inner: string) =>
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

// Obsidian type aliases -> canonical type.
const CALLOUT_ALIAS: Record<string, string> = {
  note: "note",
  abstract: "abstract",
  summary: "abstract",
  tldr: "abstract",
  info: "info",
  todo: "todo",
  tip: "tip",
  hint: "tip",
  important: "tip",
  success: "success",
  check: "success",
  done: "success",
  question: "question",
  help: "question",
  faq: "question",
  warning: "warning",
  caution: "warning",
  attention: "warning",
  failure: "failure",
  fail: "failure",
  missing: "failure",
  danger: "danger",
  error: "danger",
  bug: "bug",
  example: "example",
  quote: "quote",
  cite: "quote",
};
// Default (French) title when the callout has none.
const CALLOUT_LABEL: Record<string, string> = {
  note: "Note",
  abstract: "Résumé",
  info: "Info",
  todo: "À faire",
  tip: "Astuce",
  success: "Succès",
  question: "Question",
  warning: "Attention",
  failure: "Échec",
  danger: "Danger",
  bug: "Bug",
  example: "Exemple",
  quote: "Citation",
};
const CALLOUT_ICON: Record<string, string> = {
  note: calloutSvg(
    '<path d="M4 20h4L18 8a2 2 0 0 0-3-3L5 16v4z"/><path d="M14 6l3 3"/>',
  ),
  abstract: calloutSvg(
    '<rect x="6" y="4" width="12" height="16" rx="1.5"/><path d="M9 9h6M9 13h6M9 17h4"/>',
  ),
  info: calloutSvg(
    '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  ),
  todo: calloutSvg(
    '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5 5-5.5"/>',
  ),
  tip: calloutSvg(
    '<path d="M12 3c2.5 3 4 4.8 4 8a4 4 0 1 1-8 0c0-1.7.7-3 2-4.2"/>',
  ),
  success: calloutSvg('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  question: calloutSvg(
    '<circle cx="12" cy="12" r="9"/><path d="M9.3 9.2a2.7 2.7 0 0 1 4.5 2c0 1.7-2.3 2-2.3 3.3"/><path d="M12 17.5h.01"/>',
  ),
  warning: calloutSvg(
    '<path d="M12 4 2.7 20h18.6L12 4z"/><path d="M12 10v4"/><path d="M12 17.5h.01"/>',
  ),
  failure: calloutSvg(
    '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  ),
  danger: calloutSvg('<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/>'),
  bug: calloutSvg(
    '<rect x="8" y="9" width="8" height="9" rx="4"/><path d="M8 13H4M16 13h4M8 17l-3 2M16 17l3 2M9 9 7.5 7M15 9l1.5-2"/>',
  ),
  example: calloutSvg(
    '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  ),
  quote: calloutSvg(
    '<path d="M10 8H6a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2v2H6"/><path d="M20 8h-4a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2v2h-2"/>',
  ),
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Split inline children at the first line break (callout title vs. body text).
function splitAtBreak(
  children: ElementContent[],
): [ElementContent[], ElementContent[]] {
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.type === "element" && c.tagName === "br") {
      return [children.slice(0, i), children.slice(i + 1)];
    }
    if (c.type === "text" && c.value.includes("\n")) {
      const nl = c.value.indexOf("\n");
      const head = children.slice(0, i);
      if (c.value.slice(0, nl))
        head.push({ type: "text", value: c.value.slice(0, nl) });
      const tail: ElementContent[] = [];
      if (c.value.slice(nl + 1))
        tail.push({ type: "text", value: c.value.slice(nl + 1) });
      tail.push(...children.slice(i + 1));
      return [head, tail];
    }
  }
  return [children, []];
}

/** Render Obsidian callouts (`> [!type] Title`) as styled `<div class="callout">`. */
function rehypeCallouts() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "blockquote" || !parent || index == null) return;
      const firstP = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "p",
      );
      const firstText = firstP?.children[0];
      if (!firstP || !firstText || firstText.type !== "text") return;
      const m = firstText.value.match(/^\[!([\w-]+)\]([+-]?)[ \t]*/);
      if (!m) return;

      const type = m[1].toLowerCase();
      const fold = m[2];
      const canon = CALLOUT_ALIAS[type] ?? "note";
      firstText.value = firstText.value.slice(m[0].length);

      const [titleNodes, inlineRest] = splitAtBreak(firstP.children);
      const hasTitle = titleNodes.some(
        (n) => !(n.type === "text" && n.value.trim() === ""),
      );

      const iconFrag = fromHtml(CALLOUT_ICON[canon] ?? CALLOUT_ICON.note, {
        fragment: true,
      });
      const icon: Element = {
        type: "element",
        tagName: "span",
        properties: { className: ["callout-icon"] },
        children: iconFrag.children as ElementContent[],
      };
      const titleEl: Element = {
        type: "element",
        tagName: fold ? "summary" : "div",
        properties: { className: ["callout-title"] },
        children: [
          icon,
          {
            type: "element",
            tagName: "span",
            properties: {},
            children: hasTitle
              ? titleNodes
              : [{ type: "text", value: CALLOUT_LABEL[canon] ?? cap(type) }],
          },
        ],
      };

      // Body = the rest of the blockquote; the title line's trailing inline
      // content (no blank line before it) becomes the body's first paragraph.
      const rest = node.children.filter((c) => c !== firstP);
      const bodyChildren: ElementContent[] = inlineRest.length
        ? [
            {
              type: "element",
              tagName: "p",
              properties: {},
              children: inlineRest,
            },
            ...rest,
          ]
        : rest;
      const body: Element = {
        type: "element",
        tagName: "div",
        properties: { className: ["callout-body"] },
        children: bodyChildren,
      };

      const inner: ElementContent[] = fold
        ? [
            {
              type: "element",
              tagName: "details",
              properties: fold === "+" ? { open: true } : {},
              children: [titleEl, body],
            },
          ]
        : [titleEl, body];

      parent.children[index] = {
        type: "element",
        tagName: "div",
        properties: {
          className: ["callout", `callout-${canon}`],
          dataCallout: type,
        },
        children: inner,
      };
      return SKIP;
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
        (c): c is Element =>
          c.type === "element" && c.properties?.dataFootnoteRef !== undefined,
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
    if (m.index > last)
      out.push({ type: "text", value: value.slice(last, m.index) });
    const display = (alias ?? target.split("/").pop() ?? target).trim();
    out.push({
      type: "link",
      url,
      children: [{ type: "text", value: display }],
    });
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
  /** Whether any math was rendered (so the page can load the KaTeX stylesheet). */
  hasMath: boolean;
}

export async function renderMarkdown(
  raw: string,
  opts: { dir?: string } = {},
): Promise<Rendered> {
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
    .use(rehypeCallouts)
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
  return { html, plain: extractPlain(raw), hasMath: ph.map.size > 0 };
}

/** Plain-text rendering for meta descriptions and list excerpts. */
export function extractPlain(raw: string): string {
  // Strip math/figures/shortcodes before parsing for text.
  const cleaned = raw
    .replace(/\$\$[\s\S]+?\$\$/g, " ")
    .replace(
      /(?<![\d\\$])\$(?![\s$])(?:[^$\n]|\\\$)+?(?<![\s\\])\$(?!\d)/g,
      " ",
    )
    .replace(/\\\\\[[\s\S]*?\\\\\]/g, "")
    .replace(/\\\\\([\s\S]*?\\\\\)/g, "")
    .replace(/\{\{<[\s\S]*?>\}\}/g, "")
    .replace(/<[^>]+>/g, " ");
  const tree = unified().use(remarkParse).use(remarkGfm).parse(cleaned);
  visit(tree as unknown as Root, (node: any, index, parent: any) => {
    if (
      (node.type === "footnoteDefinition" ||
        node.type === "footnoteReference") &&
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
