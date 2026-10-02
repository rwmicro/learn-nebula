"use client";

import { useEffect } from "react";
import { t as buildT } from "@/lib/i18n";
import {
  CHANGE_EVENT,
  isRead,
  loadStore,
  slugFromHref,
  type ReadingStore,
} from "@/lib/reading-progress";
import {
  QUIZ_EVENT,
  STUDY_EVENT,
  isStudyKey,
  loadStudyStates,
  progressCounts,
  type ProgressCounts,
} from "@/lib/path-study";

/**
 * Read state on server-rendered lists (the /themes/ and /disciplines/ note
 * lists, /parcours/ and its path pages). The pages stay static; this only
 * decorates them from the reader's localStorage (lib/reading-progress.ts):
 *
 * - `[data-read-marks] a[href^="/posts/"]` — a checkmark after each read note;
 * - `[data-read-progress][data-slugs]` — "x/y lues" plus a bar (`--read`);
 * - `[data-path-progress]` (reading paths) — the same with the path states
 *   of lib/path-study.ts: "12 lues · 4 maîtrisées / 20", known notes too,
 *   and the state of each dot of the path's thumbnail.
 *
 * The path graph itself (states, next note, target…) is
 * components/ParcoursStudy.tsx.
 *
 * Renders nothing; re-runs when another tab (storage) or this one
 * (CHANGE_EVENT) changes the store, and on a back/forward restore.
 */
export function ReadMarks() {
  useEffect(() => {
    const apply = () => decorate(loadStore());
    apply();
    const onStorage = (e: StorageEvent) => {
      if (isStudyKey(e.key)) apply();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, apply);
    window.addEventListener(STUDY_EVENT, apply);
    window.addEventListener(QUIZ_EVENT, apply);
    window.addEventListener("pageshow", apply);
    document.addEventListener("i18n:change", apply);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, apply);
      window.removeEventListener(STUDY_EVENT, apply);
      window.removeEventListener(QUIZ_EVENT, apply);
      window.removeEventListener("pageshow", apply);
      document.removeEventListener("i18n:change", apply);
    };
  }, []);
  return null;
}

type I18nWindow = Window & {
  __i18n?: { t?: (k: string, v?: Record<string, string | number>) => string };
};

function tr(key: string, vars?: Record<string, string | number>): string {
  const rt = (window as I18nWindow).__i18n?.t;
  return rt ? rt(key, vars) : buildT(key, vars);
}

const CHECK_SVG =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function decorate(store: ReadingStore) {
  // 1. Checkmarks after note links.
  document
    .querySelectorAll<HTMLAnchorElement>('[data-read-marks] a[href^="/posts/"]')
    .forEach((a) => {
      if (a.closest("svg")) return;
      const read = isRead(store, slugFromHref(a.getAttribute("href")));
      const li = a.closest("li");
      li?.classList.toggle("is-read", read);
      let mark = a.nextElementSibling;
      if (!mark || !mark.classList.contains("read-check")) mark = null;
      if (read && !mark) {
        const span = document.createElement("span");
        span.className = "read-check";
        span.setAttribute("data-pagefind-ignore", "");
        span.innerHTML = CHECK_SVG + `<span class="sr-only"></span>`;
        a.after(span);
        mark = span;
      } else if (!read && mark) {
        mark.remove();
        mark = null;
      }
      if (mark) {
        const label = tr("reading.read");
        mark.setAttribute("title", label);
        mark.querySelector(".sr-only")!.textContent =
          ` (${label.toLowerCase()})`;
      }
    });

  // 2. Progress counts.
  document
    .querySelectorAll<HTMLElement>("[data-read-progress][data-slugs]")
    .forEach((el) => {
      if (el.hasAttribute("data-path-progress")) {
        decoratePath(el);
        return;
      }
      const slugs = (el.dataset.slugs ?? "").split(" ").filter(Boolean);
      const read = slugs.filter((s) => isRead(store, s)).length;
      const total = slugs.length;
      el.style.setProperty("--read", total ? String(read / total) : "0");
      el.classList.toggle("is-started", read > 0);
      el.classList.toggle("is-done", total > 0 && read === total);
      const text = el.querySelector("[data-read-count]");
      if (text) text.textContent = tr("reading.count", { read, total });
      el.setAttribute("aria-label", tr("reading.countAria", { read, total }));
      // Dots of a path's thumbnail graph.
      el.closest("[data-read-group]")
        ?.querySelectorAll<SVGElement>("[data-slug]")
        .forEach((n) =>
          n.classList.toggle("is-read", isRead(store, n.dataset.slug)),
        );
    });
}

/** "12 lues · 2 connues · 4 maîtrisées / 20", or "3/6 lues" while nothing is
 *  known or mastered. */
function pathProgressText(c: ProgressCounts): string {
  if (!c.known && !c.mastered) return tr("reading.count", { read: c.read, total: c.total });
  const n = (key: string, v: number) => tr(v === 1 ? `${key}One` : key, { n: v });
  const parts = [n("parcours.pRead", c.read)];
  if (c.known) parts.push(n("parcours.pKnown", c.known));
  if (c.mastered) parts.push(n("parcours.pMastered", c.mastered));
  return `${parts.join(" · ")} / ${c.total}`;
}

function decoratePath(el: HTMLElement) {
  const slugs = (el.dataset.slugs ?? "").split(" ").filter(Boolean);
  let quiz: Record<string, string[]> = {};
  try {
    quiz = el.dataset.quiz ? JSON.parse(el.dataset.quiz) : {};
  } catch {
    /* malformed: no mastery */
  }
  const { states } = loadStudyStates(
    slugs.map((slug) => ({ slug, prereqs: [], quiz: quiz[slug] ?? [] })),
  );
  const c = progressCounts(slugs, states);
  el.style.setProperty("--read", c.total ? String(c.done / c.total) : "0");
  el.style.setProperty("--mastered", c.total ? String(c.mastered / c.total) : "0");
  el.classList.toggle("is-started", c.done > 0);
  el.classList.toggle("is-done", c.total > 0 && c.done === c.total);
  const text = el.querySelector("[data-read-count]");
  if (text) text.textContent = pathProgressText(c);
  el.setAttribute(
    "aria-label",
    tr("parcours.progressAria", { read: c.read, known: c.known, mastered: c.mastered, total: c.total }),
  );
  el.closest("[data-read-group]")
    ?.querySelectorAll<SVGElement>(".pm-dot[data-slug]")
    .forEach((n) => {
      const st = states.get(n.dataset.slug!) ?? "unread";
      n.classList.toggle("is-read", st === "read");
      n.classList.toggle("is-known", st === "known");
      n.classList.toggle("is-mastered", st === "mastered");
    });
}
