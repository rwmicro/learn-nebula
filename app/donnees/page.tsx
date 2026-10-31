import type { Metadata } from "next";
import { t, i18nProps } from "@/lib/i18n";
import { DATA_FILES, DATA_SOURCES, getFigures } from "@/lib/donnees";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/donnees.css";
import { AppBack } from "@/components/AppBack";
import { PageHeader } from "@/components/ui/PageHeader";

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
      <PageHeader
        name="donnees"
        back={{ href: "/notes/", labelKey: "tabbar.notes" }}
        title={t("donnees.title")}
        titleProps={i18nProps("donnees.title")}
        intro={
          <>
            <span {...i18nProps("donnees.intro")}>{t("donnees.intro")}</span>{" "}
            <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.fr">CC BY-NC-SA 4.0</a>.
          </>
        }
      />

      <h2 className="donnees-h2" {...i18nProps("donnees.filesTitle")}>
        {t("donnees.filesTitle")}
      </h2>
      <div className="donnees-scroll">
        <table className="donnees-table">
          <thead>
            <tr>
              <th {...i18nProps("donnees.colFile")}>{t("donnees.colFile")}</th>
              <th {...i18nProps("donnees.colContent")}>{t("donnees.colContent")}</th>
              <th {...i18nProps("donnees.colFormat")}>{t("donnees.colFormat")}</th>
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
                <td {...i18nProps(`donnees.file_${f.key}`)}>{t(`donnees.file_${f.key}`)}</td>
                <td>{f.format}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="donnees-h2" {...i18nProps("donnees.sourcesTitle")}>
        {t("donnees.sourcesTitle")}
      </h2>
      <p className="donnees-text" {...i18nProps("donnees.sourcesIntro", { n: figures.length })}>
        {t("donnees.sourcesIntro", { n: figures.length })}
      </p>
      <div className="donnees-scroll">
        <table className="donnees-table">
          <thead>
            <tr>
              <th {...i18nProps("donnees.colSource")}>{t("donnees.colSource")}</th>
              <th {...i18nProps("donnees.colUse")}>{t("donnees.colUse")}</th>
              <th {...i18nProps("donnees.colLicence")}>{t("donnees.colLicence")}</th>
            </tr>
          </thead>
          <tbody>
            {DATA_SOURCES.map((s) => (
              <tr key={s.key}>
                <td>
                  <a href={s.href}>{s.name}</a>
                </td>
                <td {...i18nProps(`donnees.use_${s.key}`)}>{t(`donnees.use_${s.key}`)}</td>
                <td>{s.licence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="donnees-h2" {...i18nProps("donnees.reuseTitle")}>
        {t("donnees.reuseTitle")}
      </h2>
      <p className="donnees-text" {...i18nProps("donnees.reuse")}>
        {t("donnees.reuse")}
      </p>
      <p className="donnees-text">
        <a href="/carte/" {...i18nProps("donnees.seeCarte")}>
          {t("donnees.seeCarte")}
        </a>
        {" · "}
        <a href="/frise/" {...i18nProps("donnees.seeFrise")}>
          {t("donnees.seeFrise")}
        </a>
      </p>
    </main>
  );
}

