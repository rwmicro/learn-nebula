import type { Metadata } from "next";
import { SITE_TITLE } from "@/lib/site";
import { t } from "@/lib/i18n";
import { NotFoundSuggestions } from "@/components/NotFoundSuggestions";

export const metadata: Metadata = {
  title: `${t("notFound.title")} | ${SITE_TITLE}`,
  robots: { index: false, follow: true },
};

// Self-styled with Tailwind (no main.css): not-found is Next's global error
// boundary, so any stylesheet it imports would load on every route — exactly
// what we're avoiding. The article typography in main.css stays note-only.
export default function NotFound() {
  return (
    <main id="main" className="nf-page mx-auto max-w-[42rem] px-5 py-16 text-ink">
      {/* Phones only (app.css): the garden's sprout over the title. */}
      <span className="nf-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 21v-9" />
          <path d="M12 12c0-4-3-6-7-6 0 4 3 6 7 6Z" />
          <path d="M12 10c0-3.5 2.5-5.5 7-5.5 0 3.5-2.5 5.5-7 5.5Z" />
        </svg>
      </span>
      <h1
        data-i18n="notFound.title"
        className="nf-title m-0 mb-5 text-balance text-[clamp(1.5rem,1.1rem+2.5vw,3rem)] font-medium leading-tight"
      >
        {t("notFound.title")}
      </h1>
      <p className="nf-body mb-4 text-body leading-relaxed">
        <span data-i18n="notFound.body">{t("notFound.body")}</span>{" "}
        <a
          href="/"
          data-i18n="notFound.home"
          className="text-link underline underline-offset-2"
        >
          {t("notFound.home")}
        </a>
      </p>
      <NotFoundSuggestions />
      <nav className="nf-links mt-10 flex flex-wrap gap-x-7 gap-y-2 text-meta font-semibold uppercase tracking-[0.1em]">
        <a
          href="/"
          data-i18n="nav.home"
          className="text-ink no-underline underline-offset-[3px] hover:underline"
        >
          {t("nav.home")}
        </a>
        <a
          href="/graph/"
          data-i18n="nav.graph"
          className="text-ink no-underline underline-offset-[3px] hover:underline"
        >
          {t("nav.graph")}
        </a>
        <a
          href="/hasard/"
          data-i18n="nav.random"
          className="text-ink no-underline underline-offset-[3px] hover:underline"
        >
          {t("nav.random")}
        </a>
      </nav>
    </main>
  );
}
