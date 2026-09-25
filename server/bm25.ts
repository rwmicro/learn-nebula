// Lexical (BM25) index over the RAG chunks, next to the dense one in rag.ts.
//
// Embeddings are good at meaning and bad at rare exact strings: a
// transliteration ("bshūf"), an Arabic or Chinese word, a proper name the model
// never saw. The language notes are full of those, so retrieval fuses both
// rankings (rag.ts). Tiny and dependency-free: ~10k chunks, rebuilt in memory
// at startup alongside the vector matrix.

const K1 = 1.2;
const B = 0.75;

// Scripts written without spaces: every character is a token (unigrams are
// crude, but a query word still matches the same characters in a note).
const NO_SPACE_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;

/** Lowercased, accent/diacritic-folded word tokens ("Présent" → "present",
 *  Arabic harakat dropped, Han split per character). */
export function tokenize(text: string): string[] {
  const words = text.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().match(/[\p{L}\p{N}]+/gu);
  if (!words) return [];
  const out: string[] = [];
  for (const w of words) {
    if (NO_SPACE_SCRIPT.test(w)) out.push(...w);
    else out.push(w);
  }
  return out;
}

export class Bm25 {
  private postings = new Map<string, { doc: number[]; tf: number[] }>();
  private docLen: Uint32Array;
  private avgLen: number;
  readonly size: number;

  constructor(texts: string[]) {
    this.size = texts.length;
    this.docLen = new Uint32Array(texts.length);
    let total = 0;
    texts.forEach((t, i) => {
      const counts = new Map<string, number>();
      const toks = tokenize(t);
      for (const tok of toks) counts.set(tok, (counts.get(tok) ?? 0) + 1);
      for (const [tok, n] of counts) {
        let p = this.postings.get(tok);
        if (!p) this.postings.set(tok, (p = { doc: [], tf: [] }));
        p.doc.push(i);
        p.tf.push(n);
      }
      this.docLen[i] = toks.length;
      total += toks.length;
    });
    this.avgLen = texts.length ? total / texts.length : 0;
  }

  /** Top-`k` documents for `query`, restricted to those `keep(i)` accepts.
   *  `rare` is whether the document matched at least one query term found in
   *  at most `rareDf` (a fraction) of all documents — a word that actually
   *  singles notes out, as opposed to one that merely co-occurs everywhere. */
  search(
    query: string,
    k: number,
    keep: (i: number) => boolean = () => true,
    rareDf = 0.01,
  ): { i: number; s: number; rare: boolean }[] {
    const scores = new Map<number, number>();
    const rare = new Set<number>();
    const rareMax = Math.max(1, Math.floor(this.size * rareDf));
    for (const term of new Set(tokenize(query))) {
      const p = this.postings.get(term);
      if (!p) continue;
      const isRare = p.doc.length <= rareMax;
      const idf = Math.log(1 + (this.size - p.doc.length + 0.5) / (p.doc.length + 0.5));
      for (let j = 0; j < p.doc.length; j++) {
        const i = p.doc[j];
        if (!keep(i)) continue;
        const tf = p.tf[j];
        const norm = tf + K1 * (1 - B + (B * this.docLen[i]) / (this.avgLen || 1));
        scores.set(i, (scores.get(i) ?? 0) + (idf * tf * (K1 + 1)) / norm);
        if (isRare) rare.add(i);
      }
    }
    return [...scores]
      .map(([i, s]) => ({ i, s, rare: rare.has(i) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, k);
  }
}
