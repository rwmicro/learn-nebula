// Obsidian callouts (> [!type] Title), quizzes, « predict » veils.

import { visit, SKIP } from "unist-util-visit";
import { fromHtml } from "hast-util-from-html";
import type { Root, Element, ElementContent } from "hast";
import { t } from "../../i18n";
import { cardId } from "../../srs";
import { EXERCISE_ALIAS, exerciseCallout } from "../../exercises";
import { definitionAnchor, definitionTerm, isDefinitionTitle } from "../../glossary";
import { isBlank } from "./hast";

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
  // A worked solution, one step at a time: its numbered list is shown step
  // by step behind "Étape suivante" (public/js/study-tools.js).
  solution: "solution",
  etapes: "solution",
  steps: "solution",
  // Exercises (lib/exercises.ts): their own card when the body holds one.
  traduire: "ex",
  translate: "ex",
  ordre: "ex",
  order: "ex",
  associer: "ex",
  match: "ex",
  ligne: "ex",
  line: "ex",
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
  solution: "Solution pas à pas",
  ex: "Exercice",
};
const CALLOUT_ICON: Record<string, string> = {
  solution: calloutSvg('<path d="M4 18h4v-4h4v-4h4V6h4"/>'),
  ex: calloutSvg('<path d="M4 7h10M4 12h7M4 17h10"/><path d="m15 14 2.5 2.5L22 12"/>'),
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
export function quizCallout(
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
export function rehypePredictVeil() {
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
export function rehypeCallouts(ph: Map<string, string> = new Map()) {
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

      // [!traduire] / [!ordre] / [!associer] / [!ligne] (lib/exercises.ts);
      // one whose body doesn't hold an exercise stays a plain callout.
      const ex = EXERCISE_ALIAS[type];
      if (ex) {
        const card = exerciseCallout(ex, hasTitle ? titleNodes : [], bodyChildren, icon, (k) => t(k));
        if (card) {
          parent.children[index] = card;
          return SKIP;
        }
      }
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
