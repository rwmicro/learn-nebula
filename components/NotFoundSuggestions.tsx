"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { pathTerms, suggestNotes, type NoteIndexEntry } from "@/lib/note-suggest";

/**
 * "Did you mean…" for the 404. The export is static, so the requested URL is
 * only known in the browser: read location.pathname, fuzzy-match it against
 * /notes-index.json (lib/note-suggest.ts) and offer the closest notes plus a
 * home-page search for the words in the path. Renders nothing until then, and
 * nothing at all when the path holds no usable word.
 */
export function NotFoundSuggestions() {
  const locale = useLocale();
  const [words, setWords] = useState<string[]>([]);
  const [notes, setNotes] = useState<NoteIndexEntry[]>([]);

  useEffect(() => {
    const path = location.pathname;
    const w = pathTerms(path).leaf;
    if (!w.length) return;
    let cancelled = false;
    fetch("/notes-index.json")
      .then((r) => (r.ok ? (r.json() as Promise<NoteIndexEntry[]>) : []))
      .then((all) => {
        if (cancelled) return;
        setWords(w);
        setNotes(suggestNotes(path, all));
      })
      .catch(() => {
        // Offline / index missing: the search link alone still helps.
        if (!cancelled) setWords(w);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!words.length) return null;
  const q = words.join(" ");
  const link = "text-[#003366] underline underline-offset-2";
  return (
    <section className="mt-8 text-body leading-relaxed">
      {notes.length > 0 && (
        <>
          <h2 className="m-0 mb-2 text-[1.15em] font-medium">
            {t("notFound.suggestions", undefined, locale)}
          </h2>
          <ul className="m-0 mb-5 list-disc ps-6">
            {notes.map((n) => (
              <li key={n.href} className="mb-1">
                <a href={n.href} className={link}>
                  {n.title}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="m-0">
        <a href={`/?q=${encodeURIComponent(q)}`} className={link}>
          {t("notFound.search", { q }, locale)}
        </a>
      </p>
    </section>
  );
}
