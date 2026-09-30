import { t, i18nAttrs } from "@/lib/i18n";
import type { Discipline, TagGroup, ThemeNote } from "@/lib/content";

/**
 * The /themes/ pages: an index of disciplines and tags, one page per tag
 * shared by several notes, one per discipline (second-level folder). Plain
 * server-rendered lists in the /frise/ style; the data comes from
 * getTags()/getDisciplines() in lib/content.ts.
 */

const TOPS = [
  { folder: "Applied Sciences", key: "nav.appliedsciences" },
  { folder: "Social Sciences", key: "nav.socialsciences" },
];

export function ThemesIndex({
  disciplines,
  tags,
}: {
  disciplines: Discipline[];
  tags: TagGroup[];
}) {
  return (
    <main className="themes-page">
      <Back href="/" labelKey="nav.home" />
      <h1 className="themes-title" {...attrs(i18nAttrs("themes.title"))}>
        {t("themes.title")}
      </h1>
      <p className="themes-intro" {...attrs(i18nAttrs("themes.intro"))}>
        {t("themes.intro")}
      </p>

      <h2 className="themes-h2" {...attrs(i18nAttrs("themes.disciplines"))}>
        {t("themes.disciplines")}
      </h2>
      <div className="themes-tops">
        {TOPS.map((top) => (
          <section key={top.folder}>
            <h3 className="themes-h3" {...attrs(i18nAttrs(top.key))}>
              {t(top.key)}
            </h3>
            <ul className="themes-list">
              {disciplines
                .filter((d) => d.top === top.folder)
                .map((d) => (
                  <li key={d.slug}>
                    <a href={`/disciplines/${d.slug}/`}>{d.name}</a>
                    <span className="themes-count">{d.count}</span>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>

      <h2 className="themes-h2" {...attrs(i18nAttrs("themes.tags"))}>
        {t("themes.tags")}
      </h2>
      <p className="themes-intro" {...attrs(i18nAttrs("themes.tagsIntro"))}>
        {t("themes.tagsIntro")}
      </p>
      <ul className="themes-cloud">
        {tags.map((g) => (
          <li key={g.slug}>
            <a href={`/themes/${g.slug}/`}>{g.name}</a>
            <span className="themes-count">{g.notes.length}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}

export function TagPage({ tag }: { tag: TagGroup }) {
  // Grouped by discipline, the largest group first: a tag like "réseau" spans
  // Computer Science and Linguistics, and each reads better on its own.
  const groups = new Map<string, ThemeNote[]>();
  for (const n of tag.notes) {
    groups.set(n.discipline, [...(groups.get(n.discipline) ?? []), n]);
  }
  const sections = [...groups.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "fr"),
  );
  return (
    <main className="themes-page">
      <Back href="/themes/" labelKey="themes.all" />
      <p className="themes-kicker" {...attrs(i18nAttrs("themes.tagKicker"))}>
        {t("themes.tagKicker")}
      </p>
      <h1 className="themes-title">{tag.name}</h1>
      <Count n={tag.notes.length} />
      {sections.map(([discipline, notes]) => (
        <NoteSection
          key={discipline}
          name={discipline}
          notes={notes}
          showCount={sections.length > 1}
        />
      ))}
    </main>
  );
}

export function DisciplinePage({ discipline }: { discipline: Discipline }) {
  return (
    <main className="themes-page">
      <Back href="/themes/" labelKey="themes.all" />
      <p className="themes-kicker" {...attrs(i18nAttrs("themes.disciplineKicker"))}>
        {t("themes.disciplineKicker")}
      </p>
      <h1 className="themes-title">{discipline.name}</h1>
      <Count n={discipline.count} />
      {discipline.tags.length > 0 && (
        <>
          <h2 className="themes-h3" {...attrs(i18nAttrs("themes.topTags"))}>
            {t("themes.topTags")}
          </h2>
          <ul className="themes-cloud themes-cloud--compact">
            {discipline.tags.map((g) => (
              <li key={g.slug}>
                <a href={`/themes/${g.slug}/`}>{g.name}</a>
                <span className="themes-count">{g.count}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {discipline.sections.map((s) => (
        <NoteSection
          key={s.name}
          name={s.name}
          notes={s.notes}
          showCount={discipline.sections.length > 1}
        />
      ))}
    </main>
  );
}

function NoteSection({
  name,
  notes,
  showCount,
}: {
  name: string;
  notes: ThemeNote[];
  showCount: boolean;
}) {
  return (
    <section>
      <h2 className="themes-h2">
        {name ? name : <span {...attrs(i18nAttrs("themes.root"))}>{t("themes.root")}</span>}
        {showCount && <span className="themes-count">{notes.length}</span>}
      </h2>
      <ul className="themes-notes">
        {notes.map((n) => (
          <li key={n.href}>
            <a href={n.href}>{n.title}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Back({ href, labelKey }: { href: string; labelKey: string }) {
  return (
    <a href={href} className="themes-back">
      ← <span {...attrs(i18nAttrs(labelKey))}>{t(labelKey)}</span>
    </a>
  );
}

function Count({ n }: { n: number }) {
  return (
    <p className="themes-intro" {...attrs(i18nAttrs("themes.count", { n }))}>
      {t("themes.count", { n })}
    </p>
  );
}

// lib/i18n's helpers emit attribute *strings* for the HTML-string builders in
// lib/html.ts; in JSX they have to come back as a props object (same as
// components/Frise.tsx).
function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/ ([\w-]+)="([^"]*)"/g)) {
    out[m[1]] = m[2].replace(/&quot;/g, '"');
  }
  return out;
}
