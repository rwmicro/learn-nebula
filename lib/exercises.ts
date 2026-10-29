/**
 * Small exercises written in a note, beside the `[!quiz]` cards
 * (lib/markdown.ts hands these callouts over; public/js/exercises.js plays
 * them, inside quiz.bundle.js):
 *
 * - `> [!traduire] Je m'appelle Andi.` then the translation on the next line,
 *   `aussi: …` for another accepted answer, `piège: mot, mot` for extra
 *   words in the bank. The reader builds the sentence from shuffled words.
 * - `> [!ordre] Titre` then a list in the right order, `piège: …` for items
 *   that belong to none of it. The reader taps the items in order.
 * - `> [!associer] Titre` then a two-column table (or `- gauche :: droite`
 *   items). The reader pairs them.
 * - `> [!ligne] Question` then a code block and `ligne: N` (1 = its first
 *   line). The reader taps the line.
 * - A mermaid `timeline` gets, after it, a "Remettre dans l'ordre" exercise
 *   built from its own dates (rehypeFrise).
 *
 * Whatever else the callout holds is the explanation, shown once answered.
 * The answer travels in a data attribute (JSON): attributes stay out of the
 * Pagefind index, so search excerpts never spoil it.
 */
import type { Element, ElementContent, Root, RootContent } from "hast";
import { visit, SKIP } from "unist-util-visit";

export const EXERCISE_TYPES = ["traduire", "ordre", "associer", "ligne"] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

/** Callout names (lower case) → exercise; the English ones too. */
export const EXERCISE_ALIAS: Record<string, ExerciseType> = {
  traduire: "traduire",
  translate: "traduire",
  ordre: "ordre",
  order: "ordre",
  associer: "associer",
  match: "associer",
  ligne: "ligne",
  line: "ligne",
};

const el = (tagName: string, properties: Element["properties"], children: ElementContent[] = []): Element => ({
  type: "element",
  tagName,
  properties,
  children,
});
const txt = (value: string): ElementContent => ({ type: "text", value });

/** Plain text of a node, `<br>` as a line break. */
export function nodeText(n: ElementContent | RootContent): string {
  if (n.type === "text") return n.value;
  if (n.type !== "element") return "";
  if (n.tagName === "br") return "\n";
  return n.children.map(nodeText).join("");
}

/** `clé: valeur` lines of a body (keys in KEYS, any case, accents optional). */
const KEYS: Record<string, string> = {
  piege: "piege",
  pieges: "piege",
  intrus: "piege",
  trap: "piege",
  aussi: "aussi",
  also: "aussi",
  ligne: "ligne",
  line: "ligne",
  faille: "ligne",
  reponse: "ligne",
  answer: "ligne",
  vers: "vers",
  langue: "vers",
  to: "vers",
};
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function keyLine(line: string): { key: string; value: string } | null {
  const m = line.match(/^\s*([\p{L}]+)\s*:\s*(.*)$/u);
  if (!m) return null;
  const key = KEYS[fold(m[1])];
  return key ? { key, value: m[2].trim() } : null;
}

