// The pure side of a note's on-device translation
// (public/js/translate-device.js): which blocks go to the model together,
// how a batch is written and read back, what a truncated or mangled answer
// looks like, and the progress the card shows.

/** Languages written from right to left. */
const RTL = new Set(["ar", "he", "fa", "ur", "ug", "ps", "yi", "sd", "dv"]);
export function isRtl(lang: string): boolean {
  return RTL.has(lang.toLowerCase().split("-")[0]);
}

/** Whether a block holds something to translate: a word of two letters at
 *  least. "b", "/p/" or "→" in a table of sounds are left as written. */
export function worthTranslating(text: string): boolean {
  return /\p{L}[\p{L}\p{M}]/u.test(text);
}

export interface BatchLimits {
  /** Characters a batch may hold. */
  chars: number;
  /** Blocks a batch may hold. */
  blocks: number;
  /** A block this long goes alone. */
  alone: number;
}

/** Small on purpose: a 2B model keeps a handful of short lines in order,
 *  not a page. */
export const BATCH: BatchLimits = { chars: 600, blocks: 8, alone: 280 };

/**
 * Consecutive blocks grouped into batches (their indexes): table cells and
 * short lines travel together, a paragraph alone. `breaks[i]` true starts a
 * new batch at block i (a heading: a section is never cut across a batch,
 * so the card's section count stays true).
 */
export function planBatches(
  lengths: number[],
  breaks: boolean[] = [],
  limits: BatchLimits = BATCH,
): number[][] {
  const out: number[][] = [];
  let cur: number[] = [];
  let size = 0;
  const flush = () => {
    if (cur.length) out.push(cur);
    cur = [];
    size = 0;
  };
  lengths.forEach((len, i) => {
    if (breaks[i]) flush();
    if (len >= limits.alone) {
      flush();
      out.push([i]);
      return;
    }
    if (cur.length >= limits.blocks || size + len > limits.chars) flush();
    cur.push(i);
    size += len;
  });
  flush();
  return out;
}

/** What the model is sent for a batch: the block itself, or one numbered
 *  line per block. */
export function batchPrompt(texts: string[]): string {
  if (texts.length === 1) return texts[0];
  return texts.map((t, i) => `[${i + 1}] ${t}`).join("\n");
}

/** The model's answer cut back into `n` blocks; null where a line is
 *  missing (that block is asked again on its own). */
export function parseBatch(out: string, n: number): (string | null)[] {
  const clean = out.replace(/^```\w*\s*|\s*```$/g, "").trim();
  if (n === 1) return [clean.replace(/^\[1\]\s*/, "") || null];
  const res: (string | null)[] = Array.from({ length: n }, () => null);
  const re = /^\s*\[(\d+)\]\s?/gm;
  const marks: { k: number; at: number; end: number }[] = [];
  for (let m = re.exec(clean); m; m = re.exec(clean))
    marks.push({ k: Number(m[1]), at: m.index, end: re.lastIndex });
  marks.forEach((mark, i) => {
    if (mark.k < 1 || mark.k > n || res[mark.k - 1] !== null) return;
    const text = clean
      .slice(mark.end, marks[i + 1]?.at ?? clean.length)
      .replace(/\s*\n\s*/g, " ")
      .trim();
    res[mark.k - 1] = text || null;
  });
  return res;
}

/** Whether every <tN>/<kN> tag opened in `text` is closed, in order: an
 *  answer cut by the token limit ends inside one, and the HTML parser would
 *  quietly close it. */
export function tagsBalanced(text: string): boolean {
  const stack: string[] = [];
  for (const m of text.matchAll(/<(\/?)([tk]\d+)>/g)) {
    if (!m[1]) stack.push(m[2]);
    else if (stack.pop() !== m[2]) return false;
  }
  return stack.length === 0;
}

/** Room for the answer: a translation rarely needs more tokens than the
 *  source has characters. */
export function maxTokensFor(chars: number): number {
  return Math.min(2048, Math.ceil(chars * 1.1) + 96);
}

/** Share done (0–100) and seconds left, from the characters translated so
 *  far; no estimate before 8 seconds and 5 %. */
export function progressOf(
  doneChars: number,
  totalChars: number,
  elapsedMs: number,
): { pct: number; secondsLeft: number | null } {
  if (totalChars <= 0) return { pct: 100, secondsLeft: null };
  const ratio = Math.min(1, Math.max(0, doneChars / totalChars));
  const pct = Math.round(ratio * 100);
  if (elapsedMs < 8000 || ratio < 0.05 || ratio >= 1)
    return { pct, secondsLeft: null };
  return {
    pct,
    secondsLeft: Math.round(((elapsedMs / ratio) * (1 - ratio)) / 1000),
  };
}
