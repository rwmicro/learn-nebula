// The DOM side of lib/read-aloud.ts: walks the note the way
// lib/speech-text.ts does (same skips, same blocks) and says, for every
// piece of text, which language it is in. A `lang` attribute wins; a table
// whose header names a language gives it to its column; else the script
// decides (Chinese characters in French prose).
import { SPEECH_BLOCKS as BLOCKS, SPEECH_SKIP } from "./speech-text";
import {
  buildPassages,
  langFromHeader,
  splitByScript,
  type LangPart,
  type Passage,
} from "./read-aloud";

/** The language of each column of `table`, from its header row. */
function columnLangs(table: Element): (string | null)[] {
  const head = table.querySelector("thead tr") ?? table.querySelector("tr");
  if (!head || !head.querySelector("th")) return [];
  const out: (string | null)[] = [];
  for (const cell of head.children) {
    const lang = langFromHeader(cell.textContent ?? "");
    const span = Math.max(1, Number(cell.getAttribute("colspan")) || 1);
    for (let i = 0; i < span; i++) out.push(lang);
  }
  // One named column is a table about a language, not a table of languages.
  return out.filter(Boolean).length >= 2 ? out : [];
}

interface Ctx {
  base: string;
  studied: string | null;
  /** Set by a `lang` attribute or a table column: no script guessing. */
  forced: string | null;
  cols: (string | null)[];
}

function walk(root: Element, ctx: Ctx, parts: LangPart<Text>[]): void {
  let col = 0;
  for (const node of root.childNodes) {
    if (node.nodeType === 3) {
      const text = node.textContent ?? "";
      if (!text) continue;
      if (ctx.forced)
        parts.push({
          text,
          lang: ctx.forced,
          seg: { node: node as Text, start: 0, end: text.length },
        });
      else
        parts.push(...splitByScript(text, ctx.base, ctx.studied, node as Text));
    } else if (node.nodeType === 1) {
      const el = node as Element;
      if (el.matches(SPEECH_SKIP)) continue;
      if (
        el.tagName === "SUP" &&
        el.nextElementSibling?.classList.contains("side")
      )
        continue;
      let next = ctx;
      const own = el.getAttribute("lang")?.trim().toLowerCase();
      const code = own?.split("-")[0];
      if (code)
        next =
          code === ctx.base
            ? { ...ctx, forced: null }
            : { ...ctx, forced: code, base: code };
      if (el.tagName === "TABLE") next = { ...next, cols: columnLangs(el) };
      else if (
        el.tagName === "TD" &&
        root.tagName === "TR" &&
        root.parentElement?.tagName !== "THEAD"
      ) {
        const lang = ctx.cols[col] ?? null;
        if (lang && lang !== ctx.base) next = { ...next, forced: lang };
      }
      if (el.tagName === "TD" || el.tagName === "TH")
        col += Math.max(1, Number(el.getAttribute("colspan")) || 1);
      const block = BLOCKS.test(el.tagName);
      if (block) parts.push(null);
      walk(el, next, parts);
      if (block) parts.push(null);
    }
  }
}

/** The note as passages to read aloud: its title, then its body. `base` is
 *  the language of the prose (`<main lang>`, "fr" by default), `studied` the
 *  language the note is about (`data-speech-lang`), if any. */
export function notePassages(
  main: Element,
  base: string,
  studied: string | null,
): Passage<Text>[] {
  const parts: LangPart<Text>[] = [];
  const ctx: Ctx = { base, studied, forced: null, cols: [] };
  const title = main.querySelector(".title-note");
  if (title) {
    walk(title, ctx, parts);
    parts.push(null);
  }
  const body = main.querySelector(".article-body");
  if (body) walk(body, ctx, parts);
  return buildPassages(parts);
}

/** The ranges a passage covers, one per run of text nodes. */
export function passageRanges(p: Passage<Text>): Range[] {
  const out: Range[] = [];
  for (const s of p.segs) {
    if (!s.node.isConnected) continue;
    const len = s.node.data.length;
    const r = new Range();
    r.setStart(s.node, Math.min(s.start, len));
    r.setEnd(s.node, Math.min(s.end, len));
    if (!r.collapsed) out.push(r);
  }
  return out;
}
