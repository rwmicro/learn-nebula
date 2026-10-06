// Draft `prerequis:` edges for /admin ("Prérequis suggérés") — the pure part.
// scripts/prereq-suggestions.ts reads the vault, resolves link targets with the
// site's own lib/content.ts, and feeds this file plain slugs; everything here
// is unit-testable without the vault (lib/prereq-suggest.test.ts).
//
// A suggestion "A before B" needs B to link to A, plus at least one signal
// that the link points *back* to something B builds on rather than sideways:
//
//   - B cites A in its introduction (before its first section heading);
//   - B points to A with a "déjà vu / rappel / voir d'abord" cue (strong) or a
//     plain "voir A" / "cf. A" (weak on its own: it's as often a sideways
//     reference — it only counts next to another signal);
//   - A and B sit side by side in numbered folders/files and A's number is
//     lower ("01 - …" before "05 - …").
//
// Hubs (index notes, folder notes) are never suggested as prerequisites, and
// an edge B already has, one already implied through other prerequisites, or
// one that would close a cycle with the existing ones (or with a stronger
// suggestion) is left out.

import type { PrereqEdge } from "./prereq-graph";
import { stripCode } from "./vault-health";

/** One link from a note body, with what surrounds it. */
export interface LinkMention {
  kind: "wikilink" | "markdown";
  /** As written: wikilink target without alias/heading, or the decoded
   *  markdown href without its #anchor. */
  target: string;
  /** Inside the note's introduction (before the first section heading). */
  intro: boolean;
  /** "prior": déjà vu / rappel / prérequis / s'appuie sur…; "see": plain
   *  voir / cf.; "next": A comes after (avant le…, pour aller plus loin, sert
   *  de socle à…); "away": A sits beside (présenté dans, contemporain de,
   *  voir aussi…); null: no cue. */
  cue: "prior" | "see" | "next" | "away" | null;
}

/** Introductions are short; past this the "intro" is really the body of a
 *  note that has no section headings. */
export const INTRO_MAX_CHARS = 1200;

/** Signal weights, combined as independent evidence: 1 − Π(1 − w). */
export const WEIGHTS = {
  intro: 0.45,
  prior: 0.6,
  see: 0.25,
  folder: 0.4,
  basics: 0.15,
} as const;

/** Below this combined confidence a candidate is not shown. A lone "voir"
 *  (0.25) or a lone "A is a basics note" never qualifies. */
export const MIN_CONFIDENCE = 0.4;

// Cues read in the text just before a link (same line, other links on the way
// replaced by "X" so "Prérequis : [[A]], [[B]]" cues both). The closest cue
// to the link wins; with none on the line, the title of the callout the link
// sits in, then the heading of its section, decide ("> [!quote] Prérequis",
// "## Voir aussi").
const W = String.raw`[^\n.;!?]{0,60}`;
const PRIOR_WORDS =
  String.raw`d[ée]j[àa]\s+(?:vu|abord|pr[ée]sent|trait|expliqu|introdui|rencontr|d[ée]fini|[ée]tudi)\S*` +
  String.raw`|(?:comme\s+)?(?:on\s+l['’]a\s+)?\bvu[es]{0,2}\s+(?:dans|en|au|à)` +
  String.raw`|rappels?|pr[ée][- ]?requis|pr[ée]alables?|(?:lire|voir|revoir|consulter)\s+d['’]abord|d['’]abord\s+(?:lire|voir)` +
  String.raw`|\brevoir|suppos\S*\s+(?:connu|acquis)\S*|acquis\S*\s+(?:dans|en)|[ée]tabli[es]{0,2}\s+(?:dans|en)` +
  String.raw`|s['’]appuie\s+sur|repose\s+sur|fait\s+suite\s+[àa]|(?:dans\s+la|en)\s+(?:continuit[ée]|prolongement)\s+d|\bprolonge\b|\bprolongeant` +
  String.raw`|(?:^|\s)[ée]tend(?:\s|ant)|g[ée]n[ée]ralise|avant\s+de\s+commencer|bases?\s+n[ée]cessaires?`;
