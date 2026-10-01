"use client";

import { useEffect } from "react";
import { t as buildT } from "@/lib/i18n";
import {
  CHANGE_EVENT,
  STORAGE_KEY,
  isRead,
  loadStore,
  nextToRead,
  slugFromHref,
  type ReadingStore,
} from "@/lib/reading-progress";

/**
 * Read state on server-rendered lists (the /themes/ and /disciplines/ note
 * lists, /parcours/ and its path pages). The pages stay static; this only
 * decorates them from the reader's localStorage (lib/reading-progress.ts):
 *
 * - `[data-read-marks] a[href^="/posts/"]` — a checkmark after each read note;
 * - `[data-read-progress][data-slugs]` — "x/y lues" plus a bar (`--read`);
 * - `[data-parcours]` — on a path graph, `.is-read` on read notes and edges
 *   leaving them, `.is-next` on the note to read next, which
 *   `[data-parcours-next]` also names.
 *
 * Renders nothing; re-runs when another tab (storage) or this one
 * (CHANGE_EVENT) changes the store, and on a back/forward restore.
 */
export function ReadMarks() {
  useEffect(() => {
    const apply = () => decorate(loadStore());
    apply();
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) apply();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, apply);
    window.addEventListener("pageshow", apply);
    document.addEventListener("i18n:change", apply);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, apply);
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

  // 3. Path graphs: read / next state on nodes, edges and the ordered list.
  document.querySelectorAll<HTMLElement>("[data-parcours]").forEach((root) => {
    const notes = [
      ...root.querySelectorAll<HTMLElement>(".pg-node[data-slug]"),
    ].map((n) => ({
      el: n,
      slug: n.dataset.slug!,
      prereqs: (n.dataset.prereqs ?? "").split(" ").filter(Boolean),
    }));
    const next = nextToRead(notes, store);
    for (const n of notes) {
      n.el.classList.toggle("is-read", isRead(store, n.slug));
      n.el.classList.toggle("is-next", n.slug === next);
    }
    root.querySelectorAll<SVGElement>(".pg-edge[data-from]").forEach((e) => {
      e.classList.toggle("is-read", isRead(store, e.dataset.from));
    });
    root.querySelectorAll<HTMLElement>("li[data-slug]").forEach((li) => {
      li.classList.toggle("is-next", li.dataset.slug === next);
    });
    // A graph wider than the screen scrolls sideways: bring the note to read
    // next (else the first one) into view, once, without animating.
    root.querySelectorAll<HTMLElement>(".parcours-graph").forEach((box) => {
      if (box.dataset.scrolled || box.scrollWidth <= box.clientWidth) return;
      box.dataset.scrolled = "1";
      const svg = [...box.querySelectorAll<SVGSVGElement>("svg.pg")].find(
        (s) => s.getClientRects().length,
      );
      const node =
        svg?.querySelector<SVGGraphicsElement>(".pg-node.is-next") ??
        svg?.querySelector<SVGGraphicsElement>(".pg-node");
      if (!node) return;
      const b = box.getBoundingClientRect();
      const r = node.getBoundingClientRect();
      box.scrollLeft += r.left + r.width / 2 - (b.left + b.width / 2);
    });
    const callout = root.querySelector<HTMLElement>("[data-parcours-next]");
    if (callout) {
      const link = callout.querySelector("a");
      const target = notes.find((n) => n.slug === next);
      callout.hidden = !target;
      if (link && target) {
        link.setAttribute("href", `/posts/${target.slug}/`);
        link.textContent = target.el.getAttribute("aria-label") ?? target.slug;
      }
    }
  });
}
