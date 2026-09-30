import { UnifrakturMaguntia } from "next/font/google";
import type { Doc } from "@/lib/content";
import { t } from "@/lib/i18n";
import { LangSwitcher } from "@/components/LangSwitcher";
import { EditionDate } from "@/components/EditionDate";

// Blackletter wordmark, à la New York Times. next/font self-hosts the file at
// build time (served from our origin), so `font-src 'self'` keeps holding and
// the rest of the page stays on Newsreader. Reserved for the masthead title.
const blackletter = UnifrakturMaguntia({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  fallback: ["Georgia", "serif"],
});

const navLink =
  "text-black no-underline underline-offset-[3px] hover:bg-transparent hover:underline focus-visible:underline";

/** New-York-Times-style masthead in three tiers:
 *  1. utility bar — search · language "editions" · graph CTA
 *  2. masthead — dateline (left) · blackletter wordmark (center) · tagline (right)
 *  3. centered section nav between a hairline and a thick double rule.
 *  Black & white only; Tailwind + fluid type (text-micro/meta/wordmark). */
export default function Header({ doc }: { doc: Doc }) {
  // Build-time "edition" date; <EditionDate> localizes it to the active language.
  const editionIso = new Date().toISOString();

  return (
    <header className="relative mx-auto max-w-300 px-4 text-black @container">
      {/* Peer checkbox drives the mobile section-nav dropdown (#6). CSS-only, so
          it works in the static export with no JS. */}
      <input
        id="gk-menu"
        type="checkbox"
        className="peer sr-only"
        aria-label={t("nav.menu")}
      />

      {/* 1. utility bar: language "editions" — always visible, mobile included. */}
      <div className="py-2 text-center">
        <LangSwitcher />
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
            className="hidden sm:block sm:pr-4 text-micro uppercase tracking-[0.04em] text-[#787369]"
          />
          <a
            href="/"
            className="justify-self-center text-black no-underline hover:bg-transparent"
          >
            <h1
              className={`${blackletter.className} m-0 border-0 p-0 font-normal text-wordmark not-italic leading-[0.9] whitespace-nowrap`}
            >
              {doc.frontmatter.title}
            </h1>
          </a>
      </div>
            {/* Double rule under the masthead — desktop only (#6: dropped on phones). */}
      <div className="max-sm:hidden border-t-[1.5px] border-black" />
      <div className="max-sm:hidden mt-0.5 border-t-[1.5px] border-black" />
      
      {/* 3. section nav — horizontal bar on desktop; a right-anchored dropdown
          popover on mobile, revealed by the hamburger in the corner (#6). */}
      <nav
        aria-label={t("home.footerNavAria")}
        className="relative hidden peer-checked:block sm:block"
      >
        <ul className="absolute right-2 top-1 z-30 m-0 flex w-max list-none flex-col items-end gap-2.5 rounded-[4px] border border-neutral-300 bg-white px-6 py-3 text-small font-semibold uppercase tracking-[0.08em] shadow-lg sm:static sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-7 sm:gap-y-1 sm:border-0 sm:border-b sm:border-neutral-200 sm:bg-transparent sm:px-0 sm:py-2 sm:shadow-none">
          <li className="m-0">
            <a href="/#applied-sciences" className={navLink} data-i18n="nav.appliedsciences">
              {t("nav.appliedsciences")}
            </a>
          </li>
          <li className="m-0 hidden sm:block">·</li>
          <li className="m-0">
            <a href="/#social-sciences" className={navLink} data-i18n="nav.socialsciences">
              {t("nav.socialsciences")}
            </a>
          </li>
          <li className="m-0 hidden sm:block">·</li>
          <li className="m-0">
            <a href="/graph/" className={navLink} data-i18n="nav.graph">
              {t("nav.graph")}
            </a>
          </li>
          <li className="m-0 hidden sm:block">·</li>
          <li className="m-0">
            <a href="/themes/" className={navLink} data-i18n="nav.themes">
              {t("nav.themes")}
            </a>
          </li>
        </ul>
      </nav>
    </header>
  );
}
