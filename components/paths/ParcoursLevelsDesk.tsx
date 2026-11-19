"use client";

import { useEffect } from "react";

/**
 * The path page from 1100px: one level at a time under the row of levels
 * (ParcoursDetailDesk's DeskFrise). Renders nothing; it reads what
 * ParcoursStudy already writes on the server-rendered list (each
 * `details[data-level]` gets "3/7" in `[data-level-done]`, `is-current` on
 * the level holding the next note, `is-complete`) and the path's progress
 * (`--read` on `[data-path-progress]`, from ReadMarks), and:
 *
 * - shows the current level (or the one the reader picked in the row or with
 *   the ‹ › arrows) and hides the others (`pdd-shown`);
 * - keeps the row in step: done / current / shown discs, "3/7", the ring;
 * - from nine levels, names only the shown level and its two neighbours;
 * - writes the path's percentage in the side column's ring.
 *
 * Below 1100px it does nothing: phones and tablets keep their page as is.
 */
const DESK = "(min-width: 1100px)";

export function ParcoursLevelsDesk() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-parcours]");
    const frise = root?.querySelector<HTMLElement>("[data-pdd-frise]");
    if (!root) return;
    const mq = window.matchMedia(DESK);
    const levels = [...root.querySelectorAll<HTMLDetailsElement>("details[data-level]")];
    const stops = frise ? [...frise.querySelectorAll<HTMLButtonElement>("[data-pdd-stop]")] : [];
    const lines = frise ? [...frise.querySelectorAll<HTMLElement>(".pdd-ln")] : [];
    let picked: number | null = null;
    let busy = false;

    const counts = (d: HTMLDetailsElement): [number, number] => {
      const [a, b] = (d.querySelector("[data-level-done]")?.textContent ?? "0/0").split("/").map(Number);
      return [a || 0, b || 0];
    };

    const apply = () => {
      if (busy) return;
      busy = true;
      try {
        // The path's percentage, in the ring of the side column.
        const prog = root.querySelector<HTMLElement>("[data-path-progress]");
        const pct = root.querySelector("[data-pdd-pct]");
        if (prog && pct) {
          const r = Number(prog.style.getPropertyValue("--read")) || 0;
          pct.textContent = `${r > 0 ? Math.max(1, Math.round(r * 100)) : 0} %`;
        }
        if (!mq.matches || !levels.length) {
          // toggle(…, false) leaves the attribute alone when the class is
          // absent (remove() would rewrite it and wake the observer again).
          levels.forEach((d) => d.classList.toggle("pdd-shown", false));
          return;
        }
        const cur = levels.findIndex((d) => d.classList.contains("is-current"));
        const firstOpen = levels.findIndex((d) => !d.classList.contains("is-complete"));
        const now = cur >= 0 ? cur : firstOpen >= 0 ? firstOpen : 0;
        const shown = picked ?? now;
        levels.forEach((d, i) => {
          d.classList.toggle("pdd-shown", i === shown);
          if (i === shown && !d.open) d.open = true;
          const nav = d.querySelectorAll<HTMLButtonElement>("[data-pdd-nav]");
          nav.forEach((b) => (b.disabled = Number(b.dataset.pddNav) < 0 ? i === 0 : i === levels.length - 1));
        });
        const many = stops.length > 8;
        stops.forEach((s, i) => {
          const [done, total] = counts(levels[i]);
          const complete = total > 0 && done === total;
          s.classList.toggle("is-done", complete && i !== now);
          s.classList.toggle("is-now", i === now);
          s.classList.toggle("is-shown", i === shown);
          s.classList.toggle("is-mini", many && Math.abs(i - shown) > 1);
          s.style.setProperty("--f", total ? String(done / total) : "0");
          s.classList.toggle("is-zero", done === 0);
          s.setAttribute("aria-current", i === shown ? "step" : "false");
          const c = s.querySelector("[data-pdd-count]");
          if (c) c.textContent = `${done}/${total}`;
        });
        // A line is coloured once the level it leads to is reached.
        lines.forEach((l, i) => l.classList.toggle("is-on", i + 1 <= now));
      } finally {
        busy = false;
      }
    };

    const show = (i: number) => {
      if (i < 0 || i >= levels.length) return;
      picked = i;
      apply();
    };

    const onFrise = (e: Event) => {
      const b = (e.target as Element).closest<HTMLButtonElement>("[data-pdd-stop]");
      if (b) show(stops.indexOf(b));
    };
    const onRoot = (e: Event) => {
      if (!mq.matches) return;
      const target = e.target as Element;
      const nav = target.closest<HTMLButtonElement>("[data-pdd-nav]");
      const summary = target.closest("details[data-level] > summary");
      if (!nav && !summary) return;
      // On the desktop a level's header no longer folds it: the row and the
      // arrows move between levels instead.
      e.preventDefault();
      if (nav) {
        const d = nav.closest<HTMLDetailsElement>("details[data-level]");
        show(levels.indexOf(d!) + Number(nav.dataset.pddNav));
      }
    };

    frise?.addEventListener("click", onFrise);
    root.addEventListener("click", onRoot);
    mq.addEventListener("change", apply);
    // ParcoursStudy and ReadMarks update the list after us, and again on
    // every change of progress: follow them.
    const mo = new MutationObserver(apply);
    levels.forEach((d) => mo.observe(d, { attributes: true, attributeFilter: ["class"] }));
    root.querySelectorAll("[data-level-done], [data-path-progress]").forEach((el) =>
      mo.observe(el, { attributes: true, attributeFilter: ["style"], childList: true, characterData: true, subtree: true }),
    );
    apply();
    return () => {
      frise?.removeEventListener("click", onFrise);
      root.removeEventListener("click", onRoot);
      mq.removeEventListener("change", apply);
      mo.disconnect();
    };
  }, []);
  return null;
}
