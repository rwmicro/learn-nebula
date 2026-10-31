"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { t, pathName } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { CHANGE_EVENT } from "@/lib/reading-progress";
import {
  QUIZ_EVENT,
  STUDY_EVENT,
  isDone,
  isStudyKey,
  loadStudyStates,
} from "@/lib/path-study";
import { fold } from "@/lib/palette-match";
import type { PathFamily } from "@/lib/path-family";

/** One path as the /parcours/ index's browser needs it. */
export interface BrowsePath {
  slug: string;
  /** Short name ("Physique", the part before " : "). */
  name: string;
  family: PathFamily | null;
  /** [slug, title] in reading order. */
  notes: [string, string][];
}

interface Started {
  path: BrowsePath;
  done: number;
  next: [string, string];
}

const RESUME_MAX = 4;

/**
 * Top of /parcours/: "Reprendre" (the paths this browser has started, with
 * the next note to read) and the filter bar (a chip per colour family and a
 * text field). The cards themselves are server-rendered by ParcoursIndex;
 * filtering only toggles `hidden` on `[data-path-card]` items (matched
 * against their `data-search`) and on the blocks and family sections left
 * empty, so the page stays complete without JavaScript.
 */
export function ParcoursBrowse({
  paths,
  families,
}: {
  paths: BrowsePath[];
  families: { id: PathFamily | null; count: number }[];
}) {
  const locale = useLocale();
  const tr = (k: string, v?: Record<string, string | number>) => t(k, v, locale);
  const [family, setFamily] = useState<PathFamily | null | "">("");
  const [query, setQuery] = useState("");
  const [started, setStarted] = useState<Started[]>([]);

  // Started paths, from the same stores as the progress bars.
  useEffect(() => {
    const apply = () => setStarted(startedPaths(paths));
    apply();
    const onStorage = (e: StorageEvent) => {
      if (isStudyKey(e.key)) apply();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, apply);
    window.addEventListener(STUDY_EVENT, apply);
    window.addEventListener(QUIZ_EVENT, apply);
    window.addEventListener("pageshow", apply);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, apply);
      window.removeEventListener(STUDY_EVENT, apply);
      window.removeEventListener(QUIZ_EVENT, apply);
      window.removeEventListener("pageshow", apply);
    };
  }, [paths]);

  const tokens = useMemo(() => fold(query).split(/\s+/).filter(Boolean), [query]);
  const status = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const main = document.getElementById("main");
    if (!main) return;
    let count = 0;
    main.querySelectorAll<HTMLElement>("[data-path-family]").forEach((sec) => {
      const inFamily = family === "" || (sec.dataset.family ?? null) === family;
      let any = false;
      sec.querySelectorAll<HTMLElement>("[data-path-block]").forEach((block) => {
        let blockAny = false;
        block.querySelectorAll<HTMLElement>("[data-path-card]").forEach((card) => {
          const text = card.dataset.search ?? "";
          const ok = inFamily && tokens.every((tok) => text.includes(tok));
          card.hidden = !ok;
          if (ok) {
            blockAny = true;
            count++;
          }
        });
        block.hidden = !blockAny;
        any ||= blockAny;
      });
      sec.hidden = !any;
    });
    // Written here rather than kept in state: the count comes from the DOM.
    if (status.current)
      status.current.textContent =
        family === "" && !tokens.length
          ? ""
          : count === 0
            ? t("parcours.filterNone", undefined, locale)
            : t(count === 1 ? "parcours.familyCountOne" : "parcours.familyCount", { n: count }, locale);
  }, [family, tokens, locale]);

  return (
    <div className="parcours-browse">
      {started.length > 0 && (
        <section className="parcours-resume" aria-labelledby="parcours-resume-h">
          <h2 className="themes-h2" id="parcours-resume-h">
            {tr("parcours.resume")}
          </h2>
          <ul className="parcours-resume-list">
            {started.map(({ path, done, next }) => (
              <li key={path.slug} data-family={path.family ?? undefined}>
                <a href={`/parcours/${path.slug}/`} className="parcours-resume-path">
                  {pathName(path, "title", locale)}
                </a>
                <span className="parcours-resume-meta">
                  {tr("reading.count", { read: done, total: path.notes.length })}
                </span>
                <span
                  className="parcours-bar"
                  aria-hidden="true"
                  style={{ ["--read" as string]: String(done / path.notes.length) }}
                >
                  <span className="parcours-bar-done" />
                </span>
                <a href={`/posts/${next[0]}/`} className="parcours-resume-next">
                  {tr("parcours.nextShort")} : {next[1]} →
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="parcours-filter" role="search">
        <input
          type="search"
          className="parcours-filter-q"
          id="parcours-filter-q"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tr("parcours.filterPlaceholder")}
          aria-label={tr("parcours.filterAria")}
          autoComplete="off"
        />
        {families.length > 1 && (
          <div className="parcours-chips" role="group" aria-label={tr("parcours.filterFamilies")}>
            <button
              type="button"
              className="parcours-chip"
              aria-pressed={family === ""}
              onClick={() => setFamily("")}
            >
              {tr("parcours.filterAll")} <span>{paths.length}</span>
            </button>
            {families.map((f) => (
              <button
                key={f.id ?? "_"}
                type="button"
                className="parcours-chip"
                data-family={f.id ?? undefined}
                aria-pressed={family === f.id}
                onClick={() => setFamily(family === f.id ? "" : f.id)}
              >
                {tr(f.id ? `parcours.family.${f.id}` : "parcours.other")} <span>{f.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="parcours-filter-status" aria-live="polite" ref={status} />
    </div>
  );
}

/** Paths begun but not finished, furthest along first, with their next note:
 *  the first one not done in reading order (a topological order, so its
 *  prerequisites all come before it and are done). */
function startedPaths(paths: BrowsePath[]): Started[] {
  const out: Started[] = [];
  for (const path of paths) {
    const { states } = loadStudyStates(
      path.notes.map(([slug]) => ({ slug, prereqs: [], quiz: [] })),
    );
    const done = path.notes.filter(([s]) => isDone(states.get(s))).length;
    if (done === 0 || done === path.notes.length) continue;
    const next = path.notes.find(([s]) => !isDone(states.get(s)))!;
    out.push({ path, done, next });
  }
  return out
    .sort((a, b) => b.done / b.path.notes.length - a.done / a.path.notes.length)
    .slice(0, RESUME_MAX);
}
