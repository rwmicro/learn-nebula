import type { Doc } from "@/lib/content";
import { formatDateLong, getSiblings } from "@/lib/content";
import { renderMarkdown } from "@/lib/markdown";
import {
  dropcapHtml,
  signatureHtml,
  navHtml,
  escapeHtml,
  noteHeaderHtml,
  buildToc,
  siblingNavHtml,
} from "@/lib/html";
import { AUTHOR } from "@/lib/site";
import { JsonLd } from "@/components/JsonLd";
import { franc } from "franc-min";

/**
 * Single-page layout (layouts/single.html): dropcap, subtitle, title, body and
 * signature, all rendered as direct children of <main> so the `main > p` dropcap
 * selectors keep working. Notes (`note`) also get a small header and a
 * right-margin table of contents.
 */
export async function SinglePage({
  doc,
  jsonLd = null,
  note = false,
}: {
  doc: Doc;
  jsonLd?: Record<string, unknown> | null;
  note?: boolean;
}) {
  const dir = doc.rawPath.includes("/") ? doc.rawPath.slice(0, doc.rawPath.lastIndexOf("/")) : "";
  const { html, plain } = await renderMarkdown(doc.body, { dir });
  const fm = doc.frontmatter;
  const subtitle = fm.subtitle ?? formatDateLong(fm.date);
  const author = fm.author?.[0] ?? AUTHOR;

  const katex = fm.latex ? `<link rel="stylesheet" href="/katex/katex.min.css">` : "";

  // Mark English notes (the site default is French) for SEO/accessibility.
  const lang = franc(plain, { only: ["fra", "eng"], minLength: 30 }) === "eng" ? "en" : undefined;

  const siblings = note ? siblingNavHtml(getSiblings(doc.slug)) : "";

  const main =
    (note ? noteHeaderHtml(doc.rawPath) : "") +
    (note ? buildToc(html) : "") +
    katex +
    dropcapHtml(plain, fm.dropcap) +
    `<span class="subtitle">${escapeHtml(subtitle)}</span>` +
    `<h1>${escapeHtml(fm.title)}</h1>` +
    html +
    signatureHtml(author) +
    siblings +
    navHtml();

  return (
    <>
      <main id="main" lang={lang} dangerouslySetInnerHTML={{ __html: main }} />
      {jsonLd && <JsonLd data={jsonLd} />}
    </>
  );
}
