// The note pipeline: Markdown → HTML through unified, with the site's
// plugins (one file per family beside this one), plus the plain-text helpers.

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
import type { Root } from "hast";
import { rehypeShiki } from "../../highlight";
import { rehypeFrise } from "../../exercises";
import { rehypeGlossary, type GlossaryEntry } from "../../glossary";
import { rehypeCallouts, rehypePredictVeil } from "./callouts";
import { rehypePlaceholders, rehypeStripUnsafe } from "./hast";
import { remarkRelativeNoteLinks, remarkWikiLinks } from "./links";
import { newPlaceholders, preprocessMath } from "./math";
import { rehypeFigures, rehypeManim, rehypeVaultAssets, rehypeYouTube } from "./media";
import { rehypeDropHandNumbers, rehypeHeadingIds, rehypeOutline } from "./outline";
import { rehypeSidenotes } from "./sidenotes";
import { rehypeIsoFigures, rehypePrix, rehypeWidgets } from "./widgets";

export { quizId, quizParts, type QuizChoice } from "./callouts";
export { rehypeDropHandNumbers, rehypeOutline } from "./outline";

// ---------------------------------------------------------------------------
// Processors
// ---------------------------------------------------------------------------

export interface Rendered {
  html: string;
  plain: string;
  /** Whether any math was rendered (so the page can load the KaTeX stylesheet). */
  hasMath: boolean;
  /** A `[!quiz]` card (quizCallout): the page loads /js/quiz.bundle.js. */
  hasQuiz: boolean;
  /** A glossary mark (lib/glossary.ts): the page loads /js/glossary.bundle.js. */
  hasGlossary: boolean;
}

const TRUE_FALSE = /^(\s*>\s*)\[!(?:vraifaux|vrai-faux|truefalse|true-false|idee-recue|idée-reçue)\]([+-]?)\s*(.*)$/i;
const TF_ANSWER = /^(vrai|faux|true|false)\b[\s.,:;!—–-]*/i;

/**
 * `> [!vraifaux] Statement` + a body opening on "Vrai." / "Faux." (and the
 * explanation) → a two-choice `[!quiz]`: misconceptions asked as such, the
 * explanation shown with the answer. Without a title, the body's first line
 * is the statement. A block whose answer can't be read stays as written.
 */
export function preprocessTrueFalse(raw: string): string {
  if (!/\[!(?:vrai|true|id[eé]e)/i.test(raw)) return raw;
  const lines = raw.split("\n");
  const out: string[] = [];
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const m = fence ? null : TRUE_FALSE.exec(line);
    if (!m) {
      out.push(line);
      continue;
    }
    const [, quote, fold, title] = m;
    const body: string[] = [];
    let j = i + 1;
    for (; j < lines.length && /^\s*>/.test(lines[j]); j++) body.push(lines[j].replace(/^\s*>\s?/, ""));
    let statement = title.trim();
    let rest = body;
    if (!statement) {
      const k = rest.findIndex((l) => l.trim());
      if (k < 0) {
        out.push(line);
        continue;
      }
      statement = rest[k].trim();
      rest = rest.slice(k + 1);
    }
    const k = rest.findIndex((l) => l.trim());
    const a = k < 0 ? null : TF_ANSWER.exec(rest[k].trim());
    if (!a) {
      out.push(line);
      continue;
    }
    const isTrue = /^(vrai|true)$/i.test(a[1]);
    const english = /^(true|false)$/i.test(a[1]);
    const explanation = [rest[k].trim().slice(a[0].length), ...rest.slice(k + 1)];
    out.push(
      `${quote}[!quiz]${fold} ${statement}`,
      `${quote}- [${isTrue ? "x" : " "}] ${english ? "True" : "Vrai"}`,
      `${quote}- [${isTrue ? " " : "x"}] ${english ? "False" : "Faux"}`,
    );
    if (explanation.some((l) => l.trim())) {
      out.push(quote.trimEnd(), ...explanation.map((l) => `${quote}${l}`.trimEnd()));
    }
    i = j - 1;
  }
  return out.join("\n");
}

