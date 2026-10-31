// Reading-path step bar for note pages: "Parcours : <nom> · Étape 4/20",
// links to the previous and next notes in the path's reading order
// (lib/prereq-graph.ts topoOrder) and, for a note in several paths, to the
// others. "Étape 4/20" opens a panel listing every step of the path (from the
// bottom on a phone; public/js/path-sheet.js ticks the ones read). It takes the place of the "Voir le parcours" link of the "À lire
// avant" block: when both exist, components/note/SinglePage.tsx nests the
// prerequisites inside this bar, so the top of a note carries one compact
// block. HTML string like the rest of the note page (lib/html.ts); styles in
// assets/css/path-step.css.

import { escapeHtml } from "./escape";
import { encodeSlug } from "./html";
import { i18nAttr, i18nAttrs, pathName, pathNameAttrs, pathNameKeys, t } from "./i18n";
import { shortNoteTitles } from "./path-titles";

export interface PathStepNote {
  slug: string;
  title: string;
  /** Reading time, when known (the "Étape suivante" chip shows it). */
  minutes?: number;
}

export interface PathStepPath {
  slug: string;
  name: string;
  notes: PathStepNote[];
}

export interface PathStep {
  path: PathStepPath;
  /** 0-based position of the note in `path.notes`. */
  index: number;
  prev: PathStepNote | null;
  next: PathStepNote | null;
  /** The note's other paths, largest first. */
  others: { slug: string; name: string }[];
}

/**
 * Where `slug` stands in its reading paths: the path with the most notes is
 * the one shown (ties: name A→Z), the rest listed as "others". Null when the
 * note is in no path.
 */
export function pathStepOf(slug: string, paths: PathStepPath[]): PathStep | null {
  const mine = paths
    .filter((p) => p.notes.some((n) => n.slug === slug))
    .sort((a, b) => b.notes.length - a.notes.length || a.name.localeCompare(b.name, "fr"));
  if (!mine.length) return null;
  const path = mine[0];
  const index = path.notes.findIndex((n) => n.slug === slug);
  return {
    path,
    index,
    prev: index > 0 ? path.notes[index - 1] : null,
    next: index < path.notes.length - 1 ? path.notes[index + 1] : null,
    others: mine.slice(1).map((p) => ({ slug: p.slug, name: p.name })),
  };
}

const pathHref = (slug: string) => `/parcours/${encodeURIComponent(slug)}/`;
const noteHref = (slug: string) => `/posts/${encodeSlug(slug)}/`;

function stepLink(n: PathStepNote, dir: "prev" | "next"): string {
  const word = `<span class="path-step-dir"${i18nAttrs(`pathStep.${dir}`)}>${escapeHtml(t(`pathStep.${dir}`))}</span>`;
  const title = `<span class="path-step-name">${escapeHtml(n.title)}</span>`;
  const arrow = `<span class="path-step-arrow" aria-hidden="true">${dir === "prev" ? "←" : "→"}</span>`;
  return (
    `<a class="path-step-link path-step-link--${dir}" rel="${dir}" href="${noteHref(n.slug)}" title="${escapeHtml(n.title)}"` +
    (n.minutes ? ` data-minutes="${n.minutes}"` : "") +
    `>` +
    (dir === "prev" ? arrow + word + title : word + title + arrow) +
    `</a>`
  );
}

/** The panel "Étape 4/20" opens: the path's name and progress, every step
 *  (this one marked, the next tagged), the path page and the next step. A
 *  closed <dialog>, so it costs nothing until opened (path-sheet.js). */
