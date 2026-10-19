// Makes the build-time mermaid SVGs follow the site's light/dark theme, and
// stops every one of them carrying its own copy of mermaid's stylesheet.
//
// Mermaid writes a ~6.6 KB <style> into each SVG, every rule scoped to that
// SVG's random id, with the theme's colours baked in as hex. Across the vault
// that was 3.4 MB of the 11.3 MB of inline SVG, and it is why a diagram could
// only be drawn in light (the figure was a .keep-light island: a white slab on
// the dark page).
//
// hoistMermaidStyles() takes every rendered SVG of the build at once and, per
// diagram type, moves the rules that all of that type's diagrams share into
// one stylesheet: scoped to `.mermaid-diagram svg[aria-roledescription=…]`
// instead of the id, and with the theme's hex colours swapped for the site's
// colour tokens (global.css), which already flip in dark mode. What is left in
// each SVG is what is really its own: an author's `classDef`/`style` rules and
// anything that names its id (gradients).
//
// Build-only, plain JS (scripts/render-mermaid.mjs imports it with bare node).
// The client fallback (public/js/mermaid-render.js) keeps mermaid's full inline
// style and its .keep-light island.

/**
 * MERMAID_CONFIG's colours (lib/mermaid-source.js) → the site token each one
 * was picked from. The three timeline tints are mixes defined in main.css
 * (--mm-tint-*) so they darken with the paper.
 */
export const THEME_TOKENS = {
  "#fcfcfc": "var(--paper)",
  "#111": "var(--ink)",
  "#111111": "var(--ink)",
  "#000": "var(--ink)",
  "#000000": "var(--ink)",
  "#030303": "var(--ink)",
  "#555": "var(--ink-2)",
  "#555555": "var(--ink-2)",
  "#6f6f6f": "var(--muted)",
  "#ccc": "var(--rule-strong)",
  "#cccccc": "var(--rule-strong)",
  "#f7f7f5": "var(--wash)",
  // Mermaid's own greys (packet blocks, a state's composite fill, a disabled
  // mindmap node): fills, so the hover fill.
  "#efefef": "var(--wash-2)",
  "#e0e0e0": "var(--wash-2)",
  "#f0f7ff": "var(--link-wash)",
  "#003366": "var(--link)",
  "#e7eef6": "var(--mm-tint-1)",
  "#eef3ee": "var(--mm-tint-2)",
  "#f5f1e9": "var(--mm-tint-3)",
  "#2d6cc0": "var(--callout-blue)",
  "#009b8f": "var(--callout-teal)",
  "#3f6b4a": "var(--garden)",
  "#b8740f": "var(--warn)",
  "#6b4fbb": "var(--callout-violet)",
};

const hex2 = (n) => Number(n).toString(16).padStart(2, "0");

/** Swap the theme's colours (hex, or the rgb()/rgba() mermaid derives) for tokens. */
export function themeColors(css) {
  return css
    .replace(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi, (h) => THEME_TOKENS[h.toLowerCase()] ?? h)
    .replace(
      /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)/gi,
      (whole, r, g, b, a) => {
        const token = THEME_TOKENS[`#${hex2(r)}${hex2(g)}${hex2(b)}`];
        if (!token) return whole;
        if (a === undefined || Number(a) === 1) return token;
        return `color-mix(in srgb, ${token} ${Math.round(Number(a) * 100)}%, transparent)`;
      },
    )
    // Greys mermaid derives from the theme (sequence activation borders).
    .replace(/hsl\(\s*[\d.]+,\s*0%,\s*([\d.]+)%\s*\)/gi, (_, l) =>
      Number(l) >= 50 ? "var(--rule-strong)" : "var(--muted)",
    )
    .replace(/:\s*black\s*;/gi, ":var(--ink);");
}

/** Top-level CSS rules, `@keyframes x{…{…}}` kept whole. */
export function splitRules(css) {
  const rules = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) {
      const rule = css.slice(start, i + 1).trim();
      if (rule) rules.push(rule);
      start = i + 1;
    }
  }
  return rules;
}

