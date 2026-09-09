// Minimal Markdown → HTML for the RAG assistant's answers (the system prompt
// promises "**gras**, *italique*, `code`, listes `- `"). Dependency-free by
// design — lib/markdown.ts's unified/remark pipeline is a build-time,
// Node-oriented tool for the whole note corpus, far too heavy to ship into a
// client bundle just to format a chat reply.
//
// Escapes first, so every tag in the output comes from a pattern this function
// recognises itself — the input text (LLM-generated, echoing retrieved note
// content) can never inject arbitrary markup. Ported from the pre-React note
// assistant (public/js/ask.js), which solved this once already.
import { escapeHtml } from "./escape";

export function markdownToHtml(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,!?:;)]|$)/g, "$1<em>$2</em>");
  // Links [text](url) — only http(s) or root-relative targets. escapeHtml
  // already ran, so a quote inside the URL is neutralised.
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, '<a href="$2">$1</a>');
  const blocks = s.split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((l) => /^- /.test(l))) {
        return "<ul>" + lines.map((l) => "<li>" + l.slice(2) + "</li>").join("") + "</ul>";
      }
      if (lines.every((l) => /^\d+\. /.test(l))) {
        return (
          "<ol>" + lines.map((l) => "<li>" + l.replace(/^\d+\. /, "") + "</li>").join("") + "</ol>"
        );
      }
      return "<p>" + lines.join("<br>") + "</p>";
    })
    .join("");
}
