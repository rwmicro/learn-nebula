// "Fiche de révision" of a reading path (/parcours/<slug>/fiche/): for each
// note, in reading order, its definitions, its key ideas and its questions —
// the answers gathered at the end. Built at build time from the Markdown
// (definitions, key ideas) and the rendered quiz cards (lib/path-extras.ts).
// The Markdown side is pure and unit-tested in lib/path-sheet.test.ts.

import { definitionTerm, definitionText, extractDefinitions, isDefinitionTitle } from "./glossary";

export interface KeyPoint {
  title: string;
  text: string;
}

/** Longest key idea kept on the sheet, in characters. */
export const KEY_MAX_CHARS = 420;
/** At most this many key ideas a note: the sheet stays a sheet. */
export const KEYS_PER_NOTE = 6;

/**
 * The note's `[!important]` callouts — the vault's "Idée clé" boxes — as
 * plain text. A definition written as an important callout ("Définition —
 * Terme") is a definition, not a key idea, and is left to
 * extractDefinitions.
 */
export function keyPoints(body: string, max = KEYS_PER_NOTE): KeyPoint[] {
  const out: KeyPoint[] = [];
  const lines = body.split("\n");
  for (let i = 0; i < lines.length && out.length < max; i++) {
    const m = lines[i].match(/^>\s?\[!important\][+-]?[ \t]*(.*)$/i);
    if (!m) continue;
    const title = m[1].replace(/[*_`]/g, "").trim();
    if (isDefinitionTitle("important", title) || definitionTerm("important", title)) continue;
    const bodyLines: string[] = [];
    for (let j = i + 1; j < lines.length && /^>/.test(lines[j]); j++) bodyLines.push(lines[j].replace(/^>\s?/, ""));
    const text = definitionText(bodyLines.join("\n"), KEY_MAX_CHARS);
    if ((text.match(/\p{L}{2,}/gu) ?? []).length >= 4) out.push({ title, text });
  }
  return out;
}

export { extractDefinitions };
