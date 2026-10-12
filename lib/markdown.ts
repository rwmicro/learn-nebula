import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkSmartypants from "remark-smartypants";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeStringify from "rehype-stringify";
import { visit, SKIP } from "unist-util-visit";
import { fromHtml } from "hast-util-from-html";
import { toString as mdToString } from "mdast-util-to-string";
import katex from "katex";
import type { Root, Element, ElementContent, RootContent } from "hast";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rehypeShiki } from "./highlight";
import { resolveRelativeNoteLink, resolveWikiLink } from "./content";
import {
  resolveVaultAsset,
  isVideoSrc,
  isAudioSrc,
  getVaultImage,
} from "./vault-assets";
import { t } from "./i18n";
import { cardId } from "./srs";
import { EXTRA_WIDGETS } from "./widgets-extra";
import { enrichWidget } from "./widget-data";
import { parsePrix, toEuros, formatEuros, IPC_LAST } from "./prix";
import {
  definitionAnchor,
  definitionTerm,
  isDefinitionTitle,
  rehypeGlossary,
  type GlossaryEntry,
} from "./glossary";

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

function newPlaceholders(): Placeholders {
  const map = new Map<string, string>();
  let n = 0;
  return { map, next: () => `ph${n++}` };
}

function preprocessMath(raw: string, ph: Placeholders): string {
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

// ---------------------------------------------------------------------------
// rehype plugins
// ---------------------------------------------------------------------------

function hastText(node: any): string {
  if (node.type === "text") return node.value;
  if (Array.isArray(node.children)) return node.children.map(hastText).join("");
  return "";
}

// Script-execution schemes that must never survive in a note-authored link/src.
const UNSAFE_URL = /^\s*(?:javascript|vbscript):/i;

/**
 * Strip the script-execution vectors from note-authored raw HTML — everything
 * that flowed through rehypeRaw. Runs *before* our own trusted fragments (KaTeX,
 * callout icons, manim/video, highlighted code) are injected, so it only touches
 * what the note author wrote. Notes are first-party, but /api/translate re-runs
 * this exact pipeline on the model's output, so this keeps a prompt-injected note
 * from smuggling executable markup back through the translator. `<script>` goes,
 * inline `on*` event handlers go (they still fire under our `unsafe-inline`
 * script-src), and `javascript:`/`vbscript:` URLs are dropped. `data-*` is left
 * intact — the math placeholders (`data-ph`) depend on it.
 */
function rehypeStripUnsafe() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName === "script" && parent && index != null) {
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
      const props = node.properties;
      if (!props) return;
      for (const key of Object.keys(props)) {
        if (/^on/i.test(key)) delete props[key];
      }
      for (const attr of ["href", "src"] as const) {
        const v = props[attr];
        if (typeof v === "string" && UNSAFE_URL.test(v)) delete props[attr];
      }
    });
  };
}

/** Replace <div|span data-ph="…"> placeholders with their stored HTML. */
function rehypePlaceholders(map: Map<string, string>) {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      const id = node.properties?.dataPh;
      if (typeof id !== "string" || !parent || index == null) return;
      const html = map.get(id) ?? "";
      const frag = fromHtml(html, { fragment: true });
      parent.children.splice(index, 1, ...(frag.children as RootContent[]));
      return [SKIP, index + frag.children.length];
    });
  };
}

// --- Obsidian callouts ( > [!type] Title ) ---------------------------------
const calloutSvg = (inner: string) =>
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