export function pathSheetHtml(step: PathStep): string {
  const { path, index, next } = step;
  const total = path.notes.length;
  // "Verbes", not "Verbes — Arabe Libanais": the panel is already about it.
  const short = shortNoteTitles(path.name, path.notes);
  const items = path.notes
    .map((n, i) => {
      const here = i === index;
      const tag = here
        ? `<span class="path-sheet-tag"${i18nAttrs("pathStep.here")}>${escapeHtml(t("pathStep.here"))}</span>`
        : i === index + 1
          ? `<span class="path-sheet-tag path-sheet-tag--next"${i18nAttrs("pathStep.next")}>${escapeHtml(t("pathStep.next"))}</span>`
          : "";
      return (
        `<li${here ? ' class="is-here"' : ""}>` +
        `<a href="${noteHref(n.slug)}" data-slug="${escapeHtml(n.slug)}"${here ? ' aria-current="page"' : ""}>` +
        `<span class="path-sheet-n" aria-hidden="true">${i + 1}</span>` +
        `<span class="path-sheet-t">${escapeHtml(short.get(n.slug) ?? n.title)}</span>${tag}</a></li>`
      );
    })
    .join("");
  const read = { n: 0, total };
  return (
    `<dialog class="path-sheet" id="path-sheet" aria-labelledby="path-sheet-title">` +
    `<div class="path-sheet-head">` +
    `<span class="path-sheet-grab" aria-hidden="true"></span>` +
    `<p class="path-sheet-k"${i18nAttrs("pathStep.label")}>${escapeHtml(t("pathStep.label"))}</p>` +
    `<p class="path-sheet-name" id="path-sheet-title"${pathNameAttrs(path)}>${escapeHtml(pathName(path))}</p>` +
    `<button type="button" class="path-sheet-close" aria-label="${escapeHtml(t("pathStep.close"))}"${i18nAttr("aria-label", "pathStep.close")}>×</button>` +
    `<div class="path-sheet-bar" aria-hidden="true"><i></i></div>` +
    `<p class="path-sheet-meta"><span class="path-sheet-read"${i18nAttrs("pathStep.read", read)}>${escapeHtml(t("pathStep.read", read))}</span><span class="path-sheet-pct"></span></p>` +
    `</div>` +
    `<ol class="path-sheet-list">${items}</ol>` +
    `<div class="path-sheet-foot">` +
    `<a class="path-sheet-btn" href="${pathHref(path.slug)}"${i18nAttrs("pathStep.seePath")}>${escapeHtml(t("pathStep.seePath"))}</a>` +
    (next
      ? `<a class="path-sheet-btn path-sheet-btn--go" href="${noteHref(next.slug)}"><span${i18nAttrs("pathStep.dockNext")}>${escapeHtml(t("pathStep.dockNext"))}</span> <span aria-hidden="true">→</span></a>`
      : "") +
    `</div>` +
    `</dialog>`
  );
}

/** Where the step stands, at a glance: one dash per step (the ones before
 *  it filled, this one ringed), or a plain bar for a long path. */
export function dashesHtml(index: number, total: number): string {
  if (total < 2) return "";
  if (total > 24) {
    const pct = Math.round(((index + 1) / total) * 100);
    return `<span class="path-step-dashes is-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>`;
  }
  let out = "";
  for (let i = 0; i < total; i++) out += i < index ? `<i class="d"></i>` : i === index ? `<i class="c"></i>` : "<i></i>";
  return `<span class="path-step-dashes" aria-hidden="true">${out}</span>`;
}

/** The bar; `inner` (the "À lire avant" block, already rendered) goes under
 *  its first row so both read as one block. */
export function pathStepHtml(step: PathStep, inner = ""): string {
  const { path, index, prev, next, others } = step;
  const vars = { n: index + 1, total: path.notes.length };
  let othersHtml = "";
  if (others.length === 1) {
    othersHtml =
      `<a class="path-step-others" href="${pathHref(others[0].slug)}" title="${escapeHtml(pathName(others[0], "title"))}"` +
      `${pathNameKeys(others[0].slug) ? i18nAttr("title", pathNameKeys(others[0].slug)!.title) : ""}${i18nAttrs("pathStep.othersOne")}>` +
      `${escapeHtml(t("pathStep.othersOne"))}</a>`;
  } else if (others.length > 1) {
    const items = others
      .map((o) => `<li><a href="${pathHref(o.slug)}"${pathNameAttrs(o)}>${escapeHtml(pathName(o))}</a></li>`)
      .join("");
    othersHtml =
      `<details class="path-step-others">` +
      `<summary${i18nAttrs("pathStep.othersMany", { n: others.length })}>${escapeHtml(t("pathStep.othersMany", { n: others.length }))}</summary>` +
      `<div class="path-step-others-pop"><p${i18nAttrs("pathStep.othersTitle")}>${escapeHtml(t("pathStep.othersTitle"))}</p><ul>${items}</ul></div>` +
      `</details>`;
  }
  return (
    `<nav class="path-step${inner ? " path-step--with-prereq" : ""}" data-pagefind-ignore aria-labelledby="path-step-label">` +
    `<div class="path-step-row">` +
    `<p class="path-step-where" id="path-step-label">` +
    `<span class="path-step-label"${i18nAttrs("pathStep.label")}>${escapeHtml(t("pathStep.label"))}</span>` +
    `<span class="path-step-colon" aria-hidden="true"> : </span>` +
    `<a class="path-step-path" href="${pathHref(path.slug)}"${pathNameAttrs(path)}>${escapeHtml(pathName(path))}</a>` +
    `<span class="path-step-sep" aria-hidden="true"> · </span>` +
    `<button type="button" class="path-step-open" aria-haspopup="dialog" aria-controls="path-sheet">` +
    `<span class="path-step-count"${i18nAttrs("pathStep.step", vars)}>${escapeHtml(t("pathStep.step", vars))}</span>` +
    `<span class="path-step-chev" aria-hidden="true">▾</span></button>` +
    `</p>` +
    othersHtml +
    dashesHtml(index, path.notes.length) +
    (prev || next
      ? `<span class="path-step-nav">${prev ? stepLink(prev, "prev") : ""}${next ? stepLink(next, "next") : ""}</span>`
      : "") +
    `</div>` +
    inner +
    pathSheetHtml(step) +
    `</nav>`
  );
}
