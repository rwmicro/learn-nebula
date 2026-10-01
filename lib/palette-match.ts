// Fuzzy, accent-insensitive matching and ranking for the command palette
// (public/js/palette.js). Small and dependency-free on purpose: it ships in the
// site-wide palette bundle. Unit-tested in lib/palette-match.test.ts.

/** Lowercase, accents and ligatures folded: "Œuvre Économique" → "oeuvre economique". */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/ß/g, "ss")
    .replace(/[’']/g, "'");
}

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

/**
 * Score of one query token against a folded text, or null when it does not
 * match. In decreasing order: prefix of the text, start of a word, plain
 * substring, then a subsequence ("drvt" in "derivation") whose letters may not
 * be spread too thin. Earlier positions score higher.
 */
export function tokenScore(token: string, text: string, fuzzy = true): number | null {
  if (!token) return 0;
  const at = text.indexOf(token);
  if (at === 0) return 100;
  if (at > 0) {
    // Best word-start occurrence, if any, beats the first raw one.
    let i = at;
    while (i !== -1) {
      if (!isWordChar(text[i - 1])) return 80 - Math.min(i, 40) * 0.25;
      i = text.indexOf(token, i + 1);
    }
    return 55 - Math.min(at, 40) * 0.25;
  }
  if (!fuzzy || token.length < 2) return null;
  // Subsequence, greedy from the first occurrence of the first letter that
  // leads to a full match — good enough at palette sizes.
  let best: number | null = null;
  for (let start = text.indexOf(token[0]); start !== -1; start = text.indexOf(token[0], start + 1)) {
    let pos = start;
    let gaps = 0;
    let ok = true;
    for (let k = 1; k < token.length; k++) {
      const next = text.indexOf(token[k], pos + 1);
      if (next === -1) {
        ok = false;
        break;
      }
      gaps += next - pos - 1;
      pos = next;
    }
    if (!ok) break; // later starts can only find fewer letters
    // Letters scattered across the whole title are noise, not a match.
    if (gaps > token.length * 3) continue;
    const wordStart = !isWordChar(text[start - 1]) ? 6 : 0;
    const s = 30 + wordStart - gaps * 1.5 - Math.min(start, 40) * 0.2;
    if (best === null || s > best) best = s;
  }
  return best;
}

export interface Matchable {
  title: string;
  /** Secondary text (folder, section kind…), matched at half weight. */
  hint?: string;
  /** Extra words that match but are never shown (action synonyms). */
  keywords?: string;
}

/**
 * Score of a whole query (space-separated tokens, all required) against an
 * item, or null. Each token takes its best field: the title at full weight,
 * the hint at half, keywords at 0.8. Bonuses for the title being exactly the
 * query or starting with it, and a small one for shorter titles.
 */
export function scoreItem(query: string, item: Matchable, fuzzy = true): number | null {
  const q = fold(query).trim();
  if (!q) return 0;
  const title = fold(item.title);
  const hint = item.hint ? fold(item.hint) : "";
  const kw = item.keywords ? fold(item.keywords) : "";
  let total = 0;
  for (const tok of q.split(/\s+/)) {
    const candidates = [
      tokenScore(tok, title, fuzzy),
      hint ? scale(tokenScore(tok, hint, fuzzy), 0.5) : null,
      kw ? scale(tokenScore(tok, kw, fuzzy), 0.8) : null,
    ].filter((x): x is number => x !== null);
    if (!candidates.length) return null;
    total += Math.max(...candidates);
  }
  if (title === q) total += 60;
  else if (title.startsWith(q)) total += 25;
  return total - Math.min(title.length, 80) * 0.05;
}

function scale(x: number | null, k: number): number | null {
  return x === null ? null : x * k;
}

const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

/**
 * Items matching `query`, best first (ties: shorter title, then A→Z), at most
 * `limit`. Subsequence matches are only a fallback: as soon as one item
 * contains every token as a substring, scattered-letter matches ("kant" in
 * "Kata Ganti") are noise and are left out.
 */
export function rankItems<T extends Matchable>(query: string, items: T[], limit = Infinity): T[] {
  let scored = collect(query, items, false);
  if (!scored.length) scored = collect(query, items, true);
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.item.title.length - b.item.title.length ||
      collator.compare(a.item.title, b.item.title),
  );
  return scored.slice(0, limit).map((s) => s.item);
}

function collect<T extends Matchable>(query: string, items: T[], fuzzy: boolean) {
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const score = scoreItem(query, item, fuzzy);
    if (score !== null) scored.push({ item, score });
  }
  return scored;
}