/** A comes after B: "avant le [[CNN]]…", "pour aller plus loin", "sert de
 *  socle à", "indispensable pour"… */
const NEXT_WORDS =
  String.raw`\bavant\s+(?:le|la|les|l['’]|d['’]|de)\b(?!\s+commencer)|pour\s+aller\s+plus\s+loin|\bensuite|plus\s+loin|plus\s+tard|\bsuite\s*:` +
  String.raw`|conduira|m[èe]nera|d[ée]bouche|aboutit|pr[ée]pare|annonce|prolongeront|prolongera|successeur\S*` +
  String.raw`|sert\s+de\s+(?:socle|base|fondement)|\bsocle\s+(?:de|à)|servent\s+[àa]|\bsert\s+[àa]` +
  String.raw`|(?:fondamenta\S*|indispensables?|utiles?|n[ée]cessaires?|essentiel\S*)\s+pour`;
const AWAY_WORDS =
  String.raw`(?:approfondi|d[ée]velopp[ée]|d[ée]taill[ée]|trait[ée]|pr[ée]sent[ée]|abord[ée]|expos[ée]|repris|retravaill[ée])[es]{0,2}\s+(?:en\s+d[ée]tail\s+)?(?:dans|en|au|par)` +
  String.raw`|alimente\S*|prolongement|h[ée]riti\S*|influencer\S*|pour\s+expliquer` +
  String.raw`|\bpour\s+(?:la|le|les|l['’]|celle|celui|ceux|plus)\b|contemporain\S*|[àa]\s+l['’]instar|tout\s+comme|\bcomme\b|contrairement|[àa]\s+la\s+diff[ée]rence|rival\S*` +
  String.raw`|confondre|distingue\S*|oppos[ée]\S*\s+[àa]` +
  String.raw`|fiche\s+de\s+r[ée]f[ée]rence|notes?\s+(?:de\s+r[ée]f[ée]rence|canonique)|version\s+(?:compl[èe]te|d[ée]taill[ée]e)|se\s+trouve\s+dans` +
  String.raw`|(?:voir|cf\.?)\s+(?:aussi|[ée]galement|encore)|\bsee\s+also`;
/** B builds on A: "déjà vu dans", "rappel", "prérequis", "s'appuie sur"… */
const PRIOR_CUE = new RegExp(String.raw`^[\s\S]*(${PRIOR_WORDS})${W}$`, "i");
/** A comes after, or beside: "avant le [[CNN]]…", "pour aller plus loin",
 *  "présenté dans", "contemporain de", "voir aussi"… — no signal from it. */