export async function renderMarkdown(
  raw: string,
  opts: {
    dir?: string;
    /** Glossary terms to mark (lib/node/content.ts getGlossaryFor); none if unset. */
    glossary?: GlossaryEntry[];
  } = {},
): Promise<Rendered> {
  const dir = opts.dir ?? "";
  const ph = newPlaceholders();
  const text = preprocessMath(preprocessTrueFalse(raw), ph);

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkWikiLinks)
    .use(remarkRelativeNoteLinks, dir)
    .use(remarkSmartypants)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeStripUnsafe)
    .use(rehypeCallouts, ph.map)
    .use(rehypePredictVeil)
    .use(rehypeManim, dir)
    .use(rehypeWidgets, dir)
    .use(rehypeIsoFigures)
    .use(rehypePrix)
    .use(rehypeFrise)
    .use(rehypeShiki)
    .use(rehypePlaceholders, ph.map)
    .use(rehypeOutline)
    .use(rehypeHeadingIds)
    .use(rehypeSlug)
    .use(rehypeDropHandNumbers)
    .use(rehypeAutolinkHeadings, {
      behavior: "append",
      // className first: buildToc (lib/node/html.ts) strips `<a class="anchor"…`.
      // Kept out of the search index — the "#" is chrome, not heading text.
      // public/js/copy-links.js labels it and turns a click into "copy link".
      properties: { className: ["anchor"], dataPagefindIgnore: "" },
      content: { type: "text", value: "#" },
    })
    .use(rehypeVaultAssets, dir)
    .use(rehypeYouTube)
    .use(rehypeSidenotes)
    // After rehypeVaultAssets (src resolved, clips promoted to <video>) and
    // after rehypeSidenotes, so an image pulled into a margin note is left
    // alone rather than boxed into a figure inside the margin.
    .use(rehypeFigures)
    // Last content pass: math, callouts and links are final by now, so the
    // glossary can tell body text from what it must leave alone.
    .use(rehypeGlossary, opts.glossary)
    .use(rehypeStringify, { allowDangerousHtml: true });

  const html = String(await processor.process(text));
  return {
    html,
    plain: extractPlain(raw),
    hasMath: ph.map.size > 0,
    hasQuiz: /class="[^"]*\b(?:callout-(?:quiz|predict|ex)|frise-ex)\b/.test(html),
    hasGlossary: /<a class="gloss"/.test(html),
  };
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
    .replace(/<[^>]+>/g, " ")
    // Obsidian syntax remark doesn't know: embeds go, a wikilink reads as
    // its alias or the last segment of its target, a callout loses its tag.
    .replace(/!\[\[[^\]\n]*\]\]/g, " ")
    .replace(/\[\[([^\]|\n]*)(?:\|([^\]\n]*))?\]\]/g, (_, target: string, alias?: string) =>
      (alias ?? target.replace(/#.*$/, "").split("/").pop() ?? "").trim(),
    )
    .replace(/^(\s*>\s*)\[![\w-]+\][+-]?/gm, "$1");
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
  return blockText(tree)
    .replace(/\s+/g, " ")
    .trim();
}

/** Inline nodes run together; anything else (paragraph, heading, list item,
 *  table cell…) ends with a space, so two blocks never fuse into one word. */
const INLINE = new Set(["emphasis", "strong", "delete", "link", "linkReference"]);
function blockText(node: any): string {
  if (typeof node.value === "string" && node.type !== "code" && node.type !== "html")
    return node.value;
  if (!Array.isArray(node.children)) return "";
  const inner = node.children.map(blockText).join("");
  return INLINE.has(node.type) ? inner : `${inner} `;
}

/** Word-boundary truncation with an ellipsis, like Hugo's `truncate`. */
export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const sp = cut.lastIndexOf(" ");
  return (sp > 0 ? cut.slice(0, sp) : cut) + "…";
}
