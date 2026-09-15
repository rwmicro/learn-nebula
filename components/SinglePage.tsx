import type { Doc } from "@/lib/content";
import {
  formatDateLong,
  getSiblings,
  getBacklinks,
  getLocalGraph,
} from "@/lib/content";
import { renderMarkdown } from "@/lib/markdown";
import {
  dropcapHtml,
  navHtml,
  escapeHtml,
  noteHeaderHtml,
  buildToc,
  siblingNavHtml,
  backlinksHtml,
  relatedNotesHtml,
  audioButtonHtml,
  fontSizeButtonHtml,
  wideTextButtonHtml,
  translateButtonHtml,
  commentsHtml,
  asideToggleHtml,
  growthHtml,
  localGraphHtml,
} from "@/lib/html";
import { t, i18nAttrs, i18nAttr } from "@/lib/i18n";
import { JsonLd } from "@/components/JsonLd";
import { PagefindAssets } from "@/components/PagefindAssets";
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
  const dir = doc.rawPath.includes("/")
    ? doc.rawPath.slice(0, doc.rawPath.lastIndexOf("/"))
    : "";
  const { html, plain, hasMath } = await renderMarkdown(doc.body, { dir });
  const fm = doc.frontmatter;
  // Subtitle: manual override takes precedence (untranslated user text);
  // otherwise emit the article date inside a <time data-i18n-date> so the
  // runtime swap can reformat with Intl.DateTimeFormat in the active locale.
  const subtitle =
    fm.subtitle != null
      ? `<span class="subtitle">${escapeHtml(fm.subtitle)}</span>`
      : fm.date
        ? `<time class="subtitle" datetime="${fm.date.toISOString()}" data-i18n-date>${escapeHtml(formatDateLong(fm.date))}</time>`
        : `<span class="subtitle"></span>`;
  // ~220 mots/minute en lecture courante FR. Au moins 1 min pour les notes courtes.
  const words = plain.trim() ? plain.trim().split(/\s+/).length : 0;
  const readingMinutes = Math.max(1, Math.round(words / 220));
  const readingTime =
    `<span class="reading-time"` +
    ` aria-label="${escapeHtml(t("noteActions.readingTimeAria"))}"` +
    i18nAttr("aria-label", "noteActions.readingTimeAria") +
    i18nAttrs("noteActions.readingTimeFormat", { min: readingMinutes }) +
    `>${escapeHtml(t("noteActions.readingTimeFormat", { min: readingMinutes }))}</span>`;

  const katex =
    hasMath || fm.latex
      ? `<link rel="stylesheet" href="/katex/katex.min.css">`
      : "";

  // Mark English notes (the site default is French) for SEO/accessibility.
  // Drives the translate widget's source language, which only ever offers fr
  // or en as the note's *prose* language — independent of `fm.lang` below,
  // since a French note can embed a few foreign words without being written
  // in that language.
  const detectedLang =
    franc(plain, { only: ["fra", "eng"], minLength: 30 }) === "eng"
      ? "en"
      : "fr";
  // `<main lang>`: a note tagged `lang` (substantially written in that
  // language — full immersion/reading practice, as opposed to a French note
  // that just embeds a few foreign vocabulary words) wins; otherwise fall
  // back to the fr/en heuristic above. /js/audio.js's TTS voice picker reads
  // this same attribute, so tagging a note also gets it read aloud correctly.
  const noteLang = fm.lang?.trim().toLowerCase() || detectedLang;
  const lang = noteLang !== "fr" ? noteLang : undefined;

  const siblings = note ? siblingNavHtml(getSiblings(doc.slug)) : "";
  const backlinks = note ? backlinksHtml(getBacklinks(doc.slug)) : "";
  const localGraph = note ? localGraphHtml(getLocalGraph(doc.slug)) : "";
  const related = note ? relatedNotesHtml(doc.slug) : "";

  // Inline raw Markdown + folder context so /js/translate.js can ship it to
  // /api/translate without a separate fetch. Reading via JSON.parse keeps the
  // payload safe from HTML special chars (we just need to break "</script>").
  const articleSource = note
    ? `<script type="application/json" id="article-source">${JSON.stringify({
        markdown: doc.body,
        dir,
        sourceLang: detectedLang,
      }).replace(/</g, "\\u003c")}</script>`
    : "";

  const headerTitle = fm.title;
  const headerDate = fm.date
    ? { iso: fm.date.toISOString(), formatted: formatDateLong(fm.date) }
    : undefined;

  const main =
    (note ? noteHeaderHtml(doc.rawPath, headerTitle, headerDate) : "") +
    (note ? buildToc(html, fm.tags) : "") +
    katex +
    dropcapHtml(plain, fm.dropcap) +
    // On notes, the date sits on a row with the TOC/sidebar toggle (mobile).
    (note
      ? `<div class="subtitle-row">${subtitle}${asideToggleHtml()}</div>`
      : subtitle) +
    `<h1 class='title-note'>${escapeHtml(fm.title)}</h1>` +
    // Growth stage + "last tended", when the note declares them.
    (note ? growthHtml(fm.stage, fm.date, fm.updated) : "") +
    (note
      ? `<div class="note-actions" data-pagefind-ignore>` +
        // Display preferences first (visual settings — set once per session)
        fontSizeButtonHtml() +
        wideTextButtonHtml() +
        // Visual divider between preference and action groups
        `<span class="note-actions-sep" aria-hidden="true">·</span>` +
        // Content actions (audio playback, translation)
        audioButtonHtml() +
        translateButtonHtml(detectedLang) +
        // Reading time pushed to the right edge as passive metadata
        readingTime +
        `</div>`
      : "") +
    `<div class="article-body">${html}</div>` +
    articleSource +
    backlinks +
    localGraph +
    related +
    (note ? commentsHtml(doc.slug) : "") +
    siblings +
    navHtml();

  return (
    <>
      <main id="main" lang={lang} dangerouslySetInnerHTML={{ __html: main }} />
      {jsonLd && <JsonLd data={jsonLd} />}
      {note && <PagefindAssets />}
    </>
  );
}
