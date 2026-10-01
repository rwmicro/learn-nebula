// Normalises mermaid source before it reaches the parser.
//
// Shared by the build-time renderer (scripts/render-mermaid.mjs) and the client
// fallback (public/js/mermaid-render.js) — they must agree, or a diagram would
// render one way in the export and another in the browser. Plain JS, no TS, so
// the build script can import it with bare `node`.
//
// These are habits Obsidian and hand-written notes fall into that mermaid's
// grammar rejects: a parenthesis, an ampersand or an angle bracket inside a
// label is read as syntax unless the label is quoted. Every rule here only ever
// adds quotes around text the author already wrote.
//
// Anything needing a judgement call — a missing closing pipe, a node id that
// collides with a keyword like `graph`, a `"` the author put inside a label —
// is deliberately left alone and reported by render-mermaid.mjs instead.
// Guessing at intent is how a diagram ends up quietly saying something else.

// Characters mermaid's flowchart grammar treats as syntax inside a bare label.
const SPECIALS = "<>(){}+&|";
const IN_LABEL = `[${SPECIALS}]`;
const NOT_IN_LABEL = `[^\\[\\]"]`;
// A pipe inside a node label is ordinary text (set cardinality, absolute value),
// so the edge-label rule must never fire on one.
const SPECIALS_NO_PIPE = `[${SPECIALS.replace("|", "")}]`;
// Every flowchart link shape that can carry a |label|.
const LINK = "-{2,3}>|-\\.-+>|={2,3}>|~{2,3}~|-{2,3}|-\\.-+|o-{2,3}|x-{2,3}";

/**
 * Apply `fn` to the parts of a line that are NOT inside a quoted label.
 *
 * Every rule below quotes text mermaid would otherwise parse as syntax — which
 * makes all of them wrong inside a label the author already quoted, where that
 * text is just text. Two of them learned this the hard way: one turned the set
 * cardinality in `Note["|A∪B∪C|"]` into nonsense, and one wrapped the interval
 * notation in `P4["… sur ]-inf, 0[<br/>… sur ]0, +inf["]` around the `<br/>`,
 * breaking a diagram that had been rendering. Rather than patch each rule to
 * dodge quotes, none of them ever sees a quoted span.
 *
 * Splitting on `"` is exact here: mermaid has no backslash escape inside a
 * label — a literal quote is written `#quot;` — so quotes always pair up, and
 * the odd-indexed pieces are precisely the quoted ones.
 */
function outsideQuotes(line, fn) {
  const parts = line.split('"');
  if (parts.length === 1) return fn(line);
  return parts.map((part, i) => (i % 2 === 0 ? fn(part) : part)).join('"');
}

/** The quoting rules, applied only to text mermaid will read as syntax. */
function quoteBareLabels(s) {
  return (
    s
      // db[(Base (SQL))] -> db[("Base (SQL)")]. The cylinder's own brackets are
      // the shape, so the quotes go inside them. Non-greedy: the first ")]"
      // closes the node, not the last parenthesis of the label.
      .replace(
        new RegExp(`\\[\\((?!")([^\\n"]*?${IN_LABEL}[^\\n"]*?)\\)\\]`, "g"),
        '[("$1")]',
      )

      // s[[Sous-routine (x)]] -> s[["Sous-routine (x)"]]. Same idea for the
      // subroutine shape.
      .replace(
        new RegExp(`\\[\\[(?!")([^\\n"]*?${IN_LABEL}[^\\n"]*?)\\]\\]`, "g"),
        '[["$1"]]',
      )

      // The ordinary rectangle: foo[a (b)] -> foo["a (b)"]. The lookahead keeps
      // it off the two shapes above, which the rules before it have already
      // quoted.
      .replace(
        new RegExp(`\\[(?!\\[|\\()(${NOT_IN_LABEL}*${IN_LABEL}${NOT_IN_LABEL}*)\\]`, "g"),
        '["$1"]',
      )

      // Edge labels: A -->|RPO (perdu)| B -> A -->|"RPO (perdu)"| B. Anchored to
      // the link that must precede an edge label, so a pipe used as ordinary
      // notation elsewhere on the line is left alone.
      .replace(
        new RegExp(`(${LINK})\\|(?!")([^|\\n"]*${SPECIALS_NO_PIPE}[^|\\n"]*)\\|`, "g"),
        '$1|"$2"|',
      )
  );
}

