// What "Écouter" (public/js/audio.js) reads aloud: the note's title and the
// prose of `.article-body`, nothing else. `<main>` also carries the dropcap's
// <style>, the raw Markdown as JSON for translate.js, the reading dock, the
// comments form…, and a walk over every text node read all of that out —
// CSS rules, Markdown, button labels — as if it were the note.

/**
 * Inside the body, what is markup or chrome rather than prose: code and
 * diagrams (a `<style>` in each Mermaid SVG), KaTeX's LaTeX source and its
 * aria-hidden visual copy, quiz answers and controls, widgets, the margin
 * notes (and the number that points to them), heading anchors.
 */
export const SPEECH_SKIP =
  "script, style, noscript, template, svg, canvas, iframe, video, audio, " +
  "pre, annotation, button, input, select, textarea, " +
  "[hidden], [aria-hidden='true'], .deco, .anchor, " +
  ".callout-quiz, .widget, .manim-source, .manim-output, " +
  ".side, .yt-embed";

/** Elements after which a listener needs a pause, not run-on words. */
const BLOCKS =
  /^(P|LI|D[TDL]|H[1-6R]|BLOCKQUOTE|T[RHD]|TABLE|FIGCAPTION|CAPTION|DIV|SECTION|ASIDE|DETAILS|SUMMARY|BR|[OU]L|FIGURE)$/;

/** A piece of text, or the end of a block. */
export type SpeechPart = string | null;

/**
 * Joins text nodes into one readable string. Inline pieces are glued as the
 * HTML has them ("<b>jard</b>in" stays "jardin"); a block end becomes a
 * sentence break, with a full stop added when the block had none, so a
 * heading or a list item is not read into the next one.
 */
export function joinSpeech(parts: SpeechPart[]): string {
  let out = "";
  let block = "";
  const flush = () => {
    const s = block.replace(/\s+/g, " ").trim();
    block = "";
    if (!s) return;
    out += (out ? " " : "") + (/[.!?…:;,][\s"»”)\]]*$/.test(s) ? s : `${s}.`);
  };
  for (const p of parts) {
    if (p === null) flush();
    else block += p;
  }
  flush();
  return out;
}

/** The text of `root`, minus SPEECH_SKIP, as parts for joinSpeech(). */
export function speechParts(root: Element, parts: SpeechPart[] = []): SpeechPart[] {
  for (const node of root.childNodes) {
    if (node.nodeType === 3) parts.push(node.textContent ?? "");
    else if (node.nodeType === 1) {
      const el = node as Element;
      if (el.matches(SPEECH_SKIP)) continue;
      // The margin note's number in the text (not `sup:has(+ .side)`: a
      // browser without :has() would throw on the whole selector).
      if (el.tagName === "SUP" && el.nextElementSibling?.classList.contains("side")) continue;
      const block = BLOCKS.test(el.tagName);
      if (block) parts.push(null);
      speechParts(el, parts);
      if (block) parts.push(null);
    }
  }
  return parts;
}

/** The note as it should be read aloud: its title, then its body. */
export function noteSpeechText(main: Element): string {
  const parts: SpeechPart[] = [];
  const title = main.querySelector(".title-note");
  if (title) parts.push(title.textContent ?? "", null);
  const body = main.querySelector(".article-body");
  if (body) speechParts(body, parts);
  return joinSpeech(parts);
}
