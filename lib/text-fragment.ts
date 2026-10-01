/**
 * Selection helpers for public/js/selection-menu.js — pure, DOM-free.
 *
 * A "link to this passage" is a URL text fragment (`#:~:text=…`), which
 * Chromium and Safari scroll to and highlight. Short single-block selections
 * use the exact form (`text=passage`); long or multi-block ones the range form
 * (`text=start,end`), since an exact match can't span blocks and a long one
 * makes an unwieldy URL.
 */

/** Minimum words / maximum characters for the selection toolbar to show. */
export const MIN_WORDS = 3;
export const MAX_CHARS = 1000;
/** Above this length (or across blocks) the fragment uses start,end. */
export const EXACT_MAX = 80;
/** Words kept on each side of a start,end fragment. */
export const EDGE_WORDS = 4;

export function normalizeSpace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function wordCount(s: string): number {
  return (normalizeSpace(s).match(/\S+/g) ?? []).length;
}

/** Whether a selected string deserves the toolbar. */
export function selectionEligible(text: string): boolean {
  const n = normalizeSpace(text);
  return n.length > 0 && n.length <= MAX_CHARS && wordCount(n) >= MIN_WORDS;
}

/** Percent-encode one text-fragment term: encodeURIComponent plus `-`, which
 *  the syntax reserves for prefix-/-suffix (`,` and `&` already are). */
export function encodeFragmentTerm(s: string): string {
  return encodeURIComponent(s).replace(/-/g, "%2D");
}

/** The `text=` directive value for a selection (already encoded). */
export function textFragment(selected: string): string {
  const multiBlock = /\n/.test(selected.trim());
  const text = normalizeSpace(selected);
  const words = text.split(" ");
  if (!multiBlock && (text.length <= EXACT_MAX || words.length <= EDGE_WORDS * 2))
    return encodeFragmentTerm(text);
  const start = words.slice(0, EDGE_WORDS).join(" ");
  const end = words.slice(-EDGE_WORDS).join(" ");
  return `${encodeFragmentTerm(start)},${encodeFragmentTerm(end)}`;
}

/** Full shareable URL: `href` without its hash, plus the text directive. */
export function textFragmentUrl(href: string, selected: string): string {
  const base = href.split("#")[0];
  return `${base}#:~:text=${textFragment(selected)}`;
}
