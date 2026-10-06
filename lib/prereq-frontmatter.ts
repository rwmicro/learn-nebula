// Add wikilinks to a note's `prerequis:` frontmatter list as a text edit —
// what /api/admin/prereq-accept commits to the vault. Pure (no fs, no YAML
// round-trip): everything outside the edited field stays byte-for-byte as
// written, comments and key order included, which a parse + re-dump would
// not keep. Every spelling lib/prereq-graph.ts parsePrereqField() accepts is
// handled:
//
//   prerequis: ["[[A]]", "[[B]]"]     flow list → the link is appended inside
//   prerequis: []                     empty flow list
//   prerequis:                        block list → a `- ` item in the same
//     - "[[A]]"                         indentation and quoting style
//   prerequis: "[[A]]"                scalar → becomes a flow list, the
//   prerequis: [[A]]                    original token kept as its first item
//   (absent)                          → appended as the frontmatter's last line
//   (no frontmatter at all)           → a frontmatter block is created
//
// CRLF files stay CRLF; a UTF-8 BOM stays in front.

import { cleanPrereqTarget } from "./prereq-graph";

export interface PrereqEditResult {
  text: string;
  /** Links actually added, as written into the file (`[[Target]]`). */
  added: string[];
  /** Requested links that were already listed. */
  skipped: string[];
}

const FIELD_RE = /^(prerequis|prerequisites)[ \t]*:(.*)$/;

/** `X`, `[[X]]`, `"[[X|alias]]"` → `[[X]]` (alias and heading kept). */
export function toWikilink(link: string): string {
  let s = link.trim();
  if (/^(["']).*\1$/.test(s)) s = s.slice(1, -1).trim();
  if (/^\[\[[^\]]+\]\]$/.test(s)) return s;
  return `[[${s.replace(/\.md$/i, "")}]]`;
}

const keyOf = (target: string) => cleanPrereqTarget(target).toLowerCase();
const baseOf = (key: string) => key.split("/").pop() ?? key;

/** Same note? Exact target, or the same basename when one side is a bare
 *  name and the other a path (`[[Bash Basics]]` vs `[[Linux/Bash Basics]]`),
 *  which is how the vault resolves them too. */
function sameTarget(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.includes("/") && b.includes("/")) return false;
  return baseOf(a) === baseOf(b);
}

/** The entries an existing field's text names, as cleaned lowercase keys. */
function existingKeys(fieldText: string): string[] {
  const links = [...fieldText.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
  if (links.length) return links.map(keyOf).filter(Boolean);
  // Plain titles / paths: strip the list syntax and quotes.
  return fieldText
    .replace(/^[^:]*:/, "")
    .split(/[,\n]/)
    .map((s) =>
      s
        .replace(/^\s*-\s*/, "")
        .replace(/[[\]]/g, "")
        .trim()
        .replace(/^(["'])(.*)\1$/, "$2"),
    )
    .map(keyOf)
    .filter(Boolean);
}

/** Split a line from its trailing ` # comment` (outside quotes). */
function splitComment(s: string): [string, string] {
  let quote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === "\\" && quote === '"') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "#" && (i === 0 || /\s/.test(s[i - 1]))) {
      let j = i;
      while (j > 0 && /\s/.test(s[j - 1])) j--;
      return [s.slice(0, j), s.slice(j)];
    }
  }
  return [s, ""];
}

/** Net "[" minus "]" outside quoted strings. */
function flowDepth(s: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === "\\" && quote === '"') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "[") depth++;
    else if (ch === "]") depth--;
  }
  return depth;
}

const quoteDouble = (s: string) => JSON.stringify(s);
const quoteSingle = (s: string) => `'${s.replace(/'/g, "''")}'`;