/** A `piège:` value: comma-separated (or " / "). */
export const listValue = (v: string) =>
  v
    .split(/\s*[,/]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Words of a sentence for the word bank: punctuation stays on its word,
 *  except the closing stop, which would give away the last word. */
export const bankWords = (s: string) =>
  s
    .trim()
    .replace(/\s*[.!?…。！？]+$/u, "")
    .split(/\s+/)
    .filter(Boolean);

/** Compare two sentences ignoring case, accents, punctuation and spacing. */
export function sameSentence(a: string, b: string): boolean {
  const n = (s: string) =>
    fold(s)
      .replace(/[\p{P}\p{S}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  return n(a) === n(b);
}

interface Parts {
  /** Key lines found anywhere in the body's paragraphs. */
  keys: { key: string; value: string }[];
  /** The body's paragraphs' other lines, in order (the first is the answer
   *  of a translation). */
  lines: string[];
  /** Body nodes that are not paragraphs (lists, tables, code). */
  blocks: Element[];
  /** Paragraphs after the first text paragraph, kept as they are: the
   *  explanation. */
  after: ElementContent[];
}

function parts(body: ElementContent[], answerLine: boolean): Parts {
  const out: Parts = { keys: [], lines: [], blocks: [], after: [] };
  let firstDone = false;
  for (const n of body) {
    if (n.type !== "element") continue;
    if (n.tagName !== "p") {
      if (["ul", "ol", "table", "pre"].includes(n.tagName) && !out.blocks.some((b) => b.tagName === n.tagName)) {
        out.blocks.push(n);
      } else out.after.push(n);
      continue;
    }
    const lines = nodeText(n).split("\n");
    const own = lines.filter((l) => {
      const k = keyLine(l);
      if (k) out.keys.push(k);
      return !k && l.trim();
    });
    if (answerLine && !firstDone) {
      out.lines.push(...own.map((l) => l.trim()));
      firstDone = own.length > 0;
    } else if (own.length) out.after.push(n);
  }
  return out;
}

const items = (list: Element) =>
  list.children
    .filter((c): c is Element => c.type === "element" && c.tagName === "li")
    .map((li) => nodeText(li).replace(/\s+/g, " ").trim())
    .filter(Boolean);

export interface ExerciseData {
  traduire: { answer: string; also: string[]; traps: string[]; lang?: string };
  ordre: { items: string[]; traps: string[] };
  associer: { pairs: [string, string][] };
  ligne: { line: number };
}

/** The exercise's data from its callout body, or null when it is not one
 *  (the callout then renders as a plain note callout). */
export function exerciseData<T extends ExerciseType>(type: T, body: ElementContent[]): ExerciseData[T] | null {
  const p = parts(body, type === "traduire");
  const traps = p.keys.filter((k) => k.key === "piege").flatMap((k) => listValue(k.value));
  if (type === "traduire") {
    const answer = p.lines[0];
    if (!answer) return null;
    const also = p.keys.filter((k) => k.key === "aussi").map((k) => k.value);
    const lang = p.keys.find((k) => k.key === "vers")?.value;
    return (lang ? { answer, also, traps, lang } : { answer, also, traps }) as ExerciseData[T];
  }
  if (type === "ordre") {
    const list = p.blocks.find((b) => b.tagName === "ol" || b.tagName === "ul");
    const its = list ? items(list) : [];
    return its.length >= 2 ? ({ items: its, traps } as ExerciseData[T]) : null;
  }
  if (type === "associer") {
    const pairs: [string, string][] = [];
    const table = p.blocks.find((b) => b.tagName === "table");
    if (table) {
      visit(table, "element", (tr: Element) => {
        if (tr.tagName !== "tr") return;
        const cells = tr.children.filter((c): c is Element => c.type === "element" && c.tagName === "td");
        if (cells.length >= 2) pairs.push([nodeText(cells[0]).trim(), nodeText(cells[1]).trim()]);
      });
    } else {
      const list = p.blocks.find((b) => b.tagName === "ul" || b.tagName === "ol");
      for (const it of list ? items(list) : []) {
        const m = it.split(/\s+(?:::|—|=)\s+/);
        if (m.length === 2) pairs.push([m[0], m[1]]);
      }
    }
    const ok = pairs.filter(([a, b]) => a && b);
    return ok.length >= 2 ? ({ pairs: ok.slice(0, 8) } as ExerciseData[T]) : null;
  }
  const n = Number(p.keys.find((k) => k.key === "ligne")?.value.match(/\d+/)?.[0]);
  const code = p.blocks.find((b) => b.tagName === "pre");
  if (!code || !Number.isInteger(n) || n < 1) return null;
  const count = nodeText(code).replace(/\n$/, "").split("\n").length;
  return n <= count ? ({ line: n } as ExerciseData[T]) : null;
}

const LABEL: Record<ExerciseType, string> = {
  traduire: "Traduire",
  ordre: "Remettre dans l’ordre",
  associer: "Associer",
  ligne: "Touche la ligne",
};

/**
 * The exercise card, laid out as the mockups (revues/maquettes-duolingo):
 *
 * - a head, "À toi · Traduire", and a count the script fills ("1 sur 5");
 * - the action ("Traduis en indonésien"), shown as the title in lesson mode
 *   only: in a note the instruction is the title;
 * - the instruction (the callout's title line), a speech bubble in lesson
 *   mode; for a translation, the sentence to translate;
 * - the code to tap, the empty stage the script fills, the feedback band
 *   and the explanation (hidden until answered).
 *
 * The script adds the foot (keyboard hints, "Vérifier"). `t` is lib/i18n's.
 */
export function exerciseCallout(
  type: ExerciseType,
  titleNodes: ElementContent[],
  body: ElementContent[],
  icon: Element,
  t: (k: string) => string,
): Element | null {
  const data = exerciseData(type, body);
  if (!data) return null;
  const p = parts(body, type === "traduire");
  // A translation's title is the sentence to translate; the other types'
  // is the instruction, with a default when the title line is empty.
  const prompt = titleNodes.length ? titleNodes : [txt(t(`ex.${type}Prompt`))];
  const code = type === "ligne" ? p.blocks.find((b) => b.tagName === "pre") : undefined;
  const lang = type === "traduire" ? (data as ExerciseData["traduire"]).lang : undefined;
  const actionKey = lang ? "ex.doTraduireVers" : `ex.do_${type}`;
  const action = (t(actionKey) || ACTION[type]).replace("{lang}", lang ?? "");
  return el(
    "div",
    {
      className: ["callout", "callout-ex", "quiz--choice"],
      dataCallout: type,
      dataEx: type,
      dataExData: JSON.stringify(data),
    },
    [
      el("div", { className: ["callout-title", "ex-head"], dataPagefindIgnore: "" }, [
        icon,
        el("span", { className: ["ex-kick"] }, [
          el("span", { dataI18n: "ex.yourTurn" }, [txt(t("ex.yourTurn") || "À toi")]),
          txt(" · "),
          el("span", { dataI18n: `ex.${type}` }, [txt(t(`ex.${type}`) || LABEL[type])]),
        ]),
        el("span", { className: ["ex-count"] }),
      ]),
      el(
        "p",
        {
          className: ["ex-action"],
          dataPagefindIgnore: "",
          dataI18n: actionKey,
          ...(lang ? { dataI18nVars: JSON.stringify({ lang }) } : {}),
        },
        [txt(action)],
      ),
      el("p", { className: ["quiz-question", "ex-prompt", ...(type === "traduire" ? ["ex-src"] : [])] }, prompt),
      ...(code ? [el("div", { className: ["ex-code"] }, [code])] : []),
      el("div", { className: ["ex-stage"], dataPagefindIgnore: "" }),
      el("div", { className: ["quiz-feedback"], ariaLive: "polite", hidden: true, dataPagefindIgnore: "" }),
      ...(p.after.length ? [el("div", { className: ["callout-body", "ex-after"], hidden: true }, p.after)] : []),
    ],
  );
}

/** The action, as the lesson's title (French fallback; messages/ex.do_*). */
const ACTION: Record<ExerciseType, string> = {
  traduire: "Traduis la phrase",
  ordre: "Remets dans l’ordre",
  associer: "Associe les paires",
  ligne: "Touche la bonne ligne",
};

// ---------------------------------------------------------------------------
// Frise: a mermaid timeline's dates, to put back in order.
// ---------------------------------------------------------------------------

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
function roman(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN[s[i]];
    const next = ROMAN[s[i + 1]] ?? 0;
    if (!v) return NaN;
    n += v < next ? -v : v;
  }
  return n;
}

/** A timeline period as a year, or NaN: "1789", "-300 av. J.-C.", "VIIIe
 *  siècle" (its middle), "1950s", "XXe s.". */
export function periodYear(label: string): number {
  const s = label.trim();
  const bc = /\b(?:av\.?\s*J\.?-?C\.?|BC|BCE|av\.?\s*n\.?\s*è\.?)/i.test(s);
  const c = s.match(/^([IVXLC]+)(?:e|er|ème|th)?\s+(?:siècle|s\.|century)/i);
  if (c) {
    const n = roman(c[1].toUpperCase());
    if (!n) return NaN;
    return bc ? -(n - 1) * 100 - 50 : (n - 1) * 100 + 50;
  }
  const m = s.match(/^(-?\d{1,4})/);
  if (!m) return NaN;
  const y = Number(m[1]);
  return bc && y > 0 ? -y : y;
}

export interface FriseItem {
  when: string;
  what: string;
}

/** The events of a mermaid `timeline` source, in date order; null when it
 *  is not one, or its dates don't all read as years (no order to check). */
export function parseTimeline(src: string): FriseItem[] | null {
  const lines = src.split("\n");
  if (!/^\s*timeline\b/.test(lines[0] ?? "")) return null;
  const out: (FriseItem & { y: number; i: number })[] = [];
  for (const raw of lines.slice(1)) {
    const line = raw.trim();
    if (!line || /^(title|section|%%|accTitle|accDescr)\b/i.test(line)) continue;
    const [when, ...rest] = line.split(/\s+:\s+/);
    if (!rest.length) continue;
    const what = rest[0].replace(/\\n|<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim();
    const y = periodYear(when);
    if (Number.isNaN(y) || !what) return null;
    out.push({ when: when.trim(), what, y, i: out.length });
  }
  if (out.length < 3) return null;
  out.sort((a, b) => a.y - b.y || a.i - b.i);
  // Two events the same year have no order between them: keep the first.
  const seen = new Set<number>();
  const uniq = out.filter((e) => !seen.has(e.y) && seen.add(e.y));
  // At most six, spread over the whole span.
  const pick = uniq.length <= 6 ? uniq : Array.from({ length: 6 }, (_, k) => uniq[Math.round((k * (uniq.length - 1)) / 5)]);
  return pick.map(({ when, what }) => ({ when, what }));
}

/** After each mermaid `timeline` block, an empty `.frise-ex` the script
 *  turns into a "Remettre dans l'ordre" card. Runs before rehypeShiki. */
export function rehypeFrise() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "pre" || !parent || index == null) return;
      const code = node.children.find((c): c is Element => c.type === "element" && c.tagName === "code");
      const cls = (code?.properties?.className as string[] | undefined) ?? [];
      if (!code || !cls.includes("language-mermaid")) return;
      const items = parseTimeline(nodeText(code));
      if (!items) return SKIP;
      parent.children.splice(
        index + 1,
        0,
        el("div", { className: ["frise-ex"], dataFrise: JSON.stringify(items), dataPagefindIgnore: "" }),
      );
      return [SKIP, index + 2];
    });
  };
}
