import { AUTHOR, ORIGINAL_AUTHOR, ORIGINAL_AUTHOR_URL } from "@/lib/site";
import { t } from "@/lib/i18n";

// Single site-wide footer, the same on every page (the desktop home draws its
// own colophon in this shape, components/home/HomeDesk.tsx).
//
// Built in the default locale (fr) like every other string, and swapped at
// runtime by public/js/i18n.js through the data-i18n markers. That runtime only
// replaces textContent, so each run of text between links carries its own key.
export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer
      data-pagefind-ignore
      className="site-foot mt-10 pt-4 pb-4 text-small leading-relaxed text-ink-2"
    >
      {/* Phones: the home's short footer (app.css), the same on every page. */}
      <div className="site-foot-phone">
        <a className="site-foot-cc" href="https://creativecommons.org/licenses/by-nc-sa/4.0/">
          CC BY-NC-SA
        </a>
        <p>
          © {year} {AUTHOR} ·{" "}
          <a href="https://www.gnu.org/licenses/gpl-3.0.html" data-i18n="dash.footerCode">
            {t("dash.footerCode")}
          </a>
        </p>
      </div>
      {/* From 640px: the home's colophon (components/home/HomeDesk.tsx,
          .hd-colo) in one line, so every page closes the same way, at the
          site bar's width. It used to be an older licence paragraph, in a
          column of its own that lined up with neither the bar nor the page. */}
      <div className="site-foot-wide">
        <p className="site-foot-quote">
          <q data-i18n="dash.aboutQuote">{t("dash.aboutQuote")}</q>
          <span className="site-foot-by">
            <span lang="en">The Gardener</span>
          </span>
        </p>
        <p className="site-foot-lic footer-prose">
          <a className="site-foot-cc" href="https://creativecommons.org/licenses/by-nc-sa/4.0/" title={t("footer.licenseAlt")} data-i18n-title="footer.licenseAlt">
            CC BY-NC-SA
          </a>{" "}
          © {year} {AUTHOR}
          <br />
          <a href="https://www.gnu.org/licenses/gpl-3.0.html" data-i18n="dash.footerCode">
            {t("dash.footerCode")}
          </a>
          {" · "}
          {/* Reading / review progress lives in this browser only: the way to
              keep it or move it (app/progression). */}
          <a className="print:hidden" href="/progression/" data-i18n="footer.progression">
            {t("footer.progression")}
          </a>
          <br />
          <span data-i18n="footer.origin">{t("footer.origin")}</span> <a href={ORIGINAL_AUTHOR_URL}>{ORIGINAL_AUTHOR}</a>
        </p>
      </div>
    </footer>
  );
}