const AWAY_CUE = new RegExp(String.raw`^[\s\S]*(${AWAY_WORDS})${W}$`, "i");
const NEXT_CUE = new RegExp(String.raw`^[\s\S]*(${NEXT_WORDS})${W}$`, "i");
const SEE_CUE =
  /^[\s\S]*(\bvoir|\bcf\.?|\bconfer|\bsee)[*_]*\s*(?:la\s+note|la\s+fiche|l['’]article|le\s+chapitre|la\s+section)?\s*:?\s*\(?\s*(?:X\s*[,|/]\s*|X\s+(?:et|ou)\s+)*$/i;

/** Section headings / callout titles that set the cue for the links under them. */
const PRIOR_SECTION =
  /pr[ée][- ]?requis|rappels?|pr[ée]alables?|avant\s+de\s+commencer|bases?\s+n[ée]cessaires?|à\s+lire\s+avant|prerequisites?/i;
const NEXT_SECTION =
  /pour\s+aller\s+plus\s+loin|(?:à\s+)?lire\s+ensuite|\bsuite\b|prolongements?|et\s+apr[èe]s|next\s+steps?|further\s+reading/i;
const AWAY_SECTION =
  /voir\s+aussi|\bliens?\b|ressources|notes?\s+li[ée]es|connexions|r[ée]f[ée]rences|related|see\s+also|bibliographie|sources/i;

/** Where the introduction ends: the first section heading after the title
 *  (a leading `# Title` line is skipped), capped at INTRO_MAX_CHARS. */
export function introEnd(text: string): number {
  let start = 0;
  const lead = text.match(/^\s*#\s[^\n]*\n/);
  if (lead) start = lead[0].length;
  const rest = text.slice(start);
  const h = rest.match(/^#{1,6}\s/m);
  const end = h && h.index !== undefined ? start + h.index : text.length;
  return Math.min(end, start + INTRO_MAX_CHARS);
}

function inlineCue(text: string, at: number): LinkMention["cue"] {
  const lineStart = text.lastIndexOf("\n", at - 1) + 1;
  const before = text
    .slice(Math.max(lineStart, at - 160), at)
    .replace(/!?\[\[[^[\]\n]*\]\]/g, "X")
    .replace(/\[[^\]\n]*\]\([^)\n]*\)/g, "X");
  const hits: [NonNullable<LinkMention["cue"]>, number][] = [];
  for (const [cue, re] of [
    ["prior", PRIOR_CUE],
    ["next", NEXT_CUE],
    ["away", AWAY_CUE],
    ["see", SEE_CUE],
  ] as const) {
    // Each pattern is "^.*(cue)…$": the greedy prefix puts the group on the
    // rightmost occurrence, so lastIndexOf finds where it starts.
    const m = before.match(re);
    if (m) hits.push([cue, before.lastIndexOf(m[1])]);
  }
  if (!hits.length) return null;
  // Closest first; on a tie, the order above (prior, away, see).
  hits.sort((a, b) => b[1] - a[1]);
  return hits[0][0];
}

function sectionCue(title: string): LinkMention["cue"] {
  if (PRIOR_SECTION.test(title)) return "prior";
  if (NEXT_SECTION.test(title)) return "next";
  if (AWAY_SECTION.test(title)) return "away";
  return null;
}

/** For each line: the title of the callout it is in ("" outside one) and the
 *  heading of its section ("" before the first). */
function lineContext(
  text: string,
): { start: number; callout: string; heading: string }[] {
  const out: { start: number; callout: string; heading: string }[] = [];
  let heading = "";
  let callout = "";
  let pos = 0;
  for (const line of text.split("\n")) {
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) heading = h[1];
    const c = line.match(/^>\s*\[![\w-]+\][-+]?\s*(.*)$/);
    if (c) callout = c[1] || " ";
    else if (!line.startsWith(">")) callout = "";
    out.push({ start: pos, callout, heading });
    pos += line.length + 1;
  }
  return out;
}

function cueAt(
  text: string,
  at: number,
  ctx: ReturnType<typeof lineContext>,
): LinkMention["cue"] {
  const inline = inlineCue(text, at);
  if (inline) return inline;
  // Binary search for the line holding `at`.
  let lo = 0;
  let hi = ctx.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx[mid].start <= at) lo = mid;
    else hi = mid - 1;
  }
  const line = ctx[lo];
  return (
    (line.callout && sectionCue(line.callout)) ||
    (line.heading && sectionCue(line.heading)) ||
    null
  );
}

const ASSET_EXT_RE = /\.(?!md$)[a-z0-9]{2,5}$/i;

/** Every note link in `body` (code removed; embeds `![[…]]` skipped, they
 *  show content, they don't refer the reader), with intro/cue context. */
