/**
 * Build-time glossary: explicit definitions in the vault, marked (first
 * occurrence only) in the other notes of the same discipline, where
 * public/js/glossary.js turns each mark into a hover/focus definition card.
 *
 * Only *explicit* definitions count — false positives are worse than missing
 * terms. A definition is a callout whose title names the term:
 *   > [!definition] Terme                (the dedicated callout type)
 *   > [!abstract] Définition — Terme     (what the vault actually writes: also
 *   > [!important] Définition -- Terme    `–`, `-` or `:` as the separator)
 * A bare "Définition" title (term only bolded in the body) is NOT used: those
 * bold words are as often adjectives ("**premier**", "**converge**") as
 * nouns, and matching them across notes would be mostly noise.
 *
 * Pure and fs-free (lib/content.ts feeds it the notes), so it is unit-tested
 * in lib/glossary.test.ts and safe to import from lib/markdown.ts.
 */
import type { Root, Element, ElementContent, Text } from "hast";

export interface GlossaryEntry {
  /** The term as written in the definition title ("Matrice de passage"). */
  term: string;
  /** Plain-text definition, already truncated for the card. */
  def: string;
  /** Defining note: URL with the definition's anchor, and its title. */
  href: string;
  noteTitle: string;
  /** Defining note's URL without the anchor (to skip marking it there). */
  noteUrl: string;
  /** Level-2 discipline folder ("Applied Sciences/Mathematics"). */
  discipline: string;
}

/** Longest definition text shown in a card. */
export const DEF_MAX_CHARS = 240;
/** At most this many marks per page, so a dense note doesn't turn dotted. */
export const MAX_MARKS_PER_PAGE = 15;

// Terms that name something precise in the defining note but are everyday
// (or multi-sense) vocabulary elsewhere in the same discipline: "somme" of two
// subspaces vs any sum, "graphe" (graph theory) vs the graph of a function,
// "base" of a vector space vs "base 10", "équation cartésienne" of a line
// (Géométrie plane) vs of a plane (Géométrie dans l'espace)…
const AMBIGUOUS = new Set([
  "argument",
  "base",
  "conjugué",
  "convergence",
  "graphe",
  "limite",
  "médiane",
  "module",
  "moyenne",
  "norme",
  "probabilité",
  "série",
  "somme",
  "supplémentaires",
  "symétrie",
  "vecteur",
  "équation cartésienne",
  "équation réduite",
]);

const DEF_TITLE =
  /^d[ée]finitions?\s*(?:—|–|--|-|:)\s*(.+)$/iu;

/**
 * The term a callout defines, or null when its title doesn't name one
 * explicitly (or names something we won't match safely).
 * `type` is the callout type as written (`definition`, `abstract`, …);
 * `title` the title text, plain.
 */
export function definitionTerm(type: string, title: string): string | null {
  const clean = title
    .normalize("NFC")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  let term: string | null = null;
  const m = clean.match(DEF_TITLE);
  if (m) term = m[1];
  else if (type.toLowerCase() === "definition" && !/^d[ée]finitions?$/iu.test(clean))
    term = clean;
  if (!term) return null;
  term = term
    .replace(/\s*\([^)]*\)\s*/g, " ") // "Isométrie vectorielle (automorphisme orthogonal)"
    .replace(/[\s.:;,!?]+$/u, "")
    .replace(/\s+/g, " ")
    .trim();
  return acceptableTerm(term) ? term : null;
}

/** Whether `term` is safe to match in running text. */
export function acceptableTerm(term: string): boolean {
  if (term.length < 4 || term.length > 60) return false;
  // Math, digits, links or markup can't be matched reliably in text nodes.
  if (/[$\\\d[\]{}<>|=]/.test(term)) return false;
  const words = term.split(" ");
  if (words.length > 5) return false;
  if (AMBIGUOUS.has(term.toLowerCase())) return false;
  return true;
}

/** Whether a callout title marks a definition at all (titled or bare
 *  "Définition"): the glossary never marks text inside one, since that is
 *  the note defining the word itself. */
export function isDefinitionTitle(type: string, title: string): boolean {
  return (
    type.toLowerCase() === "definition" ||
    /^d[ée]finitions?(?![\p{L}])/iu.test(title.normalize("NFC").trim())
  );
}

/** Anchor id of a definition callout, shared by the callout renderer and the
 *  glossary links so `href="…#def-matrice-de-passage"` lands on it. */