// Obsidian type aliases -> canonical type.
const CALLOUT_ALIAS: Record<string, string> = {
  note: "note",
  abstract: "abstract",
  summary: "abstract",
  tldr: "abstract",
  info: "info",
  todo: "todo",
  tip: "tip",
  hint: "tip",
  important: "tip",
  success: "success",
  check: "success",
  done: "success",
  question: "question",
  help: "question",
  faq: "question",
  warning: "warning",
  caution: "warning",
  attention: "warning",
  failure: "failure",
  fail: "failure",
  missing: "failure",
  danger: "danger",
  error: "danger",
  bug: "bug",
  example: "example",
  quote: "quote",
  cite: "quote",
  // Retrieval-practice card (question in the title, answer in the body),
  // rendered by quizCallout() below — a type of its own, since Obsidian's
  // `question` already means a plain FAQ-style callout in the vault.
  quiz: "quiz",
  // "À ton avis ?": a question asked before the explanation, the rest of the
  // section veiled until the reader answers (predictCallout() below).
  predict: "predict",
  prediction: "predict",
  avis: "predict",
  // "En quelques chiffres": a few key figures, each list item's leading bold
  // text set large (assets/css/widgets-extra.css), after the Insee's
  // « L'essentiel sur… » boxes.
  chiffres: "chiffres",
  figures: "chiffres",
};
// Default (French) title when the callout has none.
const CALLOUT_LABEL: Record<string, string> = {
  note: "Note",
  abstract: "Résumé",
  info: "Info",
  todo: "À faire",
  tip: "Astuce",
  success: "Succès",
  question: "Question",
  warning: "Attention",
  failure: "Échec",
  danger: "Danger",
  bug: "Bug",
  example: "Exemple",
  quote: "Citation",
  quiz: "Question",
  predict: "À ton avis ?",
  chiffres: "En quelques chiffres",
};
const CALLOUT_ICON: Record<string, string> = {
  note: calloutSvg(
    '<path d="M4 20h4L18 8a2 2 0 0 0-3-3L5 16v4z"/><path d="M14 6l3 3"/>',
  ),
  abstract: calloutSvg(
    '<rect x="6" y="4" width="12" height="16" rx="1.5"/><path d="M9 9h6M9 13h6M9 17h4"/>',
  ),
  info: calloutSvg(
    '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  ),
  todo: calloutSvg(
    '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5 5-5.5"/>',
  ),
  tip: calloutSvg(
    '<path d="M12 3c2.5 3 4 4.8 4 8a4 4 0 1 1-8 0c0-1.7.7-3 2-4.2"/>',
  ),
  success: calloutSvg('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  question: calloutSvg(
    '<circle cx="12" cy="12" r="9"/><path d="M9.3 9.2a2.7 2.7 0 0 1 4.5 2c0 1.7-2.3 2-2.3 3.3"/><path d="M12 17.5h.01"/>',
  ),
  warning: calloutSvg(
    '<path d="M12 4 2.7 20h18.6L12 4z"/><path d="M12 10v4"/><path d="M12 17.5h.01"/>',
  ),
  failure: calloutSvg(
    '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  ),
  danger: calloutSvg('<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/>'),
  bug: calloutSvg(
    '<rect x="8" y="9" width="8" height="9" rx="4"/><path d="M8 13H4M16 13h4M8 17l-3 2M16 17l3 2M9 9 7.5 7M15 9l1.5-2"/>',
  ),
  example: calloutSvg(
    '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  ),
  quote: calloutSvg(
    '<path d="M10 8H6a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2v2H6"/><path d="M20 8h-4a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2v2h-2"/>',
  ),
  quiz: calloutSvg(
    '<rect x="3" y="6" width="14" height="14" rx="1.5"/><path d="M7 3h12.5A1.5 1.5 0 0 1 21 4.5V17"/><path d="M8 11.2a2 2 0 0 1 3.9.6c0 1.2-1.9 1.5-1.9 2.6"/><path d="M10 17h.01"/>',
  ),
  predict: calloutSvg(
    '<path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/><path d="M9.5 19h5M10.5 21.5h3"/>',
  ),
  chiffres: calloutSvg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Split inline children at the first line break (callout title vs. body text).
function splitAtBreak(
  children: ElementContent[],
): [ElementContent[], ElementContent[]] {
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.type === "element" && c.tagName === "br") {
      return [children.slice(0, i), children.slice(i + 1)];
    }
    if (c.type === "text" && c.value.includes("\n")) {
      const nl = c.value.indexOf("\n");
      const head = children.slice(0, i);
      if (c.value.slice(0, nl))
        head.push({ type: "text", value: c.value.slice(0, nl) });
      const tail: ElementContent[] = [];
      if (c.value.slice(nl + 1))
        tail.push({ type: "text", value: c.value.slice(nl + 1) });
      tail.push(...children.slice(i + 1));
      return [head, tail];
    }
  }
  return [children, []];
}

/** Text of a hast subtree with the math placeholders resolved to their
 *  rendered KaTeX, so two questions differing only by a formula hash apart. */
function stableText(node: ElementContent, ph: Map<string, string>): string {
  if (node.type === "text") return node.value;
  if (node.type !== "element") return "";
  const id = node.properties?.dataPh;
  if (typeof id === "string") return ph.get(id) ?? "";
  return node.children.map((c) => stableText(c, ph)).join("");
}

/** Stable identity of a quiz question (lib/srs.ts's content hash): the same
 *  question keeps its spaced-repetition record across rebuilds. */
export function quizId(question: string): string {
  return cardId(question.replace(/\s+/g, " ").trim(), "");
}

/** One answer of a multiple-choice question: a task-list item of the
 *  callout body (`- [x]` right, `- [ ]` wrong), its first line the answer,
 *  the rest (a continuation line) why it is right or wrong. */
export interface QuizChoice {
  ok: boolean;
  label: ElementContent[];
  why: ElementContent[];
}

const el = (
  tagName: string,
  properties: Element["properties"],
  children: ElementContent[] = [],
): Element => ({ type: "element", tagName, properties, children });
const txt = (value: string): ElementContent => ({ type: "text", value });
const hasClass = (n: ElementContent, c: string): n is Element => {
  if (n.type !== "element") return false;
  const cls = n.properties?.className;
  return Array.isArray(cls) ? cls.includes(c) : typeof cls === "string" && cls.split(/\s+/).includes(c);
};

/** Leading/trailing whitespace of an inline run, trimmed in place. */
function trimInline(nodes: ElementContent[]): ElementContent[] {
  const out = nodes.slice();
  while (out.length && isBlank(out[0])) out.shift();
  while (out.length && isBlank(out[out.length - 1])) out.pop();
  if (out[0]?.type === "text") out[0] = txt(out[0].value.replace(/^\s+/, ""));
  const last = out[out.length - 1];
  if (last?.type === "text") out[out.length - 1] = txt(last.value.replace(/\s+$/, ""));
  return out;
}

/** The choices of a `- [ ]` / `- [x]` task list, or null when `ul` is not one
 *  (or has fewer than two items). */
function taskChoices(ul: Element): QuizChoice[] | null {
  if (!hasClass(ul, "contains-task-list")) return null;
  const out: QuizChoice[] = [];
  for (const li of ul.children) {
    if (li.type !== "element" || li.tagName !== "li") continue;
    if (!hasClass(li, "task-list-item")) return null;
    // Tight list: <li><input> text\nwhy</li>; loose: <li><p><input> text\nwhy</p>…</li>.
    let inline: ElementContent[] = li.children;
    let after: ElementContent[] = [];
    const firstEl = li.children.find((c) => !isBlank(c));
    if (firstEl?.type === "element" && firstEl.tagName === "p") {
      inline = firstEl.children;
      after = li.children.slice(li.children.indexOf(firstEl) + 1).filter((c) => !isBlank(c));
    }
    const input = inline.find(
      (c): c is Element => c.type === "element" && c.tagName === "input",
    );
    if (!input) return null;
    const ok = !!input.properties?.checked;
    const [label, why] = splitAtBreak(inline.filter((c) => c !== input));
    const whyNodes = trimInline(why);
    out.push({
      ok,
      label: trimInline(label),
      why: [...(whyNodes.length ? [el("span", {}, whyNodes)] : []), ...after],
    });
  }
  return out.length >= 2 ? out : null;
}

/** "Indice : …" / "Hint: …" paragraph → its text without the prefix. */
function hintOf(n: ElementContent): ElementContent[] | null {
  if (n.type !== "element" || n.tagName !== "p") return null;
  const first = n.children[0];
  if (first?.type !== "text") return null;
  const m = first.value.match(/^\s*(?:indice|hint)\s*:\s*/i);
  if (!m) return null;
  return trimInline([txt(first.value.slice(m[0].length)), ...n.children.slice(1)]);
}

/**
 * Split a quiz/predict callout body into its parts: the answer choices (the
 * first task list), the hints ("Indice : …" paragraphs) and the rest — the
 * explanation shown with the answer. A body with neither stays as it is.
 */
export function quizParts(body: ElementContent[]): {
  choices: QuizChoice[] | null;
  hints: ElementContent[][];
  rest: ElementContent[];
} {
  let choices: QuizChoice[] | null = null;
  const hints: ElementContent[][] = [];
  const rest: ElementContent[] = [];
  for (const n of body) {
    if (!choices && n.type === "element" && n.tagName === "ul") {
      const c = taskChoices(n);
      if (c) {
        choices = c;
        continue;
      }
    }
    const h = hintOf(n);
    if (h) {
      hints.push(h);
      continue;
    }
    rest.push(n);
  }
  return { choices, hints, rest };
}

/** The answer buttons ("A", "B"…), each with its explanation kept hidden for
 *  public/js/quiz.js to show once picked. */
function choicesEl(choices: QuizChoice[]): Element {
  return el(
    "div",
    {
      className: ["quiz-choices"],
      role: "group",
      dataI18nAriaLabel: "quiz.choicesAria",
      ariaLabel: t("quiz.choicesAria"),
      // The explanations would spoil the answer in search excerpts.
      dataPagefindIgnore: true,
    },
    choices.map((c, i) =>
      el("button", { type: "button", className: ["quiz-choice"], dataOk: c.ok ? "1" : "0" }, [
        el("span", { className: ["quiz-choice-key"], ariaHidden: "true" }, [txt(String.fromCharCode(65 + i))]),
        el("span", { className: ["quiz-choice-text"] }, c.label),
        ...(c.why.length ? [el("span", { className: ["quiz-why"], hidden: true }, c.why)] : []),
      ]),
    ),
  );
}

function hintsEl(hints: ElementContent[][]): Element {
  return el(
    "div",
    { className: ["quiz-hints"], dataPagefindIgnore: true },
    hints.map((h, i) =>
      el("p", { className: ["quiz-hint"], hidden: true }, [
        hints.length > 1
          ? el(
              "span",
              {
                className: ["quiz-hint-label"],
                dataI18n: "quiz.hintN",
                dataI18nVars: JSON.stringify({ n: i + 1, total: hints.length }),
              },
              [txt(t("quiz.hintN", { n: i + 1, total: hints.length }))],
            )
          : el("span", { className: ["quiz-hint-label"], dataI18n: "quiz.hintLabel" }, [txt(t("quiz.hintLabel"))]),
        txt(" "),
        ...h,
      ]),
    ),
  );
}

/** "Un indice", a link-style button at the end of the card's title row. */
const hintButton = (): Element =>
  el("button", { type: "button", className: ["quiz-hint-btn"], dataI18n: "quiz.hint" }, [txt(t("quiz.hint"))]);

/** Live region for the right / not-quite feedback (public/js/quiz.js). */
const feedbackEl = (): Element =>
  el("div", { className: ["quiz-feedback"], ariaLive: "polite", hidden: true, dataPagefindIgnore: true });

/**
 * `> [!quiz] Question` + answer body → a retrieval-practice card: the question
 * shows, the answer is hidden behind a disclosure button (public/js/quiz.js
 * wires it, plus self-grading and "add to my reviews"). `[!quiz]+` starts
 * revealed; `[!quiz]-` (Obsidian's folded form) is the same as plain `[!quiz]`.
 *
 * A body that opens with a task list is a multiple-choice question: the
 * reader picks an answer (`- [x]` marks the right ones) and each answer can
 * say why on its next line; "Indice : …" paragraphs become hints, shown one
 * at a time. The hidden answer then holds the right choice and the rest of
 * the body, so a review card (/cartes/revision/) still has its answer.
 */
function quizCallout(
  titleNodes: ElementContent[],
  bodyChildren: ElementContent[],
  fold: string,
  icon: Element,
  ph: Map<string, string>,
  seen: Set<string>,
): Element {
  let question = titleNodes;
  let body = bodyChildren;
  // No title: the first body paragraph is the question.
  if (
    !question.length &&
    body[0]?.type === "element" &&
    body[0].tagName === "p"
  ) {
    question = body[0].children;
    body = body.slice(1);
  }
  const id = quizId(question.map((n) => stableText(n, ph)).join(""));
  let domId = `q-${id}`;
  for (let i = 2; seen.has(domId); i++) domId = `q-${id}-${i}`;
  seen.add(domId);
  const { choices: allChoices, hints, rest } = quizParts(body);
  // A list with no `[x]` is not a question with a right answer: plain body.
  const choices = allChoices?.some((c) => c.ok) ? allChoices : null;
  const answer = choices
    ? [
        el("p", { className: ["quiz-right"] }, [
          el("span", { className: ["quiz-right-label"], dataI18n: "quiz.answerIs" }, [txt(t("quiz.answerIs"))]),
          txt(" "),
          ...choices
            .filter((c) => c.ok)
            .flatMap((c, i) => [...(i ? [txt(" · ")] : []), el("strong", {}, structuredClone(c.label))]),
        ]),
        ...choices
          .filter((c) => c.ok && c.why.length)
          .map((c) => el("p", { className: ["quiz-right-why"] }, structuredClone(c.why))),
        ...rest,
      ]
    : allChoices
      ? body.filter((n) => !hintOf(n))
      : rest;
  const open = fold === "+";
  const btnKey = open ? "quiz.hide" : "quiz.reveal";
  return {
    type: "element",
    tagName: "div",
    properties: {
      className: ["callout", "callout-quiz", ...(choices ? ["quiz--choice"] : [])],
      dataCallout: "quiz",
      dataQuizId: id,
      id: domId,
    },
    children: [
      {
        type: "element",
        tagName: "div",
        properties: { className: ["callout-title"], dataPagefindIgnore: "" },
        children: [
          icon,
          {
            type: "element",
            tagName: "span",
            properties: { dataI18n: "quiz.label" },
            children: [{ type: "text", value: t("quiz.label") }],
          },
          ...(hints.length ? [hintButton()] : []),
        ],
      },
      {
        type: "element",
        tagName: "p",
        properties: { className: ["quiz-question"] },
        children: question,
      },
      ...(hints.length ? [hintsEl(hints)] : []),
      ...(choices ? [choicesEl(choices), feedbackEl()] : []),
      {
        type: "element",
        tagName: "div",
        properties: { className: ["quiz-controls"], dataPagefindIgnore: "" },
        children: [
          {
            type: "element",
            tagName: "button",
            properties: {
              type: "button",
              className: ["quiz-reveal"],
              ariaExpanded: open ? "true" : "false",
              ariaControls: `${domId}-a`,
              dataI18n: btnKey,
            },
            children: [{ type: "text", value: t(btnKey) }],
          },
        ],
      },
      {
        type: "element",
        tagName: "div",
        properties: {
          className: ["callout-body", "quiz-answer"],
          id: `${domId}-a`,
          // The answer stays out of the Pagefind index, or the search
          // excerpts would spoil it; the question above stays searchable.
          ...(open ? {} : { hidden: true }),
          dataPagefindIgnore: true,
        },
        children: answer,
      },
    ],
  };
}

/**
 * `> [!predict] Question` (also `[!avis]`): "À ton avis ?" before the
 * explanation. Same choice list as a quiz (`- [x]` optional: a guess can have
 * no single right answer), each answer's line explaining it. The rest of the
 * section (rehypePredictVeil) stays veiled until the reader picks one or asks
 * to read on. Not a review card: nothing is stored.
 */
function predictCallout(
  titleNodes: ElementContent[],
  bodyChildren: ElementContent[],
  icon: Element,
): Element {
  let question = titleNodes;
  let body = bodyChildren;
  if (!question.length && body[0]?.type === "element" && body[0].tagName === "p") {
    question = body[0].children;
    body = body.slice(1);
  }
  const { choices, hints, rest } = quizParts(body);
  return el("div", { className: ["callout", "callout-predict"], dataCallout: "predict" }, [
    el("div", { className: ["callout-title"], dataPagefindIgnore: "" }, [
      icon,
      el("span", { dataI18n: "predict.label" }, [txt(t("predict.label"))]),
      ...(hints.length ? [hintButton()] : []),
      el("button", { type: "button", className: ["predict-skip"], dataI18n: "predict.skip", hidden: true }, [
        txt(t("predict.skip")),
      ]),
    ]),
    el("p", { className: ["quiz-question"] }, question),
    ...(hints.length ? [hintsEl(hints)] : []),
    ...(choices ? [choicesEl(choices), feedbackEl()] : []),
    // Anything else in the callout: shown once the reader has answered.
    ...(rest.some((n) => !isBlank(n))
      ? [el("div", { className: ["callout-body", "predict-after"], dataPredictAfter: "" }, rest)]
      : []),
  ]);
}

/**
 * The rest of the section after a `[!predict]` callout — up to the next
 * heading of any level, or the next predict — wrapped in one
 * `.predict-rest`, which public/js/quiz.js veils until the reader answers.
 * Without JavaScript nothing is veiled.
 */
function rehypePredictVeil() {
  return (tree: Root) => {
    const walk = (parent: Root | Element) => {
      const kids = parent.children as ElementContent[];
      for (let i = 0; i < kids.length; i++) {
        const n = kids[i];
        if (!hasClass(n, "callout-predict")) continue;
        let j = i + 1;
        while (
          j < kids.length &&
          !(kids[j].type === "element" && /^h[1-6]$/.test((kids[j] as Element).tagName)) &&
          !hasClass(kids[j], "callout-predict")
        )
          j++;
        const slice = kids.slice(i + 1, j);
        if (slice.some((c) => !isBlank(c))) {
          kids.splice(i + 1, j - i - 1, el("div", { className: ["predict-rest"], dataPredictRest: "" }, slice));
        }
      }
    };
    walk(tree);
  };
}

/** Render Obsidian callouts (`> [!type] Title`) as styled `<div class="callout">`. */
function rehypeCallouts(ph: Map<string, string> = new Map()) {
  return (tree: Root) => {
    const seenQuiz = new Set<string>();
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "blockquote" || !parent || index == null) return;
      const firstP = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "p",
      );
      const firstText = firstP?.children[0];
      if (!firstP || !firstText || firstText.type !== "text") return;
      const m = firstText.value.match(/^\[!([\w-]+)\]([+-]?)[ \t]*/);
      if (!m) return;

      const type = m[1].toLowerCase();
      const fold = m[2];
      const canon = CALLOUT_ALIAS[type] ?? "note";
      firstText.value = firstText.value.slice(m[0].length);

      const [titleNodes, inlineRest] = splitAtBreak(firstP.children);
      const hasTitle = titleNodes.some(
        (n) => !(n.type === "text" && n.value.trim() === ""),
      );

      const iconFrag = fromHtml(CALLOUT_ICON[canon] ?? CALLOUT_ICON.note, {
        fragment: true,
      });
      const icon: Element = {
        type: "element",
        tagName: "span",
        properties: { className: ["callout-icon"] },
        children: iconFrag.children as ElementContent[],
      };
      const titleEl: Element = {
        type: "element",
        tagName: fold ? "summary" : "div",
        properties: { className: ["callout-title"] },
        children: [
          icon,
          {
            type: "element",
            tagName: "span",
            properties: {},
            children: hasTitle
              ? titleNodes
              : [{ type: "text", value: CALLOUT_LABEL[canon] ?? cap(type) }],
          },
        ],
      };

      // Body = the rest of the blockquote; the title line's trailing inline
      // content (no blank line before it) becomes the body's first paragraph.
      const rest = node.children.filter((c) => c !== firstP);
      const bodyChildren: ElementContent[] = inlineRest.length
        ? [
            {
              type: "element",
              tagName: "p",
              properties: {},
              children: inlineRest,
            },
            ...rest,
          ]
        : rest;
      const body: Element = {
        type: "element",
        tagName: "div",
        properties: { className: ["callout-body"] },
        children: bodyChildren,
      };

      if (canon === "predict") {
        parent.children[index] = predictCallout(hasTitle ? titleNodes : [], bodyChildren, icon);
        return SKIP;
      }
      if (canon === "quiz") {
        parent.children[index] = quizCallout(
          hasTitle ? titleNodes : [],
          bodyChildren,
          fold,
          icon,
          ph,
          seenQuiz,
        );
        return SKIP;
      }

      // A definition that names its term ("Définition — Matrice de passage")
      // gets an anchor, so glossary marks in other notes can link to it.
      const titleText = titleNodes.map((n) => stableText(n, ph)).join("");
      const term = hasTitle ? definitionTerm(type, titleText) : null;
      const isDef = isDefinitionTitle(type, hasTitle ? titleText : "");

      const inner: ElementContent[] = fold
        ? [
            {
              type: "element",
              tagName: "details",
              properties: fold === "+" ? { open: true } : {},
              children: [titleEl, body],
            },
          ]
        : [titleEl, body];

      parent.children[index] = {
        type: "element",
        tagName: "div",
        properties: {
          className: ["callout", `callout-${canon}`],
          dataCallout: type,
          ...(term ? { id: definitionAnchor(term) } : {}),
          ...(isDef ? { dataDefinition: "" } : {}),
        },
        children: inner,
      };
      return SKIP;
    });
  };
}