export function scanLinks(body: string): LinkMention[] {
  const text = stripCode(body);
  const intro = introEnd(text);
  const ctx = lineContext(text);
  const out: LinkMention[] = [];
  for (const m of text.matchAll(/(!?)\[\[([^[\]\n]+?)\]\]/g)) {
    if (m[1] === "!") continue;
    const target = m[2].split("|")[0].replace(/\\$/, "").split("#")[0].trim();
    if (!target || ASSET_EXT_RE.test(target)) continue;
    const at = m.index ?? 0;
    out.push({
      kind: "wikilink",
      target,
      intro: at < intro,
      cue: cueAt(text, at, ctx),
    });
  }
  for (const m of text.matchAll(
    /(!?)\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^)\s]+)(?:\s+"[^"]*")?\s*\)/g,
  )) {
    if (m[1] === "!") continue;
    const href = m[2].replace(/^<|>$/g, "");
    if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(href)) continue;
    const pathPart = href.split("#")[0];
    if (!/\.md$/i.test(pathPart)) continue;
    let target = pathPart;
    try {
      target = decodeURIComponent(pathPart);
    } catch {
      /* keep as written */
    }
    const at = m.index ?? 0;
    out.push({
      kind: "markdown",
      target,
      intro: at < intro,
      cue: cueAt(text, at, ctx),
    });
  }
  return out;
}

const NUM_RE = /^(\d{1,3})(?=[\s._-]|$)/;

/** "dossier 01 avant 05" when A and B differ first at sibling path segments
 *  that both start with a number and A's is lower; null otherwise. */
export function folderOrder(
  rawA: string,
  rawB: string,
): { a: string; b: string } | null {
  const pa = rawA.split("/");
  const pb = rawB.split("/");
  let i = 0;
  while (i < pa.length - 1 && i < pb.length - 1 && pa[i] === pb[i]) i++;
  // Same note, or one inside the other's folder: no sibling order.
  if (pa[i] === pb[i]) return null;
  const ma = pa[i].match(NUM_RE);
  const mb = pb[i].match(NUM_RE);
  if (!ma || !mb) return null;
  if (Number(ma[1]) >= Number(mb[1])) return null;
  return { a: ma[1], b: mb[1] };
}

/** Index pages, maps of content and folder notes (`Chess/Chess.md`): they
 *  link everything and are cited everywhere, never a real prerequisite. */
export function isHub(rawPath: string, title: string): boolean {
  const parts = rawPath.split("/");
  const base = parts[parts.length - 1];
  const folder = parts[parts.length - 2];
  if (/^0{1,3}(?=[\s._-])/.test(base)) return true;
  if (
    /\b(index|sommaire|moc|map of|table des mati[eè]res)\b/i.test(
      `${base} ${title}`,
    )
  )
    return true;
  if (folder && fold(base) === fold(folder)) return true;
  return parts.length === 1; // vault root (Garden of Knowledge)
}

/** Folders whose children are parallel collections (one per language): a
 *  link from one to another is a comparison, never a prerequisite. */
export const PARALLEL_ROOTS = ["Social Sciences/Languages - Dialects"];

