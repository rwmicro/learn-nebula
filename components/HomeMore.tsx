import { t } from "@/lib/i18n";
import { AUTHOR, ORIGINAL_AUTHOR } from "@/lib/site";

// The end of the phone home (app.css shows it below 640px only): two ways to
// wander (the graph, a note at random), the garden in three numbers, a short
// "À propos" whose rest unfolds in place, and the licence in two lines. Built
// at build time in French, swapped by /js/i18n.js through data-i18n.

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
        <a href="/graph/">
          <span className="home-more-art">
            <GraphDots />
          </span>
          <span className="home-more-tx">
            <b {...L("dash.graph")}>{t("dash.graph")}</b>
            <small {...L("dash.graphText")}>{t("dash.graphText")}</small>
          </span>
        </a>
        <a href="/hasard/" data-family="pensee">
          <span className="home-more-art">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
              <path d="M12 8v4l3 2" />
            </svg>
          </span>
          <span className="home-more-tx">
            <b {...L("dash.random")}>{t("dash.random")}</b>
            <small {...L("dash.randomText")}>{t("dash.randomText")}</small>
          </span>
        </a>
      </div>

      <div className="dash-row-h">
        <h2 className="dash-h" {...L("dash.numbers")}>
          {t("dash.numbers")}
        </h2>
        <a href="/jardin/" {...L("dash.details")}>
          {t("dash.details")}
        </a>
      </div>
      <div className="home-more-stats">
        <div>
          <b>{nf.format(notes)}</b>
          <small {...L("dash.nNotes")}>{t("dash.nNotes")}</small>
        </div>
        <div>
          <b>{nf.format(paths)}</b>
          <small {...L("dash.nPaths")}>{t("dash.nPaths")}</small>
        </div>
        <div>
          <b>{nf.format(languages)}</b>
          <small {...L("dash.nLangs")}>{t("dash.nLangs")}</small>
        </div>
      </div>

      <h2 className="dash-h" {...L("dash.aboutShort")}>
        {t("dash.aboutShort")}
      </h2>
      <div className="home-more-about">
        <span className="home-more-about-icon">{sprout}</span>
        <details>
          <summary>
            <span className="home-more-quote" {...L("dash.aboutQuote")}>
              {t("dash.aboutQuote")}
            </span>
            <em lang="en" dir="ltr">
              The Gardener
            </em>
            <span className="home-more-more" {...L("dash.readMore")}>
              {t("dash.readMore")}
            </span>
          </summary>
          <p>
            <span {...L("home.intro1")}>{t("home.intro1")}</span>{" "}
            <span {...L("home.intro2")}>{t("home.intro2")}</span>{" "}
            <span {...L("home.intro3")}>{t("home.intro3")}</span>
          </p>
        </details>
      </div>

      <footer className="home-more-foot">
        <a className="home-more-cc" href="https://creativecommons.org/licenses/by-nc-sa/4.0/">
          CC BY-NC-SA
        </a>
        <p>
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
