// Footnotes become Tufte sidenotes.

import { visit, SKIP } from "unist-util-visit";
import type { Root, Element, ElementContent } from "hast";
import { hastText } from "./hast";

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
export function rehypeSidenotes() {
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
