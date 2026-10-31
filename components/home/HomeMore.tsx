import { t } from "@/lib/i18n";
import { AUTHOR, ORIGINAL_AUTHOR } from "@/lib/site";
import { blackletter } from "@/components/layout/Header";

// The end of the phone home (app.css shows it below 640px only): four ways to
// wander (the graph, the timeline, the map, the themes), then a footer with
// the wordmark, a short "À propos" whose rest unfolds in place, the garden in
// three numbers and the licence. Built at build time in French, swapped by
// /js/i18n.js through data-i18n.

const L = (k: string, v?: Record<string, string | number>) => ({
  "data-i18n": k,
  ...(v ? { "data-i18n-vars": JSON.stringify(v) } : {}),
});

const sprout = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21v-7" />
    <path d="M12 14C7 14 4.5 11 4.5 6.5 9 6.5 12 9 12 14Z" />
    <path d="M12 12c0-4.5 3-7.5 7.5-7.5 0 4.5-3 7.5-7.5 7.5Z" />
  </svg>
);

/** A ring of coloured dots around a black one: the circular graph, drawn. */
function GraphDots() {
  const n = 22;
  return (
    <svg className="home-more-dots" viewBox="0 0 100 86" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        return (
          <circle
            key={i}
            cx={(50 + Math.cos(a) * 36).toFixed(2)}
            cy={(43 + Math.sin(a) * 30).toFixed(2)}
            r="3"
            fill={`hsl(${i * 16} 55% 50%)`}
          />
        );
      })}
      <circle cx="50" cy="43" r="4" fill="currentColor" />
    </svg>
  );
}

export function HomeMore({ notes, paths, languages }: { notes: number; paths: number; languages: number }) {
  const nf = new Intl.NumberFormat("fr-FR");
  const year = new Date().getFullYear();
  return (
    <section className="home-more" data-pagefind-ignore aria-label={t("dash.explore")}>
      <h2 className="dash-h" {...L("dash.explore")}>
        {t("dash.explore")}
      </h2>
      <div className="home-more-tiles">
        {/* A family tint like the three others: on --wash alone the tile
            vanished into the page. */}
        <a href="/graph/" data-family="informatique">
          <span className="home-more-art">
            <GraphDots />
          </span>
          <span className="home-more-tx">
            <b {...L("dash.graph")}>{t("dash.graph")}</b>
            <small {...L("dash.graphText")}>{t("dash.graphText")}</small>
          </span>
        </a>
        <a href="/frise/" data-family="societe">
          <span className="home-more-art">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12h18M6 9v6M12 7v10M18 10v4" />
            </svg>
          </span>
          <span className="home-more-tx">
            <b {...L("dash.frise")}>{t("dash.frise")}</b>
            <small {...L("dash.friseText")}>{t("dash.friseText")}</small>
          </span>
        </a>
        <a href="/carte/" data-family="sciences">
          <span className="home-more-art">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z" /><path d="M9 4v14M15 6v14" />
            </svg>
          </span>
          <span className="home-more-tx">
            <b {...L("dash.map")}>{t("dash.map")}</b>
            <small {...L("dash.mapText")}>{t("dash.mapText")}</small>
          </span>
        </a>
        <a href="/themes/" data-family="pensee">
          <span className="home-more-art">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5zM12 6.5v13" />
            </svg>
          </span>
          <span className="home-more-tx">
            <b {...L("dash.themes")}>{t("dash.themes")}</b>
            <small {...L("dash.themesText")}>{t("dash.themesText")}</small>
          </span>
        </a>
      </div>

      <footer className="home-more-foot">
        <p className={`home-more-mark ${blackletter.className}`} lang="en" dir="ltr">
          Garden of Knowledge
        </p>
        <details className="home-more-about">
          <summary>
            <span className="home-more-quote" {...L("dash.aboutQuote")}>
              {t("dash.aboutQuote")}
            </span>
            <span className="home-more-more" {...L("dash.readMore")}>
              {t("dash.readMore")}
            </span>
          </summary>
          <p>
            <span {...L("home.intro1")}>{t("home.intro1")}</span>{" "}
            <span {...L("home.intro2")}>{t("home.intro2")}</span>{" "}
            <span {...L("home.intro3")}>{t("home.intro3")}</span>{" "}
            <em lang="en" dir="ltr">
              The Gardener
            </em>
          </p>
        </details>
        <a className="home-more-stats" href="/jardin/" aria-label={t("dash.numbers")} data-i18n-aria-label="dash.numbers">
          <span>
            <b>{nf.format(notes)}</b>
            <small {...L("dash.nNotes")}>{t("dash.nNotes")}</small>
          </span>
          <span>
            <b>{nf.format(paths)}</b>
            <small {...L("dash.nPaths")}>{t("dash.nPaths")}</small>
          </span>
          <span>
            <b>{nf.format(languages)}</b>
            <small {...L("dash.nLangs")}>{t("dash.nLangs")}</small>
          </span>
        </a>
        <p>
          <a className="home-more-cc" href="https://creativecommons.org/licenses/by-nc-sa/4.0/">
            CC BY-NC-SA
          </a>{" "}
          © {year} {AUTHOR} ·{" "}
          <a href="https://www.gnu.org/licenses/gpl-3.0.html" {...L("dash.footerCode")}>
            {t("dash.footerCode")}
          </a>
          <br />
          <span {...L("dash.footerOrigin", { author: ORIGINAL_AUTHOR })}>
            {t("dash.footerOrigin", { author: ORIGINAL_AUTHOR })}
          </span>
        </p>
      </footer>
    </section>
  );
}
