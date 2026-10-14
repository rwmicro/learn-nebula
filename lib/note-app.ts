import { escapeHtml } from "./escape";
import { t, i18nAttrs, i18nAttr } from "./i18n";
import { encodeSlug } from "./html";
import type { PathFamily } from "./path-family";

// The note page as a phone app (assets/css/app.css, under 640px; wired by
// public/js/note-app.js). Everything here is hidden from 640px up, where the
// note keeps its editorial layout.
//
//  - a cover: the note's lead picture, full bleed, with the title over it,
//    for notes that open on one (the first figure before the first section);
//  - small-caps crumbs in the family colour ("Langues › Arabe libanais ›
//    étape 7"), a glass chip on a cover;
//  - floating glass chrome outside <main>: the round back button and the
//    Aa / bookmark / ⋯ pill over the cover, the sticky section pill with its
//    dots, the bottom toolbar (Précédent, Leçon or Sommaire, Écouter,
//    Affichage, then Suivant) and the "Affichage" sheet. The buttons proxy the
//    note's existing controls (.audio-btn, .lesson-btn, .bookmark-btn…), which
//    the phone layout hides.

export interface NoteAppLink {
  slug: string;
  title: string;
}

export interface NoteAppInput {
  title: string;
  family: PathFamily | null;
  /** Crumb items after the family: discipline, sub-folder or path, step. */
  crumbs: { label: string; href?: string; /** data-i18n attributes for the label. */ attrs?: string; step?: boolean }[];
  /** Where "‹" goes when there is no page to go back to. */
  up: string;
  prev: NoteAppLink | null;
  next: NoteAppLink | null;
  lesson: boolean;
  /** How many notes link here: the "Sommaire" sheet's way to the drawer's
   *  local graph. */
  inbound: number;
  /** Reading time, for the "Sommaire" sheet's header. */
  minutes: number;
}

const s = `fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"`;
export const NOTE_APP_ICONS = {
  back: `<svg viewBox="0 0 24 24" ${s} stroke-width="2.2" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" ${s} stroke-width="2.2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  aa: `<svg viewBox="0 0 24 24" ${s} stroke-width="1.8" aria-hidden="true"><path d="M3 18 8 6l5 12M4.6 14h6.8M15 18l3-7 3 7M15.8 16h4.4"/></svg>`,
  mark: `<svg viewBox="0 0 24 24" ${s} stroke-width="1.8" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>`,
  more: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>`,
  lesson: `<svg viewBox="0 0 24 24" ${s} stroke-width="1.8" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>`,
  head: `<svg class="na-ic-play" viewBox="0 0 24 24" ${s} stroke-width="1.8" aria-hidden="true"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/></svg>`,
  pause: `<svg class="na-ic-pause" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>`,
  toc: `<svg viewBox="0 0 24 24" ${s} stroke-width="1.8" aria-hidden="true"><path d="M4 6h16M4 12h11M4 18h14"/></svg>`,
  width: `<svg viewBox="0 0 24 24" ${s} stroke-width="1.8" aria-hidden="true"><path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/></svg>`,
  focus: `<svg viewBox="0 0 24 24" ${s} stroke-width="1.8" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/></svg>`,
  globe: `<svg viewBox="0 0 24 24" ${s} stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>`,
  later: `<svg viewBox="0 0 24 24" ${s} stroke-width="1.8" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>`,
  share: `<svg viewBox="0 0 24 24" ${s} stroke-width="1.8" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>`,
  ask: `<svg viewBox="0 0 24 24" ${s} stroke-width="1.8" aria-hidden="true"><path d="M12 21v-7"/><path d="M12 14C7 14 4.5 11 4.5 6.5 9 6.5 12 9 12 14Z"/><path d="M12 12c0-4.5 3-7.5 7.5-7.5 0 4.5-3 7.5-7.5 7.5Z"/></svg>`,
  path: `<svg viewBox="0 0 24 24" ${s} stroke-width="1.8" aria-hidden="true"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16"/></svg>`,
  check: `<svg viewBox="0 0 24 24" ${s} stroke-width="2.4" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>`,
  chev: `<svg class="na-chev" viewBox="0 0 24 24" ${s} stroke-width="2.4" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>`,
};
const I = NOTE_APP_ICONS;

const noteHref = (slug: string) => `/posts/${encodeSlug(slug)}/`;
const tx = (key: string, vars?: Record<string, string | number>) =>
  `<span${i18nAttrs(key, vars)}>${escapeHtml(t(key, vars))}</span>`;
