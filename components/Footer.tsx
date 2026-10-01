import { AUTHOR, ORIGINAL_AUTHOR, ORIGINAL_AUTHOR_URL } from "@/lib/site";
import { t } from "@/lib/i18n";

// Single site-wide footer, identical on the home page and note pages.
//
// Built in the default locale (fr) like every other string, and swapped at
// runtime by public/js/i18n.js through the data-i18n markers. That runtime only
// replaces textContent, so the licence sentence is one marked span per run of
// text between its links (footer.licenseBefore / …Middle / …After), and each
// link label carries its own key.
export function Footer() {
  const year = new Date().getFullYear();
  const vars = { year, author: AUTHOR };
  return (
    <footer
      data-pagefind-ignore
      className="mt-10 border-t border-rule-strong pt-4 pb-4 xl:pb-0 text-small leading-relaxed text-ink-2 [container-type:inline-size]"
    >
      <div className="flex flex-col gap-3 min-[480px]:flex-row min-[480px]:items-start min-[480px]:gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="h-auto w-[5.25rem] shrink-0"
          src="/images/license.png"
          alt={t("footer.licenseAlt")}
          data-i18n-alt="footer.licenseAlt"
          width={88}
          height={31}
        />
        <div className="space-y-1">
          <p className="m-0" data-i18n="footer.copyright" data-i18n-vars={JSON.stringify(vars)}>
            {t("footer.copyright", vars)}
          </p>
          {/* Prose links: `.footer-prose a` (global.css) gives them a persistent
              underline so they're distinguishable without colour (WCAG 1.4.1) —
              done in plain CSS, not a Tailwind utility, because the note-page
              `a { text-decoration: none }` (unlayered) would otherwise win. */}
          <p className="footer-prose m-0">
            <span data-i18n="footer.licenseBefore">{t("footer.licenseBefore")}</span>
            <a
              href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
              data-i18n="footer.licenseLink"
            >
              {t("footer.licenseLink")}
            </a>
            <span data-i18n="footer.licenseMiddle">{t("footer.licenseMiddle")}</span>
            <a href="https://www.gnu.org/licenses/gpl-3.0.html" data-i18n="footer.licenseGpl">
              {t("footer.licenseGpl")}
            </a>
            <span data-i18n="footer.licenseAfter">{t("footer.licenseAfter")}</span>
            <a href={ORIGINAL_AUTHOR_URL}>{ORIGINAL_AUTHOR}</a>.
          </p>
        </div>
      </div>
    </footer>
  );
}
