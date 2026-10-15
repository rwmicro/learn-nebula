import { t, i18nAttrs, disciplineKey } from "@/lib/i18n";
import type { Discipline, TagGroup, ThemeNote } from "@/lib/content";
import { ReadMarks } from "@/components/ReadMarks";
import { ThemesFilter } from "@/components/ThemesFilter";
import { AppBack } from "@/components/AppBack";

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

/** Tags that only restate a top folder (on hundreds of notes, they would
 *  dwarf every real theme); their pages stay, the cloud leaves them out. */
const CLOUD_HIDDEN = new Set(["sciences-sociales", "sciences-appliquees"]);

/** Size step of a tag in the cloud, from its note count. */
function tier(n: number): number {
  return n >= 40 ? 4 : n >= 15 ? 3 : n >= 6 ? 2 : 1;
}

/** Each tag under the discipline most of its notes belong to ("" when they
 *  sit directly under a top folder), groups A→Z by their French name. */
function tagsByDiscipline(tags: TagGroup[]) {
  const groups = new Map<string, TagGroup[]>();
  for (const g of tags) {
    if (CLOUD_HIDDEN.has(g.slug)) continue;
    const votes = new Map<string, number>();
    for (const n of g.notes) votes.set(n.discipline, (votes.get(n.discipline) ?? 0) + 1);
    const home = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    groups.set(home, [...(groups.get(home) ?? []), g]);
  }
  const label = (d: string) => {
    const key = d ? disciplineKey(d) : null;
    return key ? t(key) : d || t("themes.root");
  };
  return [...groups.entries()]
    .map(([discipline, list]) => ({ discipline, list }))
    .sort((a, b) =>
      !a.discipline ? 1 : !b.discipline ? -1 : label(a.discipline).localeCompare(label(b.discipline), "fr"),
    );
}

export function ThemesIndex({
  disciplines,
  tags,
}: {
  disciplines: Discipline[];
  tags: TagGroup[];
}) {
  const groups = tagsByDiscipline(tags);
  const shownTags = groups.reduce((n, g) => n + g.list.length, 0);
  return (
    <main className="themes-page themes-page--index">
      <Back href="/" labelKey="nav.home" phone={["/notes/", "tabbar.notes"]} />
      <h1 className="themes-title" {...attrs(i18nAttrs("themes.title"))}>
        {t("themes.title")}
      </h1>
      <p className="themes-intro" {...attrs(i18nAttrs("themes.intro"))}>
        {t("themes.intro")}
      </p>

      <h2 className="themes-h2" {...attrs(i18nAttrs("themes.disciplines"))}>
        {t("themes.disciplines")}
      </h2>
      {TOPS.map((top) => (
        <section key={top.folder} className="themes-top">
          <h3 className="themes-h3" {...attrs(i18nAttrs(top.key))}>
            {t(top.key)}
          </h3>
          <ul className="themes-cloud themes-cloud--compact">
            {disciplines
              .filter((d) => d.top === top.folder)
              .sort((a, b) => localName(a.name).localeCompare(localName(b.name), "fr"))
              .map((d) => (
                <li key={d.slug}>
                  <a href={`/disciplines/${d.slug}/`}>
                    <DisciplineName name={d.name} />
                  </a>
                  <span className="themes-count">{d.count}</span>
                </li>
              ))}
          </ul>
        </section>
      ))}

      <h2 className="themes-h2" id="themes-tags-h" {...attrs(i18nAttrs("themes.tags"))}>
        {t("themes.tags")}
      </h2>
      <p className="themes-intro" {...attrs(i18nAttrs("themes.tagsIntro"))}>
        {t("themes.tagsIntro")}
      </p>
      <ThemesFilter total={shownTags} />
      <div className="themes-groups" data-themes-groups>
        {groups.map(({ discipline, list }) => {
          const common = list.filter((g) => g.notes.length > MIN_COMMON);
          const rare = list.filter((g) => g.notes.length <= MIN_COMMON);
          return (
            <section key={discipline || "_"} className="themes-group" data-themes-group>
              <h3 className="themes-h3">
                {discipline ? (
                  <DisciplineName name={discipline} />
                ) : (
                  <span {...attrs(i18nAttrs("themes.root"))}>{t("themes.root")}</span>
                )}
              </h3>
              <TagCloud tags={common} />
              {rare.length > 0 && (
                <details className="themes-rare" data-themes-rare>
                  <summary {...attrs(i18nAttrs("themes.more", { n: rare.length }))}>
                    {t("themes.more", { n: rare.length })}
                  </summary>
                  <TagCloud tags={rare} />
                </details>
              )}
            </section>
          );
        })}
      </div>
      <p className="themes-filter-empty" data-themes-empty hidden {...attrs(i18nAttrs("themes.filterEmpty"))}>
        {t("themes.filterEmpty")}
      </p>
      <ReadMarks />
    </main>
  );
}

