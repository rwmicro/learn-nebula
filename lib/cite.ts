// "Citer cette note": a reference to the note as text and as BibTeX, under
// the article (components/SinglePage.tsx). Built at build time; the access
// date is the build's, and public/js/cite.js replaces it with the reader's
// today and wires the copy buttons.
import { escapeHtml } from "./escape";
import { t, i18nAttrs } from "./i18n";
import { AUTHOR, SITE_TITLE, absoluteURL } from "./site";

export interface CiteInput {
  slug: string;
  title: string;
  author?: string[];
  date?: Date;
  updated?: Date;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** "Nom. « Titre ». Garden of Knowledge, 2026. URL (consulté le …)." */
export function citeText(c: CiteInput, today: Date): string {
  const who = (c.author?.length ? c.author : [AUTHOR]).join(", ");
  const when = c.updated ?? c.date;
  const year = when ? `, ${when.getUTCFullYear()}` : "";
  const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(today);
  return `${who}. « ${c.title} ». ${SITE_TITLE}${year}. ${absoluteURL(`/posts/${c.slug}/`)} (consulté le ${day}).`;
}

/** A @misc entry; the key is the slug's last segment and the year. */
export function citeBibtex(c: CiteInput, today: Date): string {
  const who = (c.author?.length ? c.author : [AUTHOR]).join(" and ");
  const when = c.updated ?? c.date;
  const leaf = c.slug.split("/").pop() || "note";
  const key = `${leaf.replace(/[^a-z0-9]+/gi, "").slice(0, 32) || "note"}${when ? when.getUTCFullYear() : ""}`;
  const brace = (s: string) => s.replace(/[{}\\]/g, "");
  return [
    `@misc{${key},`,
    `  author = {${brace(who)}},`,
    `  title = {${brace(c.title)}},`,
    `  howpublished = {${SITE_TITLE}},`,
    ...(when ? [`  year = {${when.getUTCFullYear()}},`] : []),
    `  url = {${absoluteURL(`/posts/${c.slug}/`)}},`,
    `  urldate = {${iso(today)}}`,
    `}`,
  ].join("\n");
}

export function citeHtml(c: CiteInput, today = new Date()): string {
  const text = citeText(c, today);
  const bib = citeBibtex(c, today);
  const copy = (target: string) =>
    `<button type="button" class="cite-copy" data-copy="${target}"${i18nAttrs("citer.copy")}>${escapeHtml(t("citer.copy"))}</button>`;
  return (
    `<details class="cite-note" data-pagefind-ignore data-today="${iso(today)}">` +
    `<summary><span${i18nAttrs("citer.title")}>${escapeHtml(t("citer.title"))}</span>` +
    `<small class="cite-sub">APA, MLA, BibTeX</small></summary>` +
    `<p class="cite-label"${i18nAttrs("citer.text")}>${escapeHtml(t("citer.text"))}</p>` +
    `<div class="cite-row"><p class="cite-text" id="cite-text">${escapeHtml(text)}</p>${copy("cite-text")}</div>` +
    `<p class="cite-label">BibTeX</p>` +
    `<div class="cite-row"><pre class="cite-bib" id="cite-bib">${escapeHtml(bib)}</pre>${copy("cite-bib")}</div>` +
    `<p class="cite-licence"${i18nAttrs("citer.licence")}>${escapeHtml(t("citer.licence"))}</p>` +
    `</details>`
  );
}
