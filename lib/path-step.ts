// Reading-path step bar for note pages: "Parcours : <nom> · Étape 4/20",
// links to the previous and next notes in the path's reading order
// (lib/prereq-graph.ts topoOrder) and, for a note in several paths, to the
// others. It takes the place of the "Voir le parcours" link of the "À lire
// avant" block: when both exist, components/SinglePage.tsx nests the
// prerequisites inside this bar, so the top of a note carries one compact
// block. HTML string like the rest of the note page (lib/html.ts); styles in
// assets/css/path-step.css.

import { escapeHtml } from "./escape";
import { encodeSlug } from "./html";
import { i18nAttrs, t } from "./i18n";

export interface PathStepNote {
  slug: string;
  title: string;
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
    `<a class="path-step-link path-step-link--${dir}" rel="${dir}" href="${noteHref(n.slug)}" title="${escapeHtml(n.title)}">` +
    (dir === "prev" ? arrow + word + title : word + title + arrow) +
    `</a>`
  );
}

/** The bar; `inner` (the "À lire avant" block, already rendered) goes under
 *  its first row so both read as one block. */
export function pathStepHtml(step: PathStep, inner = ""): string {
  const { path, index, prev, next, others } = step;
  const vars = { n: index + 1, total: path.notes.length };
  let othersHtml = "";
  if (others.length === 1) {
    othersHtml =
      `<a class="path-step-others" href="${pathHref(others[0].slug)}" title="${escapeHtml(others[0].name)}"${i18nAttrs("pathStep.othersOne")}>` +
      `${escapeHtml(t("pathStep.othersOne"))}</a>`;
  } else if (others.length > 1) {
    const items = others
      .map((o) => `<li><a href="${pathHref(o.slug)}">${escapeHtml(o.name)}</a></li>`)
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
    `<a class="path-step-path" href="${pathHref(path.slug)}">${escapeHtml(path.name)}</a>` +
    `<span class="path-step-sep" aria-hidden="true"> · </span>` +
    `<span class="path-step-count"${i18nAttrs("pathStep.step", vars)}>${escapeHtml(t("pathStep.step", vars))}</span>` +
    `</p>` +
    othersHtml +
    (prev || next
      ? `<span class="path-step-nav">${prev ? stepLink(prev, "prev") : ""}${next ? stepLink(next, "next") : ""}</span>`
      : "") +
    `</div>` +
    inner +
    `</nav>`
  );
}
