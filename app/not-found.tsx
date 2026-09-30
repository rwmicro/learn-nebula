import type { Metadata } from "next";
import { getPage } from "@/lib/content";
import { renderMarkdown } from "@/lib/markdown";
import { SITE_TITLE } from "@/lib/site";
import { t } from "@/lib/i18n";
import { NotFoundSuggestions } from "@/components/NotFoundSuggestions";

export const metadata: Metadata = {
  title: `Page Not Found | ${SITE_TITLE}`,
  robots: { index: false, follow: true },
};

// Self-styled with Tailwind (no main.css): not-found is Next's global error
// boundary, so any stylesheet it imports would load on every route — exactly
// what we're avoiding. The article typography in main.css stays note-only.
export default async function NotFound() {
  const doc = getPage("404");
  const { html } = await renderMarkdown(doc.body);
  return (
    <main id="main" className="mx-auto max-w-[42rem] px-5 py-16 text-[#1a1a1a]">
      <h1 className="m-0 mb-5 text-balance text-[clamp(1.5rem,1.1rem+2.5vw,3rem)] font-medium leading-tight">
        {doc.frontmatter.title}
      </h1>
      <div
        className="text-body leading-relaxed [&_a]:text-[#003366] [&_a]:underline [&_a]:underline-offset-2 [&_p]:mb-4"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <NotFoundSuggestions />
      <nav className="mt-10 flex gap-7 text-meta font-semibold uppercase tracking-[0.1em]">
        <a
          href="/"
          data-i18n="nav.home"
          className="text-[#1a1a1a] no-underline underline-offset-[3px] hover:underline"
        >
          {t("nav.home")}
        </a>
        <a
          href="/graph/"
          data-i18n="nav.graph"
          className="text-[#1a1a1a] no-underline underline-offset-[3px] hover:underline"
        >
          {t("nav.graph")}
        </a>
      </nav>
    </main>
  );
}
