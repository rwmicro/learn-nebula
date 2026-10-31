import { t } from "@/lib/i18n";

// "‹ Notes": the phone's way back from a page one level under a tab (Frise,
// Carte, Thèmes… under Notes; a session under Réviser; Défis under Moi).
// Same look as the Notes folders' back link (notes-browse.css .nb-back).
// Phones only (app.css `.app-back`): there the page's old "← ACCUEIL" link
// is hidden (`.old-back`), and desktop keeps it as it was.
export function AppBack({ href, labelKey }: { href: string; labelKey: string }) {
  return (
    <a className="app-back" href={href}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m15 5-7 7 7 7" />
      </svg>
      <span data-i18n={labelKey}>{t(labelKey)}</span>
    </a>
  );
}
