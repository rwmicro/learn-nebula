// Shared hast helpers and the pipeline's safety net: text of a node, unsafe
// URLs and handlers stripped, placeholders put back.

import { visit, SKIP } from "unist-util-visit";
import { fromHtml } from "hast-util-from-html";
import type { Root, Element, ElementContent, RootContent } from "hast";


// ---------------------------------------------------------------------------
// rehype plugins
// ---------------------------------------------------------------------------

export function hastText(node: any): string {
  if (node.type === "text") return node.value;
  if (Array.isArray(node.children)) return node.children.map(hastText).join("");
  return "";
}

// Script-execution schemes that must never survive in a note-authored link/src.
const UNSAFE_URL = /^\s*(?:javascript|vbscript):/i;

/**
 * Strip the script-execution vectors from note-authored raw HTML — everything
 * that flowed through rehypeRaw. Runs *before* our own trusted fragments (KaTeX,
 * callout icons, manim/video, highlighted code) are injected, so it only touches
 * what the note author wrote. Notes are first-party, but /api/translate re-runs
 * this exact pipeline on the model's output, so this keeps a prompt-injected note
 * from smuggling executable markup back through the translator. `<script>` goes,
 * inline `on*` event handlers go (they still fire under our `unsafe-inline`
 * script-src), and `javascript:`/`vbscript:` URLs are dropped. `data-*` is left
 * intact — the math placeholders (`data-ph`) depend on it.
 */
export function rehypeStripUnsafe() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName === "script" && parent && index != null) {
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
      const props = node.properties;
      if (!props) return;
      for (const key of Object.keys(props)) {
        if (/^on/i.test(key)) delete props[key];
      }
      for (const attr of ["href", "src"] as const) {
        const v = props[attr];
        if (typeof v === "string" && UNSAFE_URL.test(v)) delete props[attr];
      }
    });
  };
}

/** Replace <div|span data-ph="…"> placeholders with their stored HTML. */
export function rehypePlaceholders(map: Map<string, string>) {
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

/** Is this node whitespace-only text (so it doesn't count as "content")? */
export function isBlank(node: ElementContent): boolean {
  return node.type === "text" && node.value.trim() === "";
}