/** Tags on this many notes or fewer fold behind "N autres" in their group. */
const MIN_COMMON = 2;

function TagCloud({ tags }: { tags: TagGroup[] }) {
  if (!tags.length) return null;
  return (
    <ul className="themes-cloud">
      {tags.map((g) => (
        <li key={g.slug} data-name={g.name} className={`themes-tier-${tier(g.notes.length)}`}>
          <a href={`/themes/${g.slug}/`}>{g.name}</a>
          <span className="themes-count">{g.notes.length}</span>
        </li>
      ))}
    </ul>
  );
}

/** A discipline's name in the reader's language ("Biology" → "Biologie"),
 *  swapped at runtime like the rest; the folder name when there is no key. */
function DisciplineName({ name }: { name: string }) {
  const key = disciplineKey(name);
  if (!key) return <>{name}</>;
  return <span {...attrs(i18nAttrs(key))}>{t(key)}</span>;
}

/** "1 note" / "12 notes". */
function NoteCount({ n, className }: { n: number; className?: string }) {
  const key = n === 1 ? "themes.countOne" : "themes.count";
  return (
    <span className={className} {...attrs(i18nAttrs(key, { n }))}>
      {t(key, { n })}
    </span>
  );
}

/** The build-time (French) name of a discipline, for sorting. */
function localName(name: string): string {
  const key = disciplineKey(name);
  return key ? t(key) : name;
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
      <Back href="/themes/" labelKey="themes.all" phone={["/themes/", "themes.title"]} />
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
      <ReadMarks />
    </main>
  );
}

export function DisciplinePage({ discipline }: { discipline: Discipline }) {
  return (
    <main className="themes-page">
      <Back href="/themes/" labelKey="themes.all" phone={["/notes/", "tabbar.notes"]} />
      <p
        className="themes-kicker"
        {...attrs(i18nAttrs("themes.disciplineKicker"))}
      >
        {t("themes.disciplineKicker")}
      </p>
      <h1 className="themes-title">
        <DisciplineName name={discipline.name} />
      </h1>
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
      <ReadMarks />
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
        {name ? (
          <DisciplineName name={name} />
        ) : (
          <span {...attrs(i18nAttrs("themes.root"))}>{t("themes.root")}</span>
        )}
        {showCount && <span className="themes-count">{notes.length}</span>}
      </h2>
      <ul className="themes-notes" data-read-marks>
        {notes.map((n) => (
          <li key={n.href}>
            <a href={n.href}>{n.title}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Back({ href, labelKey, phone }: { href: string; labelKey: string; phone: [string, string] }) {
  return (
    <>
      <AppBack href={phone[0]} labelKey={phone[1]} />
      <a href={href} className="old-back themes-back">
        ← <span {...attrs(i18nAttrs(labelKey))}>{t(labelKey)}</span>
      </a>
    </>
  );
}

function Count({ n }: { n: number }) {
  return (
    <p className="themes-intro">
      <NoteCount n={n} />
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