/**
 * The diagram keyword (`flowchart`, `timeline`, …): the first line that is not
 * blank, a `%%` comment or part of a `---` front-matter block.
 */
export function diagramType(code) {
  const lines = code.split("\n");
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (lines[i]?.trim() === "---") {
    i++;
    while (i < lines.length && lines[i].trim() !== "---") i++;
    i++;
  }
  for (; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l || l.startsWith("%%")) continue;
    return l.split(/[\s;]/)[0].toLowerCase();
  }
  return "";
}

export function normaliseMermaid(code) {
  // `timeline` draws its events as SVG <text>, not HTML labels, and its own
  // word-wrapper only breaks on a bare `<br>` token (mermaid 11.16:
  // `text.split(/(\s+|<br>)/)` in the timeline renderer). `<br/>` — what the
  // flowchart path below wants — reached the page verbatim as
  // "Paracelse<br/>(iatrochimie)". None of the quoting rules apply either:
  // timeline has no bracketed labels, so a quote would only show up as text.
  if (diagramType(code) === "timeline") {
    return code.replace(/\\n|<br\s*\/?>/gi, "<br>");
  }
  return (
    code
      // Obsidian writes a literal backslash-n where a line break is meant. This
      // one is wanted inside quoted labels too, so it runs on the whole source.
      .replace(/\\n/g, "<br/>")
      .split("\n")
      .map((line) =>
        outsideQuotes(
          // subgraph Formes (glaciaires) -> subgraph "Formes (glaciaires)".
          // Whole-line, since it is anchored to the keyword and already skips a
          // title the author quoted.
          line.replace(/^(\s*subgraph[ \t]+)(?!")([^[\n]*[<>()][^[\n]*?)\s*$/, '$1"$2"'),
          quoteBareLabels,
        ),
      )
      .join("\n")
  );
}

// Renderer configuration, shared for the same reason the normaliser is: the
// build pre-renders most diagrams and public/js/mermaid-render.js renders the
// rest in the browser, so a difference here means two diagrams in one garden
// that don't look like they came from the same place. The theme landed on the
// build side alone and the client kept mermaid's grey "neutral", which is
// exactly the drift this file exists to prevent.

// Theme tuned to the site palette (assets/css): #fcfcfc page, #111 text,
// #003366 accent (the `a` colour), #f0f7ff tint, #ccc hairlines. Built on
// mermaid's "base" theme because only that one reads themeVariables; "neutral"
// ignores them. Flat fills and 1px borders so a diagram sits in the page like
// a table does, rather than arriving with its own visual identity.
export const MERMAID_CONFIG = {
  startOnLoad: false,
  securityLevel: "strict",
  theme: "base",
  fontFamily: '"Alegreya Sans", sans-serif',
  themeVariables: {
    fontFamily: '"Alegreya Sans", sans-serif',
    fontSize: "15px",
    background: "#fcfcfc",
    textColor: "#111",
    lineColor: "#6f6f6f",
    // Nodes: tinted fill, accent border.
    primaryColor: "#f0f7ff",
    primaryBorderColor: "#003366",
    primaryTextColor: "#111",
    mainBkg: "#f0f7ff",
    nodeBorder: "#003366",
    nodeTextColor: "#111",
    // Secondary/tertiary surfaces (subgraphs, clusters): page-coloured, hairline.
    secondaryColor: "#fcfcfc",
    secondaryBorderColor: "#ccc",
    secondaryTextColor: "#111",
    tertiaryColor: "#fcfcfc",
    tertiaryBorderColor: "#ccc",
    tertiaryTextColor: "#555",
    clusterBkg: "#fcfcfc",
    clusterBorder: "#ccc",
    titleColor: "#111",
    edgeLabelBackground: "#fcfcfc",
    // sequenceDiagram.
    actorBkg: "#f0f7ff",
    actorBorder: "#003366",
    actorTextColor: "#111",
    actorLineColor: "#ccc",
    signalColor: "#111",
    signalTextColor: "#111",
    labelBoxBkgColor: "#f0f7ff",
    labelBoxBorderColor: "#003366",
    labelTextColor: "#111",
    loopTextColor: "#111",
    noteBkgColor: "#f7f7f5",
    noteBorderColor: "#ccc",
    noteTextColor: "#555",
    sequenceNumberColor: "#fcfcfc",
    altBackground: "#fcfcfc",
    // mindmap / timeline sections cycle through cScale*; git0 is also what
    // mindmap paints its root with, hence a light value rather than an accent.
    cScale0: "#f0f7ff", cScaleLabel0: "#111",
    cScale1: "#e7eef6", cScaleLabel1: "#111",
    cScale2: "#eef3ee", cScaleLabel2: "#111",
    cScale3: "#f5f1e9", cScaleLabel3: "#111",
    cScale4: "#f0f7ff", cScaleLabel4: "#111",
    cScale5: "#e7eef6", cScaleLabel5: "#111",
    cScale6: "#eef3ee", cScaleLabel6: "#111",
    cScale7: "#f5f1e9", cScaleLabel7: "#111",
    // mermaid cycles up to 12 sections (THEME_COLOR_LIMIT); left undefined,
    // 8-11 fell back to its own saturated yellow/green/cyan, so a timeline's
    // ninth event onwards looked like it came from another diagram.
    cScale8: "#f0f7ff", cScaleLabel8: "#111",
    cScale9: "#e7eef6", cScaleLabel9: "#111",
    cScale10: "#eef3ee", cScaleLabel10: "#111",
    cScale11: "#f5f1e9", cScaleLabel11: "#111",
    // The rule under each timeline box. Derived, these are the colour
    // inverses of the tints above (a muddy orange/brown/purple run); give them
    // the accent series instead.
    cScaleInv0: "#003366", cScaleInv1: "#2d6cc0", cScaleInv2: "#3f6b4a", cScaleInv3: "#b8740f",
    cScaleInv4: "#003366", cScaleInv5: "#2d6cc0", cScaleInv6: "#3f6b4a", cScaleInv7: "#b8740f",
    cScaleInv8: "#003366", cScaleInv9: "#2d6cc0", cScaleInv10: "#3f6b4a", cScaleInv11: "#b8740f",
    git0: "#e7eef6", git1: "#2d6cc0", git2: "#009b8f", git3: "#3f6b4a",
    // pie/quadrant: the callout accent series from main.css.
    pie1: "#003366", pie2: "#2d6cc0", pie3: "#009b8f",
    pie4: "#3f6b4a", pie5: "#b8740f", pie6: "#6b4fbb",
    pieTitleTextColor: "#111",
    pieSectionTextColor: "#fcfcfc",
    pieStrokeColor: "#fcfcfc",
    pieOuterStrokeColor: "#ccc",
  },
  flowchart: { useMaxWidth: true, htmlLabels: true, curve: "basis" },
  // 50px on every side by default; with the title pinned to the left edge
  // (polishSvg below) that read as a blank band around the diagram.
  timeline: { padding: 16 },
  sequence: { useMaxWidth: true, mirrorActors: false, messageAlign: "left" },
  packet: { useMaxWidth: true },
};

/**
 * Post-process a rendered SVG string. Shared by both render paths for the same
 * reason as the config above.
 *
 * Timeline (left to right): mermaid places the title at half the drawing's
 * width, but a timeline of fifteen events is ~3400px wide and scrolls inside a
 * ~680px column, so the title sat far off to the right, out of view, and the
 * reader saw a tall empty band above the boxes instead. Pin it to the left
 * edge of the viewBox, where the scroll starts, at a size closer to the page's
 * own headings than mermaid's 4ex bold.
 */
export function polishSvg(svg, source = "") {
  if (!/aria-roledescription="timeline"/.test(svg)) return svg;
  // A vertical timeline (`timeline TD`) lays its title out differently; none
  // in the vault uses one, so leave it exactly as mermaid drew it.
  if (/^\s*timeline[ \t]+TD\b/im.test(source)) return svg;
  const vb = svg.match(/viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/);
  if (!vb) return svg;
  const left = Number(vb[1]) + (MERMAID_CONFIG.timeline?.padding ?? 50);
  return svg.replace(
    /<text x="-?[\d.]+" font-size="4ex" font-weight="bold" y="(-?[\d.]+)">/,
    (_, y) =>
      `<text class="timeline-title" x="${left}" text-anchor="start" font-size="1.45em" font-weight="600" y="${y}">`,
  );
}
