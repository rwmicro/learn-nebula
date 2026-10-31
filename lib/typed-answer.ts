/**
 * "Taper la réponse" — comparing what the reader typed with a card's answer.
 * Pure, shared by the review surface (components/review/ReviewSession.tsx).
 *
 * The comparison is forgiving by design: case, accents and other combining
 * marks (Arabic harakat, Vietnamese tones…), punctuation and spacing are
 * ignored, and an answer listing alternatives ("maison, demeure" or "a / b")
 * accepts any one of them. The reader still grades themselves; this only
 * shows where the two differ.
 */

/** One character folded for comparison: lowercase, without combining marks
 *  or punctuation ("" = ignored altogether). */
export function foldChar(ch: string): string {
  return ch
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[\p{P}\p{S}\sـ]/gu, ""); // U+0640: Arabic tatweel
}

export function fold(s: string): string {
  return Array.from(s.normalize("NFC")).map(foldChar).join("");
}

/** The accepted forms of an answer: the whole, and each alternative. */
export function alternatives(expected: string): string[] {
  const bare = (x: string) => x.replace(/\([^)]*\)|\[[^\]]*\]/g, "").trim();
  const parts = expected
    .split(/[,;/|]|\s+(?:ou|or|o)\s+/)
    .map(bare)
    .filter(Boolean);
  const out = [expected, bare(expected), ...(parts.length > 1 ? parts : [])];
  return [...new Set(out.filter(Boolean))];
}

export function isMatch(typed: string, expected: string): boolean {
  const t = fold(typed);
  return !!t && alternatives(expected).some((a) => fold(a) === t);
}

export type Seg = { text: string; ok: boolean };

/**
 * Character diff (longest common subsequence on folded characters) between
 * the typed answer and the closest accepted form: `typed` marks the typed
 * characters that don't belong, `expected` the expected ones that are
 * missing. Ignored characters (punctuation, spaces) always count as matching.
 */
export function diff(typed: string, expected: string): { typed: Seg[]; expected: Seg[] } {
  const ft = fold(typed);
  const target =
    alternatives(expected)
      .slice(1)
      .find((a) => fold(a) === ft) ??
    alternatives(expected).reduce((best, a) =>
      similarity(ft, fold(a)) > similarity(ft, fold(best)) ? a : best,
    );
  const a = Array.from(typed.normalize("NFC"));
  const b = Array.from(target.normalize("NFC"));
  const fa = a.map(foldChar);
  const fb = b.map(foldChar);
  // LCS table over the folded characters that count.
  const ia = fa.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
  const ib = fb.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
  const n = ia.length;
  const m = ib.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => Array.from({ length: m + 1 }, () => 0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      L[i][j] = fa[ia[i]] === fb[ib[j]] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const okA = new Set<number>();
  const okB = new Set<number>();
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (fa[ia[i]] === fb[ib[j]]) {
      okA.add(ia[i++]);
      okB.add(ib[j++]);
    } else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  const segs = (chars: string[], folded: string[], ok: Set<number>): Seg[] => {
    const out: Seg[] = [];
    chars.forEach((ch, i) => {
      const good = !folded[i] || ok.has(i);
      const last = out[out.length - 1];
      if (last && last.ok === good) last.text += ch;
      else out.push({ text: ch, ok: good });
    });
    return out;
  };
  return { typed: segs(a, fa, okA), expected: segs(b, fb, okB) };
}

function similarity(a: string, b: string): number {
  // Shared characters, a cheap proxy to pick which alternative to diff against.
  const pool = new Map<string, number>();
  for (const c of b) pool.set(c, (pool.get(c) ?? 0) + 1);
  let n = 0;
  for (const c of a) {
    const k = pool.get(c);
    if (k) {
      n++;
      pool.set(c, k - 1);
    }
  }
  return n / Math.max(a.length, b.length, 1);
}