export function definitionAnchor(term: string): string {
  return (
    "def-" +
    term
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}

/** Level-2 discipline of a vault path ("Applied Sciences/Mathematics/Math
 *  Sup/Intégration" → "Applied Sciences/Mathematics"). */
export function glossaryDiscipline(rawPath: string): string {
  const parts = rawPath.split("/");
  return parts.slice(0, Math.min(2, Math.max(1, parts.length - 1))).join("/");
}

// --- LaTeX → readable plain text (for the definition card) ------------------

const TEX_SYMBOLS: Record<string, string> = {
  in: "∈", notin: "∉", subset: "⊂", subseteq: "⊆", supset: "⊃", to: "→",
  mapsto: "↦", leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠",
  infty: "∞", times: "×", cdot: "·", cdots: "⋯", ldots: "…", dots: "…",
  forall: "∀", exists: "∃", sum: "Σ", prod: "Π", int: "∫", cap: "∩",
  cup: "∪", oplus: "⊕", iff: "⇔", implies: "⇒", Rightarrow: "⇒",
  Leftrightarrow: "⇔", pm: "±", sqrt: "√", approx: "≈", equiv: "≡",
  mid: "|", wedge: "∧", vee: "∨", emptyset: "∅", varnothing: "∅",
  partial: "∂", nabla: "∇", circ: "∘", perp: "⊥", setminus: "∖",
  langle: "⟨", rangle: "⟩", "|": "‖", "{": "{", "}": "}",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε",
  varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", lambda: "λ", mu: "μ",
  nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", phi: "φ",
  varphi: "φ", chi: "χ", psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ",
  Theta: "Θ", Lambda: "Λ", Sigma: "Σ", Phi: "Φ", Omega: "Ω",
};
// Operator names that read fine as plain words (\det → det).
const TEX_WORDS = new Set([
  "det", "lim", "sup", "inf", "sin", "cos", "tan", "exp", "ln", "log", "max",
  "min", "arg", "dim", "ker", "deg", "gcd", "Im", "Re", "rg", "tr",
]);
const BLACKBOARD: Record<string, string> = {
  R: "ℝ", N: "ℕ", Z: "ℤ", Q: "ℚ", C: "ℂ", K: "𝕂",
};

/** A rough, readable rendering of a TeX snippet: enough for a hover card. */
export function texToText(tex: string): string {
  return (
    tex
      .replace(/\\mathbb\{(\w)\}/g, (_m, l: string) => BLACKBOARD[l] ?? l)
      .replace(/\\(?:left|right|big|Big|bigg|displaystyle|limits)\b/g, "")
      .replace(/\\(?:,|;|:|!|quad|qquad)/g, " ")
      .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2")
      // \text{…}, \mathcal{…}, \vec{…}… keep their argument (braces go below).
      .replace(/\\([A-Za-z]+|[|{}])/g, (_m, c: string) =>
        TEX_SYMBOLS[c] ?? (TEX_WORDS.has(c) ? `${c} ` : ""),
      )
      // ^{…}/_{…} keep their content; braces go.
      .replace(/[{}]/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Markdown definition body → one line of plain text, truncated. */
export function definitionText(md: string, max = DEF_MAX_CHARS): string {
  const text = md
    // A short display formula reads fine flattened; a matrix or a long one
    // doesn't — elide it.
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, t: string) =>
      /\\begin|\\\\|&/.test(t) || t.trim().length > 50 ? " … " : ` ${texToText(t)} `,
    )
    .replace(/\$([^$\n]+?)\$/g, (_m, t: string) =>
      /\\begin/.test(t) ? "…" : texToText(t),
    )
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, (_m, t: string) => t.split("/").pop() ?? t)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_`]+/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/(?:…\s*){2,}/g, "… ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:]+$/, "") + "…";
}

/** Every explicit definition in one note's Markdown body. */
export function extractDefinitions(
  body: string,
): { term: string; def: string }[] {
  const out: { term: string; def: string }[] = [];
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^>\s?\[!([\w-]+)\][+-]?[ \t]*(.*)$/);
    if (!m) continue;
    const term = definitionTerm(m[1], m[2]);
    if (!term) continue;
    const bodyLines: string[] = [];
    for (let j = i + 1; j < lines.length && /^>/.test(lines[j]); j++)
      bodyLines.push(lines[j].replace(/^>\s?/, ""));
    const def = definitionText(bodyLines.join("\n"));
    // A definition that is all formula has nothing to show in a card.
    if ((def.match(/\p{L}{2,}/gu) ?? []).length >= 5) out.push({ term, def });
  }
  return out;
}

// --- Matching ---------------------------------------------------------------

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Regex source for a term: first letter case-insensitive (sentence case),
 *  the rest as written; each word may take a plural s; ' matches ’. */
export function termPattern(term: string): string {
  const words = term.split(" ").map((w, i) => {
    let src = [...w]
      .map((ch, j) => {
        if (ch === "'" || ch === "’") return "['’]";
        if (i === 0 && j === 0 && ch.toLowerCase() !== ch.toUpperCase())
          return `[${escapeRe(ch.toLowerCase())}${escapeRe(ch.toUpperCase())}]`;
        return escapeRe(ch);
      })
      .join("");
    if (w.length >= 3 && !/[sxz'’]$/i.test(w)) src += "s?";
    return src;
  });
  return `(?<![\\p{L}\\p{N}_-])${words.join("\\s+")}(?![\\p{L}\\p{N}_-])`;
}

export interface Matcher {
  entries: GlossaryEntry[];
  res: RegExp[];
}

export function buildMatcher(entries: GlossaryEntry[]): Matcher {
  return {
    entries,
    res: entries.map((e) => new RegExp(termPattern(e.term), "u")),
  };
}

/**
 * Earliest match among the terms not yet `used` in `text` (ties go to the
 * longest term, so "produit scalaire" beats a hypothetical "produit").
 */
export function firstMatch(
  text: string,
  m: Matcher,
  used: Set<number>,
): { index: number; length: number; entry: number } | null {
  let best: { index: number; length: number; entry: number } | null = null;
  m.res.forEach((re, i) => {
    if (used.has(i)) return;
    const r = re.exec(text);
    if (!r) return;
    if (
      !best ||
      r.index < best.index ||
      (r.index === best.index && r[0].length > best.length)
    )
      best = { index: r.index, length: r[0].length, entry: i };
  });
  return best;
}

// Never mark inside these: headings, links, code, math, the callout title
// line, interactive chrome, media, and quiz cards (their answer is hidden).
const SKIP_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6", "a", "code", "pre", "kbd", "samp",
  "script", "style", "svg", "math", "button", "summary", "figcaption",
  "audio", "video", "iframe", "textarea", "select", "label", "dfn",
]);
const SKIP_CLASSES = ["katex", "katex-display", "callout-title", "callout-quiz", "gloss", "mermaid"];

function skipped(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName)) return true;
  const cls = el.properties?.className;
  const list = Array.isArray(cls) ? cls.map(String) : typeof cls === "string" ? cls.split(" ") : [];
  if (list.some((c) => SKIP_CLASSES.includes(c))) return true;
  // Inside a definition the note is defining the word itself.
  return el.properties?.dataDefinition != null;
}

/**
 * rehype plugin: wrap the first occurrence of each glossary term in body text
 * as `<a class="gloss" href data-gloss-def data-gloss-note>`. Only the
 * definitions actually used land in the page (as attributes on their mark).
 */
export function rehypeGlossary(entries: GlossaryEntry[] | undefined) {
  return (tree: Root) => {
    if (!entries || !entries.length) return;
    const matcher = buildMatcher(entries);
    const used = new Set<number>();
    let marks = 0;

    const walk = (parent: Root | Element) => {
      for (let i = 0; i < parent.children.length; i++) {
        if (marks >= MAX_MARKS_PER_PAGE) return;
        const node = parent.children[i];
        if (node.type === "element") {
          if (!skipped(node)) walk(node);
          continue;
        }
        if (node.type !== "text" || !node.value.trim()) continue;
        const hit = firstMatch(node.value, matcher, used);
        if (!hit) continue;
        used.add(hit.entry);
        marks++;
        const e = matcher.entries[hit.entry];
        const before = node.value.slice(0, hit.index);
        const word = node.value.slice(hit.index, hit.index + hit.length);
        const after = node.value.slice(hit.index + hit.length);
        const mark: Element = {
          type: "element",
          tagName: "a",
          properties: {
            className: ["gloss"],
            href: e.href,
            dataGlossDef: e.def,
            dataGlossTerm: e.term,
            dataGlossNote: e.noteTitle,
          },
          children: [{ type: "text", value: word }],
        };
        const repl: ElementContent[] = [];
        if (before) repl.push({ type: "text", value: before } as Text);
        repl.push(mark);
        if (after) repl.push({ type: "text", value: after } as Text);
        parent.children.splice(i, 1, ...(repl as typeof parent.children));
        // Continue with the `after` text node (other terms may sit there).
        i += before ? 1 : 0;
      }
    };
    walk(tree);
  };
}

/** Number of leading path segments two note URLs share. */
function sharedDepth(a: string, b: string): number {
  const x = a.split("/");
  const y = b.split("/");
  let n = 0;
  while (n < x.length && n < y.length && x[n] === y[n]) n++;
  return n;
}

/**
 * The glossary entries to match in one note: same discipline, defined in
 * another note, and not a term this note defines itself. When several notes
 * define the same term, the one nearest in the folder tree wins (a Math Spé
 * note links the Math Sup definition of "produit scalaire", a lycée note the
 * lycée one), then the first in vault order.
 */
export function entriesForNote(
  all: GlossaryEntry[],
  noteUrl: string,
  discipline: string,
): GlossaryEntry[] {
  const own = new Set(
    all.filter((e) => e.noteUrl === noteUrl).map((e) => e.term.toLowerCase()),
  );
  const best = new Map<string, GlossaryEntry>();
  for (const e of all) {
    if (e.discipline !== discipline || e.noteUrl === noteUrl) continue;
    const k = e.term.toLowerCase();
    if (own.has(k)) continue;
    const cur = best.get(k);
    if (!cur || sharedDepth(e.noteUrl, noteUrl) > sharedDepth(cur.noteUrl, noteUrl))
      best.set(k, e);
  }
  return [...best.values()];
}
