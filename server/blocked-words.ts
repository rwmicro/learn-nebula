// Comment word filter: the owner's list of blocked words/phrases (stored in
// the comments DB, edited from /admin). Matching is accent- and
// case-insensitive and whole-word, so "con" flags "Con !" but not "conique".
// Pure functions here; storage lives in db.ts.

export const MAX_WORDS = 200;
export const MAX_WORD_LEN = 60;

/** Lowercase, strip accents and collapse whitespace — what both the list and
 *  the comment text go through before comparing. */
export function foldText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Clean a submitted list: trim, drop empties and over-long entries, dedupe on
 *  the folded form (first spelling wins), cap the size. */
export function sanitizeWords(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const w = raw.replace(/\s+/g, " ").trim();
    if (!w || w.length > MAX_WORD_LEN) continue;
    const key = foldText(w);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(w);
    if (out.length >= MAX_WORDS) break;
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The blocked words (as listed) that occur in `text` as whole words. */
export function matchBlocked(text: string, words: readonly string[]): string[] {
  if (!words.length || !text) return [];
  const hay = foldText(text);
  const hits: string[] = [];
  for (const w of words) {
    const needle = foldText(w);
    if (!needle) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(needle)}(?![\\p{L}\\p{N}])`, "u");
    if (re.test(hay)) hits.push(w);
  }
  return hits;
}
