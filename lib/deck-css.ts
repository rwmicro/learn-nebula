/**
 * An Anki deck's own stylesheet, made to sit inside the site's card
 * (components/review/DeckFace.tsx) instead of over the whole page.
 *
 * The CSS comes verbatim from the .apkg (scripts/build-anki.mjs) and was
 * written for Anki's card window: `body { background: #1a1a1a }`,
 * `a { color: … }`, `.card { font-family: arial; font-size: 20px; color:
 * black; background: white }`. Injected as is, it leaked onto the page and
 * froze every card into Arial on a white slab, in dark mode too. Here:
 *
 * - everything goes inside `@scope (<scope>)`, with `body`/`html` read as the
 *   scope root (the wrapper), so nothing reaches the rest of the page;
 *   `@import`, `@font-face`, `@keyframes`… are kept outside, where they must be;
 * - rules on the card root (`.card`, `body`, `.night_mode .card`…) lose their
 *   frame: background, colour, border, shadow, font family — the site's card
 *   and theme provide them;
 * - plain font families (Arial, Helvetica, Roboto…) are dropped everywhere, so
 *   the card reads in the site's type; a deck's real fonts (Harmattan,
 *   Noto Naskh…) stay;
 * - `px` font sizes scale with the card (`--deck-px`, about 1px on a phone,
 *   1.5px on a wide screen) and `vw` ones follow the card width (`cqi`);
 * - neutral greys become theme tokens (near-black → the ink, mid-greys →
 *   muted, white backgrounds → none), so a card follows light and dark mode.
 *   Coloured text, and anything on a background the deck keeps, is left alone.
 *
 * Pure (string in, string out), so it is unit-tested (deck-css.test.ts).
 */

/** At-rules that can't live inside @scope: hoisted unchanged. */
const HOISTED = /^@(import|charset|namespace|font-face|(-\w+-)?keyframes|property|counter-style|font-feature-values|layer\s*;)/i;
/** At-rules whose body is more rules (recursed into). */
const GROUPING = /^@(media|supports|container|layer)\b/i;

const GENERIC_FONTS = new Set([
  "arial",
  "helvetica",
  "helvetica neue",
  "roboto",
  "verdana",
  "tahoma",
  "segoe ui",
  "times",
  "times new roman",
  "new times roman",
  "georgia",
  "inter",
  "-apple-system",
  "blinkmacsystemfont",
  "system-ui",
  "sans-serif",
  "serif",
]);

/** A selector aimed at the card root rather than something inside it. */
const ROOT_SELECTOR = /^(:scope|\.card\d*|\.card\.(night_mode|nightMode)|\.(night_mode|nightMode)\s+\.card|\.card\s+\.(night_mode|nightMode))$/;
/** What a root rule loses: the frame and the ink come from the site. */
const ROOT_DROPPED = /^(background(-color|-image)?|color|border(-[a-z-]+)?|box-shadow|font-family|max-width|margin(-[a-z-]+)?)$/;

interface Block {
  /** Selector or at-rule prelude; for a statement (`@import …;`), the whole text. */
  prelude: string;
  /** Inside the braces, or null for a statement. */
  body: string | null;
}