/** Pull explicit `{#id}` ids out of heading text (Hugo/goldmark syntax). */
function rehypeHeadingIds() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (!/^h[1-6]$/.test(node.tagName)) return;
      const last = node.children[node.children.length - 1];
      if (last && last.type === "text") {
        const m = last.value.match(/\s*\{#([^}]+)\}\s*$/);
        if (m) {
          node.properties = node.properties ?? {};
          node.properties.id = m[1];
          last.value = last.value.slice(0, m.index).trimEnd();
        }
      }
    });
  };
}

// Speaker icon shared by every `.pron` player (see rehypeVaultAssets below).
// The two outer arcs carry `.pron-wave` so main.css can pulse them while
// `data-state="playing"` without needing a second icon swapped in by JS.
const PRON_ICON_SVG =
  '<svg class="pron-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
  '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M4 9v6h4l5 4V5L8 9H4z"/>' +
  '<path class="pron-wave" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M15.5 8.5a5 5 0 0 1 0 7"/>' +
  '<path class="pron-wave" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M18.2 5.8a9 9 0 0 1 0 12.4"/>' +
  "</svg>";

function pronIcon(): ElementContent {
  return fromHtml(PRON_ICON_SVG, { fragment: true }).children[0] as Element;
}

/** Build the `.pron` pronunciation-player markup replacing `![word](clip.mp3)`.
 * Hydrated client-side by /js/pronounce.js (idle → loading → playing/error). */
