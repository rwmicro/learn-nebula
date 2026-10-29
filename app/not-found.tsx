import type { Metadata } from "next";
import { SITE_TITLE } from "@/lib/site";
import { t } from "@/lib/i18n";
import { SCENES } from "@/lib/deco-art";
import { NotFoundSuggestions } from "@/components/NotFoundSuggestions";

export const metadata: Metadata = {
  title: `${t("notFound.title")} | ${SITE_TITLE}`,
  robots: { index: false, follow: true },
};

// Styled from app.css (global), not main.css: not-found is Next's global
// error boundary, so any route stylesheet it imported would load everywhere.
export default function NotFound() {
  return (
    <main id="main" className="nf-page mx-auto px-5 pb-16 text-ink">
      {/* The sown bed with its "?" label (lib/deco-art.ts). */}
      <div className="nf-scene deco" dangerouslySetInnerHTML={{ __html: SCENES.bed }} />
      <h1 className="nf-title" data-i18n="notFound.titlePhone">
        {t("notFound.titlePhone")}
      </h1>
      <p className="nf-body" data-i18n="notFound.bodyPhone">
        {t("notFound.bodyPhone")}
      </p>
      <nav className="nf-actions">
        <a href="/" className="nf-btn nf-btn--primary" data-i18n="notFound.garden">
          {t("notFound.garden")}
        </a>
        <a href="/hasard/" className="nf-btn" data-i18n="notFound.random">
          {t("notFound.random")}
        </a>
      </nav>
      <NotFoundSuggestions />
    </main>
  );
}
