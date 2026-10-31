import { t, disciplineKey, i18nProps } from "@/lib/i18n";
import type { Discipline, TagGroup, ThemeNote } from "@/lib/content";
import { ReadMarks } from "@/components/note/ReadMarks";
import { ThemesFilter } from "@/components/explore/ThemesFilter";
import { AppBack } from "@/components/layout/AppBack";
import { familyOfFolder, type PathFamily } from "@/lib/path-family";
import type { CSSProperties } from "react";

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
  // Phones: one list of every theme, most used first (or A→Z, by CSS order).
  const flat = tags
    .filter((g) => !CLOUD_HIDDEN.has(g.slug))
    .sort((a, b) => b.notes.length - a.notes.length || a.name.localeCompare(b.name, "fr"));
  const alpha = new Map(
    [...flat].sort((a, b) => a.name.localeCompare(b.name, "fr")).map((g, i) => [g.slug, i] as const),
  );
  return (
    <main className="themes-page themes-page--index">
      <Back href="/" labelKey="nav.home" phone={["/notes/", "tabbar.notes"]} />
      <h1 className="themes-title" {...i18nProps("themes.title")}>
        {t("themes.title")}
      </h1>
      <p className="themes-intro" {...i18nProps("themes.intro")}>
        {t("themes.intro")}
      </p>
      <p className="themes-phone-intro" {...i18nProps("themes.phoneIntro")}>
        {t("themes.phoneIntro")}
      </p>

      <h2 className="themes-h2" {...i18nProps("themes.disciplines")}>
        {t("themes.disciplines")}
      </h2>
      {TOPS.map((top) => (
        <section key={top.folder} className="themes-top">
          <h3 className="themes-h3" {...i18nProps(top.key)}>
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

      <h2 className="themes-h2" id="themes-tags-h" {...i18nProps("themes.tags")}>
        {t("themes.tags")}
      </h2>
      <p className="themes-intro" {...i18nProps("themes.tagsIntro")}>
        {t("themes.tagsIntro")}
      </p>
      <ThemesFilter total={shownTags} />
      <input type="radio" name="themes-sort" id="themes-s-freq" className="themes-radio" defaultChecked />
      <input type="radio" name="themes-sort" id="themes-s-alpha" className="themes-radio" />
      <div className="themes-sort" role="group" aria-label={t("themes.sortAria")} data-i18n-aria-label="themes.sortAria">
        <label htmlFor="themes-s-freq" {...i18nProps("themes.sortFreq")}>
          {t("themes.sortFreq")}
        </label>
        <label htmlFor="themes-s-alpha" {...i18nProps("themes.sortAlpha")}>
          {t("themes.sortAlpha")}
        </label>
      </div>
      <div className="themes-groups" data-themes-groups>
        <section className="themes-phone-list" data-themes-group>
          <ul>
            {flat.map((g) => (
              <ThemeRow key={g.slug} tag={g} order={alpha.get(g.slug) ?? 0} />
            ))}
          </ul>
        </section>
        {groups.map(({ discipline, list }) => {
          const common = list.filter((g) => g.notes.length > MIN_COMMON);
          const rare = list.filter((g) => g.notes.length <= MIN_COMMON);
          return (
            <section key={discipline || "_"} className="themes-group" data-themes-group>
              <h3 className="themes-h3">
                {discipline ? (
                  <DisciplineName name={discipline} />
                ) : (
                  <span {...i18nProps("themes.root")}>{t("themes.root")}</span>
                )}
              </h3>
              <TagCloud tags={common} />
              {rare.length > 0 && (
                <details className="themes-rare" data-themes-rare>
                  <summary {...i18nProps("themes.more", { n: rare.length })}>
                    {t("themes.more", { n: rare.length })}
                  </summary>
                  <TagCloud tags={rare} />
                </details>
              )}
            </section>
          );
        })}
      </div>
      <p className="themes-filter-empty" data-themes-empty hidden {...i18nProps("themes.filterEmpty")}>
        {t("themes.filterEmpty")}
      </p>
      <ReadMarks />
    </main>
  );
}

/** A theme on phones: an icon in its main discipline's family colour, its
 *  name, how many notes and which disciplines (up to three by name). */
function ThemeRow({ tag, order }: { tag: TagGroup; order: number }) {
  const votes = new Map<string, number>();
  for (const n of tag.notes) if (n.discipline) votes.set(n.discipline, (votes.get(n.discipline) ?? 0) + 1);
  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([d]) => d);
  const fam = ranked[0] ? familyOfFolder(`x/${ranked[0]}`) : null;
  const countKey = tag.notes.length === 1 ? "themes.countOne" : "themes.count";
  return (
    <li data-name={tag.name} data-family={fam ?? undefined} style={{ "--o-alpha": order } as CSSProperties}>
      <span className="themes-row-icon" aria-hidden="true">
        <FamilyIcon family={fam} />
      </span>
      <span className="themes-row-text">
        <a href={`/themes/${tag.slug}/`}>{tag.name}</a>
        <small>
          <span {...i18nProps(countKey, { n: tag.notes.length })}>{t(countKey, { n: tag.notes.length })}</span>
          {ranked.length > 0 && " · "}
          {ranked.length > 3 ? (
            <span {...i18nProps("themes.nDisciplines", { n: ranked.length })}>
              {t("themes.nDisciplines", { n: ranked.length })}
            </span>
          ) : (
            ranked.map((d, i) => (
              <span key={d}>
                {i > 0 && ", "}
                <DisciplineName name={d} />
              </span>
            ))
          )}
        </small>
      </span>
      <svg className="themes-row-chev" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m9 5 7 7-7 7" />
      </svg>
    </li>
  );
}

/** One line icon per colour family (lib/path-family.ts). */
function FamilyIcon({ family }: { family: PathFamily | null }) {
  const d: Record<PathFamily | "none", string> = {
    sciences: "M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 3h8M7.5 14h9",
    informatique: "m8 8-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12",
    vivant: "M5 19c0-8 5-13 14-14-1 9-6 14-14 14Zm0 0 7-7",
    pensee: "M4 20h16M5 9h14M12 4 4 9h16l-8-5M7 9v8M12 9v8M17 9v8M5 17h14",
    societe: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 9c0-3 3-5 6-5s6 2 6 5M16 5a3 3 0 0 1 0 6M18 15c2 .6 3 2.4 3 5",
    arts: "M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8ZM7.5 12h0M9 8h0M14 7.5h0",
    langues: "M4 5h9M8.5 3v2M6 5c1 4 4 7 7 8M11 5c-1 4-4 7-7 8M13 20l4-9 4 9M14.5 17h5",
    jeux: "M4 4h16v16H4zM12 4v16M4 12h16",
    none: "M6 4h9l3 3v13H6zM9 10h6M9 14h6",
  };
  return (
    <svg viewBox="0 0 24 24">
      <path d={d[family ?? "none"]} />
    </svg>
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
  return <span {...i18nProps(key)}>{t(key)}</span>;
}

/** "1 note" / "12 notes". */
function NoteCount({ n, className }: { n: number; className?: string }) {
  const key = n === 1 ? "themes.countOne" : "themes.count";
  return (
    <span className={className} {...i18nProps(key, { n })}>
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
      <p className="themes-kicker" {...i18nProps("themes.tagKicker")}>
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
        {...i18nProps("themes.disciplineKicker")}
      >
        {t("themes.disciplineKicker")}
      </p>
      <h1 className="themes-title">
        <DisciplineName name={discipline.name} />
      </h1>
      <p className="themes-intro">
        <NoteCount n={discipline.count} />
        {/* Phones: "· 3 lues" (ReadMarks fills it in). */}
        <span
          className="themes-read-count"
          data-read-progress
          data-prefix={discipline.prefix}
          data-total={discipline.count}
          data-read-short
        >
          {" · "}
          <span data-read-count />
        </span>
      </p>
      {discipline.tags.length > 0 && (
        <>
          <h2 className="themes-h3" {...i18nProps("themes.topTags")}>
            {t("themes.topTags")}
          </h2>
          <ul className="themes-cloud themes-cloud--compact">
            {/* Phones: the chip row starts with the page itself, selected. */}
            <li className="themes-chip-all" aria-current="page">
              <span {...i18nProps("frise.all")}>{t("frise.all")}</span>
            </li>
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
          <span {...i18nProps("themes.root")}>{t("themes.root")}</span>
        )}
        {showCount && <span className="themes-count">{notes.length}</span>}
      </h2>
      <ul className="themes-notes" data-read-marks>
        {notes.map((n) => (
          <li key={n.href} className={n.index ? "themes-note-index" : undefined}>
            <a href={n.href}>{n.title}</a>
            {n.minutes && (
              <small className="themes-note-min" {...i18nProps("themes.minutes", { n: n.minutes })}>
                {t("themes.minutes", { n: n.minutes })}
              </small>
            )}
            {n.index && (
              <span className="themes-index-badge" {...i18nProps("themes.indexBadge")}>
                {t("themes.indexBadge")}
              </span>
            )}
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
        ← <span {...i18nProps(labelKey)}>{t(labelKey)}</span>
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

