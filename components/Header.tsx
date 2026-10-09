import { UnifrakturMaguntia } from "next/font/google";
import type { Doc } from "@/lib/content";
import { t } from "@/lib/i18n";
import { LangSwitcher } from "@/components/LangSwitcher";
import { EditionDate } from "@/components/EditionDate";
import { paletteButtonHtml, themeToggleHtml } from "@/lib/html";
import { NAV } from "@/lib/site";
import { SiteNavLinks } from "@/components/SiteNavLinks";
import { AccountChip, ReviewPill } from "@/components/AccountChip";

// Blackletter wordmark, à la New York Times. next/font self-hosts the file at
// build time (served from our origin), so `font-src 'self'` keeps holding and
// the rest of the page stays on Newsreader. Reserved for the masthead title.
const blackletter = UnifrakturMaguntia({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  fallback: ["Georgia", "serif"],
});

/** New-York-Times-style masthead in three tiers:
 *  1. utility bar — search · language "editions" · graph CTA
 *  2. masthead — dateline (left) · blackletter wordmark (center) · tagline (right)
 *  3. centered section nav between a hairline and a thick double rule.
 *  Black & white only; Tailwind + fluid type (text-micro/meta/wordmark). */
export default function Header({ doc }: { doc: Doc }) {
  // Build-time "edition" date; <EditionDate> localizes it to the active language.
  const editionIso = new Date().toISOString();

  return (
    // `home-masthead`: the site bar (components/SiteBar.tsx) hides itself on
    // the page that carries this masthead, which lists the same links.
    <header className="home-masthead relative mx-auto flex max-w-300 flex-col px-4 text-ink @container sm:block">
      {/* Peer checkbox drives the mobile section-nav dropdown (#6). CSS-only, so
          it works in the static export with no JS. */}
      <input
        id="gk-menu"
        type="checkbox"
        className="peer sr-only"
        aria-label={t("nav.menu")}
      />

      {/* 1. utility bar: language "editions" + the light/dark toggle (same
          markup as the note nav's, wired by /js/theme.js) — always visible,
          mobile included. On phones it drops below the wordmark (`order-1`,
          the header being a flex column there), so the title leads the page. */}
      <div className="flex flex-wrap items-center justify-center gap-x-2 py-2 max-sm:order-1 max-sm:pt-3">
        <LangSwitcher />
        <span
          className="contents"
          dangerouslySetInnerHTML={{ __html: themeToggleHtml() }}
        />
        {/* Command palette trigger (⌘K / Ctrl+K, wired by /js/palette.js). */}
        <span
          className="contents"
          dangerouslySetInnerHTML={{ __html: paletteButtonHtml() }}
        />
        <ReviewPill />
        <AccountChip />
      </div>

      {/* 2. masthead: dateline · wordmark · tagline. On mobile the dateline is
          hidden, so collapse to a single centred column (otherwise the title
          lands in the empty left 1fr and reads off-centre). */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-4 pt-4 md:py-4">
          <EditionDate
            iso={editionIso}
            // pr-4 keeps a gutter between the (left-aligned, wrapping) dateline
            // and the wordmark: on long days ("dimanche") the date used to fill
            // its column right up to the title. 1rem is the widest padding that
            // still fits "DIMANCHE" without breaking at the ≥640px column width.
            className="hidden sm:block sm:pr-4 text-micro uppercase tracking-[0.04em] text-muted-warm"
          />
          <a
            href="/"
            className="justify-self-center text-ink no-underline hover:bg-transparent"
          >
            <h1
              className={`${blackletter.className} m-0 border-0 p-0 font-normal text-wordmark max-sm:text-[clamp(1.55rem,10cqi,6rem)] not-italic leading-[0.9] whitespace-nowrap`}
            >
              {doc.frontmatter.title}
            </h1>
          </a>
      </div>
            {/* Double rule under the masthead — desktop only (#6: dropped on phones). */}
      <div className="max-sm:hidden border-t-[1.5px] border-ink" />
      <div className="max-sm:hidden mt-0.5 border-t-[1.5px] border-ink" />
      
      {/* Mobile hamburger (#6): top-right corner, opens the section-nav
          dropdown below. Icon toggle and focus ring sit on this div (a direct
          sibling of the peer checkbox) so peer-checked/peer-focus-visible apply. */}
      <div className="absolute right-2 top-2 z-20 sm:hidden peer-checked:[&_.gk-ic-open]:hidden peer-checked:[&_.gk-ic-close]:block peer-focus-visible:[&_label]:outline peer-focus-visible:[&_label]:outline-2 peer-focus-visible:[&_label]:outline-offset-2 peer-focus-visible:[&_label]:outline-link">
        <label
          htmlFor="gk-menu"
          aria-label={t("nav.menu")}
          className="inline-flex cursor-pointer items-center justify-center rounded-[4px] border border-rule-strong bg-paper p-1.5 text-ink"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true" className="gk-ic-open">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true" className="gk-ic-close hidden">
            <path d="M6 6l12 12M18 6l-12 12" />
          </svg>
        </label>
      </div>

      {/* 3. section nav — horizontal bar on desktop; a right-anchored dropdown
          popover on mobile, revealed by the hamburger in the corner (#6). */}
      <nav
        aria-label={t("home.footerNavAria")}
        className="max-sm:order-2 relative hidden peer-checked:block sm:block"
      >
        {/* The same links as the site bar on every other page
            (components/SiteBar.tsx), from lib/site.ts NAV. */}
        <div className="home-nav absolute right-2 top-1 z-30 w-max rounded-[4px] border border-rule-strong bg-paper px-6 py-3 text-small font-semibold uppercase tracking-[0.08em] shadow-lg sm:static sm:w-auto sm:border-0 sm:border-b sm:border-rule sm:bg-transparent sm:px-0 sm:py-2 sm:shadow-none">
          <SiteNavLinks
            links={[
              ...NAV.filter((n) => n.href !== "/"),
              { name: "nav.progression", href: "/progression/" },
            ].map((n) => ({ href: n.href, key: n.name, label: t(n.name) }))}
          />
        </div>
      </nav>
    </header>
  );
}
