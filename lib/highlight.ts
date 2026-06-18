import { createHighlighter, type Highlighter, type ThemeRegistration } from "shiki";
import { visit, SKIP } from "unist-util-visit";
import { fromHtml } from "hast-util-from-html";
import type { Root, Element, RootContent } from "hast";

// Approximation of Hugo's chroma "modus-operandi" style as a TextMate theme,
// so highlighted code keeps the same light palette without chroma/Go.
const modusOperandi: ThemeRegistration = {
  name: "modus-operandi",
  type: "light",
  colors: { "editor.foreground": "#000000", "editor.background": "#fcfcfc" },
  fg: "#000000",
  bg: "#fcfcfc",
  settings: [
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "#505050" } },
    {
      scope: ["keyword", "storage.type", "storage.modifier", "keyword.control"],
      settings: { foreground: "#5317ac" },
    },
    {
      scope: ["constant.language", "constant.numeric", "constant", "support.constant"],
      settings: { foreground: "#0000c0" },
    },
    {
      scope: ["entity.name.type", "support.type", "storage.type.built-in", "entity.name.class"],
      settings: { foreground: "#005a5f" },
    },
    {
      scope: ["support.function", "entity.name.function", "meta.function-call"],
      settings: { foreground: "#721045" },
    },
    {
      scope: [
        "variable",
        "variable.other",
        "meta.definition.variable",
        "support.type.property-name",
      ],
      settings: { foreground: "#00538b" },
    },
    {
      scope: ["string", "string.quoted", "punctuation.definition.string", "constant.character"],
      settings: { foreground: "#2544bb" },
    },
    {
      scope: ["keyword.operator", "punctuation.separator", "punctuation.terminator"],
      settings: { foreground: "#00538b" },
    },
    {
      scope: ["constant.other.preprocessor", "meta.preprocessor", "keyword.control.directive"],
      settings: { foreground: "#505050" },
    },
    { scope: ["entity.name.tag"], settings: { foreground: "#5317ac" } },
    { scope: ["entity.other.attribute-name"], settings: { foreground: "#00538b" } },
    {
      scope: ["builtin", "support.builtin", "variable.language"],
      settings: { foreground: "#8f0075" },
    },
  ],
};

// Markdown fence language -> Shiki grammar id.
const LANG_MAP: Record<string, string> = { cfg: "ini", sh: "bash" };
// Grammars to load. Plain text uses Shiki's built-in "text" (no grammar needed).
const LANGS = ["cpp", "asm", "ini", "cmake", "nginx", "bash"];

let highlighterPromise: Promise<Highlighter> | null = null;
function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({ themes: [modusOperandi], langs: LANGS });
  }
  return highlighterPromise;
}

function hastText(node: any): string {
  if (node.type === "text") return node.value;
  if (Array.isArray(node.children)) return node.children.map(hastText).join("");
  return "";
}

/** Highlight fenced code blocks with Shiki, wrapping output in `.chroma`. */
export function rehypeShiki() {
  return async (tree: Root) => {
    const hl = await getHighlighter();
    const jobs: {
      node: Element;
      parent: { children: RootContent[] };
      lang: string;
      value: string;
    }[] = [];

    visit(tree, "element", (node: Element, _index, parent) => {
      if (node.tagName !== "pre" || !parent) return;
      const code = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "code",
      );
      if (!code) return;
      const classes = (code.properties?.className as string[] | undefined) ?? [];
      const langClass = classes.find((c) => typeof c === "string" && c.startsWith("language-"));
      const lang = langClass ? langClass.slice("language-".length) : "txt";
      if (lang === "mermaid") {
        // Hand the raw diagram source to mermaid.js (rendered client-side).
        node.properties = { className: ["mermaid"], dataPagefindIgnore: "" };
        node.children = [{ type: "text", value: hastText(code).replace(/\n$/, "") }];
        return SKIP;
      }
      jobs.push({
        node,
        parent: parent as { children: RootContent[] },
        lang,
        value: hastText(code),
      });
      return SKIP;
    });

    for (const j of jobs) {
      const mapped = LANG_MAP[j.lang] ?? j.lang;
      const lang = LANGS.includes(mapped) ? mapped : "text";
      const html = hl.codeToHtml(j.value.replace(/\n$/, ""), {
        lang,
        theme: "modus-operandi",
        transformers: [
          {
            pre(node) {
              this.addClassToHast(node, "chroma");
            },
          },
        ],
      });
      const frag = fromHtml(html, { fragment: true });
      const i = j.parent.children.indexOf(j.node as unknown as RootContent);
      if (i !== -1) j.parent.children.splice(i, 1, ...(frag.children as RootContent[]));
    }
  };
}