/** Top-level blocks of a stylesheet (comments already gone). */
function blocks(css: string): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < css.length) {
    let j = i;
    let quote = "";
    // Prelude: up to the first `{` or `;` at depth 0 (outside quotes).
    while (j < css.length) {
      const ch = css[j];
      if (quote) {
        if (ch === quote) quote = "";
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "{" || ch === ";") break;
      j++;
    }
    const prelude = css.slice(i, j).trim();
    if (j >= css.length) {
      if (prelude) out.push({ prelude, body: null });
      break;
    }
    if (css[j] === ";") {
      if (prelude) out.push({ prelude: `${prelude};`, body: null });
      i = j + 1;
      continue;
    }
    let depth = 1;
    let k = j + 1;
    for (quote = ""; k < css.length && depth > 0; k++) {
      const ch = css[k];
      if (quote) {
        if (ch === quote) quote = "";
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    out.push({ prelude, body: css.slice(j + 1, depth ? k : k - 1) });
    i = k;
  }
  return out;
}

/** "#abc", "#aabbcc", black, white → [r, g, b]; anything else → null. */
function rgb(v: string): [number, number, number] | null {
  const s = v.trim().toLowerCase();
  if (s === "black") return [0, 0, 0];
  if (s === "white") return [255, 255, 255];
  let m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  if (m) return [m[1], m[2], m[3]].map((h) => parseInt(h + h, 16)) as [number, number, number];
  m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(s);
  if (m) return [m[1], m[2], m[3]].map((h) => parseInt(h, 16)) as [number, number, number];
  return null;
}

/** The grey level (0–255) of a neutral colour, or null for a hue / unknown. */
function grey(v: string): number | null {
  const c = rgb(v);
  if (!c) return null;
  const max = Math.max(...c);
  return max - Math.min(...c) <= 12 ? Math.round((c[0] + c[1] + c[2]) / 3) : null;
}

/** A neutral text colour as a theme token: the ends of the scale are the
 *  ink (black on a light card, white on a dark one), the middle is muted. */
function textToken(level: number): string {
  if (level <= 0x30 || level >= 0xe0) return "inherit";
  if (level <= 0x60 || level >= 0xb8) return "var(--ink-2)";
  return "var(--muted)";
}

/** A neutral background as a theme token, or null to keep the deck's. */
function backgroundToken(level: number): string | null {
  if (level >= 0xf0) return "transparent";
  if (level <= 0x40) return "var(--wash)";
  return null;
}

function splitValue(value: string): [string, string] {
  const m = /^(.*?)(\s*!important)?$/i.exec(value.trim())!;
  return [m[1].trim(), m[2] ?? ""];
}

function rewriteDeclarations(body: string, root: boolean): string {
  const decls = body
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const c = d.indexOf(":");
      return c < 0 ? null : { prop: d.slice(0, c).trim().toLowerCase(), value: d.slice(c + 1).trim() };
    })
    .filter((d): d is { prop: string; value: string } => !!d);

  // A background the deck keeps (a coloured band, a mid grey): its text
  // colour was chosen for it, so it stays too.
  let keptBackground = false;
  const out: string[] = [];
  for (const { prop, value } of decls) {
    if (root && ROOT_DROPPED.test(prop)) continue;
    const [v, imp] = splitValue(value);
    if (prop === "font-family") {
      const fams = v.split(",").map((f) => f.trim().replace(/^["']|["']$/g, "").toLowerCase());
      if (fams.every((f) => GENERIC_FONTS.has(f))) continue;
      out.push(`${prop}: ${value}`);
    } else if (prop === "font-size" || prop === "line-height") {
      out.push(
        `${prop}: ${v
          .replace(/(\d*\.?\d+)px\b/g, "calc($1 * var(--deck-px, 1px))")
          .replace(/(\d*\.?\d+)vw\b/g, "$1cqi")}${imp}`,
      );
    } else if (prop === "background" || prop === "background-color") {
      const level = grey(v);
      const token = level == null ? null : backgroundToken(level);
      if (token) out.push(`${prop}: ${token}${imp}`);
      else {
        if (v !== "none" && v !== "transparent") keptBackground = true;
        out.push(`${prop}: ${value}`);
      }
    } else out.push(`${prop}: ${value}`);
  }
  if (keptBackground) return out.join("; ");
  return out
    .map((d) => {
      const m = /^color: (.*)$/.exec(d);
      if (!m) return d;
      const [v, imp] = splitValue(m[1]);
      const level = grey(v);
      return level == null ? d : `color: ${textToken(level)}${imp}`;
    })
    .join("; ");
}

/** `body`, `html` → `:scope`: Anki's window is the wrapper here. */
function rewriteSelector(sel: string): string {
  return sel
    .split(",")
    .map((s) => s.trim().replace(/(^|[\s>+~])(html|body)(?![\w-])/g, "$1:scope"))
    .map((s) => s.replace(/:scope\s+:scope/g, ":scope"))
    .join(", ");
}

function rewriteRules(css: string, hoisted: string[]): string {
  const out: string[] = [];
  for (const b of blocks(css)) {
    if (HOISTED.test(b.prelude)) {
      hoisted.push(b.body == null ? b.prelude : `${b.prelude} {${b.body}}`);
    } else if (b.body == null) {
      // A stray statement (or a truncated rule): nothing to scope.
    } else if (b.prelude.startsWith("@")) {
      if (GROUPING.test(b.prelude)) out.push(`${b.prelude} {\n${rewriteRules(b.body, hoisted)}\n}`);
      // Other at-rules (@page…) mean nothing on a card.
    } else if (b.body.includes("{")) {
      // Native nesting: left as written, only scoped.
      out.push(`${rewriteSelector(b.prelude)} {${b.body}}`);
    } else {
      const sels = rewriteSelector(b.prelude);
      const root = sels.split(",").every((s) => ROOT_SELECTOR.test(s.trim()));
      out.push(`${sels} { ${rewriteDeclarations(b.body, root)} }`);
    }
  }
  return out.join("\n");
}

/** The deck's CSS, scoped to `scope` (a selector for the card's wrapper). */
export function adaptDeckCss(css: string, scope: string): string {
  const hoisted: string[] = [];
  const body = rewriteRules(css.replace(/\/\*[\s\S]*?\*\//g, ""), hoisted);
  // @import must come first; the rest of the hoisted at-rules after it.
  hoisted.sort((a, b) => Number(!/^@import/i.test(a)) - Number(!/^@import/i.test(b)));
  return `${hoisted.join("\n")}${hoisted.length ? "\n" : ""}@scope (${scope}) {\n${body}\n}`;
}

/** The same treatment for a card's inline styles (`<div style='font-family:
 *  Arial; font-size: 16px'>`, common in shared decks): plain fonts dropped,
 *  sizes scaled with the card, neutral greys made theme tokens. */
export function adaptInlineStyles(html: string): string {
  return html.replace(/(\sstyle\s*=\s*)(["'])([^"']*)\2/gi, (_m, pre: string, q: string, css: string) => {
    const out = rewriteDeclarations(css.replace(/&quot;/g, '"'), false).replace(/"/g, "&quot;");
    return `${pre}${q}${out}${q}`;
  });
}
