// "Faits à vérifier" — the pure part: parsing the vault's checklist file
// (sources/a-verifier.md), one line per doubtful claim:
//
//   - [ ] [[Note title or vault path]] — claim — what sources say (URL)
//   - [x] …                                    (done: the note was fixed)
//
// `## ` headings may group lines by discipline; they are recorded but carry
// no meaning. Anything that isn't a checklist line (frontmatter, prose, code
// fences) is ignored. scripts/facts-to-check.ts resolves the links and
// writes data/facts-to-check.json for /admin.

export interface FactLine {
  /** 1-based line number in the source file. */
  line: number;
  done: boolean;
  /** Wikilink target (alias and heading dropped), or null when the line names no note. */
  target: string | null;
  claim: string;
  /** What the sources say, as written (URLs included). */
  sources: string;
  urls: string[];
  /** The `## ` heading above the line, "" when none. */
  section: string;
}

const ITEM_RE = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/;
const LINK_RE = /^\[\[([^\]]+)\]\]\s*/;
// Em dash is the documented separator; an en dash or " -- " written by hand
// is accepted too. Spaces around it are required, so "Jean-Paul" or
// "1914–1918" inside a claim never split it.
const SEP_RE = /\s+(?:—|–|--)\s+/;
const URL_RE = /https?:\/\/[^\s<>()"']+(?:\([^\s<>()"']*\)[^\s<>()"']*)*/g;

/** `Note|alias` / `Note#Heading` / `Note.md` → `Note`. */
export function factTarget(raw: string): string {
  return raw.split("|")[0].split("#")[0].replace(/\.md$/i, "").trim();
}

export function parseFactsChecklist(md: string): FactLine[] {
  const out: FactLine[] = [];
  const lines = md.replace(/^﻿/, "").split(/\r?\n/);
  let section = "";
  let fence: string | null = null;
  let i = 0;
  // Frontmatter: skip it whole, so a `- [ ]` in a YAML value can't count.
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((l, k) => k > 0 && (l.trim() === "---" || l.trim() === "..."));
    if (end > 0) i = end + 1;
  }
  for (; i < lines.length; i++) {
    const raw = lines[i];
    const f = raw.match(/^\s*(```+|~~~+)/);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const h = raw.match(/^##\s+(.+?)\s*#*\s*$/);
    if (h) {
      section = h[1];
      continue;
    }
    const m = raw.match(ITEM_RE);
    if (!m) continue;
    let rest = m[2].trim();
    let target: string | null = null;
    const link = rest.match(LINK_RE);
    if (link) {
      target = factTarget(link[1]) || null;
      rest = rest.slice(link[0].length).replace(/^(?:—|–|--|:)\s*/, "");
    }
    const parts = rest.split(SEP_RE);
    const claim = (parts.shift() ?? "").trim();
    const sources = parts.join(" — ").trim();
    if (!claim && !target) continue;
    out.push({
      line: i + 1,
      done: m[1] !== " ",
      target,
      claim,
      sources,
      urls: [...sources.matchAll(URL_RE)].map((u) => u[0].replace(/[.,;:]+$/, "")),
      section,
    });
  }
  return out;
}

export interface FactGroup<T> {
  target: string | null;
  items: T[];
}

/** Open lines grouped by note, in order of first appearance. */
export function groupOpenFacts<T extends FactLine>(lines: T[]): FactGroup<T>[] {
  const groups = new Map<string, FactGroup<T>>();
  for (const l of lines) {
    if (l.done) continue;
    const key = l.target ? l.target.toLowerCase() : "";
    let g = groups.get(key);
    if (!g) {
      g = { target: l.target, items: [] };
      groups.set(key, g);
    }
    g.items.push(l);
  }
  return [...groups.values()];
}
