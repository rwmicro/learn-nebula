// Minimal Markdown → HTML for the RAG assistant's answers (the system prompt
// promises "**gras**, *italique*, `code`, listes `- `"). Dependency-free by
// design — lib/markdown.ts's unified/remark pipeline is a build-time,
// Node-oriented tool for the whole note corpus, far too heavy to ship into a
// client bundle just to format a chat reply.
//
// Escapes first, so every tag in the output comes from a pattern this function
// recognises itself — the input text (LLM-generated, echoing retrieved note
// content) can never inject arbitrary markup. Ported from the pre-React note
// assistant, which solved this once already; this is now the only copy.
//
// Two optional hooks, for the chat:
//   • `math(tex, display)`: formulas ($…$, $$…$$, \(…\), \[…\]) are lifted out
//     before escaping and handed to it (KaTeX, loaded on demand). Without it,
//     they stay as written.
//   • `cite(n)`: a source number the model wrote as « [2] » becomes the HTML it
//     returns (null keeps the text). n is only ever 1–99.
import { escapeHtml } from "./escape";

export interface MarkdownLiteOptions {
  math?: (tex: string, display: boolean) => string;
  cite?: (n: number) => string | null;
}

/** NUL never survives escaping or any pattern below, so it marks slots. */
const SLOT = "\u0000";

/** Does the text hold a formula `markdownToHtml` would hand to `math`? */
export function hasMath(text: string): boolean {
  return /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(^|[^\\$\w])\$[^\s$][^$\n]*?\$(?![\d\w])/.test(
    text,
  );
}

export function markdownToHtml(
  text: string,
  opts: MarkdownLiteOptions = {},
): string {
  // Code spans first (a `$` inside one isn't math), then formulas.
  const slots: string[] = [];
  const keep = (html: string) => `${SLOT}${slots.push(html) - 1}${SLOT}`;
  let s = text.replace(/\u0000/g, "");
  s = s.replace(/`([^`\n]+)`/g, (_, c: string) =>
    keep(`<code>${escapeHtml(c)}</code>`),
  );
  if (opts.math) {
    const math = opts.math;
    const tex = (t: string, display: boolean) => {
      try {
        return keep(math(t.trim(), display));
      } catch {
        return keep(escapeHtml(t));
      }
    };
    s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, t: string) => tex(t, true));
    s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, t: string) => tex(t, true));
    s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_, t: string) => tex(t, false));
    // $…$ inline: no space just inside the dollars and no digit right after
    // the closing one, so « 5 $ et 10 $ » stays prices.
    s = s.replace(
      /(^|[^\\$\w])\$([^\s$](?:[^$\n]*?[^\s$])?)\$(?![\d\w])/g,
      (_, pre: string, t: string) => pre + tex(t, false),
    );
  }
  s = escapeHtml(s);
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,!?:;)]|$)/g, "$1<em>$2</em>");
  // Links [text](url) — only http(s) or root-relative targets. escapeHtml
  // already ran, so a quote inside the URL is neutralised.
  s = s.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g,
    '<a href="$2">$1</a>',
  );
  if (opts.cite) {
    const cite = opts.cite;
    // « [1] », « [1, 2] », « [1][2] » — never a link's text (handled above).
    s = s.replace(
      / ?\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\](?!\()/g,
      (all, list: string) => {
        const parts = list.split(/\s*,\s*/).map((n) => cite(Number(n)));
        return parts.every((p) => p !== null) ? parts.join("") : all;
      },
    );
  }
  const blocks = s.split(/\n{2,}/);
  const html = blocks
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((l) => l.startsWith("- "))) {
        return (
          "<ul>" +
          lines.map((l) => "<li>" + l.slice(2) + "</li>").join("") +
          "</ul>"
        );
      }
      if (lines.every((l) => /^\d+\. /.test(l))) {
        return (
          "<ol>" +
          lines
            .map((l) => "<li>" + l.replace(/^\d+\. /, "") + "</li>")
            .join("") +
          "</ol>"
        );
      }
      return "<p>" + lines.join("<br>") + "</p>";
    })
    .join("");
  return html.replace(
    /\u0000(\d+)\u0000/g,
    (_, i: string) => slots[Number(i)] ?? "",
  );
}
