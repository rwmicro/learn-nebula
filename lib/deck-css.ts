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
 * - coloured text keeps its hue, darkened (light theme) or lightened (dark
 *   theme) only as far as it takes to be read on the site's paper: yellow
 *   names written for Anki's black night window. Anything on a background
 *   the deck keeps is left alone.
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

/** CSS named colours that shared decks actually use (the rest stay as written). */
const NAMED: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  yellow: "#ffff00",
  gold: "#ffd700",
  orange: "#ffa500",
  red: "#ff0000",
  crimson: "#dc143c",
  tomato: "#ff6347",
  coral: "#ff7f50",
  salmon: "#fa8072",
  pink: "#ffc0cb",
  hotpink: "#ff69b4",
  magenta: "#ff00ff",
  fuchsia: "#ff00ff",
  violet: "#ee82ee",
  orchid: "#da70d6",
  purple: "#800080",
  indigo: "#4b0082",
  blue: "#0000ff",
  navy: "#000080",
  darkblue: "#00008b",
  royalblue: "#4169e1",
  dodgerblue: "#1e90ff",
  deepskyblue: "#00bfff",
  skyblue: "#87ceeb",
  lightblue: "#add8e6",
  cyan: "#00ffff",
  aqua: "#00ffff",
  turquoise: "#40e0d0",
  teal: "#008080",
  green: "#008000",
  darkgreen: "#006400",
  lime: "#00ff00",
  limegreen: "#32cd32",
  lightgreen: "#90ee90",
  olive: "#808000",
  khaki: "#f0e68c",
  brown: "#a52a2a",
  maroon: "#800000",
  darkred: "#8b0000",
  silver: "#c0c0c0",
  gray: "#808080",
  grey: "#808080",
  darkgray: "#a9a9a9",
  darkgrey: "#a9a9a9",
  lightgray: "#d3d3d3",
  lightgrey: "#d3d3d3",
};

/** "#abc", "#aabbcc", "rgb(…)", a common named colour → [r, g, b]; anything else → null. */
function rgb(v: string): [number, number, number] | null {
  const s = (NAMED[v.trim().toLowerCase()] ?? v).trim().toLowerCase();
  let m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  if (m) return [m[1], m[2], m[3]].map((h) => parseInt(h + h, 16)) as [number, number, number];
  m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(s);
  if (m) return [m[1], m[2], m[3]].map((h) => parseInt(h, 16)) as [number, number, number];
  m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/.exec(s);
  if (m) return [m[1], m[2], m[3]].map((n) => Math.min(255, Number(n))) as [number, number, number];
  return null;
}

/** WCAG relative luminance. */
function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const hex = (c: [number, number, number]) => `#${c.map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`;

/** The site's paper in each theme (global.css --paper), what card text sits on. */
const PAPER_LIGHT: [number, number, number] = [0xfc, 0xfc, 0xfc];
const PAPER_DARK: [number, number, number] = [0x1c, 0x1b, 0x19];
/** Large card text: WCAG's 3:1 for large type is enough, and keeps most hues as the deck chose them. */
const MIN_CONTRAST = 3;

/** A coloured text that can be read on the site's paper: the deck's hue as
 *  is when it already can, else darkened (light theme) or lightened (dark
 *  theme) until it can. Decks written for Anki's black night window put
 *  yellow and pale blue on what is white paper here. */
function readableColor(v: string, dark: boolean): string | null {
  const c = rgb(v);
  if (!c) return null;
  const paper = dark ? PAPER_DARK : PAPER_LIGHT;
  if (contrast(c, paper) >= MIN_CONTRAST) return null;
  const toward = dark ? 255 : 0;
  for (let t = 0.05; t <= 1; t += 0.05) {
    const mixed = c.map((n) => n + (toward - n) * t) as [number, number, number];
    if (contrast(mixed, paper) >= MIN_CONTRAST) return hex(mixed);
  }
  return dark ? "#ffffff" : "#000000";
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

function rewriteDeclarations(body: string, root: boolean, dark: boolean): string {
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
      if (level != null) return `color: ${textToken(level)}${imp}`;
      const fixed = readableColor(v, dark);
      return fixed ? `color: ${fixed}${imp}` : d;
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

function rewriteRules(css: string, hoisted: string[], dark: boolean): string {
  const out: string[] = [];
  for (const b of blocks(css)) {
    if (HOISTED.test(b.prelude)) {
      hoisted.push(b.body == null ? b.prelude : `${b.prelude} {${b.body}}`);
    } else if (b.body == null) {
      // A stray statement (or a truncated rule): nothing to scope.
    } else if (b.prelude.startsWith("@")) {
      if (GROUPING.test(b.prelude)) out.push(`${b.prelude} {\n${rewriteRules(b.body, hoisted, dark)}\n}`);
      // Other at-rules (@page…) mean nothing on a card.
    } else if (b.body.includes("{")) {
      // Native nesting: left as written, only scoped.
      out.push(`${rewriteSelector(b.prelude)} {${b.body}}`);
    } else {
      const sels = rewriteSelector(b.prelude);
      const root = sels.split(",").every((s) => ROOT_SELECTOR.test(s.trim()));
      // A night-mode rule only ever applies on the dark paper.
      const night = dark || /night_?mode|nightMode/i.test(b.prelude);
      out.push(`${sels} { ${rewriteDeclarations(b.body, root, night)} }`);
    }
  }
  return out.join("\n");
}

/** The deck's CSS, scoped to `scope` (a selector for the card's wrapper). */
export function adaptDeckCss(css: string, scope: string, dark = false): string {
  const hoisted: string[] = [];
  const body = rewriteRules(css.replace(/\/\*[\s\S]*?\*\//g, ""), hoisted, dark);
  // @import must come first; the rest of the hoisted at-rules after it.
  hoisted.sort((a, b) => Number(!/^@import/i.test(a)) - Number(!/^@import/i.test(b)));
  return `${hoisted.join("\n")}${hoisted.length ? "\n" : ""}@scope (${scope}) {\n${body}\n}`;
}

/** The same treatment for a card's inline styles (`<div style='font-family:
 *  Arial; font-size: 16px'>`, common in shared decks): plain fonts dropped,
 *  sizes scaled with the card, neutral greys made theme tokens. */
export function adaptInlineStyles(html: string, dark = false): string {
  return html.replace(/(\sstyle\s*=\s*)(["'])([^"']*)\2/gi, (_m, pre: string, q: string, css: string) => {
    const out = rewriteDeclarations(css.replace(/&quot;/g, '"'), false, dark).replace(/"/g, "&quot;");
    return `${pre}${q}${out}${q}`;
  });
}
