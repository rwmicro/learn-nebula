import type { Doc } from "@/lib/content";
import {
  formatDateLong,
  getSiblings,
  getBacklinks,
  getLocalGraph,
  getGlossaryFor,
  getPrerequisites,
  getDependents,
  getReadingPathOf,
  getReadingPaths,
} from "@/lib/content";
import { pathStepHtml, pathStepOf } from "@/lib/path-step";
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
  prereqHtml,
  furtherHtml,
  readBadgeHtml,
  readStateHtml,
  noteSectionMetaHtml,
} from "@/lib/html";
import { t, i18nAttrs, i18nAttr } from "@/lib/i18n";
import { JsonLd } from "@/components/JsonLd";
import { PagefindAssets } from "@/components/PagefindAssets";
import { NoteFeatureScripts } from "@/components/NoteScripts";
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
  // Glossary marks (lib/glossary.ts) only on notes: terms defined in another
  // note of the same discipline, first occurrence each.
  const { html, plain, hasMath, hasQuiz, hasGlossary } = await renderMarkdown(doc.body, {
    dir,
    glossary: note ? getGlossaryFor(doc) : undefined,
  });
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
  // Prerequisites (frontmatter `prerequis`) up top, the notes that build on
  // this one ("pour aller plus loin") after the body. Those notes usually
  // [[link]] here too; the backlinks list leaves them out so none shows twice.
  const dependents = note ? getDependents(doc.slug) : [];
  const readingPath = note ? getReadingPathOf(doc.slug) : null;
  // In a reading path, the step bar ("Parcours : … · Étape 4/20", previous /
  // next) replaces the block's own "Voir le parcours" link and holds the
  // prerequisites under its first row: one compact block, not two.
  const step = note ? pathStepOf(doc.slug, getReadingPaths()) : null;
  const prereqBlock = note
    ? prereqHtml(
        getPrerequisites(doc.slug),
        readingPath && !step ? `/parcours/${readingPath.slug}/` : undefined,
      )
    : "";
  const prereqs = step
    ? pathStepHtml(step, prereqBlock.replace(/^<nav /, "<div ").replace(/<\/nav>$/, "</div>"))
    : prereqBlock;
  const further = note ? furtherHtml(dependents) : "";
  const dependentSlugs = new Set(dependents.map((d) => d.slug));
  const backlinks = note
    ? backlinksHtml(getBacklinks(doc.slug).filter((b) => !dependentSlugs.has(b.slug)))
    : "";
  // Rendered inside the aside, under the TOC — see buildToc below.
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
    (note ? buildToc(html, fm.tags, localGraph) : "") +
    katex +
    dropcapHtml(plain, fm.dropcap) +
    // On notes, the date sits on a row with the TOC/sidebar toggle (mobile).
    // Out of the search index: every excerpt that starts at the top of a note
    // used to open on its date ("avril 2026. …").
    (note
      ? `<div class="subtitle-row" data-pagefind-ignore>${subtitle}${asideToggleHtml()}</div>`
      : subtitle) +
    `<h1 class='title-note'>${escapeHtml(fm.title)}</h1>` +
    // Growth stage + "last tended", when the note declares them.
    (note ? growthHtml(fm.stage, fm.date, fm.updated) : "") +
    // Where the note lives, as Pagefind metadata for the search results.
    (note ? noteSectionMetaHtml(doc.rawPath) : "") +
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
        // "Lue" once the reader has finished it (/js/reading-state.js).
        readBadgeHtml() +
        `</div>`
      : "") +
    prereqs +
    `<div class="article-body">${html}</div>` +
    articleSource +
    (note ? readStateHtml(doc.slug, readingMinutes) : "") +
    further +
    backlinks +
    related +
    (note ? commentsHtml(doc.slug) : "") +
    siblings +
    navHtml();

  return (
    <>
      {/* data-pagefind-body: once any page carries it, Pagefind indexes only
          those pages and only inside it — so the search (home "Dans le
          contenu", the note drawer) lists notes, never theme/discipline/
          parcours pages, and the skip link, masthead and footer outside
          <main> stay out of the excerpts. */}
      <main
        id="main"
        lang={lang}
        {...(note ? { "data-pagefind-body": "" } : {})}
        dangerouslySetInnerHTML={{ __html: main }}
      />
      {jsonLd && <JsonLd data={jsonLd} />}
      {note && <PagefindAssets />}
      {note && <NoteFeatureScripts quiz={hasQuiz} glossary={hasGlossary} />}
    </>
  );
}
