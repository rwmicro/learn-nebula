// Links: Obsidian wikilinks and relative note links (mdast).

import { visit } from "unist-util-visit";
import type { Root } from "hast";
import { resolveRelativeNoteLink, resolveWikiLink } from "../content";

/**
 * Convert Obsidian wikilinks to real links, operating on mdast text nodes only
 * so that `[[ … ]]` inside (bash) code blocks is left untouched. Unresolved
 * targets are left as literal text.
 *
 * A leading `!` is Obsidian's embed marker. When the target resolves to a vault
 * asset, `![[photo.png]]` becomes a real image node — it used to emit a link
 * with the bang left behind as literal text, so an embedded image rendered as
 * "!photo.png" in the prose. (lib/node/seo.ts already treated `![[file.png]]` as an
 * image when picking a note's OG image, so the two halves disagreed.)
 * Note *transclusion* — `![[Some Note]]` pulling in another note's body — is
 * not implemented; that target still becomes a plain link, just without the
 * stray bang.
 */
function splitWikiLinks(value: string): unknown[] | null {
  // The optional `!` is captured so an embed can be told from a plain link.
  const re = /(!?)\[\[([^[\]\n]+?)\]\]/g;
  const out: unknown[] = [];
  let last = 0;
  let found = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    const embed = m[1] === "!";
    const inner = m[2];
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
    // Only an asset can be embedded: resolveWikiLink sends notes to /posts/.
    if (embed && url.startsWith("/vault/")) {
      // `![[photo.png|300]]` is Obsidian's width syntax, not a caption.
      const width = alias && /^\d+$/.test(alias) ? alias : null;
      // With no alias (or a numeric one, which is a width) the only text we
      // have is the file name: fine as an alt fallback, not a caption. The
      // marker tells rehypeFigures not to print it; it is stripped there.
      const named = Boolean(alias) && !width;
      out.push({
        type: "image",
        url,
        alt: named ? display : target.split("/").pop(),
        data: {
          hProperties: {
            ...(width ? { width } : {}),
            ...(named ? {} : { "data-alt-is-filename": "" }),
          },
        },
      });
    } else {
      out.push({
        type: "link",
        url,
        children: [{ type: "text", value: display }],
      });
    }
    last = re.lastIndex;
  }
  if (!found) return null;
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

export function remarkWikiLinks() {
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

/** Point relative `[text](Other note.md)` links at the note's page; left as
 *  written they would 404, since only the vault's assets are copied. */
export function remarkRelativeNoteLinks(dir: string) {
  return (tree: Root) => {
    visit(tree as any, "link", (node: any) => {
      const url = resolveRelativeNoteLink(dir, node.url ?? "");
      if (url) node.url = url;
    });
  };
}