function pronPlayer(src: string, alt: string, id: number): Element {
  const labelId = alt ? `pron-label-${id}` : undefined;
  const button: Element = {
    type: "element",
    tagName: "button",
    properties: {
      type: "button",
      className: ["pron-btn"],
      dataState: "idle",
      dataPronSrc: src,
      ariaLabel: t("pronunciation.playAria"),
      dataI18nAriaLabel: "pronunciation.playAria",
      ...(labelId ? { ariaDescribedby: labelId } : {}),
    },
    children: [pronIcon()],
  };
  const children: ElementContent[] = [button];
  if (alt) {
    children.push({
      type: "element",
      tagName: "span",
      properties: { className: ["pron-label"], id: labelId },
      children: [{ type: "text", value: alt }],
    });
  }
  return {
    type: "element",
    tagName: "span",
    properties: { className: ["pron"] },
    children,
  };
}

/** Point relative note assets (images, PDFs…) at the served copies in
 * public/vault; leave remote/absolute references untouched. Also upgrades
 * `<img>` whose src ends in a video extension to a `<video>` element so
 * `![clip](demo.mp4)` works the way authors expect, and one ending in an
 * audio extension to the `.pron` pronunciation player so `![bonjour](fr.mp3)`
 * plays inline instead of showing a broken image. */
function rehypeVaultAssets(dir: string) {
  let pronId = 0;
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName === "img") {
        const src = node.properties?.src;
        if (typeof src !== "string") return;
        node.properties = node.properties ?? {};
        node.properties.loading = "lazy";
        node.properties.decoding = "async";
        let finalSrc = src;
        if (!/^(https?:|data:)/i.test(src)) {
          const resolved = resolveVaultAsset(src, dir);
          if (resolved) {
            finalSrc = resolved;
            node.properties.src = resolved;
          }
        }
        if (isAudioSrc(finalSrc) && parent && index != null) {
          const alt =
            typeof node.properties.alt === "string"
              ? node.properties.alt.trim()
              : "";
          const player = pronPlayer(finalSrc, alt, ++pronId);
          const siblings = parent.children as unknown as Array<
            RootContent | ElementContent
          >;
          siblings.splice(index, 1, player);
          return SKIP;
        }
        // Responsive variants, when build-image-variants.mjs made some. The
        // intrinsic width/height matter as much as the srcset: without them
        // the browser cannot reserve the image's box and every picture shifts
        // the page as it lands.
        const meta = getVaultImage(finalSrc);
        if (meta && parent && index != null && !isVideoSrc(finalSrc)) {
          // `![[photo.png|300]]` already set a width the author asked for —
          // keep it and derive the height from the real aspect ratio, so the
          // box is still reserved without overriding their intent.
          const asked = Number(node.properties.width);
          if (Number.isFinite(asked) && asked > 0) {
            node.properties.height = Math.round((asked * meta.h) / meta.w);
          } else {
            node.properties.width = meta.w;
            node.properties.height = meta.h;
          }
          if (meta.avif.length || meta.webp.length) {
            const sources: ElementContent[] = [];
            for (const [type, list] of [
              ["image/avif", meta.avif],
              ["image/webp", meta.webp],
            ] as const) {
              if (!list.length) continue;
              sources.push({
                type: "element",
                tagName: "source",
                properties: {
                  type,
                  srcSet: list.map(([w, url]) => `${url} ${w}w`).join(", "),
                  // Figures are capped at the text column; below that the
                  // image fills the viewport minus the page gutter.
                  sizes: "(max-width: 40rem) 100vw, 40rem",
                },
                children: [],
              });
            }
            const picture: Element = {
              type: "element",
              tagName: "picture",
              properties: {},
              children: [...sources, { ...node }],
            };
            const siblings = parent.children as unknown as Array<
              RootContent | ElementContent
            >;
            siblings.splice(index, 1, picture);
            return SKIP;
          }
        }
        // Promote video files to a real <video> element. The HTML spec doesn't
        // let <img> render mp4/webm, so a literal Markdown image link to a
        // video would otherwise show a broken-image icon.
        if (isVideoSrc(finalSrc)) {
          const alt =
            typeof node.properties.alt === "string" ? node.properties.alt : "";
          node.tagName = "video";
          node.properties = {
            src: finalSrc,
            controls: true,
            loop: true,
            muted: true,
            playsInline: true,
            preload: "metadata",
            ...(alt ? { "aria-label": alt } : {}),
          };
          node.children = [];
        }
      } else if (node.tagName === "a") {
        const href = node.properties?.href;
        if (typeof href !== "string") return;
        // Skip external, absolute (/…, incl. wikilink output), anchors, mailto.
        if (/^(https?:|mailto:|tel:|#|\/)/i.test(href)) return;
        const resolved = resolveVaultAsset(href, dir);
        if (resolved) node.properties.href = resolved;
      }
    });
  };
}