const aria = (key: string) => ` aria-label="${escapeHtml(t(key))}"${i18nAttr("aria-label", key)}`;

/**
 * The note's lead picture: the first figure before the first section, when
 * it is a photograph (not a diagram). Returns its src and the html with that
 * figure marked `na-dup`, so the phone layout doesn't show it twice.
 */
export function leadCover(html: string): { src: string; html: string } | null {
  const h2 = html.search(/<h2[\s>]/);
  const head = h2 < 0 ? html : html.slice(0, h2);
  const m = /<figure class="note-figure"><img src="([^"]+)"/.exec(head);
  if (!m || /\.svg(?:$|[?#])/i.test(m[1])) return null;
  const src = m[1].replace(/&amp;/g, "&");
  const at = m.index;
  return {
    src,
    html: html.slice(0, at) + `<figure class="note-figure na-dup">` + html.slice(at + `<figure class="note-figure">`.length),
  };
}

/** "Langues › Arabe libanais › étape 7": the family, then the rest. */
export function noteCrumbsHtml(input: Pick<NoteAppInput, "family" | "crumbs">): string {
  const fam = input.family
    ? `<b class="na-fam">${tx(`parcours.family.${input.family}`)}</b>`
    : "";
  const items = input.crumbs.map((c) => {
    const cls = c.step ? ` class="na-step"` : "";
    const open = `${cls}${c.attrs ?? ""}>${escapeHtml(c.label)}`;
    return c.href ? `<a href="${escapeHtml(c.href)}"${open}</a>` : `<span${open}</span>`;
  });
  const all = fam ? [fam, ...items] : items;
  return `<p class="na-crumbs" data-pagefind-ignore>${all.join(`<i class="na-sep" aria-hidden="true"></i>`)}</p>`;
}

/** The cover's picture (the title, chip and date are the note's own, moved
 *  over it by CSS). */
export function coverImgHtml(src: string): string {
  return `<img class="na-cover-img" src="${escapeHtml(src)}" alt="" decoding="async" fetchpriority="high">`;
}

/** The floating chrome: placed after <main>, outside the search index. */
export function noteAppChromeHtml(input: NoteAppInput, cover: boolean): string {
  const back =
    `<a class="na-back" href="${escapeHtml(input.up)}" data-na-back${aria("noteApp.back")}>${I.back}</a>`;

  const top = cover
    ? `<div class="na-top">` +
      `<a class="glass na-gbtn" href="${escapeHtml(input.up)}" data-na-back${aria("noteApp.back")}>${I.back}</a>` +
      `<span class="glass na-gpill">` +
      `<button type="button" data-na-sheet${aria("noteApp.display")}>${I.aa}</button>` +
      `<button type="button" data-na-bookmark aria-pressed="false"${aria("noteActions.bookmark")}>${I.mark}</button>` +
      `<button type="button" data-na-share${aria("noteApp.share")}>${I.more}</button>` +
      `</span></div>`
    : "";

  const secnav =
    `<nav class="na-secnav"${aria("noteApp.sectionsAria")}>` +
    `<div class="glass na-pill">${back}` +
    `<button type="button" class="na-sec" data-na-toc><b>${escapeHtml(input.title)}</b><small></small></button>` +
    `<button type="button" class="na-toc" data-na-toc${aria("noteApp.contents")}>${I.toc}</button>` +
    `</div><div class="na-dots" aria-hidden="true"></div></nav>`;

  const prev = input.prev
    ? `<a class="na-tool" href="${noteHref(input.prev.slug)}" rel="prev" title="${escapeHtml(input.prev.title)}">${I.back}${tx("noteApp.prev")}</a>`
    : `<span class="na-tool" aria-disabled="true">${I.back}${tx("noteApp.prev")}</span>`;
  const second = input.lesson
    ? `<button type="button" class="na-tool na-tool-pri" data-na-lesson>${I.lesson}${tx("noteApp.lesson")}</button>`
    : `<button type="button" class="na-tool" data-na-toc>${I.toc}${tx("noteApp.contents")}</button>`;
  const toolbar =
    `<nav class="na-toolbar"${aria("noteApp.toolbarAria")}>` +
    `<div class="glass na-bar">` +
    prev +
    second +
    `<button type="button" class="na-tool" data-na-listen>${I.head}${I.pause}` +
    `<span class="na-listen-idle"${i18nAttrs("noteApp.listen")}>${escapeHtml(t("noteApp.listen"))}</span>` +
    `<span class="na-listen-on"${i18nAttrs("noteApp.pause")}>${escapeHtml(t("noteApp.pause"))}</span></button>` +
    `<button type="button" class="na-tool" data-na-sheet aria-haspopup="dialog">${I.aa}${tx("noteApp.display")}</button>` +
    `</div>` +
    (input.next
      ? `<a class="glass na-next" href="${noteHref(input.next.slug)}" rel="next" title="${escapeHtml(input.next.title)}"${aria("noteApp.next")}>${I.arrow}</a>`
      : "") +
    `</nav>`;

  const toggle = (attr: string, icon: string, key: string) =>
    `<button type="button" class="na-opt" role="switch" aria-checked="false" ${attr}>${icon}${tx(key)}<span class="na-switch" aria-hidden="true"></span></button>`;
  const sheet =
    `<div class="na-scrim" hidden data-na-close></div>` +
    `<div class="na-sheet" id="na-sheet" role="dialog" aria-modal="true" aria-labelledby="na-sheet-h" hidden>` +
    `<div class="na-grab" aria-hidden="true"></div>` +
    `<h2 class="na-sheet-h"><span id="na-sheet-h"${i18nAttrs("noteApp.display")}>${escapeHtml(t("noteApp.display"))}</span>` +
    `<button type="button" data-na-close${i18nAttrs("noteApp.ok")}>${escapeHtml(t("noteApp.ok"))}</button></h2>` +
    `<div class="na-grp na-size"><span class="na-a-sm" aria-hidden="true">A</span>` +
    `<input type="range" min="0" max="2" step="1" value="1" data-na-size${aria("noteApp.textSize")}>` +
    `<span class="na-a-lg" aria-hidden="true">A</span></div>` +
    `<div class="na-seg" role="radiogroup"${aria("noteApp.theme")}>` +
    (["auto", "light", "dark"] as const)
      .map(
        (m) =>
          `<button type="button" role="radio" aria-checked="false" data-na-theme="${m}"${i18nAttrs(`noteApp.theme_${m}`)}>${escapeHtml(t(`noteApp.theme_${m}`))}</button>`,
      )
      .join("") +
    `</div>` +
    `<div class="na-grp">` +
    toggle("data-na-wide", I.width, "noteApp.wide") +
    toggle("data-na-focus", I.focus, "noteApp.focus") +
    `</div>` +
    `<div class="na-grp na-grp-links">` +
    `<div class="na-opt na-translate">${I.globe}${tx("noteApp.translate")}<span class="na-translate-slot"></span></div>` +
    toggle("data-na-bookmark", I.later, "noteApp.later") +
    `<button type="button" class="na-opt" data-na-share>${I.share}${tx("noteApp.share")}${I.chev}</button>` +
    `<button type="button" class="na-opt" data-na-ask hidden>${I.ask}${tx("noteApp.ask")}${I.chev}</button>` +
    `</div>` +
    `</div>`;

  // "Sommaire": the sections as a list (filled by note-app.js from the
  // headings), read ones ticked, the current one lit; then the notes that
  // lead here, which opens the drawer and its local graph.
  const inKey = input.inbound === 1 ? "noteApp.inboundOne" : "noteApp.inbound";
  const near =
    input.inbound > 0
      ? `<button type="button" class="na-near" data-na-near>` +
        `<span class="na-near-ic">${I.path}</span>` +
        `<span class="na-near-tx"><b${i18nAttrs(inKey, { n: input.inbound })}>${escapeHtml(t(inKey, { n: input.inbound }))}</b>` +
        `<small${i18nAttrs("noteApp.neighbourhood")}>${escapeHtml(t("noteApp.neighbourhood"))}</small></span>${I.chev}</button>`
      : "";
  const tocSheet =
    `<div class="na-sheet na-toc-sheet" id="na-toc-sheet" role="dialog" aria-modal="true" aria-labelledby="na-toc-h" data-minutes="${input.minutes}" hidden>` +
    `<div class="na-grab" aria-hidden="true"></div>` +
    `<h2 class="na-sheet-h"><span id="na-toc-h"${i18nAttrs("noteApp.contents")}>${escapeHtml(t("noteApp.contents"))}</span><small class="na-toc-meta"></small></h2>` +
    `<ol class="na-toc-list"></ol>` +
    near +
    `</div>`;

  return `<div class="na-chrome${cover ? " na-has-cover" : ""}" data-pagefind-ignore>${top}${secnav}${toolbar}${sheet}${tocSheet}</div>`;
}
