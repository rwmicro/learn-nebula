"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { ActivityCalendar } from "@/components/ActivityCalendar";
import {
  listBookmarks,
  listHighlights,
  loadBookmarks,
  loadHighlights,
  saveBookmarks,
  toggleBookmark,
  BOOKMARKS_KEY,
  HIGHLIGHTS_KEY,
} from "@/lib/personal";
import { textFragmentUrl } from "@/lib/text-fragment";

const noteHref = (slug: string) => `/posts/${slug.split("/").map(encodeURIComponent).join("/")}/`;

/**
 * /progression/: the regularity calendar, the "à lire plus tard" list and the
 * highlights of every note, all from this browser (lib/personal.ts).
 */
export function MyMarks() {
  const locale = useLocale();
  const tr = (k: string, v?: Record<string, string | number>) => t(`marks.${k}`, v, locale);
  const [bm, setBm] = useState<ReturnType<typeof listBookmarks> | null>(null);
  const [hl, setHl] = useState<ReturnType<typeof listHighlights> | null>(null);

  useEffect(() => {
    const load = () => {
      setBm(listBookmarks(loadBookmarks()));
      setHl(listHighlights(loadHighlights()));
    };
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === BOOKMARKS_KEY || e.key === HIGHLIGHTS_KEY) load();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("gk:progress-synced", load);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("gk:progress-synced", load);
    };
  }, []);

  return (
    <>
      <section className="progression-marks progression-marks--cal" aria-labelledby="marks-cal">
        <h2 id="marks-cal" className="progression-h2">
          {t("calendar.title", undefined, locale)}
        </h2>
        <ActivityCalendar />
      </section>

      <section className="progression-marks" aria-labelledby="marks-bm">
        <h2 id="marks-bm" className="progression-h2">
          {tr("bookmarksTitle")}
        </h2>
        {bm && bm.length === 0 && <p className="progression-muted">{tr("bookmarksEmpty")}</p>}
        {bm && bm.length > 0 && (
          <ul className="marks-list">
            {bm.map((b) => (
              <li key={b.slug}>
                <a href={noteHref(b.slug)}>{b.title}</a>
                <button
                  type="button"
                  className="marks-remove"
                  aria-label={tr("remove", { title: b.title })}
                  onClick={() => {
                    const next = toggleBookmark(loadBookmarks(), b.slug, b.title);
                    saveBookmarks(next);
                    setBm(listBookmarks(next));
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="progression-marks" aria-labelledby="marks-hl">
        <h2 id="marks-hl" className="progression-h2">
          {tr("highlightsTitle")}
        </h2>
        {hl && hl.length === 0 && <p className="progression-muted">{tr("highlightsEmpty")}</p>}
        {hl && hl.length > 0 && (
          <ul className="marks-hl">
            {hl.map((h) => (
              <li key={`${h.slug}#${h.id}`}>
                <blockquote>
                  <a href={textFragmentUrl(noteHref(h.slug), h.q)}>{h.q}</a>
                </blockquote>
                {h.n && <p className="marks-hl-note">{h.n}</p>}
                <p className="marks-hl-src">
                  <a href={noteHref(h.slug)}>{h.title}</a>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