// ---------------------------------------------------------------------------
// Figures — a paragraph whose sole content is an image (or a clip promoted to
// <video> above) becomes a real <figure> with a caption, instead of an <img>
// loose inside a <p> with no visual treatment of its own.
//
// Only *standalone* media is promoted: an image sitting in a sentence stays
// inline, where a block-level figure would break the prose. The class is
// deliberately specific — plain `figcaption` is styled as a Tufte margin note
// (shared with .side), and .manim-figure / .mermaid-diagram / .fullwidth have
// their own treatments; none of them should inherit this one.
// ---------------------------------------------------------------------------

/** Is this node whitespace-only text (so it doesn't count as "content")? */
function isBlank(node: ElementContent): boolean {
  return node.type === "text" && node.value.trim() === "";
}

function rehypeFigures() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "p" || !parent || index == null) return;
      // Never inside a margin note or an existing figure: both already give
      // their content a layout, and nesting <figure> is invalid anyway.
      if (parent.type === "element") {
        const p = parent as Element;
        const cls = (p.properties?.className as string[] | undefined) ?? [];
        if (p.tagName === "figure" || cls.includes("side")) return;
      }
      const content = node.children.filter((c) => !isBlank(c));
      if (content.length !== 1 && content.length !== 2) return;
      const media = content[0];
      if (media.type !== "element") return;
      if (!["img", "video", "picture"].includes(media.tagName)) return;

      // The vault's older, hand-written way of captioning an image: the
      // image line followed with NO blank line by `*a caption*` — markdown
      // reads that as one paragraph (a soft line break), not two, since a
      // blank line is what actually separates paragraphs. Recognise it
      // explicitly instead of requiring every existing note to be rewritten
      // for the figure treatment below. The italic run's own children (not
      // just its text) become the figcaption, so an inline link or bold
      // inside the caption survives; it wins over alt/title unconditionally
      // since it's what the author actually wrote to be read, not a fallback.
      let figcaptionChildren: ElementContent[] | null = null;
      if (content.length === 2) {
        const second = content[1];
        if (second.type !== "element" || second.tagName !== "em") return;
        figcaptionChildren = second.children as ElementContent[];
      }

      // Caption: the author's `title` first (written to be read), falling back
      // to `alt` (written for screen readers, but better than nothing).
      // A <picture> carries nothing itself; its <img> holds alt and title.
      const captioned =
        media.tagName === "picture"
          ? ((media.children.find(
              (c): c is Element => c.type === "element" && c.tagName === "img",
            ) ?? media) as Element)
          : media;
      const props = captioned.properties ?? {};
      const title = typeof props.title === "string" ? props.title.trim() : "";
      const alt = typeof props.alt === "string" ? props.alt.trim() : "";
      // A promoted <video> carries its text as aria-label; rehypeVaultAssets
      // sets the literal hyphenated key, hast's own camelCase form is what a
      // hand-written `<video aria-label>` in a note parses to. Accept both.
      const ariaRaw = props["aria-label"] ?? props.ariaLabel;
      const ariaLabel = typeof ariaRaw === "string" ? ariaRaw.trim() : "";
      // An alt that is only the embedded file's name is not a caption. hast
      // normalises the data-* marker to its camelCase property name, so drop
      // both spellings rather than betting on which one survived.
      const altIsFilename =
        props.dataAltIsFilename !== undefined ||
        props["data-alt-is-filename"] !== undefined;
      delete props.dataAltIsFilename;
      delete props["data-alt-is-filename"];
      if (!figcaptionChildren) {
        const caption = title || (altIsFilename ? "" : alt) || ariaLabel;
        if (caption) figcaptionChildren = [{ type: "text", value: caption }];
      }
      // A title that is also the caption would be shown twice (once as the
      // browser's tooltip); the caption is the visible one.
      if (title) delete props.title;

      const children: ElementContent[] = [media];
      if (figcaptionChildren) {
        children.push({
          type: "element",
          tagName: "figcaption",
          properties: {},
          children: figcaptionChildren,
        });
      }
      const figure: Element = {
        type: "element",
        tagName: "figure",
        properties: { className: ["note-figure"] },
        children,
      };
      (parent.children as ElementContent[]).splice(index, 1, figure);
      return SKIP;
    });
  };
}

// ---------------------------------------------------------------------------
// YouTube — a paragraph whose sole content is a YouTube link becomes a
// privacy-friendly facade (#16): the video thumbnail + a play button styled
// like the rest of the site. public/js/youtube.js swaps in a youtube-nocookie
// iframe only once the reader clicks, so no Google frame (or cookie) loads up
// front; the CSP allows youtube-nocookie.com in frame-src (lib/site.ts).
// ---------------------------------------------------------------------------

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

function youtubeId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
  let id = "";
  if (host === "youtu.be") {
    id = u.pathname.slice(1).split("/")[0];
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v") ?? "";
    else if (u.pathname.startsWith("/embed/"))
      id = u.pathname.slice(7).split("/")[0];
    else if (u.pathname.startsWith("/shorts/"))
      id = u.pathname.slice(8).split("/")[0];
    else if (u.pathname.startsWith("/live/"))
      id = u.pathname.slice(6).split("/")[0];
  }
  return YT_ID.test(id) ? id : null;
}

function youtubeFacadeHtml(id: string): string {
  // id is validated against YT_ID (word chars only), so it is safe to inline.
  const watch = t("youtube.watch");
  const play = t("youtube.play");
  return (
    `<div class="yt-embed" data-yt-id="${id}">` +
    `<button class="yt-embed-btn" type="button" aria-label="${play}" data-i18n-aria-label="youtube.play">` +
    `<img class="yt-embed-thumb" src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy" width="480" height="360">` +
    `<span class="yt-embed-play" aria-hidden="true">` +
    `<svg viewBox="0 0 68 48" width="68" height="48"><path class="yt-embed-play-bg" d="M66.5 7.5a8 8 0 0 0-5.6-5.7C56 .5 34 .5 34 .5s-22 0-26.9 1.3A8 8 0 0 0 1.5 7.5 83 83 0 0 0 .2 24a83 83 0 0 0 1.3 16.5 8 8 0 0 0 5.6 5.7C12 47.5 34 47.5 34 47.5s22 0 26.9-1.3a8 8 0 0 0 5.6-5.7A83 83 0 0 0 67.8 24a83 83 0 0 0-1.3-16.5z"></path><path d="M27 34l18-10-18-10z" fill="#fff"></path></svg>` +
    `</span></button>` +
    `<a class="yt-embed-link" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener noreferrer" data-i18n="youtube.watch">${watch}</a>` +
    `</div>`
  );
}

function rehypeYouTube() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "p" || !parent || index == null) return;
      const kids = node.children.filter(
        (c) => !(c.type === "text" && !c.value.trim()),
      );
      if (kids.length !== 1) return;
      const a = kids[0];
      if (a.type !== "element" || a.tagName !== "a") return;
      const href = a.properties?.href;
      if (typeof href !== "string") return;
      const id = youtubeId(href);
      if (!id) return;
      const frag = fromHtml(youtubeFacadeHtml(id), { fragment: true });
      parent.children.splice(index, 1, ...(frag.children as ElementContent[]));
      return [SKIP, index];
    });
  };
}

// ---------------------------------------------------------------------------
// Manim — convert ```manim``` fenced blocks into <figure> with a cached video
// and a collapsible Python source. The cache file is looked up by SHA-256 of
// the trimmed source (first 16 hex chars), matching the algorithm used by the
// companion `obsidian-manim-renderer` plugin. When no cached render exists
// the block falls back to a plain Python code block with a small notice.
// ---------------------------------------------------------------------------

function manimHash(code: string): string {
  return createHash("sha256")
    .update(code.trim(), "utf-8")
    .digest("hex")
    .slice(0, 16);
}

function findManimCacheUrl(hash: string, dir: string): string | null {
  // Try mp4 first, then gif, then png (single-frame renders from `frame=last`
  // or `format=png`), then webm. We resolve through the same vault-asset
  // pipeline so the URL matches what `copy-vault-images.mjs` emits.
  for (const ext of ["mp4", "gif", "png", "webm"]) {
    const url = resolveVaultAsset(`_manim/${hash}.${ext}`, dir);
    if (url) return url;
  }
  return null;
}

