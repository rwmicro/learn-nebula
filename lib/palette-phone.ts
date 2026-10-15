// Pure helpers for the phone layout of the command palette (public/js/palette.js,
// under 640px): short titles and contexts for note rows, the language grouping
// of results such as "salut", recent searches, and the "Essayez …" spelling
// suggestion. Small and dependency-free apart from lib/palette-match.ts: it
// ships in the site-wide palette bundle. Unit-tested in lib/palette-phone.test.ts.

import { fold } from "./palette-match";

/** The vault folder (level 2) holding every language, as /notes-index.json
 *  writes it in a note's folder breadcrumb. */
export const LANGUAGES_FOLDER = "Languages & Dialects";

/** "03-Grammaire" → "Grammaire", "Arabe-Standard" → "Arabe Standard". */
export function cleanFolder(name: string): string {
  return name
    .replace(/^\d+\s*[-_.]\s*/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

const isNumbered = (name: string) => /^\d+\s*[-_.]/.test(name);
const words = (s: string) =>
  fold(s)
    .replace(/\([^)]*\)/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

export interface NoteContext {
  /** The title without a " — suffix" the context already says. */
  title: string;
  /** Discipline folder as on disk ("History"), "" at the vault's top. */
  discipline: string;
  /** For a note in Languages & Dialects: its language ("Arabe Libanais"). */
  lang: string | null;
  /** The deepest folder worth naming, numbering dropped ("Grammaire"), or "". */
  topic: string;
}

/**
 * What a note row shows on a phone, from the note's title and its folder
 * breadcrumb ("Languages & Dialects › Arabe › Libanais › 03-Grammaire"):
 * the language and the section ("Arabe Libanais · Grammaire") instead of the
 * whole path, and the title without a " — Arabe Libanais" the context
 * already gives.
 */
export function noteContext(title: string, folder: string): NoteContext {
  const parts = folder ? folder.split(" › ").map((p) => p.trim()) : [];
  const discipline = parts[0] ?? "";
  const rest = parts.slice(1);
  let lang: string | null = null;
  let topic = "";
  if (discipline === LANGUAGES_FOLDER && rest.length) {
    // The deepest unnumbered folder names the variety ("Arabe-Standard",
    // "Libanais"); prefixed with the language when it doesn't repeat it.
    const named = rest.filter((p) => !isNumbered(p) && !/^(anki|themes?)$/i.test(p));
    const base = cleanFolder(rest[0]);
    const deepest = named.length ? cleanFolder(named[named.length - 1]) : base;
    lang = fold(deepest).includes(fold(base)) ? deepest : `${base} ${deepest}`;
    const last = rest[rest.length - 1];
    topic = isNumbered(last) ? cleanFolder(last) : "";
  } else if (rest.length) {
    topic = cleanFolder(rest[rest.length - 1]);
  }
  // " — Suffix" dropped when every word of it is already in the folder path.
  let short = title;
  const m = /^(.*\S)\s+[—–]\s+(\S.*)$/.exec(title);
  if (m) {
    const have = new Set(words(parts.join(" ")));
    const suffix = words(m[2]);
    if (suffix.length && suffix.every((w) => have.has(w))) short = m[1];
  }
  return { title: short, discipline, lang, topic };
}

/**
 * The language results should be grouped by, when a query matches the same
 * kind of note in many languages ("salut": one "Salutations" per language):
 * true when at least four languages appear and language notes are most of
 * the matches.
 */
export function isMultiLanguage(langs: (string | null)[]): boolean {
  const set = new Set(langs.filter(Boolean));
  const inLang = langs.filter(Boolean).length;
  return set.size >= 4 && inLang >= langs.length * 0.6;
}

/** The language the reader reads most: the one with the most visited notes,
 *  most recent visit breaking ties; null when none. */
export function topLanguage(visits: { lang: string | null; t: number }[]): string | null {
  const by = new Map<string, { n: number; t: number }>();
  for (const v of visits) {
    if (!v.lang) continue;
    const e = by.get(v.lang) ?? { n: 0, t: 0 };
    e.n++;
    e.t = Math.max(e.t, v.t);
    by.set(v.lang, e);
  }
  let best: string | null = null;
  let bn = 0;
  let bt = 0;
  for (const [lang, e] of by) {
    if (e.n > bn || (e.n === bn && e.t > bt)) {
      best = lang;
      bn = e.n;
      bt = e.t;
    }
  }
  return best;
}

// --- recent searches ------------------------------------------------------------

export const RECENT_KEY = "gkRecentSearches";
export const RECENT_MAX = 6;

/** Recent searches with `q` put first: trimmed, at most 80 characters, the
 *  same search (accents and case aside) never twice. */
export function pushRecent(list: string[], q: string, max = RECENT_MAX): string[] {
  const s = q.replace(/\s+/g, " ").trim().slice(0, 80);
  if (s.length < 2) return list.slice(0, max);
  const k = fold(s);
  return [s, ...list.filter((x) => fold(x) !== k)].slice(0, max);
}

/** The stored list, whatever the storage holds: only strings, at most `max`. */
export function parseRecent(raw: string | null | undefined, max = RECENT_MAX): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, max) : [];
  } catch {
    return [];
  }
}

// --- spelling suggestion ----------------------------------------------------------

/**
 * Optimal string alignment distance (Levenshtein plus swapped neighbours),
 * giving up past `max`: returns max + 1 as soon as the distance must exceed it.
 */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

/** Folded words of four letters or more, with how often they occur, from the
 *  names the palette already has (note titles, tags, paths). */
export function buildVocabulary(texts: string[]): Map<string, number> {
  const vocab = new Map<string, number>();
  for (const t of texts) {
    for (const w of fold(t).split(/[^\p{L}\p{N}]+/u)) {
      if (w.length >= 4) vocab.set(w, (vocab.get(w) ?? 0) + 1);
    }
  }
  return vocab;
}

/**
 * The closest known spelling of a one- or two-word query that found nothing
 * ("philosofie" → "philosophie"), or null. One edit allowed up to six
 * letters, two beyond; ties go to the more frequent word. Every word must be
 * corrected or already known, and at least one must change.
 */
export function suggestSpelling(query: string, vocab: Map<string, number>): string | null {
  const toks = fold(query).trim().split(/\s+/).filter(Boolean);
  if (!toks.length || toks.length > 3) return null;
  let changed = false;
  const out: string[] = [];
  for (const tok of toks) {
    if (vocab.has(tok) || tok.length < 4) {
      out.push(tok);
      continue;
    }
    const max = tok.length <= 6 ? 1 : 2;
    let best: string | null = null;
    let bd = max + 1;
    let bc = 0;
    for (const [w, c] of vocab) {
      if (Math.abs(w.length - tok.length) > max) continue;
      const d = editDistance(tok, w, max);
      if (d < bd || (d === bd && d <= max && c > bc)) {
        best = w;
        bd = d;
        bc = c;
      }
    }
    if (!best || bd > max) return null;
    out.push(best);
    changed = true;
  }
  return changed ? out.join(" ") : null;
}
