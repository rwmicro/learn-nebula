// Card HTML from .apkg decks, made safe and turned into text, for
// scripts/build-anki.mjs. Its own module so lib/node/anki-html.test.ts can
// try it on hostile input.
//
// Card HTML comes from the .apkg. That's first-party for your own decks, but
// decks are commonly shared/downloaded, and the study page injects it with
// dangerouslySetInnerHTML, so anything executable has to go here. Mirrors
// lib/node/markdown/hast.ts rehypeStripUnsafe.
import { fromHtml } from "hast-util-from-html";
import rehypeStringify from "rehype-stringify";
import { unified } from "unified";
import { SKIP, visit } from "unist-util-visit";

// Parsed, not regex-matched: a regex pass can be dodged (`<scr<script>ipt>`,
// `</script >`), a real HTML parser sees what the browser will see.
const UNSAFE_URL = /^\s*(?:javascript|vbscript|data:text\/html)/i;
const URL_ATTRS = ["href", "src", "xLinkHref", "action", "formAction"];
const DROP_TAGS = new Set(["script", "style", "iframe", "object", "embed", "base", "meta"]);
const toHtml = unified().use(rehypeStringify);

export function sanitize(html) {
  const tree = fromHtml(String(html), { fragment: true });
  visit(tree, "element", (node, index, parent) => {
    if (DROP_TAGS.has(node.tagName) && parent && index != null) {
      parent.children.splice(index, 1);
      return [SKIP, index];
    }
    const props = node.properties ?? {};
    for (const key of Object.keys(props)) if (/^on/i.test(key)) delete props[key];
    for (const key of URL_ATTRS) {
      const v = props[key];
      if (typeof v === "string" && UNSAFE_URL.test(v)) props[key] = "#";
    }
  });
  return toHtml.stringify(tree);
}

/** The text of an HTML fragment, entities decoded, `<br>` as a space. */
export function htmlText(html) {
  const tree = fromHtml(String(html), { fragment: true });
  let out = "";
  visit(tree, (node) => {
    if (node.type === "text") out += node.value;
    else if (node.type === "element" && node.tagName === "br") out += " ";
  });
  return out;
}

// Plain text of a field (for typed answers): no tags, entities decoded.
export function plainText(html) {
  return htmlText(html).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
