import { t, i18nProps } from "@/lib/i18n";
import type { AnkiDeck } from "@/lib/anki";
import { NoteQuestionsEntry } from "@/components/NoteQuestionsEntry";
import { CartesToday, DeckDue, StartedDecks } from "@/components/CartesToday";
import { homeFolderLabel } from "@/lib/content";
import { CartesPhone } from "@/components/CartesPhone";
import { familyOfFolder } from "@/lib/path-family";
import { fold } from "@/lib/palette-match";

/**
 * /cartes/ — every Anki deck (lib/anki.ts's manifest), grouped under the vault
 * folder its .apkg sat in, so a deck reads next to the notes it drills (the
 * label keeps only the telling part: "Arabe › Libanais", not "Social
 * Sciences › Languages - Dialects › Arabe › Libanais › Anki"). Decks the
 * reader has started are listed again on top, with today's load.
 * Same plain document-flow layout as /frise/ (components/Frise.tsx).
 */
export function CartesIndex({ decks }: { decks: AnkiDeck[] }) {
  const groups = new Map<string, AnkiDeck[]>();
  for (const d of decks) {
    const label = folderLabel(d.folder);
    const list = groups.get(label) ?? [];
    list.push(d);
    groups.set(label, list);
  }
  const folders = [...groups.keys()].sort((a, b) => a.localeCompare(b));

  const phoneDecks = decks.map((d) => {
    // "Arabe › Libanais" reads "Arabe libanais"; elsewhere the discipline
    // is implied by the colour and only the last folder is kept ("Réseau").
    const family = familyOfFolder(d.folder);
    const parts = folderLabel(d.folder).split(" › ");
    const place = family === "langues" ? [parts[0], ...parts.slice(1).map((p) => p.toLowerCase())].join(" ") : parts[parts.length - 1];
    // "Anglais · Anglais Vocabulaire TOEIC" says the language twice: the
    // deck's own name loses a leading copy of the place.
    const name = place && fold(d.name).startsWith(fold(place) + " ") ? d.name.slice(place.length).replace(/^[\s·:–-]+/, "") : d.name;
    const label = place && place !== "—" && fold(name) !== fold(place) ? `${place} · ${name}` : name;
    return { slug: d.slug, label, name, group: place && place !== "—" ? place : name, count: d.count, family };
  });

  return (
    <main className="cartes-index tab-root">
      <CartesPhone decks={phoneDecks} />
      <a href="/" className="cartes-index-back">
        ← {t("nav.home")}
      </a>
      <h1 className="cartes-index-title" {...i18nProps("cartesIndex.title")}>
        {t("cartesIndex.title")}
      </h1>
      <p className="cartes-index-intro" {...i18nProps("cartesIndex.intro")}>
        {t("cartesIndex.intro")}
      </p>

      {/* Everything due today, all decks and note questions together. */}
      <CartesToday decks={decks} />
      <StartedDecks decks={decks} />

      {/* Questions saved from the notes' [!quiz] cards (public/js/quiz.js). */}
      <NoteQuestionsEntry />
      <p className="cartes-index-progress">
        <a href="/progression/" {...i18nProps("cartesIndex.progression")}>
          {t("cartesIndex.progression")}
        </a>
      </p>

      {folders.length === 0 ? (
        <p className="cartes-index-empty" {...i18nProps("cartesIndex.empty")}>
          {t("cartesIndex.empty")}
        </p>
      ) : (
        folders.map((folder) => (
          <section key={folder} className="cartes-index-group">
            <h2 className="cartes-index-folder">{folder}</h2>
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
                          {...i18nProps("cartesIndex.count", { count: d.count })}
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

/** "Social Sciences/Languages - Dialects/Arabe/Libanais/Anki" → "Arabe ›
 *  Libanais": the notes tree's label (top group dropped, display names),
 *  without the "Anki" folder the decks sit in nor the "Languages" level
 *  that every language repeats. A deck at the vault root has folder ".". */
function folderLabel(folder: string): string {
  const parts = homeFolderLabel(`${folder.replace(/\\/g, "/")}/deck`)
    .split(" › ")
    .filter((p) => p && p !== "." && !/^anki$/i.test(p) && !/^languages\b/i.test(p));
  if (parts.length) return parts.join(" › ");
  const last = folder.split(/[\\/]/).filter((p) => p && p !== "." && !/^anki$/i.test(p)).pop();
  return last ?? "—";
}

