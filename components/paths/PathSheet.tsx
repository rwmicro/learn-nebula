import { t, i18nProps } from "@/lib/i18n";
import type { KeyPoint } from "@/lib/path-sheet";
import { PrintButton } from "@/components/ui/PrintButton";
import { AppBack } from "@/components/layout/AppBack";
import type { PathLevel } from "@/lib/path-levels";

export interface SheetNote {
  slug: string;
  title: string;
  href: string;
  definitions: { term: string; def: string }[];
  keys: KeyPoint[];
  /** Quiz cards, HTML as the note renders them. */
  questions: { q: string; a: string }[];
}

/**
 * /parcours/<slug>/fiche/: one page to revise a path from, made for paper
 * (assets/css/fiche.css carries the print rules). Notes in reading order,
 * questions numbered across the whole sheet, answers gathered at the end so
 * the sheet can be used to test oneself.
 */
export function PathSheet({
  name,
  slug,
  notes,
  math,
  levels = [],
}: {
  name: string;
  slug: string;
  notes: SheetNote[];
  math: boolean;
  /** The path's levels (lib/path-levels.ts); phones show one at a time. */
  levels?: PathLevel[];
}) {
  const levelOf = (i: number) => levels.find((l) => i >= l.from && i < l.to)?.n ?? 1;
  let qn = 0;
  const numbered = notes.map((n, i) => ({
    ...n,
    level: levelOf(i),
    questions: n.questions.map((q) => ({ ...q, n: ++qn, level: levelOf(i) })),
  }));
  const answers = numbered.flatMap((n) => n.questions);
  const metaKey = answers.length ? "fiche.meta" : "fiche.metaNoQuiz";
  const metaVars = { notes: notes.length, questions: answers.length };
  const filled = numbered.filter((n) => n.definitions.length || n.keys.length || n.questions.length);
  return (
    <main className="fiche-page">
      {math && <link rel="stylesheet" href="/katex/katex.min.css" />}
      <div className="fiche-bar">
        <AppBack href={`/parcours/${slug}/`} labelKey="tabbar.parcours" />
        <a href={`/parcours/${slug}/`} className="old-back fiche-back">
          ← <span {...i18nProps("fiche.back")}>{t("fiche.back")}</span>
        </a>
        <PrintButton />
      </div>
      <p className="fiche-kicker" {...i18nProps("fiche.kicker")}>
        {t("fiche.kicker")}
      </p>
      <h1 className="fiche-title">{name}</h1>
      <p className="fiche-meta" {...i18nProps(metaKey, metaVars)}>
        {t(metaKey, metaVars)}
      </p>

      {/* Phones: one level at a time (fiche.css :has rules, levels 1–8). */}
      {levels.length > 1 && levels.length <= 8 && (
        <>
          {levels.map((l) => (
            <input
              key={l.n}
              type="radio"
              name="fiche-level"
              id={`fiche-l-${l.n}`}
              className="fiche-radio"
              defaultChecked={l.n === 1}
            />
          ))}
          <div className="fiche-levels" role="group" aria-label={t("fiche.levelsAria")} data-i18n-aria-label="fiche.levelsAria">
            {levels.map((l) => (
              <label key={l.n} htmlFor={`fiche-l-${l.n}`} {...i18nProps("fiche.level", { n: l.n })}>
                {t("fiche.level", { n: l.n })}
              </label>
            ))}
          </div>
        </>
      )}

      {filled.length === 0 && (
        <p className="fiche-empty" {...i18nProps("fiche.empty")}>
          {t("fiche.empty")}
        </p>
      )}

      <ol className="fiche-notes">
        {numbered.map((n) => {
          const empty = !n.definitions.length && !n.keys.length && !n.questions.length;
          return (
            <li key={n.slug} className={empty ? "fiche-note is-empty" : "fiche-note"} data-level={n.level}>
              <h2 className="fiche-note-title">
                <a href={n.href}>{n.title}</a>
              </h2>
              {n.definitions.length > 0 && (
                <dl className="fiche-defs">
                  {n.definitions.map((d) => (
                    <div key={d.term}>
                      <dt>{d.term}</dt>
                      <dd>{d.def}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {n.keys.length > 0 && (
                <ul className="fiche-keys">
                  {/* Phones: a label on the card when the first point has no
                      title of its own (hidden on desktop and paper). */}
                  {!n.keys[0].title && (
                    <li className="fiche-keys-label" aria-hidden="true" {...i18nProps("fiche.keyIdea")}>
                      {t("fiche.keyIdea")}
                    </li>
                  )}
                  {n.keys.map((k, i) => (
                    <li key={i}>
                      {k.title && <strong>{k.title}. </strong>}
                      {k.text}
                    </li>
                  ))}
                </ul>
              )}
              {n.questions.length > 0 && (
                <ol className="fiche-questions">
                  {n.questions.map((q) => (
                    <li key={q.n} value={q.n} dangerouslySetInnerHTML={{ __html: q.q }} />
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ol>

      {answers.length > 0 && (
        <section className="fiche-answers" aria-labelledby="fiche-answers-h">
          <h2 id="fiche-answers-h" className="fiche-answers-title" {...i18nProps("fiche.answers")}>
            {t("fiche.answers")}
          </h2>
          <ol>
            {answers.map((q) => (
              <li key={q.n} value={q.n} data-level={q.level} dangerouslySetInnerHTML={{ __html: q.a }} />
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}

