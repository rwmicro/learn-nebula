import { t, i18nAttrs } from "@/lib/i18n";
import type { AnkiDeck } from "@/lib/anki";
import { NoteQuestionsEntry } from "@/components/NoteQuestionsEntry";
import { CartesToday, DeckDue } from "@/components/CartesToday";

/**
 * /cartes/ — every Anki deck (lib/anki.ts's manifest), grouped under the vault
 * folder its .apkg sat in, so a deck reads next to the notes it drills.
 * Same plain document-flow layout as /frise/ (components/Frise.tsx).
 */
export function CartesIndex({ decks }: { decks: AnkiDeck[] }) {
  const groups = new Map<string, AnkiDeck[]>();
  for (const d of decks) {
    const list = groups.get(d.folder) ?? [];
    list.push(d);
    groups.set(d.folder, list);
  }
  const folders = [...groups.keys()].sort((a, b) => a.localeCompare(b));

  return (
    <main className="cartes-index">
      <a href="/" className="cartes-index-back">
        ← {t("nav.home")}
      </a>
      <h1 className="cartes-index-title" {...attrs(i18nAttrs("cartesIndex.title"))}>
        {t("cartesIndex.title")}
      </h1>
      <p className="cartes-index-intro" {...attrs(i18nAttrs("cartesIndex.intro"))}>
        {t("cartesIndex.intro")}
      </p>

      {/* Everything due today, all decks and note questions together. */}
      <CartesToday decks={decks} />

      {/* Questions saved from the notes' [!quiz] cards (public/js/quiz.js). */}
      <NoteQuestionsEntry />
      <p className="cartes-index-progress">
        <a href="/progression/" {...attrs(i18nAttrs("cartesIndex.progression"))}>
          {t("cartesIndex.progression")}
        </a>
      </p>

      {folders.length === 0 ? (
        <p className="cartes-index-empty" {...attrs(i18nAttrs("cartesIndex.empty"))}>
          {t("cartesIndex.empty")}
        </p>
      ) : (
        folders.map((folder) => (
          <section key={folder} className="cartes-index-group">
            <h2 className="cartes-index-folder">{folderLabel(folder)}</h2>
            <ul className="cartes-index-list">
              {groups
                .get(folder)!
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((d) => (
                  <li key={d.slug} className="cartes-index-deck">
                    <a href={`/cartes/${d.slug}/`}>{d.name}</a>
                    <span className="cartes-index-meta">
                      <DeckDue deck={d} />
                      {d.count > 0 && (
                        <span
                          className="cartes-index-count"
                          {...attrs(i18nAttrs("cartesIndex.count", { count: d.count }))}
                        >
                          {t("cartesIndex.count", { count: d.count })}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}

/** "Social Sciences/Languages - Dialects/Spanish" → "Social Sciences ›
 *  Languages - Dialects › Spanish"; a deck at the vault root has folder ".". */
function folderLabel(folder: string): string {
  const parts = folder.split(/[\\/]/).filter((p) => p && p !== ".");
  return parts.length ? parts.join(" › ") : "—";
}

// lib/i18n's helpers emit attribute *strings* for the HTML-string builders in
// lib/html.ts; in JSX they have to come back as a props object (see
// components/RecentNotes.tsx, same pattern).
function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/ ([\w-]+)="([^"]*)"/g))
    out[m[1]] = m[2].replace(/&quot;/g, '"');
  return out;
}
