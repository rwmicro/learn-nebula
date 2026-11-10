import { t, i18nProps, disciplineKey } from "@/lib/i18n";
import type { AnkiDeck } from "@/lib/anki";
import { NoteQuestionsEntry } from "@/components/note/NoteQuestionsEntry";
import { CartesToday, DeckDue, StartedDecks } from "@/components/review/CartesToday";
import { homeFolderLabel } from "@/lib/content";
import { CartesPhone, type PhoneDeck } from "@/components/review/CartesPhone";
import { CartesDesk } from "@/components/review/CartesDesk";
import { familyOfFolder } from "@/lib/path-family";
import { fold } from "@/lib/palette-match";
import { PageHeader } from "@/components/ui/PageHeader";

/**
 * /cartes/ — every Anki deck (lib/anki.ts's manifest), grouped under the vault
 * folder its .apkg sat in, so a deck reads next to the notes it drills (the
 * label keeps only the telling part: "Arabe › Libanais", not "Social
 * Sciences › Languages - Dialects › Arabe › Libanais › Anki"). Decks the
 * reader has started are listed again on top, with today's load.
 * Same plain document-flow layout as /frise/ (components/explore/Frise.tsx).
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

  const phoneDecks = decks.map(phoneDeck);

  return (
    <main className="cartes-index tab-root">
      <CartesPhone decks={phoneDecks} />
      {/* From 1024px it stands in for the list (cartes-desk.css). */}
      <CartesDesk decks={phoneDecks} />
      <PageHeader
        name="cartes-index"
        title={t("cartesIndex.title")}
        titleProps={i18nProps("cartesIndex.title")}
        intro={t("cartesIndex.intro")}
        introProps={i18nProps("cartesIndex.intro")}
      />

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

/** A deck as the /cartes/ lists show it: its subject (a language, a
 *  discipline), its own name, its colour family. */
export function phoneDeck(d: AnkiDeck): PhoneDeck {
  // "Arabe › Libanais" reads "Arabe libanais"; elsewhere the discipline
  // is implied by the colour and only the last folder is kept ("Réseau").
  const family = familyOfFolder(d.folder);
  const parts = folderLabel(d.folder).split(" › ");
  const place = family === "langues" ? [parts[0], ...parts.slice(1).map((p) => p.toLowerCase())].join(" ") : parts[parts.length - 1];
  // "Anglais · Anglais Vocabulaire TOEIC" says the language twice: the
  // deck's own name loses a leading copy of the place.
  // A deck named "🖋️ Figures de Style" loses its leading emoji.
  const own = d.name.replace(/^[^\p{L}\p{N}]+/u, "") || d.name;
  const name = place && fold(own).startsWith(fold(place) + " ") ? own.slice(place.length).replace(/^[\s·:–-]+/, "") : own;
  const label = place && place !== "—" && fold(name) !== fold(place) ? `${place} · ${name}` : name;
  // The discipline folders keep their English names on disk ("Geography",
  // "History"): the subject is shown through its `discipline.*` key, so it
  // reads "Géographie" in French and follows the reader's language.
  const groupKey = family !== "langues" && place && place !== "—" ? disciplineKey(place) : null;
  const discipline = d.folder.replace(/\\/g, "/").split("/")[1] ?? "";
  return {
    slug: d.slug,
    label,
    name,
    group: place && place !== "—" ? place : name,
    groupKey,
    discipline,
    count: d.count,
    family,
  };
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

