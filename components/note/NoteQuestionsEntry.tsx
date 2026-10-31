"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { dayKey } from "@/lib/srs";
import { countSaved, dueQuestions, loadAllNoteDecks } from "@/lib/note-quiz";

/**
 * The /cartes/ index's link to the note-questions review (/cartes/revision/),
 * with today's due count and the number saved — both from localStorage, so
 * they appear after hydration; the static HTML is just the link.
 */
export function NoteQuestionsEntry() {
  const locale = useLocale();
  const tr = (k: string, vars?: Record<string, string | number>) =>
    t(`cartesIndex.${k}`, vars, locale);
  const [counts, setCounts] = useState<{ due: number; saved: number } | null>(null);

  useEffect(() => {
    try {
      const all = loadAllNoteDecks(localStorage);
      setCounts({ due: dueQuestions(all, dayKey()).length, saved: countSaved(all) });
    } catch {
      /* no storage: the link alone */
    }
  }, []);

  return (
    <section className="cartes-index-group cartes-index-notes">
      <ul className="cartes-index-list">
        <li className="cartes-index-deck">
          <a href="/cartes/revision/">{tr("noteQuestions")}</a>
          {counts && (
            <span className="cartes-index-count">
              {counts.due > 0 && (
                <strong className="cartes-index-due">
                  {tr("noteQuestionsDue", { count: counts.due })}
                </strong>
              )}
              {counts.due > 0 && " · "}
              {tr("noteQuestionsSaved", { count: counts.saved })}
            </span>
          )}
        </li>
      </ul>
      <p className="cartes-index-note-intro">{tr("noteQuestionsIntro")}</p>
    </section>
  );
}