const ID_RE = /<svg\b[^>]*?\bid="([^"]+)"/;
const TYPE_RE = /aria-roledescription="([^"]+)"/;
const STYLE_RE = /<style>([\s\S]*?)<\/style>/;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * @param {string[]} svgs every SVG the build rendered
 * @returns {{ css: string, svgs: string[] }} the shared stylesheet, and the
 *   SVGs (same order) with only their own rules left inline
 */
export function hoistMermaidStyles(svgs) {
  const parsed = svgs.map((svg) => {
    const id = svg.match(ID_RE)?.[1];
    const type = svg.match(TYPE_RE)?.[1];
    const style = svg.match(STYLE_RE)?.[1];
    if (!id || !type || style === undefined) return null;
    const own = new RegExp(`#${escapeRe(id)}(?![\\w-])`, "g");
    // Mermaid ships the rules of its "neo" look in every SVG, each naming the
    // SVG's own gradient, so none could be shared — 0.7 to 4 KB per diagram.
    // Nothing in the vault uses that look: drop them unless the SVG does.
    const neo = /\bdata-look="neo"/.test(svg.replace(STYLE_RE, ""));
    const dead = (rule) =>
      !neo && rule.slice(0, rule.indexOf("{")).split(",").every((sel) => sel.includes('[data-look="neo"]'));
    // `&` stands for the diagram's own root; a rule still naming the id after
    // that (url(#<id>-gradient)) can only ever belong to this one SVG.
    const rules = splitRules(style).filter((raw) => !dead(raw)).map((raw) => {
      const norm = raw.replace(own, "&");
      return { raw, norm: norm.includes(id) ? null : norm };
    });
    return { id, type, rules };
  });

  // Per type, the rules present in every one of its diagrams.
  const shared = new Map();
  for (const p of parsed) {
    if (!p) continue;
    const mine = new Set(p.rules.map((r) => r.norm).filter(Boolean));
    const prev = shared.get(p.type);
    if (!prev) shared.set(p.type, { order: [...mine], keep: mine });
    else for (const n of prev.keep) if (!mine.has(n)) prev.keep.delete(n);
  }

  const keyframes = new Set();
  const blocks = [];
  for (const [type, { order, keep }] of [...shared].sort(([a], [b]) => a.localeCompare(b))) {
    const scope = `.mermaid-diagram svg[aria-roledescription="${type}"]`;
    const rules = [];
    for (const n of order) {
      if (!keep.has(n)) continue;
      if (n.startsWith("@")) keyframes.add(n);
      else rules.push(n.replaceAll("&", scope));
    }
    if (rules.length) blocks.push(`/* ${type} */\n${rules.join("\n")}`);
  }

  // Colours mermaid writes as presentation attributes (pie slices, state
  // markers, gradient stops) or inline style (pie legend, quadrant border)
  // rather than in its <style>. A presentation attribute loses to any CSS
  // rule, so these only take over where nothing else sets the colour, as the
  // attribute did; an inline style needs !important.
  const attrs = [];
  for (const [hex, token] of Object.entries(THEME_TOKENS)) {
    for (const prop of ["fill", "stroke", "stop-color"])
      attrs.push(`.mermaid-diagram [${prop}="${hex}" i]{${prop}:${token}}`);
    const n = parseInt(hex.length === 4 ? hex.replace(/\w/g, (c) => c + c) : hex.slice(1), 16);
    if (hex.length === 7) {
      const rgb = `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
      attrs.push(
        `.mermaid-diagram [style*="fill: ${rgb}"]{fill:${token}!important}`,
        `.mermaid-diagram [style*="stroke: ${rgb}"]{stroke:${token}!important}`,
      );
    }
  }

  // themeColors on the rules only: the attribute selectors must keep naming
  // the hex mermaid wrote.
  const css = [
    themeColors([...keyframes, ...blocks].join("\n")),
    `/* presentation attributes */\n${attrs.join("\n")}`,
  ].join("\n");

  const out = svgs.map((svg, i) => {
    const p = parsed[i];
    if (!p) return svg;
    const keep = shared.get(p.type).keep;
    const left = p.rules.filter((r) => !r.norm || !keep.has(r.norm)).map((r) => r.raw);
    return svg.replace(STYLE_RE, left.length ? `<style>${left.join("")}</style>` : "");
  });
  return { css: css + "\n", svgs: out };
}
