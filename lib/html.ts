import { NAV } from "./site";
import {
  INDEX_NOTE,
  formatDateLong,
  tagHref,
  type LocalGraph,
  type NoteStage,
  type SiblingNav,
  type SiblingRef,
} from "./content";
import { folderAnchor } from "./slug";
import { escapeHtml } from "./escape";
import { t, i18nAttrs, i18nAttr } from "./i18n";

// Re-exported for the many modules (SinglePage, tests) that import it from here.
export { escapeHtml };

/** URL-encode each slug segment (spaces, accents…) while keeping the slashes. */
export function encodeSlug(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

/** Site navigation, rendered inside <main> as in layouts/baseof.html. The
 * NAV entries' `name` field is an i18n key (e.g. "nav.home"); the runtime
 * swap reads `data-i18n` and replaces textContent. */
export function navHtml(): string {
  const items = NAV.map(
    (n) =>
      `<li><a href="${n.href}"${i18nAttrs(n.name)}>${escapeHtml(t(n.name))}</a></li>`,
  ).join("");
  return `<nav class="site-nav" data-pagefind-ignore><ul>${items}<li class="site-nav-theme">${themeToggleHtml()}</li></ul></nav>`;
}

/** Light / dark / auto toggle, shared by the note nav above and the home
 * masthead (components/Header.tsx). Wired by /js/theme.js; CSS (global.css)
 * shows the icon matching <html data-theme> — no JS needed for the first
 * paint to be right. The label is the "auto" one at build time and is synced
 * to the stored choice by theme.js. */
export function themeToggleHtml(): string {
  const svg = (cls: string, body: string) =>
    `<svg class="theme-icon ${cls}" viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" ` +
    `fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">${body}</svg>`;
  const auto = svg(
    "theme-icon-auto",
    `<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>`,
  );
  const light = svg(
    "theme-icon-light",
    `<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>`,
  );
  const dark = svg("theme-icon-dark", `<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>`);
  return (
    `<button class="theme-toggle" type="button" data-theme-toggle data-pagefind-ignore ` +
    `aria-label="${escapeHtml(t("theme.auto"))}" title="${escapeHtml(t("theme.auto"))}"` +
    i18nAttr("aria-label", "theme.auto") +
    i18nAttr("title", "theme.auto") +
    `>${auto}${light}${dark}</button>`
  );
}

/**
 * Dropcap setup for single pages (layouts/single.html): the ::first-letter rule
 * plus, when enabled and the first letter is A–Z, the matching Goudy font.
 */
export function dropcapHtml(
  plain: string,
  dropcap: boolean | undefined,
): string {
  // Dropcap is fluid too: 60px @ 320px viewport → 99px @ ≥1080. The
  // tight line-height and small padding stay constant; only the cap scales.
  // `float`/`padding` are logical, not physical: /js/i18n.js sets <html dir="rtl">
  // for Arabic, and a `float: left` cap would sit at the end of the first line
  // instead of where reading starts, detached from its own paragraph.
  const base = `<style>.article-body > p:first-of-type::first-letter, main > p:first-of-type::first-letter { font-family: "GoudyInitialen", "Alegreya", "Alegreya Fallback", serif; float: inline-start; font-size: clamp(3.8rem, 2.2rem + 5vw, 6.6rem); line-height: 0.8; padding-block: 0.4rem 0.08rem; padding-inline: 0 0.5rem; }</style>`;
  const first = plain
    .replace(/^[^A-Za-z]*/, "")
    .charAt(0)
    .toUpperCase();
  const enabled = dropcap !== false && first >= "A" && first <= "Z";
  if (!enabled) return base;
  // `block`, not `swap`: this letter is rendered at 3.8–6.6rem, so showing it
  // first in a fallback and then swapping reflows the whole opening paragraph
  // (article-body was a measured source of the note pages' CLS). The face is
  // preloaded on the next line, so the short block period costs nothing —
  // and a dropcap that arrives a frame late is better than one that jumps.
  const font =
    `<link rel="preload" href="/fonts/GoudyInitialen-${first}.woff2" as="font" type="font/woff2" crossorigin>` +
    `<style>@font-face { font-family: "GoudyInitialen"; src: url("/fonts/GoudyInitialen-${first}.woff2") format("woff2"); font-weight: 400; font-style: normal; font-display: block; }</style>`;
  return font + base;
}

/** Text-to-speech toggle for note bodies; wired client-side by /js/audio.js. */
export function audioButtonHtml(): string {
  const play =
    `<svg class="audio-icon audio-icon-play" viewBox="0 0 32 32" width="14" height="14" aria-hidden="true">` +
    `<path fill="currentColor" d="M31.995 18.892c0.003-0.658-0.101-3.141-0.18-3.851-0.91-8.149-7.523-14.063-15.724-14.063-8.542 0-15.463 6.582-15.932 15.309-0.010 0.191-0.080 1.542-0.085 2.346l-0.003 0.448c-0.041 0.185-0.066 0.376-0.066 0.573v8.708c0 1.465 1.192 2.657 2.656 2.657h2.696c1.465 0 2.657-1.192 2.657-2.657v-8.707c0-1.465-1.192-2.657-2.657-2.657h-2.697c-0.184 0-0.364 0.019-0.537 0.055 0.015-0.325 0.029-0.581 0.032-0.658 0.412-7.649 6.473-13.417 13.936-13.417 7.165 0 12.941 5.167 13.736 12.285 0.034 0.297 0.077 1.052 0.111 1.81-0.195-0.045-0.394-0.075-0.601-0.075h-2.665c-1.465 0-2.657 1.192-2.657 2.657v8.677c0 1.465 1.192 2.657 2.657 2.657h2.665c1.465 0 2.657-1.192 2.657-2.657v-8.677c0-0.163-0.020-0.322-0.049-0.476 0.029-0.092 0.048-0.188 0.049-0.288zM2.66 19h2.696c0.362 0 0.657 0.294 0.657 0.657v8.708c0 0.363-0.295 0.657-0.657 0.657h-2.696c-0.362 0-0.656-0.294-0.656-0.657v-8.708c0.001-0.363 0.295-0.657 0.657-0.657zM29.995 28.333c0 0.363-0.295 0.657-0.657 0.657h-2.665c-0.363 0-0.657-0.294-0.657-0.657v-8.677c0-0.363 0.294-0.657 0.657-0.657h2.665c0.363 0 0.657 0.294 0.657 0.657v8.677z"/>` +
    `</svg>`;
  const pause =
    `<svg class="audio-icon audio-icon-pause" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">` +
    `<rect x="6" y="4" width="4" height="16" fill="currentColor"/>` +
    `<rect x="14" y="4" width="4" height="16" fill="currentColor"/>` +
    `</svg>`;
  return (
    `<button class="audio-btn" type="button" data-state="idle" ` +
    `aria-label="${escapeHtml(t("noteActions.audioAriaIdle"))}"` +
    i18nAttr("aria-label", "noteActions.audioAriaIdle") +
    ` hidden data-pagefind-ignore>` +
    play +
    pause +
    `<span class="audio-label"${i18nAttrs("noteActions.audioListen")}>${escapeHtml(t("noteActions.audioListen"))}</span>` +
    `</button>`
  );
}

/** Cycle the note body width: normal → wide → widest → normal. State is
 * persisted by /js/wide-text.js as `noteWideText` in localStorage. The CSS
 * for each non-normal state lives behind `body[data-wide-text="wide|widest"]`. */
export function wideTextButtonHtml(): string {
  const expand =
    `<svg class="wide-icon wide-icon-expand" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">` +
    `<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ` +
    `d="M10 6 4 12l6 6M14 6l6 6-6 6M4 12h16"/>` +
    `</svg>`;
  const collapse =
    `<svg class="wide-icon wide-icon-collapse" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">` +
    `<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ` +
    `d="M3 6l6 6-6 6M21 6l-6 6 6 6M9 12h6"/>` +
    `</svg>`;
  return (
    `<button class="wide-text-btn" type="button" data-state="normal" ` +
    `aria-label="${escapeHtml(t("noteActions.wideAriaNormal"))}"` +
    i18nAttr("aria-label", "noteActions.wideAriaNormal") +
    ` data-pagefind-ignore>` +
    expand +
    collapse +
    `<span class="wide-text-label"${i18nAttrs("noteActions.wideExpand")}>${escapeHtml(t("noteActions.wideExpand"))}</span>` +
    `</button>`
  );
}

/** Supported target languages for on-demand translation. Display names are
 * resolved at runtime via Intl.DisplayNames so they follow the UI locale;
 * /js/translate.js sorts the menu by display name in that locale. */
export const TRANSLATE_LANGS = [
  // Western Europe
  "en",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "nl",
  "ca",
  "ga",
  "cy",
  "eu",
  // Nordic
  "sv",
  "da",
  "no",
  "fi",
  "is",
  // Central / Eastern Europe
  "pl",
  "cs",
  "sk",
  "hu",
  "ro",
  "bg",
  "hr",
  "sr",
  "sl",
  "el",
  "uk",
  "ru",
  "be",
  "lv",
  "lt",
  "et",
  // Middle East
  "tr",
  "ar",
  "he",
  "fa",
  // South Asia
  "hi",
  "bn",
  "ur",
  "ta",
  "te",
  "mr",
  "gu",
  "pa",
  "ml",
  "kn",
  // East / Southeast Asia
  "ja",
  "zh",
  "ko",
  "vi",
  "th",
  "id",
  "ms",
  "tl",
  // Africa
  "sw",
  "am",
  "yo",
] as const;

/** Translate-this-note widget: a typographic button that toggles a dropdown
 * menu of target languages. Menu items are rendered without their textContent
 * — /js/translate.js fills them with Intl.DisplayNames in the active UI
 * locale. State + caching also live in translate.js. */
export function translateButtonHtml(sourceLang: "fr" | "en"): string {
  const icon =
    `<svg class="translate-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">` +
    `<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ` +
    `d="M4 5h10M9 4v2M5 14a8 8 0 0 0 10-7M14 19l4-10 4 10M15.5 16h5"/>` +
    `</svg>`;
  const items = TRANSLATE_LANGS.filter((l) => l !== sourceLang)
    .map(
      (l) =>
        `<li role="none"><button class="translate-menu-item" role="menuitem" type="button" data-target-lang="${l}"></button></li>`,
    )
    .join("");
  return (
    `<span class="translate-wrap" data-pagefind-ignore>` +
    `<button class="translate-btn" type="button" data-state="idle" ` +
    `data-source-lang="${sourceLang}" aria-haspopup="menu" aria-expanded="false" ` +
    `aria-label="${escapeHtml(t("noteActions.translateAriaIdle"))}"` +
    i18nAttr("aria-label", "noteActions.translateAriaIdle") +
    `>` +
    icon +
    `<span class="translate-label"${i18nAttrs("noteActions.translate")}>${escapeHtml(t("noteActions.translate"))}</span>` +
    `</button>` +
    // A type-to-filter field tops the menu: 50+ languages are unusable as a flat
    // scroll. /js/translate.js hides non-matching rows as you type.
    `<div class="translate-menu" hidden>` +
    `<input class="translate-filter" type="text" autocomplete="off" ` +
    `placeholder="${escapeHtml(t("noteActions.translateFilter"))}"` +
    i18nAttr("placeholder", "noteActions.translateFilter") +
    ` aria-label="${escapeHtml(t("noteActions.translateFilter"))}"` +
    i18nAttr("aria-label", "noteActions.translateFilter") +
    `>` +
    `<ul class="translate-menu-list" role="menu" ` +
    `aria-label="${escapeHtml(t("noteActions.translateMenuAria"))}"` +
    i18nAttr("aria-label", "noteActions.translateMenuAria") +
    `>${items}</ul>` +
    `</div>` +
    `</span>`
  );
}

/** Text-size cycler ("Aa") for the note body; wired by /js/font-size.js. */
export function fontSizeButtonHtml(): string {
  return (
    `<button class="text-size-btn" type="button" data-size="md" ` +
    `aria-label="${escapeHtml(t("noteActions.textSizeAria"))}"` +
    i18nAttr("aria-label", "noteActions.textSizeAria") +
    ` data-pagefind-ignore>` +
    `<span class="text-size-small">A</span>` +
    `<span class="text-size-large">A</span>` +
    `</button>`
  );
}

/** The TOC/sidebar toggle pill (mobile only) — rendered next to the date in
 * SinglePage's subtitle row and in the condensed sticky header. Wired by
 * public/js/aside-toggle.js, which un-hides every .aside-toggle. */
export function asideToggleHtml(): string {
  return (
    `<button class="aside-toggle" type="button" hidden ` +
    `aria-label="${escapeHtml(t("sidebar.toggleOpenAria"))}"` +
    i18nAttr("aria-label", "sidebar.toggleOpenAria") +
    ` data-pagefind-ignore>` +
    `<svg class="aside-toggle-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">` +
    `<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ` +
    `d="M4 6h12M4 12h12M4 18h8M19 18l2-2-2-2"/>` +
    `</svg>` +
    `<span${i18nAttrs("sidebar.toggleOpen")}>${escapeHtml(t("sidebar.toggleOpen"))}</span>` +
    `</button>`
  );
}

/** Page header for notes. Two bars:
 *   1. The original in-flow header: home link + folder breadcrumb + toggle.
 *      Always visible at the top of the article (mobile and desktop).
 *   2. A condensed sticky bar with the note's title + date + toggle, shown
 *      only on mobile/tablet (≤ 1080 px) and only once the original header
 *      has scrolled out of view (handled by /js/sticky-header.js).
 * The toggle pill is duplicated so it's reachable in both states. */
/** Growth line: the digital-garden convention that a note is published early
 * and matures in public, so the reader can tell a sketch from a settled piece.
 * Renders only what the note actually declares — a vault that sets neither
 * `stage` nor `updated` gets nothing rather than an invented default.
 *
 * The "planted" date is already the article's subtitle, so only the tending
 * date is repeated here, and only when it differs from the planting date. The
 * <time> carries `data-i18n-date` so /js/i18n.js reformats it on a locale
 * switch, exactly like the subtitle. */
export function growthHtml(
  stage: NoteStage | undefined,
  planted: Date | undefined,
  tended: Date | undefined,
): string {
  const sameDay =
    planted &&
    tended &&
    planted.toISOString().slice(0, 10) === tended.toISOString().slice(0, 10);
  const showTended = tended && !sameDay;
  if (!stage && !showTended) return "";

  const badge = stage
    ? `<span class="growth-stage growth-${stage}"` +
      ` title="${escapeHtml(t("growth.stageAria"))}"` +
      i18nAttr("title", "growth.stageAria") +
      `>` +
      `<span class="growth-dot" aria-hidden="true"></span>` +
      `<span${i18nAttrs(`growth.${stage}`)}>${escapeHtml(t(`growth.${stage}`))}</span>` +
      `</span>`
    : "";

  const tendedHtml = showTended
    ? `<span class="growth-tended">` +
      `<span${i18nAttrs("growth.tended")}>${escapeHtml(t("growth.tended"))}</span> ` +
      `<time datetime="${tended.toISOString()}" data-i18n-date>${escapeHtml(formatDateLong(tended))}</time>` +
      `</span>`
    : "";

  const sep =
    badge && tendedHtml
      ? `<span class="growth-sep" aria-hidden="true">·</span>`
      : "";
  return `<div class="note-growth">${badge}${sep}${tendedHtml}</div>`;
}

export function noteHeaderHtml(
  rawPath: string,
  title?: string,
  date?: { iso: string; formatted: string },
): string {
  // Each folder segment links to the home browse tree opened at that folder
  // (/#<folderAnchor>), so the breadcrumb doubles as navigation back up the
  // discipline it belongs to. The cumulative on-disk path drives the anchor,
  // matching the ids HomeContent gives its folder rows.
  const folders = rawPath.split("/").slice(0, -1);
  const crumbs = folders.length
    ? `<span class="crumbs">${folders
        .map(
          (name, i) =>
            `<a href="/#${folderAnchor(folders.slice(0, i + 1).join("/"))}">${escapeHtml(name)}</a>`,
        )
        .join(" › ")}</span>`
    : "";
  const meta =
    title || date
      ? // aria-hidden here (not on the whole condensed bar): the title/date are a
        // visual duplicate of the article's h1/date, but the sibling toggle is a
        // real control — hiding the bar wholesale trapped a focusable button
        // inside aria-hidden (WCAG 4.1.2 / axe aria-hidden-focus).
        `<div class="note-header-meta" aria-hidden="true">` +
        (title
          ? `<span class="note-header-title">${escapeHtml(title)}</span>`
          : "") +
        (date
          ? `<time class="note-header-date" datetime="${escapeHtml(date.iso)}" data-i18n-date>${escapeHtml(date.formatted)}</time>`
          : "") +
        `</div>`
      : "";
  return (
    `<header class="note-header" data-pagefind-ignore>` +
    `<div class="note-header-crumb">` +
    `<a href="/">${escapeHtml(INDEX_NOTE)}</a>${crumbs}` +
    `</div>` +
    // Command palette (⌘K): search notes, jump to a section, switch theme.
    paletteButtonHtml(true) +
    `</header>` +
    `<div class="note-header-condensed" data-pagefind-ignore>` +
    meta +
    asideToggleHtml() +
    `</div>`
  );
}

/** Deterministic hash of a string → 0..359 hue, so a given tag always picks
 * the same colour. Cheap djb2 variant; collisions are fine since we just want
 * a stable visual chip per tag. */
function tagHue(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

function themePillsHtml(tags: unknown[] | undefined): string {
  if (!tags || !tags.length) return "";
  // YAML coerces tokens like `802.11` to numbers; cast every entry so neither
  // `.toLowerCase()` nor `escapeHtml` (which expects a string) blow up.
  const pills = tags
    .map((t) => {
      const s = String(t);
      const hue = tagHue(s.toLowerCase());
      // A theme shared by several notes opens its /themes/ page. One found on
      // this note alone has no page, so it runs a home search instead (#12):
      // the home search reads ?q= on mount, no JS needed here.
      const href = tagHref(s) ?? `/?q=${encodeURIComponent(s)}`;
      return `<a class="theme-pill" href="${href}" style="--theme-h:${hue}">${escapeHtml(s)}</a>`;
    })
    .join("");
  return `<div class="note-themes" aria-label="${escapeHtml(t("sidebar.themesAriaLabel"))}"${i18nAttr("aria-label", "sidebar.themesAriaLabel")}>${pills}</div>`;
}

/** Build a right-margin sidebar with a Pagefind search bar, the note's themes
 * (frontmatter `tags`), the table of contents, and — below it — the local
 * graph (see {@link localGraphHtml}). The TOC lists rendered h2/h3 headings;
 * in dev (no Pagefind bundle) the search box becomes a plain placeholder
 * input. */
export function buildToc(
  html: string,
  tags?: unknown[],
  localGraph = "",
): string {
  // Match any h2/h3 regardless of attribute order, then pull `id` out of the
  // opening tag — so a heading that ever carries a class (e.g. raw HTML in a
  // note) isn't silently dropped from the TOC. Headings without an id can't be
  // anchor targets and are skipped.
  const re = /<h([23])\b([^>]*)>([\s\S]*?)<\/h\1>/g;
  const items: { level: string; id: string; text: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const idMatch = m[2].match(/\bid="([^"]+)"/);
    if (!idMatch) continue;
    // Heading text is already HTML-escaped; just drop the anchor and any tags.
    const text = m[3]
      .replace(/<a class="anchor"[\s\S]*?<\/a>/g, "")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (text) items.push({ level: m[1], id: idMatch[1], text });
  }
  const search =
    process.env.NODE_ENV === "production"
      ? `<div id="search" class="note-search" data-pagefind-ignore></div>`
      : `<input type="search" class="note-search" placeholder="${escapeHtml(t("sidebar.searchPlaceholder"))}"` +
        i18nAttr("placeholder", "sidebar.searchPlaceholder") +
        ` autocomplete="off" aria-label="${escapeHtml(t("sidebar.searchAriaLabel"))}"` +
        i18nAttr("aria-label", "sidebar.searchAriaLabel") +
        ` data-pagefind-ignore>`;
  const toc =
    items.length >= 2
      ? `<nav class="toc" aria-label="${escapeHtml(t("sidebar.tocTitle"))}"${i18nAttr("aria-label", "sidebar.tocTitle")}><p class="toc-title"${i18nAttrs("sidebar.tocTitle")}>${escapeHtml(t("sidebar.tocTitle"))}</p><ul>${items
          .map(
            (i) =>
              `<li class="toc-h${i.level}"><a href="#${i.id}">${i.text}</a></li>`,
          )
          .join("")}</ul></nav>`
      : "";
  // Mobile/tablet close button (lives inside the aside but is hidden by CSS
  // above 1080 px; on small screens it sits inside the slide-in drawer).
  const close =
    `<button class="aside-close" type="button" ` +
    `aria-label="${escapeHtml(t("sidebar.toggleCloseAria"))}"` +
    i18nAttr("aria-label", "sidebar.toggleCloseAria") +
    `>×</button>`;
  // The trigger pill itself lives in noteHeaderHtml so the sticky header can
  // host it directly — kept out of the aside so it stays visible while the
  // aside is hidden behind its drawer transform.
  return `<aside class="note-aside" data-pagefind-ignore>${close}${search}${themePillsHtml(tags)}${toc}${localGraph}</aside>`;
}

/** Comments section mount point; data fetching and form handling live in
 * /js/comments.js. The Turnstile widget is rendered only when the site key is
 * configured at build time (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`); without it,
 * submissions still work but go to the moderation queue. */
export function commentsHtml(slug: string): string {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const turnstile = siteKey
    ? `<div class="cf-turnstile" data-sitekey="${escapeHtml(siteKey)}" data-theme="light" data-size="flexible" data-action="turnstile-spin-v1"></div>`
    : "";
  return (
    `<section class="comments" data-pagefind-ignore data-slug="${escapeHtml(slug)}">` +
    `<h2 class="comments-title"${i18nAttrs("comments.title")}>${escapeHtml(t("comments.title"))}</h2>` +
    `<div class="comments-list" aria-live="polite"></div>` +
    `<form class="comments-form" novalidate>` +
    `<label class="comments-field">` +
    `<span class="comments-label"${i18nAttrs("comments.namePlaceholder")}>${escapeHtml(t("comments.namePlaceholder"))}</span>` +
    `<input class="comments-name" type="text" name="name" maxlength="80" autocomplete="name">` +
    `</label>` +
    `<label class="comments-field">` +
    `<span class="comments-label"${i18nAttrs("comments.messageLabel")}>${escapeHtml(t("comments.messageLabel"))}</span>` +
    `<textarea class="comments-body" name="body" required maxlength="2000" rows="4"></textarea>` +
    `</label>` +
    turnstile +
    `<div class="comments-actions">` +
    `<button class="comments-submit" type="submit"${i18nAttrs("comments.submit")}>${escapeHtml(t("comments.submit"))}</button>` +
    `<span class="comments-status" role="status"></span>` +
    `</div>` +
    `</form>` +
    `</section>`
  );
}

/** Bottom-of-page navigation between notes in the same folder (prev/next + list). */
export function siblingNavHtml(nav: SiblingNav): string {
  if (nav.siblings.length <= 1) return "";
  const link = (s: { title: string; slug: string }, arrow: "prev" | "next") =>
    arrow === "prev"
      ? `<a class="sib-prev" href="/posts/${encodeSlug(s.slug)}/">← ${escapeHtml(s.title)}</a>`
      : `<a class="sib-next" href="/posts/${encodeSlug(s.slug)}/">${escapeHtml(s.title)} →</a>`;
  const arrows =
    `<div class="sib-arrows">` +
    (nav.prev ? link(nav.prev, "prev") : `<span></span>`) +
    (nav.next ? link(nav.next, "next") : `<span></span>`) +
    `</div>`;
  const folderName = nav.folder.split("/").pop() ?? "";
  const headingKey = folderName ? "siblings.moreIn" : "siblings.more";
  const headingVars = folderName
    ? { folder: prettyFolder(folderName) }
    : undefined;
  const items = nav.siblings
    .map((s) =>
      s.current
        ? `<li class="sib-current">${escapeHtml(s.title)}</li>`
        : `<li><a href="/posts/${encodeSlug(s.slug)}/">${escapeHtml(s.title)}</a></li>`,
    )
    .join("");
  return (
    `<nav class="siblings" data-pagefind-ignore>` +
    arrows +
    `<p class="sib-title"${i18nAttrs(headingKey, headingVars)}>${escapeHtml(t(headingKey, headingVars))}</p>` +
    `<ul>${items}</ul>` +
    `</nav>`
  );
}

/** Mount point for "notes proches" — semantically related notes, fetched
 *  client-side from /api/related (server/rag.ts's embedding index) since
 *  that index only exists at server runtime, not at this static build. Empty
 *  when RAG isn't configured/ready or the request fails — the enhancer
 *  (/js/related.js) just leaves the section out of the DOM in that case. */
export function relatedNotesHtml(slug: string): string {
  return (
    `<nav class="related-notes" data-pagefind-ignore data-url="/posts/${escapeHtml(slug)}/">` +
    `<p class="related-notes-title"${i18nAttrs("siblings.related")}>${escapeHtml(t("siblings.related"))}</p>` +
    `<ul class="related-notes-list"></ul>` +
    `</nav>`
  );
}

// Local-graph geometry. A bipartite fan, not a force layout: inbound notes on
// the reading-start side, outbound on the other, the current note between them.
// Radial placement collides labels as soon as a note has more than a handful of
// neighbours, and there is no room to run a simulation in a static export
// anyway — this renders at build time, ships as plain SVG and needs no JS.
const LG_MAX_PER_SIDE = 8;
// Sized for the sidebar it lives in (.note-aside is 30rem ≈ 450px), not for the
// article column: a wider viewBox would just be scaled down, shrinking every
// label with it. Labels stay inside the viewBox — the SVG no longer paints
// outside its box, so a long title can't spill into the aside and give it a
// horizontal scrollbar.
const LG_WIDTH = 460;
const LG_ROW = 26;
const LG_PAD = 24;
// How far the two columns sit from the centre node. The rest of the half-width
// (LG_WIDTH / 2 - LG_ARM) is the room a label has, which is what LG_MAX_CHARS
// below is derived from.
const LG_ARM = 80;
// ~7.5px per character at the 15px label size, against 150 units of room.
const LG_MAX_CHARS = 20;

function lgTruncate(title: string): string {
  return title.length > LG_MAX_CHARS
    ? `${title.slice(0, LG_MAX_CHARS - 1)}…`
    : title;
}

function lgColumn(
  refs: SiblingRef[],
  x: number,
  cx: number,
  cy: number,
  top: number,
  anchor: "start" | "end",
): string {
  return refs
    .map((r, i) => {
      const y = top + i * LG_ROW;
      const dot = anchor === "end" ? x + 10 : x - 10;
      return (
        `<line class="lg-edge" x1="${dot}" y1="${y}" x2="${cx}" y2="${cy}"/>` +
        `<circle class="lg-dot" cx="${dot}" cy="${y}" r="3"/>` +
        `<a href="/posts/${encodeSlug(r.slug)}/">` +
        `<title>${escapeHtml(r.title)}</title>` +
        `<text class="lg-label" x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="middle">` +
        `${escapeHtml(lgTruncate(r.title))}</text>` +
        `</a>`
      );
    })
    .join("");
}

/** The note's immediate [[wikilink]] neighbourhood, drawn at build time as a
 * static SVG. The /graph page holds the whole vault; this is the slice a reader
 * can act on without leaving the note. Rendered only when the note actually has
 * neighbours — an isolated note gets nothing rather than an empty frame. */
export function localGraphHtml(g: LocalGraph): string {
  const incoming = g.incoming.slice(0, LG_MAX_PER_SIDE);
  const outgoing = g.outgoing.slice(0, LG_MAX_PER_SIDE);
  if (!incoming.length && !outgoing.length) return "";

  const rows = Math.max(incoming.length, outgoing.length);
  const height = LG_PAD * 2 + Math.max(1, rows) * LG_ROW;
  const cx = LG_WIDTH / 2;
  const cy = height / 2;
  const topFor = (n: number) => cy - ((n - 1) * LG_ROW) / 2;

  // Labels are laid out with `direction` on the <svg>, so in RTL the inbound
  // column mirrors to the other side along with everything else.
  const left = lgColumn(
    incoming,
    cx - LG_ARM,
    cx,
    cy,
    topFor(incoming.length),
    "end",
  );
  const right = lgColumn(
    outgoing,
    cx + LG_ARM,
    cx,
    cy,
    topFor(outgoing.length),
    "start",
  );

  const more = (
    all: number,
    shown: number,
    x: number,
    anchor: "start" | "end",
  ) =>
    all > shown
      ? `<text class="lg-more" x="${x}" y="${height - 8}" text-anchor="${anchor}"` +
        i18nAttrs("graph.localMore", { n: all - shown }) +
        `>${escapeHtml(t("graph.localMore", { n: all - shown }))}</text>`
      : "";

  const headings =
    (incoming.length
      ? `<text class="lg-head" x="${cx - LG_ARM}" y="14" text-anchor="end"${i18nAttrs("graph.localIn")}>` +
        `${escapeHtml(t("graph.localIn"))}</text>`
      : "") +
    (outgoing.length
      ? `<text class="lg-head" x="${cx + LG_ARM}" y="14" text-anchor="start"${i18nAttrs("graph.localOut")}>` +
        `${escapeHtml(t("graph.localOut"))}</text>`
      : "");

  return (
    `<nav class="local-graph" data-pagefind-ignore>` +
    `<p class="local-graph-title"${i18nAttrs("graph.localTitle")}>${escapeHtml(t("graph.localTitle"))}</p>` +
    `<svg class="lg-svg" viewBox="0 0 ${LG_WIDTH} ${height}" role="group"` +
    ` aria-label="${escapeHtml(t("graph.localTitle"))}"` +
    i18nAttr("aria-label", "graph.localTitle") +
    `>` +
    headings +
    left +
    right +
    `<circle class="lg-self" cx="${cx}" cy="${cy}" r="5"/>` +
    more(g.incoming.length, incoming.length, cx - LG_ARM, "end") +
    more(g.outgoing.length, outgoing.length, cx + LG_ARM, "start") +
    `</svg>` +
    `</nav>`
  );
}

/** "Notes that link here" — the reverse [[wikilink]] index for a note. */
export function backlinksHtml(backlinks: SiblingRef[]): string {
  if (!backlinks.length) return "";
  const items = backlinks
    .map(
      (b) =>
        `<li><a href="/posts/${encodeSlug(b.slug)}/">${escapeHtml(b.title)}</a></li>`,
    )
    .join("");
  return (
    `<nav class="backlinks" data-pagefind-ignore>` +
    `<p class="backlinks-title"${i18nAttrs("siblings.backlinks")}>${escapeHtml(t("siblings.backlinks"))}</p>` +
    `<ul>${items}</ul>` +
    `</nav>`
  );
}

/** "À lire avant": the notes this one lists under frontmatter `prerequis`, as
 *  a compact row near the top of the note. `pathHref` links the reading path
 *  (/parcours/#id) the note belongs to, when it is in one. Read checkmarks are
 *  added client-side (/js/reading-state.js). */
export function prereqHtml(prereqs: SiblingRef[], pathHref?: string): string {
  if (!prereqs.length) return "";
  const items = prereqs
    .map((p) => `<li><a href="/posts/${encodeSlug(p.slug)}/">${escapeHtml(p.title)}</a></li>`)
    .join("");
  const path = pathHref
    ? `<a class="prereq-path" href="${escapeHtml(pathHref)}"${i18nAttrs("prereq.pathLink")}>${escapeHtml(t("prereq.pathLink"))}</a>`
    : "";
  return (
    `<nav class="prereq" data-pagefind-ignore aria-labelledby="prereq-title">` +
    `<p class="prereq-title" id="prereq-title"${i18nAttrs("prereq.before")}>${escapeHtml(t("prereq.before"))}</p>` +
    `<ul class="prereq-list">${items}</ul>` +
    path +
    `</nav>`
  );
}

/** "Pour aller plus loin": the notes that list this one as a prerequisite,
 *  placed right after the article body (before the backlinks, which leave
 *  these notes out so none is listed twice). */
export function furtherHtml(dependents: SiblingRef[]): string {
  if (!dependents.length) return "";
  const items = dependents
    .map((d) => `<li><a href="/posts/${encodeSlug(d.slug)}/">${escapeHtml(d.title)}</a></li>`)
    .join("");
  return (
    `<nav class="further" data-pagefind-ignore aria-labelledby="further-title">` +
    `<p class="further-title" id="further-title"${i18nAttrs("prereq.further")}>${escapeHtml(t("prereq.further"))}</p>` +
    `<ul>${items}</ul>` +
    `</nav>`
  );
}

/** "Lue" badge for the note-actions row; revealed by /js/reading-state.js
 *  once the reader has finished the note (state lives in localStorage). */
export function readBadgeHtml(): string {
  return (
    `<span class="read-badge" hidden>` +
    `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>` +
    `<span${i18nAttrs("reading.read")}>${escapeHtml(t("reading.read"))}</span>` +
    `</span>`
  );
}

/** End-of-article reading state (read on…, mark read / unread, resume). An
 *  empty mount point: /js/reading-state.js fills and reveals it, so readers
 *  without JS (or storage) never see controls that can't work. */
export function readStateHtml(slug: string, minutes: number): string {
  return (
    `<div class="read-state" data-pagefind-ignore hidden` +
    ` data-slug="${escapeHtml(slug)}" data-minutes="${minutes}"></div>`
  );
}

/** Command-palette trigger (/js/palette.js, site-wide). `compact` drops the
 *  text label (note header); the shortcut hint is rewritten to ⌘K on Apple
 *  platforms by the script. */
export function paletteButtonHtml(compact = false): string {
  const label = escapeHtml(t("palette.openAria"));
  return (
    `<button type="button" class="palette-btn${compact ? " palette-btn--compact" : ""}" data-palette-open data-pagefind-ignore` +
    ` aria-label="${label}" title="${label}" aria-haspopup="dialog"` +
    i18nAttr("aria-label", "palette.openAria") +
    i18nAttr("title", "palette.openAria") +
    `>` +
    `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>` +
    (compact
      ? ""
      : `<span class="palette-btn-label"${i18nAttrs("palette.open")}>${escapeHtml(t("palette.open"))}</span>`) +
    `<kbd class="palette-kbd" aria-hidden="true">Ctrl K</kbd>` +
    `</button>`
  );
}

function prettyFolder(name: string): string {
  const words = name.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// renderNoteTree()/renderNode() removed — the home notes list is now the
// <HomeContent> React component (lib/content getHomeTree()).
