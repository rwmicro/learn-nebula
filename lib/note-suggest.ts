/** One entry of /notes-index.json (app/notes-index.json/route.ts): every
 *  published note, shipped to the client for the 404 suggestions and /hasard/. */
export interface NoteIndexEntry {
  title: string;
  href: string;
  /** Folder breadcrumb, top group dropped ("Mathematics › Lycée") — shown and
   *  matched by the command palette (/js/palette.js). Optional: older cached
   *  copies of the index don't carry it. */
  folder?: string;
}

/** Lowercase, accent-free, alphanumeric words ("Économie_politique" →
 *  "economie politique"). Pure and dependency-free: runs in the browser. */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Path noise that says nothing about which note was meant.
const STOP = new Set(["posts", "index", "html", "htm", "md", "www"]);

/** The words a mistyped/stale URL was probably looking for, decoded and
 *  normalised: `leaf` from its last meaningful segment (the note), `folder`
 *  from the one before it (its folder, a weaker hint). */
export function pathTerms(pathname: string): { leaf: string[]; folder: string[] } {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    /* malformed escape: match on the raw path */
  }
  const segs = decoded
    .split("/")
    .map((seg) => normalize(seg).split(" ").filter((w) => w.length >= 2 && !STOP.has(w)))
    .filter((words) => words.length);
  const leaf = [...new Set(segs.at(-1) ?? [])];
  const folder = [...new Set(segs.at(-2) ?? [])].filter((w) => !leaf.includes(w));
  return { leaf, folder };
}

/** Levenshtein distance, bailing out once it exceeds `max` (only "is it a
 *  one- or two-letter typo?" matters here, so most comparisons stop early). */
function withinDistance(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

function wordScore(word: string, tokens: string[]): number {
  let best = 0;
  for (const tok of tokens) {
    if (tok === word) return 3;
    if (tok.startsWith(word) || word.startsWith(tok)) best = Math.max(best, tok.length >= 3 ? 2 : 0);
    else if (tok.includes(word) && word.length >= 3) best = Math.max(best, 1.5);
    else if (word.length >= 4 && withinDistance(word, tok, word.length >= 7 ? 2 : 1))
      best = Math.max(best, 1.5);
  }
  return best;
}

/**
 * Up to `limit` notes whose title or URL look like `pathname`: each path word
 * scores against the note's title and last two slug segments (exact word >
 * prefix > substring / typo), folder words at half weight, and a note whose
 * own last slug segment is exactly the requested one (a note that moved
 * folder) comes first. Ties go to the shorter title, the closer match.
 */
export function suggestNotes(
  pathname: string,
  notes: NoteIndexEntry[],
  limit = 5,
): NoteIndexEntry[] {
  const { leaf: words, folder } = pathTerms(pathname);
  if (!words.length) return [];
  const wanted = words.join(" ");
  const scored: { note: NoteIndexEntry; score: number }[] = [];
  for (const note of notes) {
    const slugParts = note.href.split("/").filter((s) => s && s !== "posts");
    const leaf = normalize(slugParts.at(-1) ?? "");
    const tokens = normalize(`${note.title} ${slugParts.slice(-2).join(" ")}`).split(" ");
    let score = 0;
    let hits = 0;
    for (const w of words) {
      const s = wordScore(w, tokens);
      if (s) hits++;
      score += s;
    }
    // Most of the note words must land somewhere, or a single common word
    // ("la", "de") would pull in half the garden.
    if (!hits || hits < Math.ceil(words.length / 2)) continue;
    for (const w of folder) score += wordScore(w, tokens) / 2;
    if (leaf === wanted || normalize(note.title) === wanted) score += 10;
    scored.push({ note, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.note.title.length - b.note.title.length)
    .slice(0, limit)
    .map((s) => s.note);
}
