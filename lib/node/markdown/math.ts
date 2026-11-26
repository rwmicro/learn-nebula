// Math and shortcodes: the raw Markdown's LaTeX and Hugo shortcodes are
// swapped for placeholders before unified sees them, and put back as HTML.

import katex from "katex";


// ---------------------------------------------------------------------------
// Preprocessing (runs on the raw Markdown, before the unified pipeline so that
// LaTeX backslashes and Hugo shortcodes survive Markdown's own escaping).
// ---------------------------------------------------------------------------

// CommonMark backslash-unescaping, applied inside math so the author's
// goldmark-oriented escaping (\_, \\{, \\}) yields valid KaTeX input.
const PUNCT = /\\([!-/:-@[-`{-~])/g;
const unescapeMath = (s: string) => s.replace(PUNCT, "$1");

interface Placeholders {
  map: Map<string, string>;
  next: () => string;
}

export function newPlaceholders(): Placeholders {
  const map = new Map<string, string>();
  let n = 0;
  return { map, next: () => `ph${n++}` };
}

export function preprocessMath(raw: string, ph: Placeholders): string {
  const render = (tex: string, displayMode: boolean) =>
    katex.renderToString(unescapeMath(tex), {
      displayMode,
      throwOnError: false,
      strict: false,
    });
  const display = (tex: string) => {
    const id = ph.next();
    ph.map.set(id, render(tex, true));
    return `\n\n<div data-ph="${id}"></div>\n\n`;
  };
  const inline = (tex: string) => {
    const id = ph.next();
    ph.map.set(id, render(tex, false));
    return `<span data-ph="${id}"></span>`;
  };

  // Stash code (fenced + inline) so `$…$` inside it isn't treated as math.
  const code: string[] = [];
  const stash = (m: string) => `@@C${code.push(m) - 1}@@`;
  let out = raw
    .replace(/```[\s\S]*?```/g, stash)
    .replace(/~~~[\s\S]*?~~~/g, stash)
    .replace(/`+[^`]*`+/g, stash);

  // Display first ($$ … $$ and \[ … \]), then inline ($ … $ and \( … \)). The
  // `$ … $` rule avoids currency: the opening `$` can't follow a digit nor lead
  // a space, and the closing `$` can't follow a space nor precede a digit.
  out = out.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex) => display(tex));
  out = out.replace(/\\\\\[([\s\S]*?)\\\\\]/g, (_m, tex) => display(tex));
  out = out.replace(
    /(?<![\d\\$])\$(?![\s$])((?:[^$\n]|\\\$)+?)(?<![\s\\])\$(?!\d)/g,
    (_m, tex) => inline(tex),
  );
  out = out.replace(/\\\\\(([\s\S]*?)\\\\\)/g, (_m, tex) => inline(tex));

  // Restore code untouched.
  out = out.replace(/@@C(\d+)@@/g, (_m, i) => code[Number(i)]);
  return out;
}
