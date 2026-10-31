import type { Doc, SiblingRef } from "@/lib/content";
import { CUL_DE_LAMPE } from "@/lib/deco-art";
import {
  formatDateLong,
  getSiblings,
  getBacklinks,
  getLocalGraph,
  getGlossaryFor,
  getPrerequisites,
  getDependents,
  getPost,
  getReadingPathOf,
  getReadingPaths,
  getDisciplines,
} from "@/lib/content";
import { noteHistoryUrl } from "@/lib/site";
import { pathStepHtml, pathStepOf } from "@/lib/path-step";
import { extractPlain, renderMarkdown } from "@/lib/markdown";
import { readingMinutes as minutesOfText } from "@/lib/path-extras";
import {
  dropcapHtml,
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
  noteDockHtml,
  noteSectionMetaHtml,
  folderLabel,
  folderI18n,
  bookmarkButtonHtml,
  focusButtonHtml,
  voiceButtonHtml,
  lessonButtonHtml,
  noteMoreHtml,
  nextUpHtml,
  noteSideHtml,
  prerenderNextHtml,
  type NextUp,
} from "@/lib/html";
import { t, i18nAttrs, i18nAttr, pathName, pathNameAttrs, pathNameKeys, pathNameRef } from "@/lib/i18n";
import { citeHtml } from "@/lib/cite";
import { JsonLd } from "@/components/layout/JsonLd";
import { NoteFeatureScripts } from "@/components/note/NoteScripts";
import { franc } from "franc-min";
import { familyOfPrefix } from "@/lib/path-family";
import { coverImgHtml, leadCover, noteAppChromeHtml, noteCrumbsHtml, type NoteAppInput } from "@/lib/note-app";

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
  const rendered = await renderMarkdown(doc.body, {
    dir,
    glossary: note ? getGlossaryFor(doc) : undefined,
  });
  const { plain, hasMath, hasQuiz, hasGlossary } = rendered;
  // Phone layout (lib/note-app.ts): a note that opens on a picture gets it as
  // a cover; that figure is then marked so it doesn't show twice.
  const cover = note ? leadCover(rendered.html) : null;
  const html = cover ? cover.html : rendered.html;
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

  const sibNav = note ? getSiblings(doc.slug) : null;
  const siblings = sibNav ? siblingNavHtml(sibNav) : "";
  // Prerequisites (frontmatter `prerequis`) up top, the notes that build on
  // this one ("pour aller plus loin") after the body. Those notes usually
  // [[link]] here too; the backlinks list leaves them out so none shows twice.
  const dependents = note ? getDependents(doc.slug) : [];
  const readingPath = note ? getReadingPathOf(doc.slug) : null;
  // In a reading path, the step bar ("Parcours : … · Étape 4/20", previous /
  // next) replaces the block's own "Voir le parcours" link and holds the
  // prerequisites under its first row: one compact block, not two.
  const found = note ? pathStepOf(doc.slug, getReadingPaths()) : null;
  // The next step's reading time, for the "Étape suivante" chip (path-dock.js).
  const step =
    found?.next != null
      ? { ...found, next: { ...found.next, minutes: minutesOfText(extractPlain(getPost(found.next.slug).body)) } }
      : found;
  const prereqBlock = note
    ? prereqHtml(
        // The previous step is already one tap away in the path bar: listed
        // again under "À lire avant", it read as a second, different note.
        getPrerequisites(doc.slug).filter((p) => p.slug !== step?.prev?.slug),
        readingPath && !step ? `/parcours/${readingPath.slug}/` : undefined,
      )
    : "";
  const pathCard = step
    ? pathStepHtml(step, prereqBlock.replace(/^<nav /, "<div ").replace(/<\/nav>$/, "</div>"))
    : "";
  // The right-hand column from 1100px: the path card, the notes this one
  // links to, the ones linking here, and its questions.
  const cited: SiblingRef[] = [];
  if (note) {
    const seen = new Set([doc.slug]);
    for (const m of html.matchAll(/<a\b[^>]*\bhref="\/posts\/([^"#?]+?)\/?(?:[#?][^"]*)?"/g)) {
      let slug: string;
      try {
        slug = decodeURIComponent(m[1]);
      } catch {
        continue;
      }
      if (seen.has(slug)) continue;
      seen.add(slug);
      try {
        cited.push({ slug, title: getPost(slug).frontmatter.title });
      } catch {
        /* not a note */
      }
    }
  }
  const quizIds = [...html.matchAll(/data-quiz-id="[^"]*" id="([^"]+)"/g)].map((m) => m[1]);
  const side = note
    ? noteSideHtml({
        path: pathCard,
        cited,
        inbound: getBacklinks(doc.slug),
        questions: quizIds.length ? { n: quizIds.length, href: `#${quizIds[0]}` } : null,
      })
    : "";
  const prereqs = side + (step ? "" : prereqBlock);
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

  // "Et ensuite ?": the next step of the reading path, else the next note of
  // the folder, plus a dozen notes of the discipline (in its page's order,
  // starting after this one) for the browser to pick an unread one from.
  const disc = note
    ? getDisciplines().find((d) => doc.slug.startsWith(d.prefix)) ?? null
    : null;
  const discNotes = disc
    ? disc.sections.flatMap((s) =>
        s.notes.map((n) => ({
          slug: n.href.slice("/posts/".length, -1),
          title: n.title,
        })),
      )
    : [];
  const here = discNotes.findIndex((n) => n.slug === doc.slug);
  const nextUp: NextUp = {
    next: step?.next
      ? { slug: step.next.slug, title: step.next.title, path: pathNameRef(step.path) }
      : sibNav?.next
        ? { slug: sibNav.next.slug, title: sibNav.next.title }
        : null,
    prev: step ? step.prev : (sibNav?.prev ?? null),
    step: step?.next ? { n: step.index + 2, total: step.path.notes.length } : null,
    discipline: disc
      ? {
          name: folderLabel(doc.rawPath.split("/")[1] ?? ""),
          href: `/disciplines/${disc.slug}/`,
          notes: [...discNotes.slice(here + 1), ...discNotes.slice(0, Math.max(0, here))].slice(0, 24),
        }
      : null,
  };
  const nextBlock = note ? nextUpHtml(nextUp) : "";

  const lessonSteps = (html.match(/class="callout callout-(?:quiz|predict|ex)\b/g) ?? []).length;

  // The phone app chrome: crumbs, section pill, toolbar and display sheet.
  const family = disc ? familyOfPrefix(disc.prefix) : null;
  const folders = doc.rawPath.split("/").slice(0, -1);
  const appCrumbs: NoteAppInput["crumbs"] = step
    ? [
        {
          label: pathNameKeys(step.path.slug) ? pathName(step.path, "title") : step.path.name.split(/\s+[:—–-]\s+/)[0],
          attrs: pathNameAttrs(step.path, "title"),
          href: `/parcours/${encodeURIComponent(step.path.slug)}/`,
        },
        {
          label: t("noteApp.step", { n: step.index + 1 }),
          attrs: i18nAttrs("noteApp.step", { n: step.index + 1 }),
          step: true,
        },
      ]
    : folders.slice(1, 3).map((name, i) => ({
        label: folderLabel(name),
        attrs: folderI18n(name),
        href: i === 0 && disc ? `/disciplines/${disc.slug}/` : undefined,
      }));
  const appInput: NoteAppInput = {
    title: fm.title,
    family,
    crumbs: appCrumbs,
    up: step ? `/parcours/${encodeURIComponent(step.path.slug)}/` : disc ? `/disciplines/${disc.slug}/` : "/",
    prev: step ? step.prev : (sibNav?.prev ?? null),
    next: step ? step.next : (sibNav?.next ?? null),
    lesson: lessonSteps >= 2,
    inbound: note ? getBacklinks(doc.slug).length : 0,
    minutes: readingMinutes,
  };
  const appCrumbsHtml = note ? noteCrumbsHtml(appInput) : "";
  const appMinutes = note
    ? `<span class="na-min"${i18nAttrs("noteActions.readingTimeFormat", { min: readingMinutes })}>${escapeHtml(t("noteActions.readingTimeFormat", { min: readingMinutes }))}</span>`
    : "";

  const headerTitle = fm.title;
  const headerDate = fm.date
    ? { iso: fm.date.toISOString(), formatted: formatDateLong(fm.date) }
    : undefined;

  const main =
    (note
      ? noteHeaderHtml(
          doc.rawPath,
          headerTitle,
          headerDate,
          disc ? { href: `/disciplines/${disc.slug}/`, depth: 1 } : null,
          family,
        )
      : "") +
    (note ? buildToc(html, fm.tags, localGraph) : "") +
    katex +
    dropcapHtml(html, fm.dropcap) +
    // On notes, the date sits on a row with the TOC/sidebar toggle (mobile).
    // Out of the search index: every excerpt that starts at the top of a note
    // used to open on its date ("avril 2026. …").
    (cover ? `<div class="na-cover">${coverImgHtml(cover.src)}` : "") +
    appCrumbsHtml +
    (note
      ? `<div class="subtitle-row" data-pagefind-ignore>${subtitle}${appMinutes}${asideToggleHtml()}</div>`
      : subtitle) +
    `<h1 class='title-note'>${escapeHtml(fm.title)}</h1>` +
    (cover ? `</div>` : "") +
    // One line under the title (from 640px; lib/note-app.ts has the phone's
    // own): the date, the reading time, the growth stage, "last tended", the
    // history, and "Lue" once the reader has finished it (/js/reading-state.js).
    (note
      ? `<div class="note-meta" data-pagefind-ignore>${subtitle}${readingTime}` +
        growthHtml(fm.stage, fm.date, fm.updated, noteHistoryUrl(doc.rawPath)) +
        readBadgeHtml() +
        `</div>`
      : "") +
    // Where the note lives, as Pagefind metadata for the search results.
    (note ? noteSectionMetaHtml(doc.rawPath) : "") +
    (note
      ? noteDockHtml(
          // The ways to read it first. "Lire en leçon": the note one section
          // at a time, its questions in between (public/js/lesson.js), when
          // it has two questions or more.
          (lessonSteps >= 2 ? lessonButtonHtml() : "") +
            audioButtonHtml() +
            bookmarkButtonHtml() +
            // Then the display settings (set once, rarely touched) and the
            // translation, folded under "Affichage ▾".
            noteMoreHtml(fontSizeButtonHtml() + wideTextButtonHtml() + focusButtonHtml() + voiceButtonHtml() + translateButtonHtml(detectedLang)),
          step?.next ?? sibNav?.next ?? null,
        )
      : "") +
    prereqs +
    `<div class="article-body">${html}</div>` +
    // The vignette that closes a note (lib/deco-art.ts).
    (note
      ? `<div class="note-colophon deco" data-pagefind-ignore>${CUL_DE_LAMPE}<small${i18nAttrs("noteActions.endOfNote", { min: readingMinutes })}>${escapeHtml(t("noteActions.endOfNote", { min: readingMinutes }))}</small></div>`
      : "") +
    articleSource +
    (note
      ? citeHtml({ slug: doc.slug, title: fm.title, author: fm.author, date: fm.date, updated: fm.updated })
      : "") +
    (note
      ? readStateHtml(
          doc.slug,
          readingMinutes,
          sibNav
            ? { name: sibNav.folder.split("/").pop() ?? "", slugs: sibNav.siblings.map((x) => x.slug) }
            : undefined,
          { title: fm.title, family },
        )
      : "") +
    nextBlock +
    (note ? prerenderNextHtml(nextUp.next?.slug) : "") +
    further +
    backlinks +
    related +
    (note ? commentsHtml(doc.slug) : "") +
    siblings;

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
        data-family={family ?? undefined}
        {...(note ? { "data-pagefind-body": "" } : {})}
        dangerouslySetInnerHTML={{ __html: main }}
      />
      {note && (
        <div
          className="na-root"
          data-family={family ?? undefined}
          dangerouslySetInnerHTML={{ __html: noteAppChromeHtml(appInput, cover != null) }}
        />
      )}
      {jsonLd && <JsonLd data={jsonLd} />}
      {note && <NoteFeatureScripts quiz={hasQuiz} glossary={hasGlossary} path={!!step} />}
    </>
  );
}
