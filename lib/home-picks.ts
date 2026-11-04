// Pure pickers for the phone home (components/home/HomeDashboard.tsx), run at
// build in app/page.tsx: the note of the day's opening paragraph, and the
// words of the day read from the vault's vocabulary tables. Tested in
// lib/home-picks.test.ts.

/**
 * The first paragraph of prose in a note's markdown: not a heading, a list,
 * a table, a rule, an embed or a code block. A callout's text counts (its
 * `[!type]` title line does not), since many notes open on their key idea there.
 * Returns the raw markdown of that paragraph, or "" when the note has none
 * of at least `min` characters (a vocabulary sheet, a list of objectives).
 */
export function openingParagraph(md: string, min = 160): string {
  const body = md.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/```[\s\S]*?```/g, "\n\n");
  for (const block of body.split(/\n\s*\n/)) {
    const lines = block
      .split("\n")
      .map((l) => l.replace(/^\s*>\s?/, ""))
      // A callout's tag line is its title ("Idée clé"), not its text.
      .filter((l) => !/^\s*\[![\w-]+\]/.test(l))
      .filter((l) => l.trim());
    if (!lines.length) continue;
    const first = lines[0].trim();
    // Headings, lists, tables, rules, embeds, html, math, shortcodes.
    if (/^(#|[-*+]\s|\d+[.)]\s|\||---|\*\*\*|!\[|<|\$\$|\{\{)/.test(first)) continue;
    const text = lines.join(" ").trim();
    if (text.replace(/[*_`[\]()]/g, "").length < min) continue;
    return text;
  }
  return "";
}

/** A word of the day: the word as written in its note, its French gloss, the
 *  clip that says it, and an optional transliteration and example. */
export interface VocabWord {
  w: string;
  g: string;
  audio: string;
  tr?: string;
  ex?: string;
}

const AUDIO_CELL = /^!\[([^\]]+)\]\(([^)\s]+\.mp3)\)$/i;
const strip = (s: string) =>
  s
    .replace(/\*\*|__|\*|`/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Words from a note's vocabulary tables: rows whose first cell is a single
 * `![word](clip.mp3)` and whose header names a French column ("Français",
 * "Sens", "Traduction"). Kept short (a word or an expression of up to four
 * words), so a table of example sentences gives nothing. `audio` is the clip
 * path as written in the note, resolved by the caller.
 */
export function vocabFromMarkdown(md: string): VocabWord[] {
  const out: VocabWord[] = [];
  const lines = md.split("\n");
  for (let i = 0; i < lines.length - 2; i++) {
    if (!/^\s*\|/.test(lines[i]) || !/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) continue;
    const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    const head = cells(lines[i]).map((h) => strip(h).toLowerCase());
    const gi = head.findIndex((h, k) => k > 0 && /fran[cç]ais|^sens$|traduction|signification/.test(h));
    if (gi < 0) continue;
    const ti = head.findIndex((h, k) => k > 0 && /translitt|pinyin|romanis|prononciation/.test(h));
    const ei = head.findIndex((h, k) => k > 0 && /exemple/.test(h));
    let j = i + 2;
    for (; j < lines.length && /^\s*\|/.test(lines[j]); j++) {
      const row = cells(lines[j]);
      const m = AUDIO_CELL.exec(row[0] ?? "");
      if (!m) continue;
      const w = strip(m[1]);
      const g = strip(row[gi] ?? "");
      if (!w || !g || w.split(" ").length > 4 || w.length > 32 || g.length > 48 || g.includes("![")) continue;
      const tr = ti > 0 ? strip(row[ti] ?? "") : "";
      const ex = ei > 0 ? strip(row[ei] ?? "") : "";
      out.push({
        w,
        g,
        audio: m[2],
        ...(tr && !tr.includes("![") ? { tr } : {}),
        ...(ex && !ex.includes("![") && ex.length <= 120 ? { ex } : {}),
      });
    }
    i = j - 1;
  }
  return out;
}