/** False when A and B sit in different children of a PARALLEL_ROOTS folder. */
export function sameCollection(rawA: string, rawB: string): boolean {
  for (const root of PARALLEL_ROOTS) {
    const pre = `${root}/`;
    if (rawA.startsWith(pre) && rawB.startsWith(pre)) {
      return (
        rawA.slice(pre.length).split("/")[0] ===
        rawB.slice(pre.length).split("/")[0]
      );
    }
  }
  return true;
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .trim();

/** First year in a title's parentheses: "Max Weber (1864-1920)" → 1864,
 *  "Baroque (1600-1750)" → 1600; null when there is none. */
export function titleYear(title: string): number | null {
  const m =
    title.match(/\((?:[^()]*?\b)?(\d{3,4})\s*[-–]/) ??
    title.match(/\((\d{3,4})\)/);
  return m ? Number(m[1]) : null;
}

/** A note whose title says it lays the ground. */
export function isBasics(title: string): boolean {
  return /\b(fondamentaux|fondements|bases?|introduction|initiation|g[ée]n[ée]ralit[ée]s|basics|fundamentals|premiers pas|d[ée]buter|notions)\b/i.test(
    title,
  );
}

export interface SuggestNote {
  slug: string;
  title: string;
  rawPath: string;
  /** How to name this note in a `[[wikilink]]` that resolves to it. */
  linkName: string;
  /** The note's own `prerequis` targets, as written (kept in the YAML line). */
  prereqTargets: string[];
  /** Resolved outgoing note links: slug + context. Unresolved ones dropped. */
  links: { slug: string; intro: boolean; cue: LinkMention["cue"] }[];
}

export interface PathRef {
  slug: string;
  name: string;
  notes: string[];
}

export interface Suggestion {
  /** The note to edit (B). */
  note: string;
  /** The note to list in B's `prerequis` (A). */
  prereq: string;
  confidence: number;
  reasons: string[];
  /** Ready-to-paste frontmatter line: B's current prerequisites plus A. */
  yaml: string;
  /** The existing reading path this edge would extend, if any. */
  path: { slug: string; name: string } | null;
}

export interface SuggestStats {
  candidates: number;
  already: number;
  implied: number;
  cycle: number;
  reverse: number;
}

/** `prerequis: ["[[A]]", "[[B]]"]` — JSON strings are valid YAML flow scalars. */
export function prereqYaml(targets: string[]): string {
  const items = targets.map((t) =>
    JSON.stringify(/^\[\[.*\]\]$/.test(t) ? t : `[[${t}]]`),
  );
  return `prerequis: [${items.join(", ")}]`;
}

/** Can `to` be reached from `from` following `out`? */
function reaches(
  out: Map<string, Set<string>>,
  from: string,
  to: string,
): boolean {
  if (from === to) return true;
  const seen = new Set([from]);
  const stack = [from];
  while (stack.length) {
    const n = stack.pop()!;
    for (const m of out.get(n) ?? []) {
      if (m === to) return true;
      if (!seen.has(m)) {
        seen.add(m);
        stack.push(m);
      }
    }
  }
  return false;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Score every (A linked from B) pair, drop what can't or needn't be added,
 * and accept the rest strongest first so the accepted set stays acyclic
 * together with the existing `prerequis` edges.
 */
export function suggestPrereqs(
  notes: SuggestNote[],
  edges: PrereqEdge[],
  paths: PathRef[] = [],
  minConfidence = MIN_CONFIDENCE,
): { suggestions: Suggestion[]; stats: SuggestStats } {
  const bySlug = new Map(notes.map((n) => [n.slug, n]));
  const out = new Map<string, Set<string>>();
  const addEdge = (a: string, b: string) => {
    if (!out.has(a)) out.set(a, new Set());
    out.get(a)!.add(b);
  };
  for (const [a, b] of edges) if (a !== b) addEdge(a, b);
  const direct = new Set(edges.map(([a, b]) => `${a}\n${b}`));
  const pathOf = new Map<string, PathRef>();
  for (const p of paths)
    for (const s of p.notes) if (!pathOf.has(s)) pathOf.set(s, p);

  type Cand = { a: string; b: string; confidence: number; reasons: string[] };
  const cands = new Map<string, Cand>();
  for (const B of notes) {
    // Several mentions of the same note: their signals add up once each.
    // A hub's links go down to its children, not back to its prerequisites.
    if (isHub(B.rawPath, B.title)) continue;
    const sig = new Map<
      string,
      {
        intro: boolean;
        prior: boolean;
        see: boolean;
        plain: boolean;
        next: boolean;
      }
    >();
    for (const l of B.links) {
      if (l.slug === B.slug) continue;
      const s = sig.get(l.slug) ?? {
        intro: false,
        prior: false,
        see: false,
        plain: false,
        next: false,
      };
      // "Pour X, voir [[A]]" in an introduction is a pointer sideways, and
      // "avant le [[A]]" points forward: only an uncued or "déjà vu" mention
      // counts as citing A in the introduction.
      s.intro ||= l.intro && (l.cue === null || l.cue === "prior");
      s.prior ||= l.cue === "prior";
      s.see ||= l.cue === "see";
      s.plain ||= l.cue !== "away" && l.cue !== "next";
      s.next ||= l.cue === "next";
      sig.set(l.slug, s);
    }
    for (const [aSlug, s] of sig) {
      const A = bySlug.get(aSlug);
      if (!A || isHub(A.rawPath, A.title)) continue;
      // B says A comes after it somewhere, or every mention points sideways:
      // nothing to suggest.
      if (s.next || !s.plain) continue;
      if (!sameCollection(A.rawPath, B.rawPath)) continue;
      // Thinkers and periods dated in their title: a later one is never a
      // prerequisite of an earlier one (Tocqueville doesn't need Durkheim).
      const ya = titleYear(A.title);
      const yb = titleYear(B.title);
      if (ya !== null && yb !== null && ya > yb) continue;
      const reasons: string[] = [];
      const w: number[] = [];
      if (s.prior) {
        w.push(WEIGHTS.prior);
        reasons.push(
          `y renvoie comme à une notion déjà vue (« rappel », « vu dans »…)`,
        );
      }
      if (s.intro) {
        w.push(WEIGHTS.intro);
        reasons.push(`cite « ${A.title} » dans son introduction`);
      }
      const fo = folderOrder(A.rawPath, B.rawPath);
      if (fo) {
        w.push(WEIGHTS.folder);
        reasons.push(`dossier ${fo.a} avant ${fo.b}`);
      }
      if (s.see && !s.prior) {
        w.push(WEIGHTS.see);
        reasons.push(`y renvoie (« voir … », « cf. … »)`);
      }
      // "Basics" only reinforces a real signal, never starts one.
      if (w.length && isBasics(A.title) && !isBasics(B.title)) {
        w.push(WEIGHTS.basics);
        reasons.push(`« ${A.title} » est une note d'introduction`);
      }
      if (!w.length) continue;
      const confidence = round2(1 - w.reduce((p, x) => p * (1 - x), 1));
      if (confidence < minConfidence) continue;
      cands.set(`${aSlug}\n${B.slug}`, {
        a: aSlug,
        b: B.slug,
        confidence,
        reasons,
      });
    }
  }

  const stats: SuggestStats = {
    candidates: cands.size,
    already: 0,
    implied: 0,
    cycle: 0,
    reverse: 0,
  };
  // Both directions proposed (A and B cite each other): keep the clearly
  // stronger one, drop both when it's a toss-up.
  const kept: Cand[] = [];
  for (const c of cands.values()) {
    const rev = cands.get(`${c.b}\n${c.a}`);
    if (rev && rev.confidence + 0.1 > c.confidence) {
      stats.reverse++;
      continue;
    }
    kept.push(c);
  }
  kept.sort(
    (x, y) =>
      y.confidence - x.confidence ||
      (x.b < y.b ? -1 : x.b > y.b ? 1 : 0) ||
      (x.a < y.a ? -1 : x.a > y.a ? 1 : 0),
  );

  const suggestions: Suggestion[] = [];
  for (const c of kept) {
    if (direct.has(`${c.a}\n${c.b}`)) {
      stats.already++;
      continue;
    }
    if (reaches(out, c.b, c.a)) {
      stats.cycle++;
      continue;
    }
    if (reaches(out, c.a, c.b)) {
      stats.implied++;
      continue;
    }
    addEdge(c.a, c.b);
    const B = bySlug.get(c.b)!;
    const A = bySlug.get(c.a)!;
    const p = pathOf.get(c.b) ?? pathOf.get(c.a) ?? null;
    suggestions.push({
      note: c.b,
      prereq: c.a,
      confidence: c.confidence,
      reasons: c.reasons,
      yaml: prereqYaml([...B.prereqTargets, A.linkName]),
      path: p && { slug: p.slug, name: p.name },
    });
  }
  return { suggestions, stats };
}
