import type { Metadata } from "next";
import { t, i18nAttrs } from "@/lib/i18n";
import { DATA_FILES, DATA_SOURCES, getFigures } from "@/lib/donnees";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/donnees.css";
import { AppBack } from "@/components/AppBack";

export const metadata: Metadata = {
  title: `Données ouvertes · ${SITE_TITLE}`,
  description: "Les fichiers ouverts du jardin (notes, graphe, carte, frise, figures), leur licence et les sources des graphiques.",
};

/**
 * /donnees/: every machine-readable file the site publishes, what is in it
 * and under which licence, then the sources the figures in the notes are
 * drawn from. Our World in Data's "every chart is downloadable" applied to a
 * garden: the notes are CC BY-NC-SA, the files that describe them too.
 */
export default function DonneesPage() {
  const figures = getFigures();
  return (
    <main className="donnees-page">
      <AppBack href="/notes/" labelKey="tabbar.notes" />
      <a href="/" className="old-back donnees-back">
        ← {t("nav.home")}
      </a>
      <h1 className="donnees-title" {...attrs(i18nAttrs("donnees.title"))}>
        {t("donnees.title")}
      </h1>
      <p className="donnees-intro">
        <span {...attrs(i18nAttrs("donnees.intro"))}>{t("donnees.intro")}</span>{" "}
        <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.fr">CC BY-NC-SA 4.0</a>.
      </p>

      <h2 className="donnees-h2" {...attrs(i18nAttrs("donnees.filesTitle"))}>
        {t("donnees.filesTitle")}
      </h2>
      <div className="donnees-scroll">
        <table className="donnees-table">
          <thead>
            <tr>
              <th {...attrs(i18nAttrs("donnees.colFile"))}>{t("donnees.colFile")}</th>
              <th {...attrs(i18nAttrs("donnees.colContent"))}>{t("donnees.colContent")}</th>
              <th {...attrs(i18nAttrs("donnees.colFormat"))}>{t("donnees.colFormat")}</th>
            </tr>
          </thead>
          <tbody>
            {DATA_FILES.map((f) => (
              <tr key={f.href}>
                <td>
                  <a href={f.href}>
                    <code>{f.href}</code>
                  </a>
                </td>
                <td {...attrs(i18nAttrs(`donnees.file_${f.key}`))}>{t(`donnees.file_${f.key}`)}</td>
                <td>{f.format}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="donnees-h2" {...attrs(i18nAttrs("donnees.sourcesTitle"))}>
        {t("donnees.sourcesTitle")}
      </h2>
      <p className="donnees-text" {...attrs(i18nAttrs("donnees.sourcesIntro", { n: figures.length }))}>
        {t("donnees.sourcesIntro", { n: figures.length })}
      </p>
      <div className="donnees-scroll">
        <table className="donnees-table">
          <thead>
            <tr>
              <th {...attrs(i18nAttrs("donnees.colSource"))}>{t("donnees.colSource")}</th>
              <th {...attrs(i18nAttrs("donnees.colUse"))}>{t("donnees.colUse")}</th>
              <th {...attrs(i18nAttrs("donnees.colLicence"))}>{t("donnees.colLicence")}</th>
            </tr>
          </thead>
          <tbody>
            {DATA_SOURCES.map((s) => (
              <tr key={s.key}>
                <td>
                  <a href={s.href}>{s.name}</a>
                </td>
                <td {...attrs(i18nAttrs(`donnees.use_${s.key}`))}>{t(`donnees.use_${s.key}`)}</td>
                <td>{s.licence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="donnees-h2" {...attrs(i18nAttrs("donnees.reuseTitle"))}>
        {t("donnees.reuseTitle")}
      </h2>
      <p className="donnees-text" {...attrs(i18nAttrs("donnees.reuse"))}>
        {t("donnees.reuse")}
      </p>
      <p className="donnees-text">
        <a href="/carte/" {...attrs(i18nAttrs("donnees.seeCarte"))}>
          {t("donnees.seeCarte")}
        </a>
        {" · "}
        <a href="/frise/" {...attrs(i18nAttrs("donnees.seeFrise"))}>
          {t("donnees.seeFrise")}
        </a>
      </p>
    </main>
  );
}

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/ ([\w-]+)="([^"]*)"/g)) out[m[1]] = m[2].replace(/&quot;/g, '"');
  return out;
}
