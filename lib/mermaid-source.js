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

export function normaliseMermaid(code) {
  return (
    code
      // Obsidian writes a literal backslash-n where a line break is meant.
      .replace(/\\n/g, "<br/>")

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
      // quoted (and whose quotes the character class then refuses to re-enter).
      .replace(
        new RegExp(`\\[(?!\\[|\\()(${NOT_IN_LABEL}*${IN_LABEL}${NOT_IN_LABEL}*)\\]`, "g"),
        '["$1"]',
      )

      // Edge labels: A -->|RPO (perdu)| B -> A -->|"RPO (perdu)"| B. The same
      // problem as node labels, and the same fix — but the pipe form used to be
      // missed, which is what breaks a flowchart that annotates its arrows.
      // Most explanatory diagrams do.
      //
      // Anchored to the arrow that must precede an edge label, not to the pipe
      // alone: a maths note writes set cardinality as |A∪B∪C| *inside* a node
      // label, and a bare-pipe rule quotes that into nonsense. Measured on this
      // vault — it silently broke three diagrams that had been rendering.
      .replace(
        new RegExp(`(${LINK})\\|(?!")([^|\\n"]*${SPECIALS_NO_PIPE}[^|\\n"]*)\\|`, "g"),
        '$1|"$2"|',
      )

      // subgraph Formes (glaciaires) -> subgraph "Formes (glaciaires)"
      .replace(/^(\s*subgraph[ \t]+)(?!")([^[\n]*[<>()][^[\n]*?)\s*$/gm, '$1"$2"')
  );
}
