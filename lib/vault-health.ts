// Pure detection helpers for the build-time vault health report
// (scripts/vault-health.ts → data/vault-health.json → /admin). No fs, no
// content index: the script resolves what these extract against
// lib/content.ts / lib/vault-assets.ts, so link resolution stays the site's
// own and can't drift from what the pages actually render.

import { isAudioSrc } from "./vault-assets";

/** Frontmatter keys every vault note carries (title/domain/subdomain drive the
 *  browse tree, Domaines facet and graph themes; tags the /themes pages; date
 *  the feed and "latest growth"). */
export const REQUIRED_FIELDS = ["title", "domain", "subdomain", "tags", "date"] as const;

/** Reason given for a `prerequis:` entry that names no published note (the
 *  "À lire avant" block drops it; vault-health lists it under broken links). */
export const PREREQ_MISSING = "prérequis introuvable";

/** Below this many characters of body text a note is a stub. */
export const NEAR_EMPTY_CHARS = 200;

/** Fenced code blocks and inline code removed: a `[[x]]` or a
 *  link inside a bash snippet is text, not a link (remarkWikiLinks skips code
 *  the same way). Line count is preserved so positions stay meaningful. */
export function stripCode(body: string): string {
  return body
    .replace(/^(\s*)(```|~~~)[^\n]*\n[\s\S]*?^\s*\2[^\n]*$/gm, (m) => m.replace(/[^\n]/g, ""))
    .replace(/`[^`\n]+`/g, "");
}

export interface NoteLink {
  kind: "wikilink" | "markdown";
  /** Note target as written: wikilink target without alias/heading, or the
   *  decoded markdown href without its `#anchor`. */
  target: string;
}

const ASSET_EXT_RE = /\.(?!md$)[a-z0-9]{2,5}$/i;

/** Links that point at *notes*: `[[Note]]`, `[[path/Note|alias]]`,
 *  `[[Note#heading]]`, and relative markdown links to a `.md` file. Embeds and
 *  links to assets (`[[photo.png]]`, `![](x.mp3)`) and same-note anchors
 *  (`[[#heading]]`) are not note links. */
export function extractNoteLinks(body: string): NoteLink[] {
  const text = stripCode(body);
  const out: NoteLink[] = [];
  for (const m of text.matchAll(/!?\[\[([^[\]\n]+?)\]\]/g)) {
    // `![[Note]]` (transclusion) renders as a plain link too, so it counts.
    const inner = m[1];
    // `\|` is the escaped pipe Obsidian writes for an alias inside a table.
    const beforePipe = inner.split("|")[0].replace(/\\$/, "");
    const target = beforePipe.split("#")[0].trim();
    if (!target || ASSET_EXT_RE.test(target)) continue;
    out.push({ kind: "wikilink", target });
  }
  for (const m of text.matchAll(/(!?)\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^)\s]+)(?:\s+"[^"]*")?\s*\)/g)) {
    if (m[1] === "!") continue;
    const href = m[2].replace(/^<|>$/g, "");
    if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(href)) continue; // external, absolute, anchor
    const pathPart = href.split("#")[0];
    if (!/\.md$/i.test(pathPart)) continue;
    let target = pathPart;
    try {
      target = decodeURIComponent(pathPart);
    } catch {
      /* keep as written */
    }
    out.push({ kind: "markdown", target });
  }
  return out;
}

/** Audio clips a note embeds: `![word](audio/x.mp3)` and `![[x.mp3]]`. */
export function extractAudioRefs(body: string): string[] {
  const text = stripCode(body);
  const out: string[] = [];
  for (const m of text.matchAll(/!\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^)\s]+)(?:\s+"[^"]*")?\s*\)/g)) {
    const src = m[1].replace(/^<|>$/g, "");
    if (isAudioSrc(src) && !/^[a-z][a-z0-9+.-]*:/i.test(src)) out.push(src);
  }
  for (const m of text.matchAll(/!\[\[([^[\]\n|#]+)(?:[|#][^\]\n]*)?\]\]/g)) {
    if (isAudioSrc(m[1].trim())) out.push(m[1].trim());
  }
  return out;
}

/** Normalise a note-relative path ("a/b" + "../c.md" → "a/c"). */
export function joinNotePath(dir: string, href: string): string {
  const parts: string[] = [];
  for (const seg of `${dir}/${href.replace(/\.md$/i, "")}`.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

/** Readable body length: HTML comments dropped, whitespace collapsed. */
export function bodyTextLength(body: string): number {
  return body
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .trim().length;
}

/** Required frontmatter keys that are absent or blank. */
export function missingFields(
  data: Record<string, unknown>,
  required: readonly string[] = REQUIRED_FIELDS,
): string[] {
  return required.filter((k) => {
    const v = data[k];
    if (v === undefined || v === null) return true;
    if (typeof v === "string") return !v.trim();
    if (Array.isArray(v)) return v.length === 0;
    return false;
  });
}

// Function words that are frequent in one language and (near-)absent from the
// others the vault is written in. Words shared between two of them ("que",
// "on", "a", "in") are left out on purpose.
const STOPWORDS: Record<"en" | "fr" | "es", Set<string>> = {
  en: new Set(
    "the and of to is are was were that this with for from which it be by not have has an as or can will their they these those when what how there been would also into than then more its".split(
      " ",
    ),
  ),
  fr: new Set(
    "le la les des du une est et qui dans pour sur pas avec sont ce cette au aux par plus ou il elle ils nous vous mais son sa ses leur être été".split(
      " ",
    ),
  ),
  es: new Set(
    "el los las del una es y por para con como pero su sus se lo al está son muy".split(" "),
  ),
};

export interface LangScore {
  en: number;
  fr: number;
  es: number;
  /** Share of English among the counted stopwords (0 when none counted). */
  enRatio: number;
}

export function stopwordScore(body: string): LangScore {
  const text = stripCode(body)
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\[\[[^\]]*\]\]/g, " ")
    .toLowerCase();
  const score = { en: 0, fr: 0, es: 0 };
  for (const w of text.match(/[\p{L}']+/gu) ?? []) {
    for (const lang of ["en", "fr", "es"] as const) {
      if (STOPWORDS[lang].has(w)) score[lang]++;
    }
  }
  const total = score.en + score.fr + score.es;
  return { ...score, enRatio: total ? score.en / total : 0 };
}

/** At least `minHits` English function words, and English ≥ `ratio` of all
 *  counted ones. A French note quoting an English sentence stays French. */
export function isMostlyEnglish(body: string, minHits = 15, ratio = 0.6): boolean {
  const s = stopwordScore(body);
  return s.en >= minHits && s.enRatio >= ratio;
}

/** git-lfs pointer stub instead of the real file (LFS not pulled). */
export function isLfsPointer(head: string): boolean {
  return head.startsWith("version https://git-lfs.github.com/spec/");
}
