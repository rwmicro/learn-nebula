import { AUTHOR, CODE_REPO_PAGE, NOTES_REPO_PAGE } from "@/lib/site";
import { t } from "@/lib/i18n";

// Single site-wide footer, the same on every page (the desktop home closes on
// its own colophon, components/home/HomeDesk.tsx, and hides this one).
//
// A sky over Rembrandt's Three Trees (1643, Art Institute of Chicago, CC0),
// whose colour follows the reader's clock: aube, jour, estampe (the etching
// itself, untouched, as the background), crépuscule, nuit. Each sky is a set
// of tokens on footer[data-ciel] (assets/css/footer.css); SKY_SCRIPT below
// picks it from the local hour before the footer paints, and holds back the
// etching (gf-far: ~200 KB of masks, 370 KB for the midday plate) until the
// footer comes within 1000px of the screen. Design reviews:
// revues/footer-2026-11-10/ (v14).
//
// Built in the default locale (fr) like every other string, and swapped at
// runtime by public/js/i18n.js through the data-i18n markers, which only
// replace textContent: each run of text carries its own key.

type FootLink = { key: string; href: string; note?: string };

const GROUPS: { key: string; links: FootLink[] }[] = [
  {
    key: "footer.learn",
    links: [
      { key: "nav.parcours", href: "/parcours/" },
      { key: "nav.cartes", href: "/cartes/" },
      { key: "parler.title", href: "/parler/" },
      { key: "defis.title", href: "/defis/" },
      { key: "nav.progression", href: "/progression/" },
    ],
  },
  {
    key: "footer.explore",
    links: [
      { key: "tabbar.notes", href: "/notes/" },
      { key: "nav.graph", href: "/graph/" },
      { key: "nav.frise", href: "/frise/" },
      { key: "nav.themes", href: "/themes/" },
      { key: "notesTab.view.jardin", href: "/jardin/" },
    ],
  },
  {
    key: "footer.play",
    links: [
      { key: "discipline.echecs", href: "/echecs/" },
      { key: "duel.title", href: "/duel/" },
      { key: "nav.random", href: "/hasard/" },
    ],
  },
  {
    key: "footer.garden",
    links: [
      { key: "footer.notesRepo", href: NOTES_REPO_PAGE, note: "GitHub" },
      { key: "footer.codeRepo", href: CODE_REPO_PAGE, note: "GitHub" },
      { key: "desk.rss", href: "/feed.xml" },
      { key: "account.myAccount", href: "/compte/" },
    ],
  },
];

// 5–8 h aube, 8–11 h jour, 11–15 h estampe, 15–17 h jour, 17–20 h
// crépuscule, otherwise nuit. Runs inline right after the footer, so the
// right sky is set before the first paint; re-checked every minute.
const SKY_SCRIPT = `(function(){var f=document.getElementById("site-foot");if(!f)return;function s(){var h=new Date().getHours();f.dataset.ciel=h>=5&&h<8?"aube":h>=11&&h<15?"estampe":h>=8&&h<17?"jour":h>=17&&h<20?"crepuscule":"nuit"}s();setInterval(s,60000);if("IntersectionObserver"in window){f.classList.add("gf-far");var o=new IntersectionObserver(function(e){if(e.some(function(x){return x.isIntersecting})){f.classList.remove("gf-far");o.disconnect()}},{rootMargin:"1000px 0px"});o.observe(f)}})();`;

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <>
      <footer id="site-foot" data-pagefind-ignore className="site-foot gf" data-ciel="nuit">
        <div className="gf-veil" aria-hidden="true" />
        <div className="gf-in">
          <div className="gf-top">
            <div className="gf-brand">
              <a className="gf-word" href="/">
                {/* eslint-disable-next-line @next/next/no-img-element -- static export, 4 KB PNG */}
                <img src="/brand/logo-sombre.png" alt="" width={34} height={34} />
                <span>Garden of Knowledge</span>
              </a>
              <p className="gf-quote">
                <q data-i18n="dash.aboutQuote">{t("dash.aboutQuote")}</q>
              </p>
            </div>
            <nav className="gf-cols" aria-label={t("footer.navLabel")} data-i18n-aria-label="footer.navLabel">
              {GROUPS.map((g) => (
                <div className="gf-col" key={g.key}>
                  <h2 data-i18n={g.key}>{t(g.key)}</h2>
                  <ul>
                    {g.links.map((l) => (
                      <li key={l.href}>
                        <a href={l.href}>
                          <span data-i18n={l.key}>{t(l.key)}</span>
                          {l.note ? <small>{l.note}</small> : null}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>
        </div>

        <div className="gf-ground">
          <div
            className="gf-land"
            role="img"
            aria-label={t("footer.engravingAlt")}
            data-i18n-aria-label="footer.engravingAlt"
          >
            <i />
            <i />
          </div>
          <div className="gf-foot">
            <div className="gf-colo">
              <div className="gf-colo-in">
                <div>
                  <span>
                    © {year} {AUTHOR}
                  </span>
                  <span>
                    <span data-i18n="footer.contentLabel">{t("footer.contentLabel")}</span>{" "}
                    <a
                      href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
                      title={t("footer.licenseAlt")}
                      data-i18n-title="footer.licenseAlt"
                    >
                      CC BY-NC-SA 4.0
                    </a>
                  </span>
                  <span>
                    <span data-i18n="footer.codeLabel">{t("footer.codeLabel")}</span>{" "}
                    <a href="https://www.gnu.org/licenses/gpl-3.0.html">GNU GPL 3.0</a>
                  </span>
                </div>
                <div>
                  <span className="gf-wrap">
                    <span data-i18n="footer.engraving">{t("footer.engraving")}</span> Rembrandt,{" "}
                    <a href="https://www.artic.edu/artworks/29271">
                      <i data-i18n="footer.threeTrees">{t("footer.threeTrees")}</i>
                    </a>
                    , 1643 (CC0)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>
      <script dangerouslySetInnerHTML={{ __html: SKY_SCRIPT }} />
    </>
  );
}