/** True for image-like outputs that should be rendered as <img>, not <video>. */
function isStaticManimUrl(url: string): boolean {
  const u = url.toLowerCase().split(/[?#]/)[0];
  return u.endsWith(".gif") || u.endsWith(".png");
}

function rehypeManim(dir: string) {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, _index, parent) => {
      if (node.tagName !== "pre" || !parent) return;
      const code = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "code",
      );
      if (!code) return;
      const classes =
        (code.properties?.className as string[] | undefined) ?? [];
      const isManim = classes.some(
        (c) => typeof c === "string" && c === "language-manim",
      );
      if (!isManim) return;

      const source = hastText(code).replace(/\n$/, "");
      const hash = manimHash(source);
      const videoUrl = findManimCacheUrl(hash, dir);

      // Re-mark the inner <code> as Python so rehypeShiki highlights it.
      code.properties = code.properties ?? {};
      code.properties.className = ["language-python"];

      const summaryText = videoUrl
        ? `Source · ${hash}`
        : `Source · ${hash} · (no cached render)`;
      const sourceDetails: Element = {
        type: "element",
        tagName: "details",
        properties: { className: ["manim-source"] },
        children: [
          {
            type: "element",
            tagName: "summary",
            properties: {},
            children: [{ type: "text", value: summaryText }],
          },
          // Keep the original <pre><code> so shiki picks it up later.
          { ...node },
        ],
      };

      const figureChildren: ElementContent[] = [];

      if (videoUrl) {
        const isStatic = isStaticManimUrl(videoUrl);
        figureChildren.push(
          isStatic
            ? {
                type: "element",
                tagName: "img",
                properties: {
                  src: videoUrl,
                  alt: "Manim render",
                  loading: "lazy",
                  decoding: "async",
                  className: ["manim-output"],
                },
                children: [],
              }
            : {
                type: "element",
                tagName: "video",
                properties: {
                  src: videoUrl,
                  controls: true,
                  loop: true,
                  muted: true,
                  playsInline: true,
                  preload: "metadata",
                  className: ["manim-output"],
                },
                children: [],
              },
        );
      } else {
        figureChildren.push({
          type: "element",
          tagName: "p",
          properties: { className: ["manim-missing"] },
          children: [
            {
              type: "text",
              value:
                "No cached render — open this note in Obsidian with the Manim plugin enabled and click ▶ to generate it.",
            },
          ],
        });
      }

      figureChildren.push(sourceDetails);

      const figure: Element = {
        type: "element",
        tagName: "figure",
        properties: {
          className: ["manim-figure"],
          dataManimHash: hash,
        },
        children: figureChildren,
      };

      // Replace the <pre> in its parent with the <figure>. `parent.children`
      // may be RootContent[] or ElementContent[] depending on context; the
      // figure is a valid member of both so the cast is sound.
      const siblings = parent.children as unknown as Array<
        RootContent | ElementContent
      >;
      const i = siblings.indexOf(node as unknown as RootContent);
      if (i !== -1) siblings.splice(i, 1, figure);
      return SKIP;
    });
  };
}

/** Widgets the site knows how to mount; anything else stays a code block. */
const WIDGETS = new Set([
  "ieee754",
  "complement2",
  "cache-locality",
  "subnet",
  "hash-avalanche",
  "encodage",
  "boutisme",
  "regex",
  "seuil",
  "complexite",
  "table-verite",
  "cadre-pile",
  "pipeline",
  "intervalle",
  "echiquier",
  "trapeze-vocalique",
  "punnett",
  "matrice-2d",
  "logistique",
  "theorie-jeux",
  "harmonie-vocalique",
  "ton",
  "racine-arabe",
  "abugida",
  "ordre-des-mots",
  "depistage",
  "pharmacocinetique",
  "cadrage",
  "tcl",
]);

/** Text shown before hydration and to readers without JavaScript. */
const WIDGET_FALLBACK: Record<string, string> = {
  ieee754: "Décomposition IEEE 754 d'un nombre flottant (nécessite JavaScript).",
  complement2: "Représentation en complément à deux (nécessite JavaScript).",
  "cache-locality":
    "Parcours d'un tableau et défauts de cache (nécessite JavaScript).",
  subnet: "Découpage d'une adresse IPv4 en réseau et hôte (nécessite JavaScript).",
  "hash-avalanche":
    "Effet d'avalanche d'une fonction de hachage (nécessite JavaScript).",
  encodage:
    "Un même texte dans ses différents encodages (nécessite JavaScript).",
  boutisme: "Disposition d'une valeur en mémoire (nécessite JavaScript).",
  regex: "Test d'une expression régulière (nécessite JavaScript).",
  seuil:
    "Seuil de décision, précision et rappel d'un classifieur (nécessite JavaScript).",
  complexite:
    "Croissance comparée des classes de complexité (nécessite JavaScript).",
  "table-verite": "Table de vérité d'une expression booléenne (nécessite JavaScript).",
  "cadre-pile": "Cadre de pile au fil d'un appel de fonction (nécessite JavaScript).",
  pipeline: "Pipeline d'instructions et aléas de données (nécessite JavaScript).",
  intervalle:
    "Comparaison audible entre gamme juste et tempérament égal (nécessite JavaScript).",
  echiquier: "Position d'échecs déroulée coup par coup (nécessite JavaScript).",
  "trapeze-vocalique":
    "Trapèze vocalique et traits articulatoires (nécessite JavaScript).",
  punnett: "Échiquier de Punnett d'un croisement (nécessite JavaScript).",
  "matrice-2d":
    "Une matrice 2×2 comme transformation du plan (nécessite JavaScript).",
  logistique: "Suite logistique et diagramme de bifurcation (nécessite JavaScript).",
  "theorie-jeux": "Matrice de gains et équilibres de Nash (nécessite JavaScript).",
  "harmonie-vocalique":
    "Harmonie vocalique turque appliquée aux suffixes (nécessite JavaScript).",
  ton: "Contours de hauteur et sandhi tonal (nécessite JavaScript).",
  "racine-arabe":
    "Famille de mots dérivés d'une racine trilitère (nécessite JavaScript).",
  abugida:
    "Composition d'une syllabe devanagari, consonne et signe vocalique (nécessite JavaScript).",
  "ordre-des-mots":
    "Ordre des constituants selon la langue (nécessite JavaScript).",
  depistage:
    "Valeur prédictive d'un test selon la prévalence (nécessite JavaScript).",
  pharmacocinetique:
    "Concentration plasmatique au fil des prises (nécessite JavaScript).",
  cadrage: "Mise en évidence de l'effet de cadrage (nécessite JavaScript).",
  tcl: "Théorème central limite, distribution des moyennes (nécessite JavaScript).",
};

