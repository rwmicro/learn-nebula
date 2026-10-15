import { t, i18nAttrs } from "@/lib/i18n";
import type { KeyPoint } from "@/lib/path-sheet";
import { PrintButton } from "@/components/PrintButton";
import { AppBack } from "@/components/AppBack";

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
}: {
  name: string;
  slug: string;
  notes: SheetNote[];
  math: boolean;
}) {
  let qn = 0;
  const numbered = notes.map((n) => ({ ...n, questions: n.questions.map((q) => ({ ...q, n: ++qn })) }));
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
          ← <span {...attrs(i18nAttrs("fiche.back"))}>{t("fiche.back")}</span>
        </a>
        <PrintButton />
      </div>
      <p className="fiche-kicker" {...attrs(i18nAttrs("fiche.kicker"))}>
        {t("fiche.kicker")}
      </p>
      <h1 className="fiche-title">{name}</h1>
      <p className="fiche-meta" {...attrs(i18nAttrs(metaKey, metaVars))}>
        {t(metaKey, metaVars)}
      </p>

      {filled.length === 0 && (
        <p className="fiche-empty" {...attrs(i18nAttrs("fiche.empty"))}>
          {t("fiche.empty")}
        </p>
      )}

      <ol className="fiche-notes">
        {numbered.map((n) => {
          const empty = !n.definitions.length && !n.keys.length && !n.questions.length;
          return (
            <li key={n.slug} className={empty ? "fiche-note is-empty" : "fiche-note"}>
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
          <h2 id="fiche-answers-h" className="fiche-answers-title" {...attrs(i18nAttrs("fiche.answers"))}>
            {t("fiche.answers")}
          </h2>
          <ol>
            {answers.map((q) => (
              <li key={q.n} value={q.n} dangerouslySetInnerHTML={{ __html: q.a }} />
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/ ([\w-]+)="([^"]*)"/g)) out[m[1]] = m[2].replace(/&quot;/g, '"');
  return out;
}
