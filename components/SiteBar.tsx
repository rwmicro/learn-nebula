import { NAV } from "@/lib/site";
import { t, i18nAttrs } from "@/lib/i18n";
import { paletteButtonHtml, themeToggleHtml } from "@/lib/html";
import { SiteNavLinks } from "@/components/SiteNavLinks";
import { AccountChip, ReviewPill } from "@/components/AccountChip";
import { MeButton } from "@/components/MeButton";
import { TopBarScroll } from "@/components/TopBarScroll";
import { LangSwitcher } from "@/components/LangSwitcher";

// The one site menu, the same on every page: the home's masthead lists the
// same links (components/Header.tsx) and this slim bar is hidden there (CSS,
// global.css `.site-bar`), every other page opens with it. Before, the home
// menu had no Parcours / Frise / Cartes, and a note page had its menu only at
// the very bottom, after the comments.
//
// Desktop: links inline, with Progression as on the home's masthead. Phone: a
// <details> "Menu" (no JS needed). On the right: the review reminder, the
// language (the home's inline list folded into a dropdown), search,
// light/dark, and the account button.
export function SiteBar() {
  const links = [...NAV, { name: "nav.progression", href: "/progression/" }].map((n) => ({
    href: n.href,
    key: n.name,
    label: t(n.name),
  }));
  return (
    <header className="site-bar" data-pagefind-ignore>
      <div className="site-bar-inner">
        <a className="site-bar-brand" href="/">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M12 21v-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
            <path d="M12 14C7 14 4.5 11 4.5 6.5 9 6.5 12 9 12 14Z" fill="var(--garden)" />
            <path d="M12 12c0-4.5 3-7.5 7.5-7.5 0 4.5-3 7.5-7.5 7.5Z" fill="var(--garden)" opacity=".7" />
          </svg>
          <span data-i18n="siteBar.brand">{t("siteBar.brand")}</span>
          {/* Phones: the page's title, once scrolled past (TopBarScroll). */}
          <b className="site-bar-page" aria-hidden="true" />
        </a>
        <nav className="site-bar-nav" aria-label={t("siteBar.navAria")}>
          <SiteNavLinks links={links} />
        </nav>
        <div className="site-bar-tools">
          <ReviewPill />
          <span className="site-bar-lang">
            <LangSwitcher compact />
          </span>
          <span className="contents" dangerouslySetInnerHTML={{ __html: paletteButtonHtml() }} />
          <span className="contents" dangerouslySetInnerHTML={{ __html: themeToggleHtml() }} />
          <AccountChip />
          {/* Phones: "Moi" (progress, account), the tab bar holding the rest
              of the menu (components/MobileTabBar.tsx). Shows the reader's
              avatar once signed in (components/MeButton.tsx). */}
          <MeButton label={t("siteBar.me")} />
          <details className="site-bar-menu">
            <summary aria-label={t("nav.menu")}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <span className="sr-only" dangerouslySetInnerHTML={{ __html: `<span${i18nAttrs("nav.menu")}>${t("nav.menu")}</span>` }} />
            </summary>
            <div className="site-bar-menu-panel">
              <SiteNavLinks links={links} />
            </div>
          </details>
        </div>
      </div>
      <TopBarScroll />
    </header>
  );
}