export function addPrereqLinks(source: string, links: string[]): PrereqEditResult {
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const bom = source.startsWith("﻿") ? "﻿" : "";
  const body = bom ? source.slice(1) : source;
  const lines = body.split(eol);
  // A line's own content, minus a stray "\r" in an LF file with mixed endings.
  const bare = (l: string) => l.replace(/\r$/, "");

  let fmEnd = -1;
  if (lines.length > 1 && bare(lines[0]).trimEnd() === "---") {
    for (let i = 1; i < lines.length; i++) {
      const t = bare(lines[i]).trimEnd();
      if (t === "---" || t === "...") {
        fmEnd = i;
        break;
      }
    }
  }

  // Field location: [start, end) line range.
  let fStart = -1;
  let fEnd = -1;
  if (fmEnd > 0) {
    for (let i = 1; i < fmEnd; i++) {
      if (FIELD_RE.test(bare(lines[i]))) {
        fStart = i;
        fEnd = i + 1;
        // An open flow list runs until its brackets balance, whatever the
        // indentation of its closing line.
        let depth = flowDepth(splitComment(bare(lines[i]).replace(FIELD_RE, "$2"))[0]);
        while (depth > 0 && fEnd < fmEnd) {
          depth += flowDepth(splitComment(bare(lines[fEnd]))[0]);
          fEnd++;
        }
        if (depth > 0 || fEnd > i + 1) break;
        // Continuation lines: block items / indented continuation / blanks.
        while (fEnd < fmEnd && /^(\s+\S|\s*-\s|\s*-$|\s*$)/.test(bare(lines[fEnd]))) fEnd++;
        while (fEnd > fStart + 1 && bare(lines[fEnd - 1]).trim() === "") fEnd--;
        break;
      }
    }
  }

  const fieldText = fStart >= 0 ? lines.slice(fStart, fEnd).map(bare).join("\n") : "";
  const seen = existingKeys(fieldText);
  const added: string[] = [];
  const skipped: string[] = [];
  for (const raw of links) {
    if (!raw || !raw.trim()) continue;
    const w = toWikilink(raw);
    const k = keyOf(w);
    if (!k || seen.some((s) => sameTarget(s, k))) {
      skipped.push(w);
      continue;
    }
    seen.push(k);
    added.push(w);
  }
  if (!added.length) return { text: source, added, skipped };

  const flow = (items: string[]) => `[${items.join(", ")}]`;
  const newQuoted = added.map(quoteDouble);
  const crOf = (l: string) => (l.endsWith("\r") ? "\r" : "");

  if (fmEnd < 0) {
    const fm = ["---", `prerequis: ${flow(newQuoted)}`, "---"].join(eol);
    return { text: bom + fm + eol + body, added, skipped };
  }

  if (fStart < 0) {
    // Absent: last line of the frontmatter.
    const out = [...lines];
    out.splice(fmEnd, 0, `prerequis: ${flow(newQuoted)}${crOf(lines[fmEnd])}`);
    return { text: bom + out.join(eol), added, skipped };
  }

  const first = bare(lines[fStart]);
  const m = first.match(FIELD_RE)!;
  const keyPart = first.slice(0, first.length - m[2].length); // "prerequis:" (+ spaces before colon)
  const [value, comment] = splitComment(m[2]);
  const v = value.trim();
  const lead = value.match(/^\s*/)![0] || " ";
  const out = [...lines];
  const cr = crOf(lines[fStart]);

  // Bare wikilinks `[[A]]` / `[[A]], [[B]]` (YAML reads nested lists) or a
  // flow list `[...]` — possibly spread over several lines.
  const bareLinks = /^\[\[[^\]]+\]\](\s*,\s*\[\[[^\]]+\]\])*$/.test(v);
  if (v.startsWith("[") && !bareLinks) {
    // Close of the flow list: the last "]" in the field (outside a comment).
    for (let i = fEnd - 1; i >= fStart; i--) {
      const lineBare = i === fStart ? keyPart + value : splitComment(bare(lines[i]))[0];
      const at = lineBare.lastIndexOf("]");
      if (at < 0) continue;
      const before = lineBare.slice(0, at);
      const inner = i === fStart ? before.slice(before.indexOf("[") + 1) : before;
      const empty = i === fStart && inner.trim() === "";
      const trailingComma = before.trimEnd().endsWith(",");
      const head = empty || trailingComma ? before.trimEnd() : before;
      const sep = empty ? "" : trailingComma ? " " : ", ";
      const tail = i === fStart ? comment : splitComment(bare(lines[i]))[1];
      out[i] = head + sep + newQuoted.join(", ") + lineBare.slice(at) + tail + crOf(lines[i]);
      return { text: bom + out.join(eol), added, skipped };
    }
  }

  if (v === "" && fEnd > fStart + 1) {
    // Block list: copy the last item's indentation and quoting.
    let last = fEnd - 1;
    while (last > fStart && !/^\s*-(\s|$)/.test(bare(lines[last]))) last--;
    if (last > fStart) {
      const item = bare(lines[last]);
      const indent = item.match(/^(\s*)-/)![1];
      const itemVal = splitComment(item.replace(/^\s*-\s*/, ""))[0].trim();
      const q = itemVal.startsWith('"') ? quoteDouble : itemVal.startsWith("'") ? quoteSingle : null;
      const ins = added.map((w) => `${indent}- ${q ? q(w) : w}${crOf(lines[last])}`);
      out.splice(last + 1, 0, ...ins);
      return { text: bom + out.join(eol), added, skipped };
    }
  }

  // Empty value, a scalar, or bare wikilinks: rewrite this one line as a flow
  // list, the previous value (if any) kept as written as its first entry.
  let existing: string[] = [];
  if (bareLinks) existing = [...v.matchAll(/\[\[[^\]]+\]\]/g)].map((x) => quoteDouble(x[0]));
  else if (v && v !== "~" && v !== "null") existing = [/^["']/.test(v) ? v : quoteDouble(v)];
  out[fStart] = `${keyPart}${lead}${flow([...existing, ...newQuoted])}${comment}${cr}`;
  return { text: bom + out.join(eol), added, skipped };
}