/** Parses the `key: value` body of a widget block into a flat record. */
function widgetProps(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of source.split("\n")) {
    const m = /^\s*([A-Za-z][\w-]*)\s*:\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/**
 * ```widget:<name> blocks become a mount point that public/js/widgets.js
 * hydrates. The source stays ordinary fenced markdown so the vault keeps
 * working on its own: Obsidian shows a readable code block, and a reader
 * without JavaScript gets the fallback line rather than a hole in the page.
 *
 * Same shape as rehypeManim — recognise the language class, replace the <pre>.
 * An unknown widget name is left alone on purpose, so a typo shows up as a
 * visible code block instead of silently rendering nothing.
 */
function rehypeWidgets(dir: string) {
  return async (tree: Root) => {
    const jobs: Promise<void>[] = [];
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "pre" || !parent || index == null) return;
      const code = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "code",
      );
      if (!code) return;
      const classes =
        (code.properties?.className as string[] | undefined) ?? [];
      const cls = classes.find(
        (c) => typeof c === "string" && c.startsWith("language-widget:"),
      );
      if (!cls) return;
      const name = cls.slice("language-widget:".length);
      const extra = EXTRA_WIDGETS[name];
      if (!WIDGETS.has(name) && !extra) return;

      const props = widgetProps(hastText(code));
      const figure: Element = {
        type: "element",
        tagName: "figure",
        properties: {
          className: ["widget"],
          "data-widget": name,
          // Which pack bundle the loader fetches; absent for the original
          // library. Read by public/js/widgets-loader.js so that the note
          // bundle every page downloads needn't carry the widget registry.
          "data-pack": extra?.pack,
          "data-props": JSON.stringify(props),
          "data-pagefind-ignore": true,
        },
        children: [
          {
            type: "element",
            tagName: "p",
            properties: { className: ["widget-fallback"] },
            children: [
              {
                type: "text",
                value: WIDGET_FALLBACK[name] ?? extra?.fallback ?? "Widget.",
              },
            ],
          },
        ],
      };
      parent.children[index] = figure;
      // Data widgets (lib/widget-data.ts) get their numbers now, at build:
      // OWID / Wikidata from the on-disk cache or the network, the Insee and
      // Lichess snapshots from lib/data/. The no-JS fallback becomes a table
      // of the same numbers when there is one.
      // Two language widgets read the vault too: minimal pairs resolve their
      // note-relative clips, the language tree lists the language folders.
      if (extra) {
        jobs.push(
          enrichWidget(name, props, { dir }).then((d) => {
            if (!d) return;
            figure.properties["data-props"] = JSON.stringify(d.props);
            if (d.error) {
              figure.children = [
                {
                  type: "element",
                  tagName: "p",
                  properties: { className: ["widget-fallback"] },
                  children: [{ type: "text", value: d.error }],
                },
              ];
              figure.properties["data-error"] = "";
            } else if (d.table) {
              figure.children.push(fallbackTable(d.table));
            }
          }),
        );
      }
    });
    await Promise.all(jobs);
  };
}

/**
 * ```iso:<name>``` → an isometric figure (figures/<name>/, built into
 * public/figures/ by scripts/build-figures.mjs before `next build`).
 *
 * The plate (card, SVG, legend, caption) is inlined here, so the drawing is in
 * the page from the first paint and reads without JavaScript; the note bundle
 * (public/js/iso-figures.js) then imports /figures/<name>.js to make it move.
 * The kit's stylesheet is linked once, just before the first figure of the
 * note. A name with no built plate keeps a one-line fallback, like a widget.
 */
const ISO_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const isoPlates = new Map<string, string | null>();
function isoPlate(name: string): string | null {
  if (!isoPlates.has(name)) {
    let html: string | null = null;
    try {
      html = readFileSync(join(process.cwd(), "public", "figures", `${name}.html`), "utf8");
    } catch {
      html = null;
    }
    isoPlates.set(name, html);
  }
  return isoPlates.get(name) ?? null;
}

function rehypeIsoFigures() {
  return (tree: Root) => {
    let linked = false;
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "pre" || !parent || index == null) return;
      const code = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "code",
      );
      if (!code) return;
      const classes = (code.properties?.className as string[] | undefined) ?? [];
      const cls = classes.find((c) => typeof c === "string" && c.startsWith("language-iso:"));
      if (!cls) return;
      const name = cls.slice("language-iso:".length);
      const plate = ISO_NAME.test(name) ? isoPlate(name) : null;
      const children: ElementContent[] = [];
      if (plate && !linked) {
        children.push({
          type: "element",
          tagName: "link",
          properties: { rel: ["stylesheet"], href: "/figures/iso.css" },
          children: [],
        });
        linked = true;
      }
      if (plate) {
        children.push(...(fromHtml(plate, { fragment: true }).children as ElementContent[]));
      } else {
        children.push({
          type: "element",
          tagName: "p",
          properties: { className: ["widget-fallback"] },
          children: [{ type: "text", value: "Figure interactive indisponible." }],
        });
      }
      parent.children[index] = {
        type: "element",
        tagName: "div",
        properties: {
          className: ["iso", "iso-mount"],
          "data-iso": plate ? name : undefined,
          // The light plate ships; iso-figures.js follows the site's theme.
          "data-theme": "light",
          "data-pagefind-ignore": true,
        },
        children,
      };
      return SKIP;
    });
  };
}

/** A plain <table> of a data widget's numbers, for readers without JS. */
function fallbackTable(rows: string[][]): Element {
  const cell = (tag: "th" | "td", v: string): Element => ({
    type: "element",
    tagName: tag,
    properties: {},
    children: [{ type: "text", value: v }],
  });
  return {
    type: "element",
    tagName: "table",
    properties: { className: ["widget-fallback-table"] },
    children: [
      {
        type: "element",
        tagName: "thead",
        properties: {},
        children: [
          {
            type: "element",
            tagName: "tr",
            properties: {},
            children: rows[0].map((v) => cell("th", v)),
          },
        ],
      },
      {
        type: "element",
        tagName: "tbody",
        properties: {},
        children: rows.slice(1).map((r) => ({
          type: "element",
          tagName: "tr",
          properties: {},
          children: r.map((v, i) => cell(i ? "td" : "th", v)),
        })),
      },
    ],
  };
}

/**
 * Inline `prix: 300 francs 1950` code spans (lib/prix.ts) become the amount as
 * written, underlined, with its worth in today's euros worked out here at
 * build. public/js/widgets-data.js turns it into a button with a popover; the
 * title attribute carries the answer for readers without JavaScript.
 */
function rehypePrix() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "code" || !parent || index == null) return;
      if ((parent as Element).tagName === "pre") return;
      const p = parsePrix(hastText(node));
      if (!p) return;
      const eur = toEuros(p.amount, p.unit, p.year);
      parent.children[index] = {
        type: "element",
        tagName: "span",
        properties: {
          className: ["prix"],
          "data-eur": formatEuros(eur),
          "data-year": String(p.year),
          "data-unit": p.unit,
          "data-to": String(IPC_LAST),
          title: `≈ ${formatEuros(eur)} de ${IPC_LAST} (pouvoir d'achat, Insee)`,
        },
        children: [{ type: "text", value: p.label }],
      };
    });
  };
}

const isBackref = (n: ElementContent) =>
  n.type === "element" && n.properties?.dataFootnoteBackref !== undefined;

function unwrapParagraphs(nodes: ElementContent[]): ElementContent[] {
  const out: ElementContent[] = [];
  for (const n of nodes) {
    if (n.type === "element" && n.tagName === "p") {
      out.push(...n.children.filter((c) => !isBackref(c)));
    } else if (!isBackref(n)) {
      out.push(n);
    }
  }
  return out;
}

/**
 * Convert GFM footnotes into Tufte-style margin notes, mirroring
 * layouts/partials/processed-content.html: each reference becomes
 *   <sup>N</sup><span class="side" data-nosnippet><sup>N</sup>…content…</span>
 * and the footnotes section at the bottom is removed.
 */
function rehypeSidenotes() {
  return (tree: Root) => {
    const defs = new Map<string, ElementContent[]>();

    // 1. Collect and remove the footnotes section.
    visit(tree, "element", (node: Element, index, parent) => {
      const isSection =
        node.tagName === "section" &&
        (node.properties?.dataFootnotes !== undefined ||
          (Array.isArray(node.properties?.className) &&
            (node.properties.className as string[]).includes("footnotes")));
      if (!isSection || !parent || index == null) return;
      visit(node, "element", (li: Element) => {
        const id = li.tagName === "li" ? li.properties?.id : undefined;
        if (typeof id === "string") {
          defs.set(id, unwrapParagraphs(li.children as ElementContent[]));
        }
      });
      parent.children.splice(index, 1);
      return [SKIP, index];
    });

    // 2. Replace each reference with the inline number + margin note.
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "sup" || !parent || index == null) return;
      const a = node.children.find(
        (c): c is Element =>
          c.type === "element" && c.properties?.dataFootnoteRef !== undefined,
      );
      if (!a) return;
      const num = hastText(a);
      const href = String(a.properties?.href ?? "");
      const content = defs.get(href.replace(/^#/, "")) ?? [];

      const numSup: Element = {
        type: "element",
        tagName: "sup",
        properties: {},
        children: [{ type: "text", value: num }],
      };
      const side: Element = {
        type: "element",
        tagName: "span",
        properties: { className: ["side"], dataNosnippet: "" },
        children: [
          {
            type: "element",
            tagName: "sup",
            properties: {},
            children: [{ type: "text", value: num }],
          },
          ...content,
        ],
      };
      parent.children.splice(index, 1, numSup, side);
      return [SKIP, index + 2];
    });
  };
}

/**
 * Convert Obsidian wikilinks to real links, operating on mdast text nodes only
 * so that `[[ … ]]` inside (bash) code blocks is left untouched. Unresolved
 * targets are left as literal text.
 *
 * A leading `!` is Obsidian's embed marker. When the target resolves to a vault
 * asset, `![[photo.png]]` becomes a real image node — it used to emit a link
 * with the bang left behind as literal text, so an embedded image rendered as
 * "!photo.png" in the prose. (lib/seo.ts already treated `![[file.png]]` as an
 * image when picking a note's OG image, so the two halves disagreed.)
 * Note *transclusion* — `![[Some Note]]` pulling in another note's body — is
 * not implemented; that target still becomes a plain link, just without the
 * stray bang.
 */
function splitWikiLinks(value: string): unknown[] | null {
  // The optional `!` is captured so an embed can be told from a plain link.
  const re = /(!?)\[\[([^[\]\n]+?)\]\]/g;
  const out: unknown[] = [];
  let last = 0;
  let found = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    const embed = m[1] === "!";
    const inner = m[2];
    const pipe = inner.indexOf("|");
    const alias = pipe >= 0 ? inner.slice(pipe + 1).trim() : null;
    const beforePipe = pipe >= 0 ? inner.slice(0, pipe) : inner;
    const hash = beforePipe.indexOf("#");
    const target = (hash >= 0 ? beforePipe.slice(0, hash) : beforePipe).trim();
    const url = resolveWikiLink(target);
    if (!url) continue;
    found = true;
    if (m.index > last)
      out.push({ type: "text", value: value.slice(last, m.index) });
    const display = (alias ?? target.split("/").pop() ?? target).trim();
    // Only an asset can be embedded: resolveWikiLink sends notes to /posts/.
    if (embed && url.startsWith("/vault/")) {
      // `![[photo.png|300]]` is Obsidian's width syntax, not a caption.
      const width = alias && /^\d+$/.test(alias) ? alias : null;
      // With no alias (or a numeric one, which is a width) the only text we
      // have is the file name: fine as an alt fallback, not a caption. The
      // marker tells rehypeFigures not to print it; it is stripped there.
      const named = Boolean(alias) && !width;
      out.push({
        type: "image",
        url,
        alt: named ? display : target.split("/").pop(),
        data: {
          hProperties: {
            ...(width ? { width } : {}),
            ...(named ? {} : { "data-alt-is-filename": "" }),
          },
        },
      });
    } else {
      out.push({
        type: "link",
        url,
        children: [{ type: "text", value: display }],
      });
    }
    last = re.lastIndex;
  }
  if (!found) return null;
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

function remarkWikiLinks() {
  return (tree: Root) => {
    visit(tree as any, "text", (node: any, index, parent: any) => {
      if (parent == null || index == null || !node.value.includes("[[")) return;
      const replaced = splitWikiLinks(node.value);
      if (!replaced) return;
      parent.children.splice(index, 1, ...replaced);
      return index + replaced.length;
    });
  };
}

/** Point relative `[text](Other note.md)` links at the note's page; left as
 *  written they would 404, since only the vault's assets are copied. */
function remarkRelativeNoteLinks(dir: string) {
  return (tree: Root) => {
    visit(tree as any, "link", (node: any) => {
      const url = resolveRelativeNoteLink(dir, node.url ?? "");
      if (url) node.url = url;
    });
  };
}

// ---------------------------------------------------------------------------
// Processors
// ---------------------------------------------------------------------------

export interface Rendered {
  html: string;
  plain: string;
  /** Whether any math was rendered (so the page can load the KaTeX stylesheet). */
  hasMath: boolean;
  /** A `[!quiz]` card (quizCallout): the page loads /js/quiz.bundle.js. */
  hasQuiz: boolean;
  /** A glossary mark (lib/glossary.ts): the page loads /js/glossary.bundle.js. */
  hasGlossary: boolean;
}

export async function renderMarkdown(
  raw: string,
  opts: {
    dir?: string;
    /** Glossary terms to mark (lib/content.ts getGlossaryFor); none if unset. */
    glossary?: GlossaryEntry[];
  } = {},
): Promise<Rendered> {
  const dir = opts.dir ?? "";
  const ph = newPlaceholders();
  const text = preprocessMath(raw, ph);

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkWikiLinks)
    .use(remarkRelativeNoteLinks, dir)
    .use(remarkSmartypants)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeStripUnsafe)
    .use(rehypeCallouts, ph.map)
    .use(rehypePredictVeil)
    .use(rehypeManim, dir)
    .use(rehypeWidgets, dir)
    .use(rehypeIsoFigures)
    .use(rehypePrix)
    .use(rehypeShiki)
    .use(rehypePlaceholders, ph.map)
    .use(rehypeHeadingIds)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: "append",
      // className first: buildToc (lib/html.ts) strips `<a class="anchor"…`.
      // Kept out of the search index — the "#" is chrome, not heading text.
      // public/js/copy-links.js labels it and turns a click into "copy link".
      properties: { className: ["anchor"], dataPagefindIgnore: "" },
      content: { type: "text", value: "#" },
    })
    .use(rehypeVaultAssets, dir)
    .use(rehypeYouTube)
    .use(rehypeSidenotes)
    // After rehypeVaultAssets (src resolved, clips promoted to <video>) and
    // after rehypeSidenotes, so an image pulled into a margin note is left
    // alone rather than boxed into a figure inside the margin.
    .use(rehypeFigures)
    // Last content pass: math, callouts and links are final by now, so the
    // glossary can tell body text from what it must leave alone.
    .use(rehypeGlossary, opts.glossary)
    .use(rehypeStringify, { allowDangerousHtml: true });

  const html = String(await processor.process(text));
  return {
    html,
    plain: extractPlain(raw),
    hasMath: ph.map.size > 0,
    hasQuiz: /class="[^"]*\bcallout-(?:quiz|predict)\b/.test(html),
    hasGlossary: /<a class="gloss"/.test(html),
  };
}

/** Plain-text rendering for meta descriptions and list excerpts. */
export function extractPlain(raw: string): string {
  // Strip math/figures/shortcodes before parsing for text.
  const cleaned = raw
    .replace(/\$\$[\s\S]+?\$\$/g, " ")
    .replace(
      /(?<![\d\\$])\$(?![\s$])(?:[^$\n]|\\\$)+?(?<![\s\\])\$(?!\d)/g,
      " ",
    )
    .replace(/\\\\\[[\s\S]*?\\\\\]/g, "")
    .replace(/\\\\\([\s\S]*?\\\\\)/g, "")
    .replace(/\{\{<[\s\S]*?>\}\}/g, "")
    .replace(/<[^>]+>/g, " ");
  const tree = unified().use(remarkParse).use(remarkGfm).parse(cleaned);
  visit(tree as unknown as Root, (node: any, index, parent: any) => {
    if (
      (node.type === "footnoteDefinition" ||
        node.type === "footnoteReference") &&
      parent &&
      typeof index === "number"
    ) {
      parent.children.splice(index, 1);
      return [SKIP, index];
    }
  });
  return mdToString(tree as any)
    .replace(/\s+/g, " ")
    .trim();
}

/** Word-boundary truncation with an ellipsis, like Hugo's `truncate`. */
export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const sp = cut.lastIndexOf(" ");
  return (sp > 0 ? cut.slice(0, sp) : cut) + "…";
}
